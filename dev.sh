#!/usr/bin/env bash
set -e

PORT=${PORT:-3000}
NGROK_BIN="$(dirname "$0")/ngrok"

echo "=== Homelander Dev ==="
echo ""

# Ensure ngrok is configured
if ! "$NGROK_BIN" config check &>/dev/null; then
  echo "ngrok needs an auth token. Get yours at:"
  echo "  https://dashboard.ngrok.com/get-started/your-authtoken"
  echo ""
  read -rp "Paste your ngrok auth token: " token
  "$NGROK_BIN" config add-authtoken "$token"
  echo ""
fi

# Start the dev server
echo "Starting server on port $PORT..."
npx tsx --env-file .env src/server.ts &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null; kill %1 2>/dev/null" EXIT INT TERM
sleep 2

# Start ngrok tunnel
echo "Starting ngrok tunnel..."
"$NGROK_BIN" http "$PORT" --log=stdout > /tmp/ngrok.log 2>&1 &
sleep 3

# Extract the public URL
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | python3 -c "import sys,json; print(json.load(sys.stdin)['tunnels'][0]['public_url'])" 2>/dev/null || echo "")

if [ -n "$NGROK_URL" ]; then
  echo ""
  echo "============================================"
  echo "  Homelander is live at:"
  echo "  $NGROK_URL"
  echo ""
  echo "  Slack Events URL:"
  echo "  ${NGROK_URL}/slack/events"
  echo "============================================"
  echo ""
  echo "Paste the Slack Events URL into:"
  echo "  https://api.slack.com/apps"
  echo "  → Your App → Event Subscriptions → Request URL"
  echo ""
  echo "Test the /analyze endpoint:"
  echo "  curl -X POST ${NGROK_URL}/analyze ..."
else
  echo "Warning: couldn't get ngrok URL. Check /tmp/ngrok.log"
fi

echo "Press Ctrl+C to stop."
wait
