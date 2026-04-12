import type { RemoteInstructionDocument } from '../../remote-instructions/remote-instruction.model.js';

const TELEGRAM_MESSAGE_MAX_CHARS = 3500;

function truncate(text: string, maxChars: number = TELEGRAM_MESSAGE_MAX_CHARS): string {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars - 1)}...`;
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
  activeProjectCount: number = 1,
  agentDisplayName: string = 'Claude',
): string {
  const sessionLabel = getSessionLabel(remoteInstruction);
  const lines = [`Sent To ${agentDisplayName}`, ''];

  if (queuePosition > 0) {
    lines.push(`Queued -- ${queuePosition} instruction${queuePosition === 1 ? '' : 's'} ahead`);
    lines.push('');
  }

  if (projectName) {
    lines.push(`Project: ${projectName}`);
    if (activeProjectCount > 1) {
      lines.push('(Tip: use @projectname to target a specific project)');
    }
    lines.push('');
  }

  if (sessionLabel) {
    lines.push(`Session: ${sessionLabel}`);
    lines.push('');
  }

  lines.push(truncate(remoteInstruction.prompt, 700));
  lines.push('');
  lines.push(`I'll send ${agentDisplayName}'s reply here when it's ready.`);

  return lines.join('\n');
}

export function formatTelegramRemoteInstructionReplyMessage(
  remoteInstruction: RemoteInstructionDocument,
  agentDisplayName: string = 'Claude',
): string {
  const sessionLabel = getSessionLabel(remoteInstruction);
  const lines = [`${agentDisplayName} Reply`, ''];

  if (sessionLabel) {
    lines.push(`Session: ${sessionLabel}`);
    lines.push('');
  }

  const replyText = truncate(remoteInstruction.replyText?.trim() || `${agentDisplayName} finished, but did not return a message.`);
  lines.push(replyText);

  return lines.join('\n');
}

export function formatTelegramRemoteInstructionFailureMessage(
  remoteInstruction: RemoteInstructionDocument,
  agentDisplayName: string = 'Claude',
): string {
  const sessionLabel = getSessionLabel(remoteInstruction);
  const lines = [`${agentDisplayName} Couldn't Complete That`, ''];

  if (sessionLabel) {
    lines.push(`Session: ${sessionLabel}`);
    lines.push('');
  }

  lines.push(
    truncate(
      remoteInstruction.errorMessage?.trim() ||
        `${agentDisplayName} did not complete the request. Try again or ask for more details from your computer.`,
      1200,
    ),
  );

  return lines.join('\n');
}
