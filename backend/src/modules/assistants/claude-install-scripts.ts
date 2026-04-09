// Inline script content for the BRB install endpoint.
// These are embedded in the shell script returned by /api/assistants/claude/install/:token.

export const BRIDGE_SCRIPT = `#!/usr/bin/env node
const BRB_CONNECTION_TOKEN = process.env.BRB_CONNECTION_TOKEN;
const BRB_CONNECT_URL = process.env.BRB_CONNECT_URL;
const BRB_EVENTS_URL = process.env.BRB_EVENTS_URL;

const APPROVAL_POLL_INTERVAL_MS = 3000;
const APPROVAL_POLL_TIMEOUT_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15000;

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + BRB_CONNECTION_TOKEN };
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    setTimeout(() => resolve(data), 500);
  });
}

async function fetchJSON(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error('HTTP ' + res.status + ': ' + text); }
    return await res.json();
  } finally { clearTimeout(timeout); }
}

async function sendConnectPing(event) {
  try {
    await fetchJSON(BRB_CONNECT_URL, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ machineName: process.env.HOSTNAME || 'local', cwd: event.cwd || event.project_path || process.cwd() }),
    });
  } catch (err) { process.stderr.write('BRB bridge: ping failed: ' + err.message + '\\n'); }
}

async function forwardEvent(event) {
  return fetchJSON(BRB_EVENTS_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify(event) });
}

async function pollApprovalDecision(approvalId) {
  const approvalUrl = BRB_CONNECT_URL.replace('/bridge/connect', '/bridge/approval/' + approvalId);
  const deadline = Date.now() + APPROVAL_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const result = await fetchJSON(approvalUrl, { method: 'GET', headers: authHeaders() });
      if (result.status === 'approved') return { decision: 'allow' };
      if (result.status === 'denied') return { decision: 'deny', reason: result.resolutionNote || 'Denied via Telegram' };
      if (result.status === 'responded') return { decision: 'allow' };
    } catch (err) { process.stderr.write('BRB bridge: approval poll error: ' + (err.message || err) + '\\n'); }
    await new Promise((r) => setTimeout(r, APPROVAL_POLL_INTERVAL_MS));
  }
  process.stderr.write('BRB bridge: approval poll timed out after ' + (APPROVAL_POLL_TIMEOUT_MS / 1000) + 's — allowing by default\\n');
  return { decision: 'allow' };
}

async function main() {
  if (!BRB_CONNECTION_TOKEN || !BRB_CONNECT_URL || !BRB_EVENTS_URL) process.exit(0);
  let event = {};
  try { const raw = await readStdin(); if (raw.trim()) event = JSON.parse(raw); } catch {}
  await sendConnectPing(event);
  const hookEventName = event.hookEventName || event.hook_event_name || event.eventName || event.event;
  if (!hookEventName) process.exit(0);
  let result;
  try { result = await forwardEvent(event); } catch (err) { process.stderr.write('BRB bridge: forward failed: ' + err.message + '\\n'); process.exit(0); }
  if (hookEventName === 'PermissionRequest' && result.action === 'remote_candidate' && result.approvalId) {
    const decision = await pollApprovalDecision(result.approvalId);
    process.stdout.write(JSON.stringify(decision) + '\\n');
  }
  process.exit(0);
}
main().catch((err) => { process.stderr.write('BRB bridge error: ' + err.message + '\\n'); process.exit(0); });
`;

