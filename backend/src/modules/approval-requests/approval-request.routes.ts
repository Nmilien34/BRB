import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  getApprovalRequestById,
  getApprovalRequests,
} from './approval-request.controller.js';
import {
  approvalRequestListQuerySchema,
  approvalRequestParamsSchema,
} from './approval-request.schemas.js';

const router = Router();

router.get('/', requireAuth, validate({ query: approvalRequestListQuerySchema }), getApprovalRequests);
router.get(
  '/:id',
  requireAuth,
  validate({ params: approvalRequestParamsSchema }),
  getApprovalRequestById,
);

export default router;
