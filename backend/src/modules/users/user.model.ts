import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);

export type IUser = InferSchemaType<typeof userSchema>;
export const User = mongoose.model('User', userSchema);
