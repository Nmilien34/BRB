// Inline script content for the BRB Codex install endpoint.
// The bridge script is identical to Claude's (same hook event format).
// The poller differs only in the CLI execution command.

// Re-export the bridge script — Codex hooks use the same JSON stdin format
export { BRIDGE_SCRIPT } from './claude-install-scripts.js';

export const CODEX_POLLER_SCRIPT = `#!/usr/bin/env node
import { spawn, execFile } from 'node:child_process';
import { hostname } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const BRB_CONNECTION_TOKEN = process.env.BRB_CONNECTION_TOKEN;
const BRB_CONNECT_URL = process.env.BRB_CONNECT_URL;
const BRB_INSTRUCTIONS_URL = process.env.BRB_INSTRUCTIONS_URL;
const BRB_INSTRUCTION_RESULT_URL = process.env.BRB_INSTRUCTION_RESULT_URL;

const CONNECT_PING_INTERVAL_MS = 30000;
const INSTRUCTION_POLL_INTERVAL_MS = 5000;
const CODEX_EXECUTION_TIMEOUT_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15000;
const MAX_REPLY_LENGTH = 3500;
const MAX_CONSECUTIVE_AUTH_FAILURES = 10;

let running = true;
let executingInstruction = false;
let consecutiveAuthFailures = 0;

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
    consecutiveAuthFailures = 0;
    log('Ping OK — status: ' + result.status + ', away: ' + result.awayModeEnabled);
  } catch (err) {
    log('Ping FAILED: ' + err.message);
    if (err.message && err.message.includes('401')) {
      consecutiveAuthFailures++;
      if (consecutiveAuthFailures >= MAX_CONSECUTIVE_AUTH_FAILURES) {
        log('Too many consecutive auth failures (' + consecutiveAuthFailures + ') — token is likely invalid. Exiting cleanly. Re-run the install command to get a new token.');
        running = false;
      }
    }
  }
}

async function pollForInstruction() {
  if (!BRB_INSTRUCTIONS_URL || executingInstruction) return null;
  try {
    const url = BRB_INSTRUCTIONS_URL + '?cwd=' + encodeURIComponent(process.cwd());
    const result = await fetchJSON(url, { method: 'GET', headers: authHeaders() });
    return result.instruction || null;
  } catch (err) { log('Poll error: ' + err.message); return null; }
}

function mapCodexError(stderr, exitCode) {
  const lower = stderr.toLowerCase();
  if (lower.includes('api key') || lower.includes('authentication') || lower.includes('openai_api_key')) {
    return 'Codex API key not set or invalid. Check OPENAI_API_KEY in your environment.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('429')) {
    return 'Codex API rate limit reached. Try again in a few minutes.';
  }
  if (lower.includes('command not found') || exitCode === 127) {
    return 'Codex CLI not installed. Visit https://github.com/openai/codex to install.';
  }
  if (!stderr.trim() && exitCode !== 0) {
    return 'Codex exited unexpectedly (code ' + exitCode + ')';
  }
  return 'Codex error (code ' + exitCode + '): ' + stderr.slice(0, 200).trim();
}

function executeCodexCLI(prompt) {
  return new Promise((resolve, reject) => {
    let stdout = ''; let stderr = ''; let killed = false;
    const args = ['--quiet', '--json', prompt];
    const child = spawn('codex', args, {
      cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env },
    });
    const timer = setTimeout(() => { killed = true; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 5000); }, CODEX_EXECUTION_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (killed) { reject(new Error('Codex execution timed out after ' + (CODEX_EXECUTION_TIMEOUT_MS / 60000) + ' minutes')); return; }
      if (code !== 0) { reject(new Error(mapCodexError(stderr, code))); return; }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve({ text: parsed.result || parsed.text || parsed.message || stdout.trim() });
      } catch {
        resolve({ text: stdout.trim() });
      }
    });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

function truncate(text, max) { return text.length <= max ? text : text.slice(0, max - 1) + '...'; }

async function getGitDiffSummary() {
  try {
    await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: process.cwd() });
    const { stdout } = await execFileAsync('git', ['diff', '--stat', 'HEAD'], { cwd: process.cwd(), timeout: 10000 });
    const stat = stdout.trim();
    if (!stat) return null;
    return stat;
  } catch {
    return null;
  }
}

async function reportResult(instructionId, status, replyText, errorMessage) {
  const resultUrl = BRB_INSTRUCTION_RESULT_URL.replace(':instructionId', instructionId);
  try {
    await fetchJSON(resultUrl, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({
        status,
        replyText: replyText ? truncate(replyText, MAX_REPLY_LENGTH) : undefined,
        errorMessage: errorMessage ? truncate(errorMessage, 1200) : undefined,
      }),
    });
    log('Reported ' + status + ' for instruction ' + instructionId);
  } catch (err) { log('Failed to report result: ' + err.message); }
}

async function handleInstruction(instruction) {
  executingInstruction = true;
  const { id, prompt } = instruction;
  log('Executing instruction ' + id + ': "' + prompt.slice(0, 80) + '..."');
  try {
    const { text } = await executeCodexCLI(prompt);
    let replyText = text;
    const diffSummary = await getGitDiffSummary();
    if (diffSummary) { replyText = replyText + '\\n\\nFiles changed:\\n' + diffSummary; }
    log('Codex completed — ' + replyText.length + ' chars');
    await reportResult(id, 'completed', replyText, null);
  } catch (err) {
    log('Codex failed: ' + err.message);
    await reportResult(id, 'failed', null, err.message);
  } finally { executingInstruction = false; }
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function main() {
  if (!BRB_CONNECTION_TOKEN || !BRB_CONNECT_URL) { log('ERROR: Missing env vars'); process.exit(1); }
  log('BRB Codex Poller starting...');
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
main().catch((err) => { log('Fatal: ' + err.message); process.exit(0); });
`;
