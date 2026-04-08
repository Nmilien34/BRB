import type { ApprovalRequestDocument } from '../../approval-requests/approval-request.model.js';

export type ApprovalRiskLevel = 'low' | 'medium' | 'high';

export type ApprovalActionCategory =
  | 'build'
  | 'test'
  | 'dependencies'
  | 'delete'
  | 'push'
  | 'env_change'
  | 'deploy'
  | 'migration'
  | 'edit'
  | 'inspect'
  | 'unknown';

export interface ApprovalSummary {
  title: string;
  intent: string;
  reason?: string;
  effect?: string;
  riskLevel: ApprovalRiskLevel;
  riskReason?: string;
  exactAction: string;
  target?: string;
  shortContext?: string;
  pendingCount?: number;
  approvalId: string;
  raw?: {
    tool?: string;
    cwd?: string;
    command?: string;
    files?: string[];
  };
}

interface ApprovalSummaryContext {
  approvalRequest: ApprovalRequestDocument;
  otherPendingCount?: number;
}

interface ApprovalActionDetails {
  category: ApprovalActionCategory;
  toolName?: string;
  cwd?: string;
  target?: string;
  exactAction: string;
  command?: string;
  files: string[];
  reasonHint?: string;
  shortContext?: string;
}

interface ApprovalNarrative {
  title: string;
  intent: string;
  reason: string;
  effect: string;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function getShortApprovalId(approvalId: string): string {
  return approvalId.slice(-6);
}

function getRawContext(approvalRequest: ApprovalRequestDocument): Record<string, unknown> {
  if (!approvalRequest.rawContext || typeof approvalRequest.rawContext !== 'object') {
    return {};
  }

  return approvalRequest.rawContext as Record<string, unknown>;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function getStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => getString(entry))
      .filter((entry): entry is string => Boolean(entry));
  }

  const stringValue = getString(value);
  return stringValue ? [stringValue] : [];
}

function basenameLike(value: string): string {
  const normalized = value.replace(/[\\/]+$/, '');
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? normalized;
}

