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
} from './claude.schemas.js';
import {
  getCodexSetup,
  getCodexStatus,
  generateCodexInstallScript,
} from './codex.service.js';
// Reuse Claude's bridge handlers — they're agent-agnostic (work via connection token)
import {
  handleClaudeBridgeConnect,
  ingestClaudeBridgeEvent,
  getClaudeBridgeApprovalStatus,
  claimClaudeBridgeInstruction,
  reportClaudeBridgeInstructionResult,
  resolveClaudeBridgeApprovalLocally,
} from './claude.service.js';

export const getCodexSetupPayload: RequestHandler = async (req, res) => {
  const user = requireAuthenticatedUser(req);
  const setup = await getCodexSetup(user, req);
  res.json(setup);
};

export const getCodexConnectionStatus: RequestHandler = async (req, res) => {
  const user = requireAuthenticatedUser(req);
  const status = await getCodexStatus(user);
  res.json(status);
};

// Bridge endpoints — reuse Claude's handlers since they work on any connection type
export const connectCodexBridge: RequestHandler = async (req, res) => {
  const connection = requireAssistantConnection(req);
  const result = await handleClaudeBridgeConnect(connection, req.body as BridgeConnectBody);
  res.json(result);
};

export const ingestCodexBridgeHookEvent: RequestHandler = async (req, res) => {
  const connection = requireAssistantConnection(req);
  const result = await ingestClaudeBridgeEvent(connection, req.body as BridgeEventBody);
  res.json(result);
};

export const getCodexBridgeApproval: RequestHandler = async (req, res) => {
  const connection = requireAssistantConnection(req);
  const { approvalId } = req.params as BridgeApprovalParams;
  const result = await getClaudeBridgeApprovalStatus(connection, approvalId);
  res.json(result);
};

export const resolveCodexBridgeApproval: RequestHandler = async (req, res) => {
  const connection = requireAssistantConnection(req);
  const { approvalId } = req.params as BridgeApprovalParams;
  const result = await resolveClaudeBridgeApprovalLocally(
    connection,
    approvalId,
    req.body as BridgeApprovalResolveBody,
  );
  res.json(result);
};

export const getCodexBridgeInstruction: RequestHandler = async (req, res) => {
  const connection = requireAssistantConnection(req);
  const pollerCwd = typeof req.query.cwd === 'string' ? req.query.cwd : null;
  const instruction = await claimClaudeBridgeInstruction(connection, pollerCwd);
  res.json({ instruction });
};

export const postCodexBridgeInstructionResult: RequestHandler = async (req, res) => {
  const connection = requireAssistantConnection(req);
  const { instructionId } = req.params as BridgeInstructionParams;
  const result = await reportClaudeBridgeInstructionResult(
    connection,
    instructionId,
    req.body as BridgeInstructionResultBody,
  );
  res.json({ instruction: result });
};

export const getCodexInstallScript: RequestHandler = async (req, res) => {
  const { token } = req.params;

  if (!token || typeof token !== 'string' || token.length < 10) {
    return res.status(400).send('# Error: Invalid token\nexit 1\n');
  }

  const forwardedProto = req.get('x-forwarded-proto');
  const forwardedHost = req.get('x-forwarded-host');
  const host = forwardedHost ?? req.get('host');
  const protocol = forwardedProto ?? req.protocol ?? 'https';
  const baseUrl = host ? `${protocol}://${host}` : 'https://be-right-back.onrender.com';

  const result = await generateCodexInstallScript(token, baseUrl);

  if (!result) {
    return res.status(404).send('# Error: Token not found or expired. Get a new one from BRB.\nexit 1\n');
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(result.script);
};
