import type { UserDocument } from '../users/user.model.js';
import { ChannelConnection } from '../channel-connections/channel-connection.model.js';
import { type PublicChannelConnection, serializeChannelConnection } from './channel.serializer.js';

export async function listChannelConnectionsForUser(user: UserDocument): Promise<PublicChannelConnection[]> {
  const channelConnections = await ChannelConnection.find({ userId: user._id }).sort({ updatedAt: -1 });

  return channelConnections.map((channelConnection) => serializeChannelConnection(channelConnection));
}
