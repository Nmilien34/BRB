import type { RequestHandler } from 'express';
import { requireAuthenticatedUser } from '../../middleware/auth.js';
import { requireAssistantConnection } from './require-claude-bridge-auth.js';
import type {
  BridgeApprovalParams,
  BridgeApprovalResolveBody,
  BridgeConnectBody,
  BridgeEventBody,
  BridgeInstructionParams,
  BridgeInstructionResultBody,
  ClaudeSettingsBody,
} from './claude.schemas.js';
import {
  claimClaudeBridgeInstruction,
  generateInstallScript,
  getClaudeAwayModeStatus,
  getClaudeBridgeApprovalStatus,
  getClaudeSetup,
  getClaudeStatus,
  handleClaudeBridgeConnect,
  ingestClaudeBridgeEvent,
  reportClaudeBridgeInstructionResult,
  resolveClaudeBridgeApprovalLocally,
  selectClaudeConnectionForUser,
  setClaudeAwayMode,
  updateClaudeSettings,
} from './claude.service.js';

export const selectClaudeConnection: RequestHandler = async (req, res) => {
  const user = requireAuthenticatedUser(req);
  const selection = await selectClaudeConnectionForUser(user);

  res.json(selection);
};

export const getClaudeSetupPayload: RequestHandler = async (req, res) => {
  const user = requireAuthenticatedUser(req);
  const setup = await getClaudeSetup(user, req);

  res.json(setup);
};

export const getClaudeConnectionStatus: RequestHandler = async (req, res) => {
  const user = requireAuthenticatedUser(req);
  const status = await getClaudeStatus(user);

  res.json(status);
};

export const enableClaudeAwayMode: RequestHandler = async (req, res) => {
  const user = requireAuthenticatedUser(req);
  const status = await setClaudeAwayMode(user, true);

  res.json(status);
};

export const disableClaudeAwayMode: RequestHandler = async (req, res) => {
  const user = requireAuthenticatedUser(req);
  const status = await setClaudeAwayMode(user, false);

  res.json(status);
};

export const getClaudeAwayMode: RequestHandler = async (req, res) => {
  const user = requireAuthenticatedUser(req);
  const status = await getClaudeAwayModeStatus(user);

  res.json(status);
};

export const patchClaudeSettings: RequestHandler = async (req, res) => {
  const user = requireAuthenticatedUser(req);
  const settings = await updateClaudeSettings(user, req.body as ClaudeSettingsBody);

  res.json(settings);
};

export const connectClaudeBridge: RequestHandler = async (req, res) => {
  const connection = requireAssistantConnection(req);
  const result = await handleClaudeBridgeConnect(connection, req.body as BridgeConnectBody);

  res.json(result);
};

export const ingestClaudeBridgeHookEvent: RequestHandler = async (req, res) => {
  const connection = requireAssistantConnection(req);
  const result = await ingestClaudeBridgeEvent(connection, req.body as BridgeEventBody);

  res.json(result);
};

export const getClaudeBridgeApproval: RequestHandler = async (req, res) => {
  const connection = requireAssistantConnection(req);
  const { approvalId } = req.params as BridgeApprovalParams;
  const result = await getClaudeBridgeApprovalStatus(connection, approvalId);

  res.json(result);
};

export const resolveClaudeBridgeApproval: RequestHandler = async (req, res) => {
  const connection = requireAssistantConnection(req);
  const { approvalId } = req.params as BridgeApprovalParams;
  const result = await resolveClaudeBridgeApprovalLocally(
    connection,
    approvalId,
    req.body as BridgeApprovalResolveBody,
  );

  res.json(result);
};

export const getClaudeBridgeInstruction: RequestHandler = async (req, res) => {
  const connection = requireAssistantConnection(req);
  const pollerCwd = typeof req.query.cwd === 'string' ? req.query.cwd : null;
  const instruction = await claimClaudeBridgeInstruction(connection, pollerCwd);

  res.json({ instruction });
};

export const postClaudeBridgeInstructionResult: RequestHandler = async (req, res) => {
  const connection = requireAssistantConnection(req);
  const { instructionId } = req.params as BridgeInstructionParams;
  const result = await reportClaudeBridgeInstructionResult(
    connection,
    instructionId,
    req.body as BridgeInstructionResultBody,
  );

  res.json({ instruction: result });
};

export const getInstallScript: RequestHandler = async (req, res) => {
  const { token } = req.params;

  if (!token || typeof token !== 'string' || token.length < 10) {
    return res.status(400).send('# Error: Invalid token\nexit 1\n');
  }

  const forwardedProto = req.get('x-forwarded-proto');
  const forwardedHost = req.get('x-forwarded-host');
  const host = forwardedHost ?? req.get('host');
  const protocol = forwardedProto ?? req.protocol ?? 'https';
  const baseUrl = host ? `${protocol}://${host}` : 'https://be-right-back.onrender.com';

  const result = await generateInstallScript(token, baseUrl);

  if (!result) {
    return res.status(404).send('# Error: Token not found or expired. Get a new one from BRB.\nexit 1\n');
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(result.script);
};
