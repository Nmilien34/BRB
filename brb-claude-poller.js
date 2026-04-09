#!/usr/bin/env node

// BRB Claude Poller — persistent background process that keeps Claude connected
// to BRB and executes remote instructions from Telegram.
//
// Usage:
//   BRB_CONNECTION_TOKEN="..." BRB_CONNECT_URL="..." BRB_EVENTS_URL="..." \
//   BRB_INSTRUCTIONS_URL="..." BRB_INSTRUCTION_RESULT_URL="..." \
//   node brb-claude-poller.js

import { spawn } from 'node:child_process';
import { hostname } from 'node:os';

const BRB_CONNECTION_TOKEN = process.env.BRB_CONNECTION_TOKEN;
const BRB_CONNECT_URL = process.env.BRB_CONNECT_URL;
const BRB_EVENTS_URL = process.env.BRB_EVENTS_URL;
const BRB_INSTRUCTIONS_URL = process.env.BRB_INSTRUCTIONS_URL;
const BRB_INSTRUCTION_RESULT_URL = process.env.BRB_INSTRUCTION_RESULT_URL;

const CONNECT_PING_INTERVAL_MS = 30_000;
const INSTRUCTION_POLL_INTERVAL_MS = 5_000;
const CLAUDE_EXECUTION_TIMEOUT_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_REPLY_LENGTH = 3500;

let running = true;
let executingInstruction = false;

function log(msg) {
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] ${msg}\n`);
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${BRB_CONNECTION_TOKEN}`,
  };
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

async function sendConnectPing() {
  try {
    const result = await fetchJSON(BRB_CONNECT_URL, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        machineName: hostname(),
        cwd: process.cwd(),
      }),
    });
    log(`Ping OK — status: ${result.status}, away: ${result.awayModeEnabled}`);
  } catch (err) {
    log(`Ping FAILED: ${err.message}`);
  }
}

async function pollForInstruction() {
  if (!BRB_INSTRUCTIONS_URL || executingInstruction) return null;

  try {
    const result = await fetchJSON(BRB_INSTRUCTIONS_URL, {
      method: 'GET',
      headers: authHeaders(),
    });
    return result.instruction || null;
  } catch (err) {
    log(`Poll error: ${err.message}`);
    return null;
  }
}

function executeClaudeCLI(prompt) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let killed = false;

    const child = spawn('npx', ['@anthropic-ai/claude-code', '-p', prompt, '--output-format', 'text'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      timeout: CLAUDE_EXECUTION_TIMEOUT_MS,
    });

    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, CLAUDE_EXECUTION_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (killed) {
        reject(new Error('Claude execution timed out after 5 minutes'));
      } else if (code !== 0) {
        reject(new Error(`Claude exited with code ${code}: ${stderr.slice(0, 500)}`));
      } else {
        resolve(stdout.trim());
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function truncate(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

async function reportResult(instructionId, status, replyText, errorMessage) {
  const resultUrl = BRB_INSTRUCTION_RESULT_URL.replace(':instructionId', instructionId);

  try {
    await fetchJSON(resultUrl, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        status,
        replyText: replyText ? truncate(replyText, MAX_REPLY_LENGTH) : undefined,
        errorMessage: errorMessage ? truncate(errorMessage, 1200) : undefined,
      }),
    });
    log(`Reported ${status} for instruction ${instructionId}`);
  } catch (err) {
    log(`Failed to report result: ${err.message}`);
  }
}

async function handleInstruction(instruction) {
  executingInstruction = true;
  const { id, prompt } = instruction;
  log(`Executing instruction ${id}: "${prompt.slice(0, 80)}..."`);

  try {
    const output = await executeClaudeCLI(prompt);
    log(`Claude completed — ${output.length} chars`);
    await reportResult(id, 'completed', output, null);
  } catch (err) {
    log(`Claude failed: ${err.message}`);
    await reportResult(id, 'failed', null, err.message);
  } finally {
    executingInstruction = false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!BRB_CONNECTION_TOKEN || !BRB_CONNECT_URL) {
    log('ERROR: Missing required env vars (BRB_CONNECTION_TOKEN, BRB_CONNECT_URL)');
    process.exit(1);
  }

  log('BRB Claude Poller starting...');
  log(`Working directory: ${process.cwd()}`);

  // Initial connect ping
  await sendConnectPing();

  let lastPingAt = Date.now();

  // Main loop
  while (running) {
    // Send keepalive ping every 30s
    if (Date.now() - lastPingAt >= CONNECT_PING_INTERVAL_MS) {
      await sendConnectPing();
      lastPingAt = Date.now();
    }

    // Poll for instructions
    const instruction = await pollForInstruction();

    if (instruction) {
      await handleInstruction(instruction);
    }

    // Wait before next poll
    await sleep(INSTRUCTION_POLL_INTERVAL_MS);
  }

  log('Poller shutting down gracefully.');
}

// Graceful shutdown
process.on('SIGINT', () => {
  log('Received SIGINT — shutting down...');
  running = false;
});

process.on('SIGTERM', () => {
  log('Received SIGTERM — shutting down...');
  running = false;
});

main().catch((err) => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
