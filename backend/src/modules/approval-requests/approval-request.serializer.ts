import type { ChannelConnectionType } from '../channel-connections/channel-connection.model.js';
import type {
  ApprovalRequestDocument,
  ApprovalRequestEscalationMode,
  ApprovalRequestEscalationStatus,
  ApprovalRequestStatus,
} from './approval-request.model.js';

export interface PublicApprovalRequest {
  id: string;
  assistantConnectionId: string;
  sourceType: string;
  sourceEventId: string | null;
  requestType: string;
  summary: string;
  sessionLabel: string | null;
  rawContext: unknown;
  status: ApprovalRequestStatus;
  selectedChannelType: ChannelConnectionType | null;
  escalationStatus: ApprovalRequestEscalationStatus;
  escalationMode: ApprovalRequestEscalationMode;
  desktopTimeoutAt: Date | null;
  escalatedAt: Date | null;
  deliveredAt: Date | null;
  deadlineAt: Date | null;
  resolvedAt: Date | null;
  resolutionSource: string | null;
  resolutionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type TimestampedApprovalRequestDocument = ApprovalRequestDocument & {
  createdAt: Date;
  updatedAt: Date;
};

export function serializeApprovalRequest(approvalRequest: ApprovalRequestDocument): PublicApprovalRequest {
  const timestampedApprovalRequest = approvalRequest as TimestampedApprovalRequestDocument;

  return {
    id: timestampedApprovalRequest.id,
    assistantConnectionId: String(timestampedApprovalRequest.assistantConnectionId),
    sourceType: timestampedApprovalRequest.sourceType,
    sourceEventId: timestampedApprovalRequest.sourceEventId
      ? String(timestampedApprovalRequest.sourceEventId)
      : null,
    requestType: timestampedApprovalRequest.requestType,
    summary: timestampedApprovalRequest.summary,
    sessionLabel: timestampedApprovalRequest.sessionLabel ?? null,
    rawContext: timestampedApprovalRequest.rawContext ?? null,
    status: timestampedApprovalRequest.status,
    selectedChannelType: timestampedApprovalRequest.selectedChannelType ?? null,
    escalationStatus: timestampedApprovalRequest.escalationStatus,
    escalationMode: timestampedApprovalRequest.escalationMode,
    desktopTimeoutAt: timestampedApprovalRequest.desktopTimeoutAt ?? null,
    escalatedAt: timestampedApprovalRequest.escalatedAt ?? null,
    deliveredAt: timestampedApprovalRequest.deliveredAt ?? null,
    deadlineAt: timestampedApprovalRequest.deadlineAt ?? null,
    resolvedAt: timestampedApprovalRequest.resolvedAt ?? null,
    resolutionSource: timestampedApprovalRequest.resolutionSource ?? null,
    resolutionNote: timestampedApprovalRequest.resolutionNote ?? null,
    createdAt: timestampedApprovalRequest.createdAt,
    updatedAt: timestampedApprovalRequest.updatedAt,
  };
}
