import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const channelConnectionTypes = ['telegram', 'discord', 'whatsapp', 'sms', 'voice'] as const;
export const channelConnectionStatuses = ['pending', 'connected', 'disabled', 'error'] as const;

const channelConnectionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: channelConnectionTypes, required: true, index: true },
    status: {
      type: String,
      enum: channelConnectionStatuses,
      default: 'pending',
      required: true,
    },
    identifier: { type: String, required: true },
    label: { type: String, required: false },
    metadata: { type: Schema.Types.Mixed, default: () => ({}) },
    lastConnectedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

channelConnectionSchema.index({ userId: 1, type: 1, identifier: 1 }, { unique: true });

export type ChannelConnectionType = (typeof channelConnectionTypes)[number];
export type ChannelConnectionStatus = (typeof channelConnectionStatuses)[number];
export type IChannelConnection = InferSchemaType<typeof channelConnectionSchema>;
export type ChannelConnectionDocument = HydratedDocument<IChannelConnection>;
export const ChannelConnection = mongoose.model('ChannelConnection', channelConnectionSchema);
