import type { RequestHandler } from 'express';
import { requireAuthenticatedUser } from '../../middleware/auth.js';
import { requireAssistantConnection } from './require-claude-bridge-auth.js';
import type { BridgeConnectBody, BridgeEventBody } from './claude.schemas.js';
import {
  getClaudeAwayModeStatus,
  getClaudeSetup,
  getClaudeStatus,
  handleClaudeBridgeConnect,
  ingestClaudeBridgeEvent,
  selectClaudeConnectionForUser,
  setClaudeAwayMode,
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
