#!/usr/bin/env node

// BRB Claude Bridge — Claude Code hook script that connects Claude to BRB.
// Runs on every hook event (PermissionRequest, PreToolUse, PostToolUse, Stop).
// Forwards events to BRB backend so Telegram can see Claude activity and
// respond to approval requests while you're away.

const BRB_CONNECTION_TOKEN = process.env.BRB_CONNECTION_TOKEN;
const BRB_CONNECT_URL = process.env.BRB_CONNECT_URL;
const BRB_EVENTS_URL = process.env.BRB_EVENTS_URL;
const BRB_INSTRUCTIONS_URL = process.env.BRB_INSTRUCTIONS_URL;
const BRB_INSTRUCTION_RESULT_URL = process.env.BRB_INSTRUCTION_RESULT_URL;

const APPROVAL_POLL_INTERVAL_MS = 3000;
const APPROVAL_POLL_TIMEOUT_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15000;

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${BRB_CONNECTION_TOKEN}`,
  };
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    // If stdin is already closed or empty, resolve after a short timeout
    setTimeout(() => resolve(data), 500);
  });
}

async function fetchJSON(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function sendConnectPing(event) {
  try {
    await fetchJSON(BRB_CONNECT_URL, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        machineName: process.env.HOSTNAME || 'local',
        cwd: event.cwd || event.project_path || process.cwd(),
      }),
    });
  } catch (err) {
    process.stderr.write(`BRB bridge: connect ping failed: ${err.message}\n`);
  }
}

async function forwardEvent(event) {
  return fetchJSON(BRB_EVENTS_URL, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(event),
  });
}

async function pollApprovalDecision(approvalId) {
  const approvalUrl = BRB_CONNECT_URL.replace('/bridge/connect', `/bridge/approval/${approvalId}`);
  const deadline = Date.now() + APPROVAL_POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const result = await fetchJSON(approvalUrl, {
        method: 'GET',
        headers: authHeaders(),
      });

      if (result.status === 'approved') {
        return { decision: 'allow' };
      }
      if (result.status === 'denied') {
        return { decision: 'deny', reason: result.resolutionNote || 'Denied via Telegram' };
      }
      if (result.status === 'responded') {
        return { decision: 'allow' };
      }
    } catch {
      // Retry on transient errors
    }

    await new Promise((r) => setTimeout(r, APPROVAL_POLL_INTERVAL_MS));
  }

  // Timeout — let Claude proceed rather than hang forever
  return { decision: 'allow' };
}

async function main() {
  if (!BRB_CONNECTION_TOKEN || !BRB_CONNECT_URL || !BRB_EVENTS_URL) {
    process.exit(0);
  }

  let event = {};
  try {
    const raw = await readStdin();
    if (raw.trim()) {
      event = JSON.parse(raw);
    }
  } catch {
    // If stdin isn't valid JSON, still send a connect ping
  }

  // Always send a connect ping to keep the connection alive
  await sendConnectPing(event);

  // If there's no meaningful event, just exit
  const hookEventName =
    event.hookEventName || event.hook_event_name || event.eventName || event.event;
  if (!hookEventName) {
    process.exit(0);
  }

  // Forward the event to BRB
  let result;
  try {
    result = await forwardEvent(event);
  } catch (err) {
    process.stderr.write(`BRB bridge: event forward failed: ${err.message}\n`);
    process.exit(0);
  }

  // For PermissionRequest in away mode: poll for Telegram approval
  if (
    hookEventName === 'PermissionRequest' &&
    result.action === 'remote_candidate' &&
    result.approvalId
  ) {
    const decision = await pollApprovalDecision(result.approvalId);
    process.stdout.write(JSON.stringify(decision) + '\n');
    process.exit(0);
  }

  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`BRB bridge error: ${err.message}\n`);
  process.exit(0);
});
