import type { AssistantConnectionDocument } from '../modules/assistants/assistant-connection.model.js';
import type { UserDocument } from '../modules/users/user.model.js';

declare global {
  namespace Express {
    interface Request {
      assistantConnection?: AssistantConnectionDocument;
      user?: UserDocument;
    }
  }
}

export {};
