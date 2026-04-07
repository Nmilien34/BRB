import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const approvalSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    prompt: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending' },
    respondedAt: { type: Date },
  },
  { timestamps: true },
);

export type IApproval = InferSchemaType<typeof approvalSchema>;
export const Approval = mongoose.model('Approval', approvalSchema);
