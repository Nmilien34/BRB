import type { Request } from 'express';
import { env } from '../../config/index.js';
import type { UserDocument } from '../users/user.model.js';
import { advanceOnboardingStatus } from '../users/user.constants.js';
import { serializeUser } from '../users/user.serializer.js';
import { HttpError } from '../../utils/httpError.js';
import {
  type AssistantConnectionDocument,
  AssistantConnection,
} from './assistant-connection.model.js';
import {
  generateAssistantConnectionToken,
  hashAssistantConnectionToken,
  encryptAssistantConnectionToken,
  decryptAssistantConnectionToken,
} from './assistant-token.js';
import { BRIDGE_SCRIPT } from './codex-install-scripts.js';
import { CODEX_POLLER_SCRIPT } from './codex-install-scripts.js';
import {
  type AssistantConnectionMetadata,
  type AssistantConnectionStatus,
  CONNECTION_STALE_THRESHOLD_MS,
} from './assistant.constants.js';
import { serializeAssistantConnection } from './assistant.serializer.js';

const CODEX_ASSISTANT_TYPE = 'codex';
const DEFAULT_ESCALATION_DELAY_MINUTES = 2;

function getConnectionMetadata(connection: AssistantConnectionDocument): Partial<AssistantConnectionMetadata> {
  if (!connection.metadata || typeof connection.metadata !== 'object') {
    return {};
  }
  return connection.metadata as Partial<AssistantConnectionMetadata>;
}

function applyConnectionMetadata(
  connection: AssistantConnectionDocument,
  updates: Partial<AssistantConnectionMetadata>,
): void {
  const metadata = { ...getConnectionMetadata(connection) };
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      delete metadata[key as keyof AssistantConnectionMetadata];
    } else {
      metadata[key as keyof AssistantConnectionMetadata] = value as never;
    }
  }
  connection.metadata = metadata;
}

function isConnectionStale(connection: AssistantConnectionDocument): boolean {
  if (connection.status !== 'connected') return false;
  const metadata = getConnectionMetadata(connection);
  if (!metadata.lastPingAt) return false;
  const lastPingAt = metadata.lastPingAt instanceof Date
    ? metadata.lastPingAt
    : new Date(metadata.lastPingAt as string | number);
  return Date.now() - lastPingAt.getTime() > CONNECTION_STALE_THRESHOLD_MS;
}

function isCodexConnectionStatus(status: string): status is AssistantConnectionStatus {
  return ['selected', 'pending_connection', 'connected', 'error', 'disconnected'].includes(status);
}

function ensureSupportedCodexConnection(
  connection: AssistantConnectionDocument | null,
): AssistantConnectionDocument {
  if (!connection || connection.assistantType !== CODEX_ASSISTANT_TYPE) {
    throw new HttpError(404, 'Codex connection not found.');
  }
  return connection;
}

function getPublicBaseUrl(req: Request): string {
  if (env.BACKEND_URL) return env.BACKEND_URL;
  const forwardedProto = req.get('x-forwarded-proto');
  const forwardedHost = req.get('x-forwarded-host');
  const host = forwardedHost ?? req.get('host');
  const protocol = forwardedProto ?? req.protocol ?? 'http';
  return host ? `${protocol}://${host}` : `http://localhost:${env.PORT}`;
}

function buildCodexSetupPayload(
  connection: AssistantConnectionDocument,
  connectionToken: string | null,
  baseUrl: string,
) {
  const bridgeConnectUrl = `${baseUrl}/api/assistants/codex/bridge/connect`;
  const bridgeEventsUrl = `${baseUrl}/api/assistants/codex/bridge/events`;
  const bridgeInstructionsUrl = `${baseUrl}/api/assistants/codex/bridge/instructions/next`;
  const bridgeInstructionResultUrl = `${baseUrl}/api/assistants/codex/bridge/instructions/:instructionId/result`;

  return {
    assistantType: CODEX_ASSISTANT_TYPE,
    status: connection.status,
    connectionToken,
    tokenPreview: connection.connectionTokenPreview ?? null,
    bridgeConnectUrl,
    bridgeEventsUrl,
    bridgeInstructionsUrl,
    bridgeInstructionResultUrl,
    title: 'Connect Codex to BRB',
    description:
      'Install a lightweight local hook bridge that forwards Codex events to BRB and polls for Telegram instructions.',
    connection: serializeAssistantConnection(connection),
  };
}

