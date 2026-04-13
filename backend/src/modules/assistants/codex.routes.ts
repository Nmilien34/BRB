import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  connectCodexBridge,
  getCodexBridgeApproval,
  getCodexBridgeInstruction,
  getCodexConnectionStatus,
  getCodexSetupPayload,
  ingestCodexBridgeHookEvent,
  postCodexBridgeInstructionResult,
  resolveCodexBridgeApproval,
  getCodexInstallScript,
} from './codex.controller.js';
import {
  bridgeApprovalParamsSchema,
  bridgeApprovalResolveBodySchema,
  bridgeConnectBodySchema,
  bridgeEventBodySchema,
  bridgeInstructionParamsSchema,
  bridgeInstructionResultBodySchema,
} from './claude.schemas.js';
import { requireClaudeBridgeAuth } from './require-claude-bridge-auth.js';

const router = Router();

// Public install endpoint — auth via token in URL
router.get('/install/:token', getCodexInstallScript);

// User-authenticated endpoints
router.get('/setup', requireAuth, getCodexSetupPayload);
router.get('/status', requireAuth, getCodexConnectionStatus);

// Bridge endpoints (auth via connection token)
router.post('/bridge/connect', requireClaudeBridgeAuth, validate({ body: bridgeConnectBodySchema }), connectCodexBridge);
router.post('/bridge/events', requireClaudeBridgeAuth, validate({ body: bridgeEventBodySchema }), ingestCodexBridgeHookEvent);
router.get(
  '/bridge/approval/:approvalId',
  requireClaudeBridgeAuth,
  validate({ params: bridgeApprovalParamsSchema }),
  getCodexBridgeApproval,
);
router.get('/bridge/instructions/next', requireClaudeBridgeAuth, getCodexBridgeInstruction);
router.post(
  '/bridge/instructions/:instructionId/result',
  requireClaudeBridgeAuth,
  validate({ params: bridgeInstructionParamsSchema, body: bridgeInstructionResultBodySchema }),
  postCodexBridgeInstructionResult,
);
router.post(
  '/bridge/approval/:approvalId/resolve',
  requireClaudeBridgeAuth,
  validate({ params: bridgeApprovalParamsSchema, body: bridgeApprovalResolveBodySchema }),
  resolveCodexBridgeApproval,
);

export default router;