function humanJoin(values: string[]): string {
  if (values.length <= 1) {
    return values[0] ?? '';
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}

function describeProjectTarget(target?: string): string {
  return target ? `the ${target} project` : 'the current project';
}

function describeTargetLocation(target?: string): string {
  return target ? `in ${target}` : 'in the current project';
}

function extractCommand(rawContext: Record<string, unknown>): string | undefined {
  const toolInput = rawContext.toolInput;

  if (typeof toolInput === 'string' && toolInput.trim().length > 0) {
    return toolInput.trim();
  }

  if (!toolInput || typeof toolInput !== 'object') {
    return undefined;
  }

  const record = toolInput as Record<string, unknown>;

  for (const field of ['command', 'cmd', 'shellCommand', 'shell_command']) {
    const value = getString(record[field]);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function extractFiles(rawContext: Record<string, unknown>): string[] {
  const directFiles = [
    ...getStringArray(rawContext.files),
    ...getStringArray(rawContext.filePaths),
    ...getStringArray(rawContext.paths),
    ...getStringArray(rawContext.changedFiles),
    ...getStringArray(rawContext.touchedFiles),
  ];

  const toolInput = rawContext.toolInput;

  if (!toolInput || typeof toolInput !== 'object') {
    return [...new Set(directFiles)];
  }

  const record = toolInput as Record<string, unknown>;
  const derivedFiles = [
    ...directFiles,
    ...getStringArray(record.files),
    ...getStringArray(record.filePaths),
    ...getStringArray(record.paths),
    ...getStringArray(record.targets),
    ...getStringArray(record.path),
    ...getStringArray(record.file),
    ...getStringArray(record.target),
  ];

  return [...new Set(derivedFiles)];
}

function inferTarget(
  approvalRequest: ApprovalRequestDocument,
  rawContext: Record<string, unknown>,
  files: string[],
): string | undefined {
  if (approvalRequest.sessionLabel?.trim() && approvalRequest.sessionLabel !== 'Claude session') {
    return approvalRequest.sessionLabel.trim();
  }

  const sessionLabel = getString(rawContext.sessionLabel);

  if (sessionLabel && sessionLabel !== 'Claude session') {
    return sessionLabel;
  }

  const cwd = getString(rawContext.cwd) ?? getString(rawContext.projectPath);

  if (cwd) {
    return basenameLike(cwd);
  }

  if (files.length > 0) {
    return basenameLike(files[0] as string);
  }

  return undefined;
}

function inferShortContext(
  rawContext: Record<string, unknown>,
): string | undefined {
  for (const field of ['taskContext', 'task', 'context']) {
    const value = getString(rawContext[field]);

    if (value) {
      return truncate(value, 140);
    }
  }

  return undefined;
}

function isBuildCommand(command: string): boolean {
  return /\b(npm\s+run\s+build|pnpm\s+(run\s+)?build|yarn\s+build|bun\s+run\s+build|next\s+build|vite\s+build|tsc\b|cargo\s+build|go\s+build|dotnet\s+build)\b/i
    .test(command);
}

function isTestCommand(command: string): boolean {
  return /\b(npm\s+(run\s+)?test|pnpm\s+(run\s+)?test|yarn\s+test|bun\s+test|vitest\b|jest\b|pytest\b|cargo\s+test|go\s+test)\b/i
    .test(command);
}

function isDependencyCommand(command: string): boolean {
  return /\b(npm\s+install|npm\s+i\b|pnpm\s+add|pnpm\s+install|yarn\s+add|yarn\s+install|bun\s+add|pip\s+install|poetry\s+add|cargo\s+add|go\s+get)\b/i
    .test(command);
}

function isDeleteCommand(command: string): boolean {
  return /(^|\s)(rm|rmdir|unlink|del)(\s|$)|git\s+clean\b/i.test(command);
}

function isPushCommand(command: string): boolean {
  return /\bgit\s+push\b/i.test(command);
}

function isDeployCommand(command: string): boolean {
  return /\b(deploy|vercel\b|netlify\b|fly\s+deploy\b|render\b|railway\b|kubectl\s+apply\b|helm\s+upgrade\b|terraform\s+apply\b|npm\s+publish\b|docker\s+push\b)\b/i
    .test(command);
}

function isMigrationCommand(command: string): boolean {
  return /\b(prisma\s+migrate|sequelize\s+db:migrate|knex\s+migrate|alembic\s+upgrade|rails\s+db:migrate|drizzle-kit\s+migrate|typeorm\s+migration:run)\b/i
    .test(command);
}

function touchesEnvConfig(command: string | undefined, files: string[]): boolean {
  if (command && /(^|\s)(\.env(\.[\w.-]+)?)(\s|$)|\bexport\s+[A-Z0-9_]+=|\benv\b/i.test(command)) {
    return true;
  }

  return files.some((file) => /(^|[\\/])\.env(\.[\w.-]+)?$/i.test(file));
}

export function classifyApprovalAction(details: {
  command?: string;
  toolName?: string;
  files?: string[];
}): ApprovalActionCategory {
  const command = details.command?.toLowerCase();
  const toolName = details.toolName?.toLowerCase();
  const files = details.files ?? [];

  if (touchesEnvConfig(command, files)) {
    return 'env_change';
  }

  if (command && isDeployCommand(command)) {
    return 'deploy';
  }

  if (command && isMigrationCommand(command)) {
    return 'migration';
  }

  if (command && isPushCommand(command)) {
    return 'push';
  }

  if (command && isDeleteCommand(command)) {
    return 'delete';
  }

  if (command && isDependencyCommand(command)) {
    return 'dependencies';
  }

  if (command && isBuildCommand(command)) {
    return 'build';
  }

  if (command && isTestCommand(command)) {
    return 'test';
  }

  if (toolName && ['read', 'grep', 'glob', 'ls', 'list', 'search', 'cat'].includes(toolName)) {
    return 'inspect';
  }

  if (toolName && ['edit', 'write', 'multiedit'].includes(toolName)) {
    return 'edit';
  }

  if (files.length > 0) {
    return 'edit';
  }

  if (command && /\b(ls|cat|grep|find|git\s+status|git\s+diff)\b/i.test(command)) {
    return 'inspect';
  }

  return 'unknown';
}

export function classifyApprovalRisk(category: ApprovalActionCategory): {
  riskLevel: ApprovalRiskLevel;
  riskReason: string;
} {
  switch (category) {
    case 'build':
      return { riskLevel: 'low', riskReason: 'local build/verification only' };
    case 'test':
      return { riskLevel: 'low', riskReason: 'runs tests without publishing changes' };
    case 'inspect':
      return { riskLevel: 'low', riskReason: 'read-only inspection or listing action' };
    case 'dependencies':
      return { riskLevel: 'medium', riskReason: 'changes project dependencies and lockfile' };
    case 'edit':
      return { riskLevel: 'medium', riskReason: 'updates project files in the working tree' };
    case 'delete':
      return { riskLevel: 'high', riskReason: 'destructive file deletion' };
    case 'push':
      return { riskLevel: 'high', riskReason: 'publishes commits to a remote repository' };
    case 'env_change':
      return { riskLevel: 'high', riskReason: 'changes environment or secret configuration' };
    case 'deploy':
      return { riskLevel: 'high', riskReason: 'could affect a live or shared environment' };
    case 'migration':
      return { riskLevel: 'high', riskReason: 'changes database structure or data' };
    case 'unknown':
    default:
      return { riskLevel: 'medium', riskReason: 'technical context is incomplete, so review details if unsure' };
  }
}

export function buildApprovalNarrative(details: {
  category: ApprovalActionCategory;
  target?: string;
  reasonHint?: string;
  files?: string[];
}): ApprovalNarrative {
  const filePreview = (details.files ?? []).length > 0
    ? humanJoin((details.files ?? []).slice(0, 3).map((file) => basenameLike(file)))
    : null;
  const projectTarget = describeProjectTarget(details.target);
  const targetLocation = describeTargetLocation(details.target);

  switch (details.category) {
    case 'build':
      return {
        title: 'Build Project',
        intent: `Claude wants to build ${projectTarget}.`,
        reason:
          details.reasonHint ??
          'It likely just made code changes and wants to verify the project still compiles.',
        effect:
          `BRB will run the build command ${targetLocation}. This checks for compile errors and will not deploy production by itself.`,
      };
    case 'test':
      return {
        title: 'Run Tests',
        intent: `Claude wants to run the test suite for ${projectTarget}.`,
        reason:
          details.reasonHint ??
          'It likely changed code and wants to verify behavior before continuing.',
        effect:
          `BRB will run the project tests ${targetLocation}. This verifies behavior without publishing anything.`,
      };
    case 'dependencies':
      return {
        title: 'Update Dependencies',
        intent: `Claude wants to install or update dependencies for ${projectTarget}.`,
        reason:
          details.reasonHint ??
          'It appears to need a package required for the feature or fix it is working on.',
        effect:
          `BRB will update project dependencies ${targetLocation}. This may change the lockfile and installed packages.`,
      };
    case 'delete':
      return {
        title: 'Delete Files',
        intent: `Claude wants to delete files ${targetLocation}.`,
        reason:
          details.reasonHint ??
          'It appears to be cleaning up generated, temporary, or obsolete files.',
        effect:
          'BRB will permanently remove the targeted files unless they are restored from git or a backup.',
      };
    case 'push':
      return {
        title: 'Push Commits',
        intent: `Claude wants to push commits from ${projectTarget} to the remote repository.`,
        reason:
          details.reasonHint ??
          'It appears to believe the current changes are ready to be shared remotely.',
        effect:
          'BRB will send local commits to the configured git remote, making them visible outside this machine.',
      };
    case 'env_change':
      return {
        title: 'Change Environment Config',
        intent: `Claude wants to change environment configuration for ${projectTarget}.`,
        reason:
          details.reasonHint ??
          'It appears to be updating configuration or secret-related settings needed for the task.',
        effect:
          'BRB will modify environment configuration, which can affect local behavior, deployments, or secrets handling.',
      };
    case 'deploy':
      return {
        title: 'Deploy Changes',
        intent: `Claude wants to deploy or publish changes from ${projectTarget}.`,
        reason:
          details.reasonHint ??
          'It appears to be trying to make the latest changes live or available to others.',
        effect:
          'BRB will run a deployment or publish command that could affect a live or shared environment.',
      };
    case 'migration':
      return {
        title: 'Run Database Migration',
        intent: `Claude wants to run a database migration for ${projectTarget}.`,
        reason:
          details.reasonHint ??
          'It appears to be updating schema or data shape for the current work.',
        effect:
          'BRB will modify database structure or data, which can have broader impact than a local code change.',
      };
    case 'edit':
      return {
        title: 'Modify Files',
        intent: `Claude wants to modify files in ${projectTarget}.`,
        reason:
          details.reasonHint ??
          (filePreview
            ? `It appears to be updating ${filePreview} for the current task.`
            : 'It appears to be implementing or adjusting code for the current task.'),
        effect:
          'BRB will apply file changes in the working tree. Review details if the affected files are sensitive.',
      };
    case 'inspect':
      return {
        title: 'Inspect Project',
        intent: `Claude wants to inspect the current state of ${projectTarget}.`,
        reason:
          details.reasonHint ??
          'It appears to be reading files or checking project state before taking the next step.',
        effect:
          'BRB will run a read-only inspection step. This should not modify your project.',
      };
    case 'unknown':
    default:
      return {
        title: 'Approval Needed',
        intent: 'Claude wants permission to run a development action in your project.',
        reason:
          details.reasonHint ??
          'BRB could not fully infer the reason from the raw request.',
        effect: 'The requested action will be executed.',
      };
  }
}

function buildActionDetails(approvalRequest: ApprovalRequestDocument): ApprovalActionDetails {
  const rawContext = getRawContext(approvalRequest);
  const toolName = getString(rawContext.toolName);
  const cwd = getString(rawContext.cwd) ?? getString(rawContext.projectPath);
  const command = extractCommand(rawContext);
  const files = extractFiles(rawContext);
  const target = inferTarget(approvalRequest, rawContext, files);
  const category = classifyApprovalAction({ command, toolName, files });
  const exactAction =
    command ??
    (files.length > 0
      ? `Modify ${truncate(humanJoin(files.map((file) => basenameLike(file))), 100)}`
      : toolName
        ? `Use ${toolName}`
        : truncate(approvalRequest.summary, 140));

  return {
    category,
    toolName,
    cwd,
    target,
    exactAction: truncate(exactAction, 280),
    command: command ? truncate(command, 280) : undefined,
    files,
    reasonHint: getString(rawContext.reason),
    shortContext: inferShortContext(rawContext),
  };
}

export function summarizeApprovalRequest({
  approvalRequest,
  otherPendingCount = 0,
}: ApprovalSummaryContext): ApprovalSummary {
  const details = buildActionDetails(approvalRequest);
  const { riskLevel, riskReason } = classifyApprovalRisk(details.category);
  const narrative = buildApprovalNarrative({
    category: details.category,
    target: details.target,
    reasonHint: details.reasonHint,
    files: details.files,
  });

  return {
    title: narrative.title,
    intent: narrative.intent,
    reason: truncate(narrative.reason, 220),
    effect: truncate(narrative.effect, 220),
    riskLevel,
    riskReason,
    exactAction: details.exactAction,
    target: details.target,
    shortContext: details.shortContext,
    pendingCount: otherPendingCount > 0 ? otherPendingCount : undefined,
    approvalId: getShortApprovalId(approvalRequest.id),
    raw: {
      tool: details.toolName,
      cwd: details.cwd,
      command: details.command,
      files: details.files.length > 0 ? details.files : undefined,
    },
  };
}
