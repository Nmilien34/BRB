import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  connectClaudeBridge,
  disableClaudeAwayMode,
  enableClaudeAwayMode,
  getClaudeAwayMode,
  getClaudeConnectionStatus,
  getClaudeSetupPayload,
  ingestClaudeBridgeHookEvent,
  selectClaudeConnection,
} from './claude.controller.js';
import { bridgeConnectBodySchema, bridgeEventBodySchema } from './claude.schemas.js';
import { requireClaudeBridgeAuth } from './require-claude-bridge-auth.js';

const router = Router();

router.post('/select', requireAuth, selectClaudeConnection);
router.get('/setup', requireAuth, getClaudeSetupPayload);
router.get('/status', requireAuth, getClaudeConnectionStatus);
router.post('/away-mode/on', requireAuth, enableClaudeAwayMode);
router.post('/away-mode/off', requireAuth, disableClaudeAwayMode);
router.get('/away-mode/status', requireAuth, getClaudeAwayMode);

router.post('/bridge/connect', requireClaudeBridgeAuth, validate({ body: bridgeConnectBodySchema }), connectClaudeBridge);
router.post('/bridge/events', requireClaudeBridgeAuth, validate({ body: bridgeEventBodySchema }), ingestClaudeBridgeHookEvent);

export default router;
