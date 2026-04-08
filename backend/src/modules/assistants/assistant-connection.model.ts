import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';
import {
  assistantConnectionAuthMethods,
  assistantConnectionStatuses,
  assistantTypes,
} from './assistant.constants.js';

const assistantConnectionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assistantType: { type: String, enum: assistantTypes, required: true, index: true },
    status: {
      type: String,
      enum: assistantConnectionStatuses,
      default: 'selected',
      required: true,
    },
    authMethod: {
      type: String,
      enum: assistantConnectionAuthMethods,
      default: 'hook',
      required: true,
    },
    connectionTokenHash: { type: String, required: false },
    connectionTokenPreview: { type: String, required: false },
    metadata: { type: Schema.Types.Mixed, default: () => ({}) },
    awayModeEnabled: { type: Boolean, default: false, required: true },
    awayModeActivatedAt: { type: Date, default: null },
    escalationDelayMinutes: { type: Number, default: 2, required: true },
    lastConnectedAt: { type: Date, default: null },
    lastEventAt: { type: Date, default: null },
  },
  { timestamps: true },
);

assistantConnectionSchema.index({ userId: 1, assistantType: 1 }, { unique: true });
assistantConnectionSchema.index({ connectionTokenHash: 1 }, { sparse: true, unique: true });

export type IAssistantConnection = InferSchemaType<typeof assistantConnectionSchema>;
export type AssistantConnectionDocument = HydratedDocument<IAssistantConnection>;
export const AssistantConnection = mongoose.model('AssistantConnection', assistantConnectionSchema);