function buildCodexStatusResponse(connection: AssistantConnectionDocument | null) {
  const effectiveStatus = connection && isConnectionStale(connection)
    ? 'disconnected'
    : connection?.status ?? 'disconnected';

  return {
    assistantType: CODEX_ASSISTANT_TYPE,
    status: effectiveStatus,
    awayModeEnabled: connection?.awayModeEnabled ?? false,
    awayModeActivatedAt: connection?.awayModeActivatedAt ?? null,
    escalationDelayMinutes: connection?.escalationDelayMinutes ?? DEFAULT_ESCALATION_DELAY_MINUTES,
    lastConnectedAt: connection?.lastConnectedAt ?? null,
    lastEventAt: connection?.lastEventAt ?? null,
    tokenPreview: connection?.connectionTokenPreview ?? null,
    connection: connection ? serializeAssistantConnection(connection) : null,
  };
}

export async function findCodexConnectionForUser(
  user: UserDocument,
): Promise<AssistantConnectionDocument | null> {
  return AssistantConnection.findOne({
    userId: user._id,
    assistantType: CODEX_ASSISTANT_TYPE,
  });
}

export async function selectCodexConnectionForUser(user: UserDocument) {
  let connection = await findCodexConnectionForUser(user);

  if (!connection) {
    connection = new AssistantConnection({
      userId: user._id,
      assistantType: CODEX_ASSISTANT_TYPE,
      status: 'selected',
      authMethod: 'hook',
      escalationDelayMinutes: DEFAULT_ESCALATION_DELAY_MINUTES,
    });
  } else if (
    !isCodexConnectionStatus(connection.status) ||
    connection.status === 'error' ||
    connection.status === 'disconnected'
  ) {
    connection.status = 'selected';
  }

  await connection.save();

  user.selectedAssistantType = CODEX_ASSISTANT_TYPE;
  user.onboardingStatus = advanceOnboardingStatus(user.onboardingStatus, 'assistant_selected');
  await user.save();

  return {
    assistant: serializeAssistantConnection(connection),
    user: serializeUser(user),
  };
}

export async function getCodexSetup(user: UserDocument, req: Request) {
  await selectCodexConnectionForUser(user);
  const connection = ensureSupportedCodexConnection(await findCodexConnectionForUser(user));

  if (connection.status === 'connected' && connection.connectionTokenHash && !isConnectionStale(connection)) {
    const decryptedToken = connection.connectionTokenEncrypted
      ? decryptAssistantConnectionToken(connection.connectionTokenEncrypted, env.JWT_SECRET)
      : null;
    return buildCodexSetupPayload(connection, decryptedToken, getPublicBaseUrl(req));
  }

  const { rawToken, tokenHash, tokenPreview } = generateAssistantConnectionToken();

  connection.connectionTokenHash = tokenHash;
  connection.connectionTokenPreview = tokenPreview;
  connection.connectionTokenEncrypted = encryptAssistantConnectionToken(rawToken, env.JWT_SECRET);
  connection.status = 'pending_connection';
  connection.authMethod = 'hook';
  applyConnectionMetadata(connection, { lastError: undefined });
  await connection.save();

  return buildCodexSetupPayload(connection, rawToken, getPublicBaseUrl(req));
}

export async function getCodexStatus(user: UserDocument) {
  const connection = await findCodexConnectionForUser(user);
  return buildCodexStatusResponse(connection);
}

export async function generateCodexInstallScript(
  connectionToken: string,
  baseUrl: string,
): Promise<{ script: string; connection: AssistantConnectionDocument } | null> {
  const connection = await AssistantConnection.findOne({
    assistantType: CODEX_ASSISTANT_TYPE,
    connectionTokenHash: hashAssistantConnectionToken(connectionToken),
  });

  if (!connection) return null;

  const connectUrl = `${baseUrl}/api/assistants/codex/bridge/connect`;
  const eventsUrl = `${baseUrl}/api/assistants/codex/bridge/events`;
  const instructionsUrl = `${baseUrl}/api/assistants/codex/bridge/instructions/next`;
  const instructionResultUrl = `${baseUrl}/api/assistants/codex/bridge/instructions/:instructionId/result`;

  const script = buildCodexInstallShellScript({
    connectionToken,
    connectUrl,
    eventsUrl,
    instructionsUrl,
    instructionResultUrl,
  });

  return { script, connection };
}