export const POLLER_SCRIPT = `#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { hostname } from 'node:os';

const BRB_CONNECTION_TOKEN = process.env.BRB_CONNECTION_TOKEN;
const BRB_CONNECT_URL = process.env.BRB_CONNECT_URL;
const BRB_INSTRUCTIONS_URL = process.env.BRB_INSTRUCTIONS_URL;
const BRB_INSTRUCTION_RESULT_URL = process.env.BRB_INSTRUCTION_RESULT_URL;

const CONNECT_PING_INTERVAL_MS = 30000;
const INSTRUCTION_POLL_INTERVAL_MS = 5000;
const CLAUDE_EXECUTION_TIMEOUT_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15000;
const MAX_REPLY_LENGTH = 3500;

let running = true;
let executingInstruction = false;

function log(msg) { const ts = new Date().toISOString(); process.stderr.write('[' + ts + '] ' + msg + '\\n'); }

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + BRB_CONNECTION_TOKEN };
}

async function fetchJSON(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error('HTTP ' + res.status + ': ' + text); }
    return await res.json();
  } finally { clearTimeout(timeout); }
}

async function sendConnectPing() {
  try {
    const result = await fetchJSON(BRB_CONNECT_URL, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ machineName: hostname(), cwd: process.cwd() }),
    });
    log('Ping OK — status: ' + result.status + ', away: ' + result.awayModeEnabled);
  } catch (err) { log('Ping FAILED: ' + err.message); }
}

async function pollForInstruction() {
  if (!BRB_INSTRUCTIONS_URL || executingInstruction) return null;
  try {
    const result = await fetchJSON(BRB_INSTRUCTIONS_URL, { method: 'GET', headers: authHeaders() });
    return result.instruction || null;
  } catch (err) { log('Poll error: ' + err.message); return null; }
}

function executeClaudeCLI(prompt) {
  return new Promise((resolve, reject) => {
    let stdout = ''; let stderr = ''; let killed = false;
    const child = spawn('npx', ['@anthropic-ai/claude-code', '-p', prompt, '--output-format', 'text'], {
      cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env },
    });
    const timer = setTimeout(() => { killed = true; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 5000); }, CLAUDE_EXECUTION_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (killed) reject(new Error('Claude execution timed out'));
      else if (code !== 0) reject(new Error('Claude exited with code ' + code + ': ' + stderr.slice(0, 500)));
      else resolve(stdout.trim());
    });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

function truncate(text, max) { return text.length <= max ? text : text.slice(0, max - 1) + '…'; }

async function reportResult(instructionId, status, replyText, errorMessage) {
  const resultUrl = BRB_INSTRUCTION_RESULT_URL.replace(':instructionId', instructionId);
  try {
    await fetchJSON(resultUrl, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ status, replyText: replyText ? truncate(replyText, MAX_REPLY_LENGTH) : undefined, errorMessage: errorMessage ? truncate(errorMessage, 1200) : undefined }),
    });
    log('Reported ' + status + ' for instruction ' + instructionId);
  } catch (err) { log('Failed to report result: ' + err.message); }
}

async function handleInstruction(instruction) {
  executingInstruction = true;
  const { id, prompt } = instruction;
  log('Executing instruction ' + id + ': "' + prompt.slice(0, 80) + '..."');
  try {
    const output = await executeClaudeCLI(prompt);
    log('Claude completed — ' + output.length + ' chars');
    await reportResult(id, 'completed', output, null);
  } catch (err) {
    log('Claude failed: ' + err.message);
    await reportResult(id, 'failed', null, err.message);
  } finally { executingInstruction = false; }
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function main() {
  if (!BRB_CONNECTION_TOKEN || !BRB_CONNECT_URL) { log('ERROR: Missing env vars'); process.exit(1); }
  log('BRB Claude Poller starting...');
  log('Working directory: ' + process.cwd());
  await sendConnectPing();
  let lastPingAt = Date.now();
  while (running) {
    if (Date.now() - lastPingAt >= CONNECT_PING_INTERVAL_MS) { await sendConnectPing(); lastPingAt = Date.now(); }
    const instruction = await pollForInstruction();
    if (instruction) await handleInstruction(instruction);
    await sleep(INSTRUCTION_POLL_INTERVAL_MS);
  }
  log('Poller shutting down.');
}

process.on('SIGINT', () => { log('SIGINT — shutting down...'); running = false; });
process.on('SIGTERM', () => { log('SIGTERM — shutting down...'); running = false; });
main().catch((err) => { log('Fatal: ' + err.message); process.exit(1); });
`;
