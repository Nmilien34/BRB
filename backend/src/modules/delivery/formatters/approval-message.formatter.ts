import type { ApprovalRequestDocument } from '../../approval-requests/approval-request.model.js';

function getShortApprovalId(approvalId: string): string {
  return approvalId.slice(-6);
}

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

function formatTimeAgo(date: Date): string {
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) {
    return 'just now';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getToolName(rawContext: Record<string, unknown>): string {
  return (typeof rawContext.toolName === 'string' && rawContext.toolName.trim()) || 'Unknown tool';
}

function getSessionLabel(approvalRequest: ApprovalRequestDocument, rawContext: Record<string, unknown>): string {
  if (approvalRequest.sessionLabel?.trim()) {
    return approvalRequest.sessionLabel.trim();
  }

  if (typeof rawContext.sessionLabel === 'string' && rawContext.sessionLabel.trim()) {
    return rawContext.sessionLabel.trim();
  }

  return 'Claude session';
}

export function formatTelegramApprovalMessage(
  approvalRequest: ApprovalRequestDocument,
  otherPendingCount = 0,
): string {
  const rawContext = getRawContext(approvalRequest);
  const toolName = getToolName(rawContext);
  const sessionLabel = getSessionLabel(approvalRequest, rawContext);
  const command = stringifyToolInput(rawContext.toolInput);
  const cwd =
    (typeof rawContext.cwd === 'string' && rawContext.cwd.trim()) ||
    (typeof rawContext.projectPath === 'string' && rawContext.projectPath.trim()) ||
    null;
  const toolInputSummary = command ??
    (typeof rawContext.reason === 'string' && rawContext.reason.trim()
      ? truncate(rawContext.reason.trim(), 280)
      : truncate(approvalRequest.summary, 280));

  const lines = [
    '🤖 BRB — Approval Request',
    '',
    `📁 ${sessionLabel}`,
    `🛠 Tool: ${toolName}`,
    `⚡ ${toolInputSummary}`,
  ];

  if (cwd) {
    lines.push(`📂 ${cwd}`);
  }

  if (otherPendingCount > 0) {
    lines.push('', `⚠️ ${otherPendingCount} other approvals pending — reply "list" to see all`);
  }

  lines.push(
    '',
    'Reply:',
    '✅ yes — approve',
    '❌ no — deny',
    '💬 anything else — send as instruction',
    '',
    `ID: ${getShortApprovalId(approvalRequest.id)}`,
  );

  return lines.join('\n');
}

export function formatTelegramPendingApprovalList(
  approvalRequests: ApprovalRequestDocument[],
): string {
  const lines = ['🤖 BRB — Pending Approvals', ''];

  approvalRequests.forEach((approvalRequest, index) => {
    const rawContext = getRawContext(approvalRequest);
    const sessionLabel = getSessionLabel(approvalRequest, rawContext);
    const toolName = getToolName(rawContext);
    const createdAt = approvalRequest.createdAt instanceof Date
      ? approvalRequest.createdAt
      : new Date(approvalRequest.createdAt);

    lines.push(`${index + 1}. ${sessionLabel} — ${toolName} — ${formatTimeAgo(createdAt)}`);
  });

  lines.push('', 'Reply with a number to target a specific approval, or keep replying to the most recent one.');

  return lines.join('\n');
}

export function formatTelegramSelectedApprovalPrompt(
  approvalRequest: ApprovalRequestDocument,
  selectionIndex: number,
): string {
  const rawContext = getRawContext(approvalRequest);
  const sessionLabel = getSessionLabel(approvalRequest, rawContext);
  const toolName = getToolName(rawContext);

  return [
    `Selected #${selectionIndex}: ${sessionLabel} — ${toolName}`,
    'Reply yes/no or send instructions for this approval.',
  ].join('\n');
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
