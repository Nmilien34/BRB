import type { ApprovalRequestDocument } from '../../approval-requests/approval-request.model.js';

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function stringifyToolInput(toolInput: unknown): string | null {
  if (typeof toolInput === 'string' && toolInput.trim().length > 0) {
    return truncate(toolInput.trim(), 280);
  }

  if (!toolInput || typeof toolInput !== 'object') {
    return null;
  }

  const record = toolInput as Record<string, unknown>;
  const commandFields = ['command', 'cmd', 'shellCommand', 'shell_command'];

  for (const field of commandFields) {
    const value = record[field];

    if (typeof value === 'string' && value.trim().length > 0) {
      return truncate(value.trim(), 280);
    }
  }

  try {
    return truncate(JSON.stringify(toolInput), 280);
  } catch {
    return null;
  }
}

function getRawContext(approvalRequest: ApprovalRequestDocument): Record<string, unknown> {
  if (!approvalRequest.rawContext || typeof approvalRequest.rawContext !== 'object') {
    return {};
  }

  return approvalRequest.rawContext as Record<string, unknown>;
}

export function formatTelegramApprovalMessage(approvalRequest: ApprovalRequestDocument): string {
  const rawContext = getRawContext(approvalRequest);
  const toolName =
    (typeof rawContext.toolName === 'string' && rawContext.toolName.trim()) || 'a tool';
  const command = stringifyToolInput(rawContext.toolInput);
  const cwd =
    (typeof rawContext.cwd === 'string' && rawContext.cwd.trim()) ||
    (typeof rawContext.projectPath === 'string' && rawContext.projectPath.trim()) ||
    null;
  const reason = typeof rawContext.reason === 'string' && rawContext.reason.trim()
    ? truncate(rawContext.reason.trim(), 280)
    : approvalRequest.summary;

  const lines = [
    '🤖 BRB - Approval Request',
    '',
    `Claude wants to use: ${toolName}`,
    `Request: ${reason}`,
  ];

  if (command) {
    lines.push(`Command: ${command}`);
  }

  if (cwd) {
    lines.push(`Directory: ${cwd}`);
  }

  lines.push(
    '',
    'Reply with:',
    'yes - approve',
    'no - deny',
    'anything else - send as instruction',
  );

  return lines.join('\n');
}

export function formatTelegramApprovalConfirmation(
  status: ApprovalRequestDocument['status'],
): string {
  if (status === 'approved') {
    return '✓ Approved. Claude will continue.';
  }

  if (status === 'denied') {
    return '✗ Denied. Claude has been stopped.';
  }

  if (status === 'expired') {
    return '⏱️ This approval has already expired.';
  }

  return '📩 Instruction sent to Claude.';
}
