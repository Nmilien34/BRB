import type { UserDocument } from '../users/user.model.js';
import type { PublicAssistantConnection } from './assistant.constants.js';
import { serializeAssistantConnection } from './assistant.serializer.js';
import { AssistantConnection } from './assistant-connection.model.js';

export async function listAssistantConnectionsForUser(
  user: UserDocument,
): Promise<PublicAssistantConnection[]> {
  const assistants = await AssistantConnection.find({ userId: user._id }).sort({ updatedAt: -1 });

  return assistants.map((assistant) => serializeAssistantConnection(assistant));
}
