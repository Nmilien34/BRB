import type { RequestHandler } from 'express';
import { requireAuthenticatedUser } from '../../middleware/auth.js';
import type {
  ApprovalRequestListQuery,
  ApprovalRequestParams,
} from './approval-request.schemas.js';
import {
  getApprovalRequestForUser,
  listApprovalRequestsForUser,
} from './approval-request.service.js';

export const getApprovalRequests: RequestHandler = async (req, res) => {
  const user = requireAuthenticatedUser(req);
  const { status } = req.query as ApprovalRequestListQuery;
  const approvals = await listApprovalRequestsForUser(user, { status });

  res.json({ approvals });
};

export const getApprovalRequestById: RequestHandler = async (req, res) => {
  const user = requireAuthenticatedUser(req);
  const { id } = req.params as ApprovalRequestParams;
  const approval = await getApprovalRequestForUser(user, id);

  res.json({ approval });
};
