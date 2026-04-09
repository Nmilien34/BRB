import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  connectClaudeBridge,
  disableClaudeAwayMode,
  enableClaudeAwayMode,
  getClaudeAwayMode,
  getClaudeBridgeApproval,
  getClaudeBridgeInstruction,
  getClaudeConnectionStatus,
  getClaudeSetupPayload,
  ingestClaudeBridgeHookEvent,
  patchClaudeSettings,
  postClaudeBridgeInstructionResult,
  resolveClaudeBridgeApproval,
  getInstallScript,
  selectClaudeConnection,
} from './claude.controller.js';
import {
  bridgeApprovalParamsSchema,
  bridgeApprovalResolveBodySchema,
  bridgeConnectBodySchema,
  bridgeEventBodySchema,
  bridgeInstructionParamsSchema,
  bridgeInstructionResultBodySchema,
  claudeSettingsBodySchema,
} from './claude.schemas.js';
import { requireClaudeBridgeAuth } from './require-claude-bridge-auth.js';

const router = Router();

// Public install endpoint — auth via token in URL
router.get('/install/:token', getInstallScript);

router.post('/select', requireAuth, selectClaudeConnection);
router.get('/setup', requireAuth, getClaudeSetupPayload);
router.get('/status', requireAuth, getClaudeConnectionStatus);
router.patch('/settings', requireAuth, validate({ body: claudeSettingsBodySchema }), patchClaudeSettings);
router.post('/away-mode/on', requireAuth, enableClaudeAwayMode);
router.post('/away-mode/off', requireAuth, disableClaudeAwayMode);
router.get('/away-mode/status', requireAuth, getClaudeAwayMode);

router.post('/bridge/connect', requireClaudeBridgeAuth, validate({ body: bridgeConnectBodySchema }), connectClaudeBridge);
router.post('/bridge/events', requireClaudeBridgeAuth, validate({ body: bridgeEventBodySchema }), ingestClaudeBridgeHookEvent);
router.get(
  '/bridge/approval/:approvalId',
  requireClaudeBridgeAuth,
  validate({ params: bridgeApprovalParamsSchema }),
  getClaudeBridgeApproval,
);
router.get('/bridge/instructions/next', requireClaudeBridgeAuth, getClaudeBridgeInstruction);
router.post(
  '/bridge/instructions/:instructionId/result',
  requireClaudeBridgeAuth,
  validate({ params: bridgeInstructionParamsSchema, body: bridgeInstructionResultBodySchema }),
  postClaudeBridgeInstructionResult,
);
router.post(
  '/bridge/approval/:approvalId/resolve',
  requireClaudeBridgeAuth,
  validate({ params: bridgeApprovalParamsSchema, body: bridgeApprovalResolveBodySchema }),
  resolveClaudeBridgeApproval,
);

export default router;
