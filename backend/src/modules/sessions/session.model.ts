import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assistantId: { type: Schema.Types.ObjectId, ref: 'Assistant', required: true },
    status: { type: String, enum: ['active', 'paused', 'ended'], default: 'active' },
  },
  { timestamps: true },
);

export type ISession = InferSchemaType<typeof sessionSchema>;
export const Session = mongoose.model('Session', sessionSchema);
