#!/usr/bin/env bash
# Start the Peppol lesson HTTP server
# Serves the peppoll-access directory on port 8080

DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${1:-8080}"

cd "$DIR" || exit 1

if lsof -ti :"$PORT" &>/dev/null; then
  echo "❌ Port $PORT is already in use (PID $(lsof -ti :$PORT))"
  exit 1
fi

nohup python3 -m http.server "$PORT" > /tmp/pepoll-http-server.log 2>&1 &
PID=$!
sleep 1

if kill -0 "$PID" 2>/dev/null; then
  echo "✅ Peppol HTTP server running on http://0.0.0.0:$PORT (PID $PID)"
  echo "   Access from your notebook at http://89.167.93.109:$PORT"
else
  echo "❌ Failed to start server. Check /tmp/pepoll-http-server.log"
  exit 1
fi
