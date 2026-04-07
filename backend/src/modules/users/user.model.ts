import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { assistantTypes } from '../assistants/assistant.constants.js';
import { onboardingStatuses } from './user.constants.js';

const userSchema = new Schema(
  {
    phoneE164: { type: String, required: true, unique: true, index: true },
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

export type IUser = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<IUser>;
export const User = mongoose.model('User', userSchema);
