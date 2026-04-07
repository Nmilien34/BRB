import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const phoneNumberSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    number: { type: String, required: true, unique: true },
    verified: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type IPhoneNumber = InferSchemaType<typeof phoneNumberSchema>;
export const PhoneNumber = mongoose.model('PhoneNumber', phoneNumberSchema);
