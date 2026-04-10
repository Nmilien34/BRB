import type { RequestHandler } from 'express';
import { requireAuthenticatedUser } from '../../middleware/auth.js';
import { RemoteInstruction } from './remote-instruction.model.js';
import { serializeRemoteInstruction } from './remote-instruction.serializer.js';

export const listRemoteInstructions: RequestHandler = async (req, res) => {
  const user = requireAuthenticatedUser(req);
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const skip = (page - 1) * limit;

  const [instructions, total] = await Promise.all([
    RemoteInstruction.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    RemoteInstruction.countDocuments({ userId: user._id }),
  ]);

  res.json({
    instructions: instructions.map(serializeRemoteInstruction),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
};
