import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

const claudeHookEventProcessingStatuses = ['received', 'normalized', 'ignored', 'error'] as const;

const claudeHookEventSchema = new Schema(
  {
    assistantConnectionId: {
      type: Schema.Types.ObjectId,
      ref: 'AssistantConnection',
      required: true,
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    hookEventName: { type: String, required: true, index: true },
    toolName: { type: String, required: false },
    sessionId: { type: String, required: false },
    cwd: { type: String, required: false },
    transcriptPath: { type: String, required: false },
    rawPayload: { type: Schema.Types.Mixed, required: true },
    normalizedSummary: { type: String, required: false },
    processingStatus: {
      type: String,
      enum: claudeHookEventProcessingStatuses,
      default: 'received',
      required: true,
    },
    receivedAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

claudeHookEventSchema.index({ assistantConnectionId: 1, receivedAt: -1 });
claudeHookEventSchema.index({ userId: 1, receivedAt: -1 });

export type ClaudeHookEventProcessingStatus = (typeof claudeHookEventProcessingStatuses)[number];
export type IClaudeHookEvent = InferSchemaType<typeof claudeHookEventSchema>;
export type ClaudeHookEventDocument = HydratedDocument<IClaudeHookEvent>;
export const ClaudeHookEvent = mongoose.model('ClaudeHookEvent', claudeHookEventSchema);
