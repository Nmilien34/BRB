import { z } from 'zod';
import { approvalRequestStatuses } from './approval-request.model.js';

export const approvalRequestListQuerySchema = z.object({
  status: z.enum(approvalRequestStatuses).optional(),
});

export const approvalRequestParamsSchema = z.object({
  id: z.string().trim().regex(/^[0-9a-fA-F]{24}$/),
});

export type ApprovalRequestListQuery = z.infer<typeof approvalRequestListQuerySchema>;
export type ApprovalRequestParams = z.infer<typeof approvalRequestParamsSchema>;
