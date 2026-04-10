import type { RemoteInstructionDocument } from '../../remote-instructions/remote-instruction.model.js';

const TELEGRAM_MESSAGE_MAX_CHARS = 3500;

function truncate(text: string, maxChars: number = TELEGRAM_MESSAGE_MAX_CHARS): string {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars - 1)}…`;
}

function getSessionLabel(remoteInstruction: RemoteInstructionDocument): string | null {
  return (
    remoteInstruction.bridgeSessionLabel ??
    remoteInstruction.targetSessionLabel ??
    remoteInstruction.bridgeSessionTitle ??
    null
  );
}

export function formatTelegramRemoteInstructionQueuedMessage(
  remoteInstruction: RemoteInstructionDocument,
  queuePosition: number = 0,
  projectName: string | null = null,
): string {
  const sessionLabel = getSessionLabel(remoteInstruction);
  const lines = ['🤖 BRB — Sent To Claude', ''];

  if (queuePosition > 0) {
    lines.push(`Queued — ${queuePosition} instruction${queuePosition === 1 ? '' : 's'} ahead`);
    lines.push('');
  }

  if (projectName) {
    lines.push(`Project: ${projectName}`);
    lines.push('');
  }

  if (sessionLabel) {
    lines.push(`Session: ${sessionLabel}`);
    lines.push('');
  }

  lines.push(truncate(remoteInstruction.prompt, 700));
  lines.push('');
  lines.push("I'll send Claude's reply here when it's ready.");

  return lines.join('\n');
}

export function formatTelegramRemoteInstructionReplyMessage(
  remoteInstruction: RemoteInstructionDocument,
): string {
  const sessionLabel = getSessionLabel(remoteInstruction);
  const lines = ['🤖 BRB — Claude Reply', ''];

  if (sessionLabel) {
    lines.push(`Session: ${sessionLabel}`);
    lines.push('');
  }

  const replyText = truncate(remoteInstruction.replyText?.trim() || 'Claude finished, but did not return a message.');
  lines.push(replyText);

  return lines.join('\n');
}

export function formatTelegramRemoteInstructionFailureMessage(
  remoteInstruction: RemoteInstructionDocument,
): string {
  const sessionLabel = getSessionLabel(remoteInstruction);
  const lines = ['🤖 BRB — Claude Couldn’t Complete That', ''];

  if (sessionLabel) {
    lines.push(`Session: ${sessionLabel}`);
    lines.push('');
  }

  lines.push(
    truncate(
      remoteInstruction.errorMessage?.trim() ||
        'Claude did not complete the request. Try again or ask for more details from your computer.',
      1200,
    ),
  );

  return lines.join('\n');
}
