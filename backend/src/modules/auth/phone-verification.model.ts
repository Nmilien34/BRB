import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

const phoneVerificationSchema = new Schema(
  {
    phoneE164: { type: String, required: true, unique: true, index: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0, min: 0 },
    lastSentAt: { type: Date, required: true },
    verifiedAt: { type: Date, required: false },
  },
  { timestamps: true },
);

phoneVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type IPhoneVerification = InferSchemaType<typeof phoneVerificationSchema>;
export type PhoneVerificationDocument = HydratedDocument<IPhoneVerification>;
export const PhoneVerification = mongoose.model('PhoneVerification', phoneVerificationSchema);
