import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { channelConnectionTypes } from '../channel-connections/channel-connection.model.js';

export const remoteInstructionStatuses = ['queued', 'dispatched', 'completed', 'failed'] as const;

const remoteInstructionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assistantConnectionId: {
      type: Schema.Types.ObjectId,
      ref: 'AssistantConnection',
      required: true,
      index: true,
    },
    channelType: {
      type: String,
      enum: channelConnectionTypes,
      required: true,
      index: true,
    },
    sourceChannelConnectionId: {
      type: Schema.Types.ObjectId,
      ref: 'ChannelConnection',
      required: false,
      index: true,
    },
    prompt: { type: String, required: true },
    status: {
      type: String,
      enum: remoteInstructionStatuses,
      default: 'queued',
      required: true,
      index: true,
    },
    targetProjectPath: { type: String, required: false, index: true },
    targetSessionId: { type: String, required: false, index: true },
    targetSessionLabel: { type: String, required: false },
    bridgeSessionId: { type: String, required: false },
    bridgeSessionTitle: { type: String, required: false },
    bridgeSessionLabel: { type: String, required: false },
    replyText: { type: String, required: false },
    errorMessage: { type: String, required: false },
    dispatchedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

remoteInstructionSchema.index({ assistantConnectionId: 1, status: 1, createdAt: 1 });
remoteInstructionSchema.index({ userId: 1, createdAt: -1 });

export type RemoteInstructionStatus = (typeof remoteInstructionStatuses)[number];
export type IRemoteInstruction = InferSchemaType<typeof remoteInstructionSchema>;
export type RemoteInstructionDocument = HydratedDocument<IRemoteInstruction>;
export const RemoteInstruction = mongoose.model('RemoteInstruction', remoteInstructionSchema);
