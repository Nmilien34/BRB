#!/bin/bash
# Start the BRB Claude Poller in the background.
# Reads connection config from .claude/settings.json.

set -euo pipefail
cd "$(dirname "$0")"

SETTINGS=".claude/settings.json"

if [ ! -f "$SETTINGS" ]; then
  echo "ERROR: $SETTINGS not found. Run Claude setup first."
  exit 1
fi

# Extract the first hook command and parse env vars from it
HOOK_CMD=$(node -e "
  const s = require('./$SETTINGS');
  const hooks = s.hooks || {};
  const first = (hooks.Stop || hooks.PermissionRequest || hooks.PreToolUse || hooks.PostToolUse || [])[0];
  if (first) console.log(first.command);
")

if [ -z "$HOOK_CMD" ]; then
  echo "ERROR: No hooks found in $SETTINGS"
  exit 1
fi

# Parse env vars from the hook command
extract_env() {
  echo "$HOOK_CMD" | grep -oE "$1=\"[^\"]*\"" | head -1 | cut -d'"' -f2
}

export BRB_CONNECTION_TOKEN=$(extract_env BRB_CONNECTION_TOKEN)
export BRB_CONNECT_URL=$(extract_env BRB_CONNECT_URL)
export BRB_EVENTS_URL=$(extract_env BRB_EVENTS_URL)
export BRB_INSTRUCTIONS_URL=$(extract_env BRB_INSTRUCTIONS_URL)
export BRB_INSTRUCTION_RESULT_URL=$(extract_env BRB_INSTRUCTION_RESULT_URL)

if [ -z "$BRB_CONNECTION_TOKEN" ]; then
  echo "ERROR: Could not extract BRB_CONNECTION_TOKEN from hooks config"
  exit 1
fi

# Check if already running
if [ -f brb-poller.pid ]; then
  OLD_PID=$(cat brb-poller.pid)
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Poller already running (PID $OLD_PID). Stop it first with ./brb-poller-stop.sh"
    exit 1
  fi
  rm -f brb-poller.pid
fi

echo "Starting BRB Claude Poller..."
echo "  Token: ${BRB_CONNECTION_TOKEN:0:8}..."
echo "  Log:   brb-poller.log"

nohup node brb-claude-poller.js >> brb-poller.log 2>&1 &
echo $! > brb-poller.pid

echo "  PID:   $(cat brb-poller.pid)"
echo "Done. Tail the log with: tail -f brb-poller.log"
