import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { channelConnectionTypes } from '../channel-connections/channel-connection.model.js';

export const approvalRequestStatuses = [
  'pending',
  'delivered',
  'approved',
  'denied',
  'responded',
  'expired',
  'canceled',
] as const;

export const approvalRequestEscalationStatuses = [
  'pending_local',
  'escalated',
  'resolved_locally',
  'expired',
] as const;

export const approvalRequestEscalationModes = ['manual_away', 'timer_based'] as const;

const approvalRequestSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assistantConnectionId: {
      type: Schema.Types.ObjectId,
      ref: 'AssistantConnection',
      required: true,
      index: true,
    },
    sourceType: { type: String, required: true, index: true },
    sourceEventId: {
      type: Schema.Types.ObjectId,
      ref: 'ClaudeHookEvent',
      required: false,
      index: true,
    },
    requestType: { type: String, required: true, index: true },
    summary: { type: String, required: true },
    sessionLabel: { type: String, required: false },
    rawContext: { type: Schema.Types.Mixed, required: false },
    dedupeKey: { type: String, required: false, index: true },
    status: {
      type: String,
      enum: approvalRequestStatuses,
      default: 'pending',
      required: true,
      index: true,
    },
    selectedChannelType: {
      type: String,
      enum: channelConnectionTypes,
      required: false,
      default: null,
    },
    escalationStatus: {
      type: String,
      enum: approvalRequestEscalationStatuses,
      default: 'pending_local',
      required: true,
      index: true,
    },
    escalationMode: {
      type: String,
      enum: approvalRequestEscalationModes,
      default: 'timer_based',
      required: true,
    },
    desktopTimeoutAt: { type: Date, default: null },
    escalatedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    deadlineAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    resolutionSource: { type: String, required: false },
    resolutionNote: { type: String, required: false },
  },
  { timestamps: true },
);

approvalRequestSchema.index({ userId: 1, status: 1, createdAt: -1 });
approvalRequestSchema.index({ assistantConnectionId: 1, createdAt: -1 });
approvalRequestSchema.index({ assistantConnectionId: 1, dedupeKey: 1, status: 1, createdAt: -1 });
approvalRequestSchema.index({ escalationStatus: 1, desktopTimeoutAt: 1, status: 1 });

export type ApprovalRequestStatus = (typeof approvalRequestStatuses)[number];
export type ApprovalRequestEscalationStatus = (typeof approvalRequestEscalationStatuses)[number];
export type ApprovalRequestEscalationMode = (typeof approvalRequestEscalationModes)[number];
export type IApprovalRequest = InferSchemaType<typeof approvalRequestSchema>;
export type ApprovalRequestDocument = HydratedDocument<IApprovalRequest>;
export const ApprovalRequest = mongoose.model('ApprovalRequest', approvalRequestSchema);
