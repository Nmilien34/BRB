import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const messageSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true },
    direction: { type: String, enum: ['inbound', 'outbound'], required: true },
    channel: { type: String, enum: ['sms', 'voice'], required: true },
    body: { type: String, required: true },
  },
  { timestamps: true },
);

export type IMessage = InferSchemaType<typeof messageSchema>;
export const Message = mongoose.model('Message', messageSchema);
