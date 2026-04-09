#!/bin/bash
# Stop the BRB Claude Poller.

set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f brb-poller.pid ]; then
  echo "No brb-poller.pid found — poller may not be running."
  exit 0
fi

PID=$(cat brb-poller.pid)

if kill -0 "$PID" 2>/dev/null; then
  echo "Stopping poller (PID $PID)..."
  kill "$PID"
  sleep 2
  if kill -0 "$PID" 2>/dev/null; then
    echo "Force killing..."
    kill -9 "$PID" 2>/dev/null || true
  fi
  echo "Stopped."
else
  echo "Poller not running (stale PID $PID)."
fi

rm -f brb-poller.pid
