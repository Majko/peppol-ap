#!/usr/bin/env bash
# Kill the Peppol lesson HTTP server

PORT="${1:-8080}"
PID=$(lsof -ti :"$PORT" 2>/dev/null)

if [ -z "$PID" ]; then
  echo "ℹ️  No server running on port $PORT"
  exit 0
fi

kill "$PID" 2>/dev/null
sleep 0.5

if kill -0 "$PID" 2>/dev/null; then
  kill -9 "$PID" 2>/dev/null
  echo "⚠️  Force killed server on port $PORT (PID $PID)"
else
  echo "✅ Server on port $PORT stopped (PID $PID)"
fi