function buildCodexInstallShellScript(config: {
  connectionToken: string;
  connectUrl: string;
  eventsUrl: string;
  instructionsUrl: string;
  instructionResultUrl: string;
}): string {
  const bridgeCommand =
    `BRB_CONNECTION_TOKEN="${config.connectionToken}" ` +
    `BRB_CONNECT_URL="${config.connectUrl}" ` +
    `BRB_EVENTS_URL="${config.eventsUrl}" ` +
    `BRB_INSTRUCTIONS_URL="${config.instructionsUrl}" ` +
    `BRB_INSTRUCTION_RESULT_URL="${config.instructionResultUrl}" ` +
    'node .brb/brb-codex-bridge.js';

  const hooksJson = JSON.stringify(
    {
      hooks: {
        PermissionRequest: [{ matcher: '*', command: bridgeCommand }],
        PreToolUse: [{ matcher: '*', command: bridgeCommand }],
        PostToolUse: [{ matcher: '*', command: bridgeCommand }],
        Stop: [{ matcher: '*', command: bridgeCommand }],
      },
    },
    null,
    2,
  );

  return `#!/bin/bash
set -euo pipefail

echo ""
echo "  +-----------------------------------+"
echo "  |  BRB -- Codex Setup               |"
echo "  +-----------------------------------+"
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "  Error: Node.js is required but not installed."; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "  Error: curl is required but not installed."; exit 1; }

# Create .brb directory with restricted permissions
mkdir -p .brb
chmod 700 .brb

# Write bridge script (hook handler for approval forwarding)
cat > .brb/brb-codex-bridge.js << 'BRIDGE_EOF'
${BRIDGE_SCRIPT}
BRIDGE_EOF

# Write poller script (persistent background process)
cat > .brb/brb-codex-poller.js << 'POLLER_EOF'
${CODEX_POLLER_SCRIPT}
POLLER_EOF

chmod +x .brb/brb-codex-bridge.js .brb/brb-codex-poller.js

# Write/merge Codex hooks config
mkdir -p .codex
cat > .brb/_brb_codex_hooks.json << 'HOOKS_JSON_EOF'
${hooksJson}
HOOKS_JSON_EOF

if [ -f .codex/hooks.json ]; then
  # Merge BRB hooks into existing hooks (preserves user's other config)
  node --input-type=commonjs << 'MERGE_EOF'
var fs = require("fs");
var brb = JSON.parse(fs.readFileSync(".brb/_brb_codex_hooks.json", "utf8"));
var hooksPath = ".codex/hooks.json";
var existing = {};
try { existing = JSON.parse(fs.readFileSync(hooksPath, "utf8")); } catch(e) {}
var hooks = existing.hooks || {};
Object.keys(brb.hooks || {}).forEach(function(key) {
  var arr = hooks[key] || [];
  arr = arr.filter(function(h) { return (h.command || "").indexOf("brb-codex-bridge") === -1; });
  arr = arr.concat(brb.hooks[key]);
  hooks[key] = arr;
});
existing.hooks = hooks;
fs.writeFileSync(hooksPath, JSON.stringify(existing, null, 2) + "\\n");
MERGE_EOF
  echo "  Merged BRB hooks into existing .codex/hooks.json"
else
  cp .brb/_brb_codex_hooks.json .codex/hooks.json
fi
rm -f .brb/_brb_codex_hooks.json

# Write env config for the poller (restricted permissions)
cat > .brb/.env.codex << ENV_EOF
BRB_CONNECTION_TOKEN="${config.connectionToken}"
BRB_CONNECT_URL="${config.connectUrl}"
BRB_EVENTS_URL="${config.eventsUrl}"
BRB_INSTRUCTIONS_URL="${config.instructionsUrl}"
BRB_INSTRUCTION_RESULT_URL="${config.instructionResultUrl}"
ENV_EOF
chmod 600 .brb/.env.codex

# Write start/stop scripts
cat > .brb/start-codex.sh << 'START_EOF'
#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if [ -f codex-poller.pid ]; then
  OLD_PID=$(cat codex-poller.pid)
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "BRB Codex poller already running (PID $OLD_PID)"
    exit 0
  fi
  rm -f codex-poller.pid
fi
set -a; source .env.codex; set +a
nohup node brb-codex-poller.js >> codex-poller.log 2>&1 &
echo $! > codex-poller.pid
echo "BRB Codex poller started (PID $!)"
START_EOF

cat > .brb/stop-codex.sh << 'STOP_EOF'
#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
# Unload launchd agent if present
if [ -f codex-launchd-plist-path ]; then
  PLIST=$(cat codex-launchd-plist-path)
  LABEL=$(basename "$PLIST" .plist)
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  if [ -f "$PLIST" ]; then
    launchctl unload "$PLIST" 2>/dev/null || true
  fi
  echo "Unloaded launchd agent"
fi
# Also kill by PID as fallback
if [ -f codex-poller.pid ]; then
  PID=$(cat codex-poller.pid)
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "BRB Codex poller stopped (PID $PID)"
  fi
  rm -f codex-poller.pid
fi
echo "BRB Codex poller stopped."
STOP_EOF

chmod +x .brb/start-codex.sh .brb/stop-codex.sh

# Add .brb to .gitignore if not already there
if [ -f .gitignore ]; then
  grep -qxF '.brb/' .gitignore || echo '.brb/' >> .gitignore
else
  echo '.brb/' > .gitignore
fi

# Set up launchd to auto-start poller on login (macOS only)
if [ "$(uname)" = "Darwin" ]; then
  PLIST_LABEL="com.brb.codex-poller.$(echo "$(pwd)" | md5 | head -c 8)"
  PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"
  BRB_DIR="$(pwd)/.brb"

  launchctl bootout "gui/$(id -u)/$PLIST_LABEL" 2>/dev/null || true
  if [ -f "$PLIST_PATH" ]; then
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
  fi

  cat > "$BRB_DIR/launch-codex-poller.sh" << LAUNCHER_EOF
#!/bin/bash
cd "$BRB_DIR/.."
set -a; source .brb/.env.codex; set +a
exec $(which node) .brb/brb-codex-poller.js
LAUNCHER_EOF
  chmod +x "$BRB_DIR/launch-codex-poller.sh"

  cat > "$PLIST_PATH" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$BRB_DIR/launch-codex-poller.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$(pwd)</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$(echo "$PATH")</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>$BRB_DIR/codex-poller.log</string>
  <key>StandardErrorPath</key>
  <string>$BRB_DIR/codex-poller.log</string>
  <key>ThrottleInterval</key>
  <integer>10</integer>
</dict>
</plist>
PLIST_EOF

  echo "$PLIST_PATH" > .brb/codex-launchd-plist-path

  launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH" 2>/dev/null || launchctl load "$PLIST_PATH" 2>/dev/null || true

  sleep 2
  LAUNCHD_PID=$(launchctl list "$PLIST_LABEL" 2>/dev/null | head -1 | awk '{print $1}')
  if [ "$LAUNCHD_PID" != "-" ] && [ -n "$LAUNCHD_PID" ] && [ "$LAUNCHD_PID" != "0" ]; then
    echo "  Registered launchd agent -- poller will auto-start on login"
  else
    echo "  launchd agent failed to start -- falling back to background process"
    launchctl bootout "gui/$(id -u)/$PLIST_LABEL" 2>/dev/null || true
    cd "$(pwd)/.brb"
    set -a; source .env.codex; set +a
    nohup $(which node) brb-codex-poller.js >> codex-poller.log 2>&1 &
    echo $! > codex-poller.pid
    cd - > /dev/null
    echo "  Poller running as background process (PID $(cat .brb/codex-poller.pid))"
  fi
fi

# Send initial connect ping
echo "Connecting to BRB..."
CONNECT_RESULT=$(curl -s -w "\\n%{http_code}" -X POST "${config.connectUrl}" \\
  -H "Authorization: Bearer ${config.connectionToken}" \\
  -H "Content-Type: application/json" \\
  -d "{\\"cwd\\": \\"$(pwd)\\", \\"machineName\\": \\"$(hostname)\\"}" 2>/dev/null)
HTTP_CODE=$(echo "$CONNECT_RESULT" | tail -1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "  Connected!"
else
  echo "  Warning: Connect ping returned $HTTP_CODE (may need a fresh token)"
fi

# Start the poller (launchd handles this on macOS, fallback to manual start)
if [ ! -f .brb/codex-launchd-plist-path ]; then
  .brb/start-codex.sh
fi

echo ""
echo "  BRB Codex is set up!"
echo ""
echo "  What happened:"
echo "    - .brb/                  Scripts + config (gitignored)"
echo "    - .codex/hooks.json      Codex hooks for approval forwarding"
echo "    - Background poller running for Telegram instructions"
if [ -f .brb/codex-launchd-plist-path ]; then
echo "    - Auto-start on login (launchd agent registered)"
fi
echo ""
echo "  Commands:"
echo "    .brb/start-codex.sh     Start the poller"
echo "    .brb/stop-codex.sh      Stop the poller"
echo "    tail -f .brb/codex-poller.log   Watch poller activity"
echo ""
echo "  Next: restart Codex in this project so hooks load."
echo ""
`;
}
