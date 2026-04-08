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

function buildApprovalLead(summary: ReturnType<typeof summarizeApprovalRequest>): string {
  const target = summary.target ?? 'this project';

  switch (summary.category) {
    case 'build':
      return `Claude wants to build the ${target} project.`;
    case 'test':
      return `Claude wants to run tests for the ${target} project.`;
    case 'dependencies':
      return `Claude wants to update dependencies for the ${target} project.`;
    case 'delete':
      return `Claude wants to delete files in ${target}.`;
    case 'push':
      return `Claude wants to push commits from ${target}.`;
    case 'env_change':
      return `Claude wants to change environment configuration for ${target}.`;
    case 'deploy':
      return `Claude wants to deploy changes from ${target}.`;
    case 'migration':
      return `Claude wants to run a database migration for ${target}.`;
    case 'edit':
      return `Claude wants to modify files in ${target}.`;
    case 'inspect':
      return `Claude wants to inspect ${target}.`;
    case 'unknown':
    default:
      return 'Claude wants approval to continue with a project action.';
  }
}

function buildCompactApprovalLines(summary: ReturnType<typeof summarizeApprovalRequest>): string[] {
  const lines = [`• BRB will run: ${summary.exactAction}`];

  if (summary.target) {
    lines.push(`• Target: ${summary.target}`);
  }

  switch (summary.category) {
    case 'build':
      lines.push('• This is a compile check only');
      lines.push('• It will not deploy anything');
      break;
    case 'test':
      lines.push('• This only runs the test suite');
      lines.push('• It will not publish or deploy anything');
      break;
    case 'dependencies':
      lines.push('• This will update packages and the lockfile');
      break;
    case 'delete':
      lines.push('• This permanently removes the targeted files');
      break;
    case 'push':
      lines.push('• This publishes commits to the remote repository');
      break;
    case 'env_change':
      lines.push('• This changes environment or secret configuration');
      break;
    case 'deploy':
      lines.push('• This could affect a live environment');
      break;
    case 'migration':
      lines.push('• This changes database schema or data');
      break;
    case 'edit':
      lines.push('• This applies file changes in the working tree');
      break;
    case 'inspect':
      lines.push('• This is read-only and should not change files');
      break;
    case 'unknown':
    default:
      lines.push('• This executes the requested action');
      break;
  }

  return lines;
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
  const lines = ['🤖 BRB — Approval Needed', '', buildApprovalLead(summary)];

  lines.push(
    '',
    'Why this is coming up:',
    summary.shortContext && summary.shortContext !== summary.reason
      ? summary.shortContext
      : summary.reason ?? 'BRB could not infer the reason confidently.',
  );

  lines.push('', 'If you approve:', ...buildCompactApprovalLines(summary));

  lines.push(
    '',
    `Risk: ${capitalize(summary.riskLevel)} — ${summary.riskReason ?? 'Review details if unsure'}`,
    'Reply: yes / no / why / details',
  );

  if (summary.pendingCount) {
    lines.push(
      summary.pendingCount === 1
        ? 'There is 1 other approval waiting. Reply "list"'
        : `There are ${summary.pendingCount} other approvals waiting. Reply "list"`,
    );
  }

  lines.push(
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
