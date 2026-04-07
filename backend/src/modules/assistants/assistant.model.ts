import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const assistantSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['claude-code', 'cursor', 'other'], required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true },
);

export type IAssistant = InferSchemaType<typeof assistantSchema>;
export const Assistant = mongoose.model('Assistant', assistantSchema);
