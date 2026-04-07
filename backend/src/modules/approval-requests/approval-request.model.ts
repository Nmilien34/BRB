import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { channelConnectionTypes } from '../channel-connections/channel-connection.model.js';

export const approvalRequestStatuses = [
  'pending',
  'delivered',
  'approved',
  'denied',
  'expired',
  'canceled',
] as const;

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
    rawContext: { type: Schema.Types.Mixed, required: false },
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
    },
    deadlineAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    resolutionSource: { type: String, required: false },
    resolutionNote: { type: String, required: false },
  },
  { timestamps: true },
);

approvalRequestSchema.index({ userId: 1, status: 1, createdAt: -1 });
approvalRequestSchema.index({ assistantConnectionId: 1, createdAt: -1 });

export type ApprovalRequestStatus = (typeof approvalRequestStatuses)[number];
export type IApprovalRequest = InferSchemaType<typeof approvalRequestSchema>;
export type ApprovalRequestDocument = HydratedDocument<IApprovalRequest>;
export const ApprovalRequest = mongoose.model('ApprovalRequest', approvalRequestSchema);
