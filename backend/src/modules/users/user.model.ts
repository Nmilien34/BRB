import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { assistantTypes } from '../assistants/assistant.constants.js';
import { onboardingStatuses } from './user.constants.js';

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: function (this: { phoneE164?: string | null }) {
        return !this.phoneE164;
      },
      trim: true,
    },
    email: {
      type: String,
      required: function (this: { phoneE164?: string | null }) {
        return !this.phoneE164;
      },
      trim: true,
      lowercase: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
      required: true,
    },
    phoneE164: {
      type: String,
      required: false,
      trim: true,
    },
    onboardingStatus: {
      type: String,
      enum: onboardingStatuses,
      default: 'started',
      required: true,
    },
    selectedAssistantType: {
      type: String,
      enum: assistantTypes,
      required: false,
    },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ phoneE164: 1 }, { unique: true, sparse: true });

export type IUser = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<IUser>;
export const User = mongoose.model('User', userSchema);
