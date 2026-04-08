import type { ApprovalRequestDocument } from '../../approval-requests/approval-request.model.js';
import { summarizeApprovalRequest } from '../approvals/summarize-approval.js';

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

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatFilePreview(files?: string[]): string | null {
  if (!files || files.length === 0) {
    return null;
  }

  const preview = files.slice(0, 3).join(', ');
  return files.length > 3 ? `${preview}, +${files.length - 3} more` : preview;
}

export function formatTelegramApprovalMessage(
  approvalRequest: ApprovalRequestDocument,
  otherPendingCount = 0,
): string {
  const summary = summarizeApprovalRequest({ approvalRequest, otherPendingCount });
  const lines = ['🤖 BRB — Approval Needed', '', summary.intent];

  if (summary.shortContext && summary.shortContext !== summary.reason) {
    lines.push('', `Context: ${summary.shortContext}`);
  }

  lines.push(
    '',
    `Why: ${summary.reason ?? 'BRB could not infer the reason confidently.'}`,
    `If approved: ${summary.effect ?? 'The requested action will be executed.'}`,
    `Risk: ${capitalize(summary.riskLevel)} — ${summary.riskReason ?? 'Review details if unsure'}`,
    `Action: ${summary.exactAction}`,
  );

  if (summary.target) {
    lines.push(`Target: ${summary.target}`);
  }

  if (summary.pendingCount) {
    lines.push('', `Pending: ${summary.pendingCount} other approvals pending — reply "list"`);
  }

  lines.push(
    '',
    'Reply:',
    'yes = approve',
    'no = deny',
    'why = more context',
    'details = raw technical details',
    `ID: ${summary.approvalId}`,
  );

  return lines.join('\n');
}

export function formatTelegramApprovalWhyMessage(
  approvalRequest: ApprovalRequestDocument,
): string {
  const summary = summarizeApprovalRequest({ approvalRequest });
  const lines = [
    '🤖 BRB — Why This Needs Approval',
    '',
    summary.intent,
  ];

  if (summary.shortContext) {
    lines.push('', `Context: ${summary.shortContext}`);
  }

  lines.push(
    '',
    `Why: ${summary.reason ?? 'BRB could not infer the reason confidently.'}`,
    `If approved: ${summary.effect ?? 'The requested action will be executed.'}`,
    `Risk: ${capitalize(summary.riskLevel)} — ${summary.riskReason ?? 'Review details if unsure'}`,
    `Action: ${summary.exactAction}`,
  );

  if (summary.target) {
    lines.push(`Target: ${summary.target}`);
  }

  lines.push('', 'Reply: yes / no / details / instructions', `ID: ${summary.approvalId}`);

  return lines.join('\n');
}

export function formatTelegramApprovalDetailsMessage(
  approvalRequest: ApprovalRequestDocument,
): string {
  const summary = summarizeApprovalRequest({ approvalRequest });
  const lines = [
    '🤖 BRB — Technical Details',
    '',
    `Summary: ${summary.intent}`,
  ];

  if (summary.raw?.command) {
    lines.push(`Command: ${summary.raw.command}`);
  } else {
    lines.push(`Action: ${summary.exactAction}`);
  }

  if (summary.raw?.tool) {
    lines.push(`Tool: ${summary.raw.tool}`);
  }

  if (summary.target) {
    lines.push(`Target: ${summary.target}`);
  }

  if (summary.raw?.cwd) {
    lines.push(`Directory: ${summary.raw.cwd}`);
  }

  const filePreview = formatFilePreview(summary.raw?.files);

  if (filePreview) {
    lines.push(`Files: ${filePreview}`);
  }

  if (summary.shortContext) {
    lines.push(`Context: ${summary.shortContext}`);
  }

  lines.push('', 'Reply: yes / no / why / instructions', `ID: ${summary.approvalId}`);

  return lines.join('\n');
}

export function formatTelegramPendingApprovalList(
  approvalRequests: ApprovalRequestDocument[],
): string {
  const lines = ['🤖 BRB — Pending Approvals', ''];

  approvalRequests.forEach((approvalRequest, index) => {
    const summary = summarizeApprovalRequest({ approvalRequest });
    const createdAt = approvalRequest.createdAt instanceof Date
      ? approvalRequest.createdAt
      : new Date(approvalRequest.createdAt);
    const primaryLabel = summary.target ?? 'Claude session';
    const secondaryLabel = summary.title.toLowerCase();

    lines.push(`${index + 1}. ${primaryLabel} — ${secondaryLabel} — ${formatTimeAgo(createdAt)}`);
  });

  lines.push('', 'Reply with a number to target a specific approval, or keep replying to the most recent one.');

  return lines.join('\n');
}

export function formatTelegramSelectedApprovalPrompt(
  approvalRequest: ApprovalRequestDocument,
  selectionIndex: number,
): string {
  const summary = summarizeApprovalRequest({ approvalRequest });

  return [
    `Selected #${selectionIndex}: ${summary.intent}`,
    'Reply yes / no / why / details, or send instructions for this approval.',
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
