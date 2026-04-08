import type { UserDocument } from '../users/user.model.js';
import type { AssistantConnectionDocument } from '../assistants/assistant-connection.model.js';
import type { ClaudeHookEventDocument } from '../assistants/claude-hook-event.model.js';
import type { ClaudeApprovalCandidate } from '../assistants/claude-approval.js';
import type { ChannelConnectionType } from '../channel-connections/channel-connection.model.js';
import { logger } from '../../utils/index.js';
import { HttpError } from '../../utils/httpError.js';
import {
  ApprovalRequest,
  type ApprovalRequestDocument,
  type ApprovalRequestStatus,
} from './approval-request.model.js';
import { type PublicApprovalRequest, serializeApprovalRequest } from './approval-request.serializer.js';

const APPROVAL_DEADLINE_MS = 10 * 60 * 1000;
const OPEN_APPROVAL_STATUSES: ApprovalRequestStatus[] = ['pending', 'delivered'];

interface ApprovalRequestListFilters {
  status?: ApprovalRequestStatus;
}

interface CreateApprovalRequestFromClaudeEventInput {
  assistantConnection: AssistantConnectionDocument;
  sourceEvent: ClaudeHookEventDocument;
  candidate: ClaudeApprovalCandidate;
}

type ApprovalResolutionStatus = 'approved' | 'denied' | 'responded' | 'expired' | 'canceled';

interface ResolveApprovalRequestInput {
  status: ApprovalResolutionStatus;
  resolutionSource: 'telegram' | 'discord' | 'sms' | 'web' | 'system';
  resolutionNote?: string | null;
}

export interface BridgeApprovalStatusResponse {
  approvalId: string;
  status: ApprovalRequestStatus;
  action: 'waiting' | 'approved' | 'denied' | 'instruction' | 'expired';
  instruction: string | null;
  resolvedAt: Date | null;
}

function isPastDeadline(approvalRequest: ApprovalRequestDocument): boolean {
  return Boolean(
    approvalRequest.deadlineAt &&
      approvalRequest.deadlineAt.getTime() <= Date.now() &&
      OPEN_APPROVAL_STATUSES.includes(approvalRequest.status),
  );
}

async function lazilyExpireApprovalRequest(
  approvalRequest: ApprovalRequestDocument,
): Promise<ApprovalRequestDocument> {
  if (!isPastDeadline(approvalRequest)) {
    return approvalRequest;
  }

  approvalRequest.status = 'expired';
  approvalRequest.resolvedAt = new Date();
  approvalRequest.resolutionSource = 'system';
  approvalRequest.resolutionNote = 'Approval timed out.';
  await approvalRequest.save();

  logger.info({ approvalRequestId: approvalRequest.id }, 'Approval request expired');

  return approvalRequest;
}

function mapApprovalToBridgeResponse(
  approvalRequest: ApprovalRequestDocument,
): BridgeApprovalStatusResponse {
  if (approvalRequest.status === 'approved') {
    return {
      approvalId: approvalRequest.id,
      status: approvalRequest.status,
      action: 'approved',
      instruction: null,
      resolvedAt: approvalRequest.resolvedAt ?? null,
    };
  }

  if (approvalRequest.status === 'denied' || approvalRequest.status === 'canceled') {
    return {
      approvalId: approvalRequest.id,
      status: approvalRequest.status,
      action: 'denied',
      instruction: null,
      resolvedAt: approvalRequest.resolvedAt ?? null,
    };
  }

  if (approvalRequest.status === 'responded') {
    return {
      approvalId: approvalRequest.id,
      status: approvalRequest.status,
      action: 'instruction',
      instruction: approvalRequest.resolutionNote ?? null,
      resolvedAt: approvalRequest.resolvedAt ?? null,
    };
  }

  if (approvalRequest.status === 'expired') {
    return {
      approvalId: approvalRequest.id,
      status: approvalRequest.status,
      action: 'expired',
      instruction: null,
      resolvedAt: approvalRequest.resolvedAt ?? null,
    };
  }

  return {
    approvalId: approvalRequest.id,
    status: approvalRequest.status,
    action: 'waiting',
    instruction: null,
    resolvedAt: null,
  };
}

export async function createApprovalRequestFromClaudeEvent({
  assistantConnection,
  sourceEvent,
  candidate,
}: CreateApprovalRequestFromClaudeEventInput): Promise<{
  approvalRequest: ApprovalRequestDocument;
  approval: PublicApprovalRequest;
  created: boolean;
}> {
  const existingApproval = await ApprovalRequest.findOne({
    assistantConnectionId: assistantConnection._id,
    dedupeKey: candidate.dedupeKey,
    status: { $in: OPEN_APPROVAL_STATUSES },
  }).sort({ createdAt: -1 });

  if (existingApproval) {
    logger.info(
      {
        approvalRequestId: existingApproval.id,
        assistantConnectionId: String(assistantConnection._id),
        sourceEventId: String(sourceEvent._id),
      },
      'Skipped duplicate Claude approval request',
    );

    return {
      approvalRequest: existingApproval,
      approval: serializeApprovalRequest(existingApproval),
      created: false,
    };
  }

  const approvalRequest = await ApprovalRequest.create({
    userId: assistantConnection.userId,
    assistantConnectionId: assistantConnection._id,
    sourceType: 'claude_code',
    sourceEventId: sourceEvent._id,
    requestType: candidate.requestType,
    summary: candidate.summary,
    rawContext: candidate.rawContext,
    dedupeKey: candidate.dedupeKey,
    status: 'pending',
    selectedChannelType: null,
    deliveredAt: null,
    deadlineAt: new Date(Date.now() + APPROVAL_DEADLINE_MS),
  });

  logger.info(
    {
      approvalRequestId: approvalRequest.id,
      assistantConnectionId: String(assistantConnection._id),
      sourceEventId: String(sourceEvent._id),
      requestType: candidate.requestType,
    },
    'Created Claude approval request',
  );

  return {
    approvalRequest,
    approval: serializeApprovalRequest(approvalRequest),
    created: true,
  };
}

export async function listApprovalRequestsForUser(
  user: UserDocument,
  filters: ApprovalRequestListFilters,
): Promise<PublicApprovalRequest[]> {
  const query: { userId: UserDocument['_id']; status?: ApprovalRequestStatus } = { userId: user._id };

  if (filters.status) {
    query.status = filters.status;
  }

  const approvalRequests = await ApprovalRequest.find(query).sort({ createdAt: -1 });

  return approvalRequests.map((approvalRequest) => serializeApprovalRequest(approvalRequest));
}

export async function getApprovalRequestForUser(
  user: UserDocument,
  approvalRequestId: string,
): Promise<PublicApprovalRequest> {
  const approvalRequest = await ApprovalRequest.findOne({
    _id: approvalRequestId,
    userId: user._id,
  });

  if (!approvalRequest) {
    throw new HttpError(404, 'Approval request not found.');
  }

  return serializeApprovalRequest(approvalRequest);
}

export async function markApprovalRequestDelivered(
  approvalRequest: ApprovalRequestDocument,
  channelType: ChannelConnectionType,
): Promise<ApprovalRequestDocument> {
  if (!OPEN_APPROVAL_STATUSES.includes(approvalRequest.status)) {
    return approvalRequest;
  }

  approvalRequest.selectedChannelType = channelType;
  approvalRequest.status = 'delivered';
  approvalRequest.deliveredAt = new Date();
  await approvalRequest.save();

  return approvalRequest;
}

export async function resolveApprovalRequest(
  approvalRequest: ApprovalRequestDocument,
  input: ResolveApprovalRequestInput,
): Promise<ApprovalRequestDocument> {
  const currentApproval = await lazilyExpireApprovalRequest(approvalRequest);

  if (!OPEN_APPROVAL_STATUSES.includes(currentApproval.status)) {
    return currentApproval;
  }

  currentApproval.status = input.status;
  currentApproval.resolutionSource = input.resolutionSource;
  currentApproval.resolutionNote = input.resolutionNote ?? null;
  currentApproval.resolvedAt = new Date();
  await currentApproval.save();

  logger.info(
    {
      approvalRequestId: currentApproval.id,
      status: currentApproval.status,
      resolutionSource: currentApproval.resolutionSource,
    },
    'Approval request resolved',
  );

  return currentApproval;
}

export async function findLatestOpenApprovalRequestForUser(
  userId: UserDocument['_id'],
): Promise<ApprovalRequestDocument | null> {
  const approvalRequests = await ApprovalRequest.find({
    userId,
    status: { $in: OPEN_APPROVAL_STATUSES },
  }).sort({ createdAt: -1 });

  for (const approvalRequest of approvalRequests) {
    const currentApproval = await lazilyExpireApprovalRequest(approvalRequest);

    if (OPEN_APPROVAL_STATUSES.includes(currentApproval.status)) {
      return currentApproval;
    }
  }

  return null;
}

export async function getApprovalRequestBridgeStatus(
  assistantConnection: AssistantConnectionDocument,
  approvalRequestId: string,
): Promise<BridgeApprovalStatusResponse> {
  const approvalRequest = await ApprovalRequest.findOne({
    _id: approvalRequestId,
    assistantConnectionId: assistantConnection._id,
  });

  if (!approvalRequest) {
    throw new HttpError(404, 'Approval request not found.');
  }

  const currentApproval = await lazilyExpireApprovalRequest(approvalRequest);

  return mapApprovalToBridgeResponse(currentApproval);
}
