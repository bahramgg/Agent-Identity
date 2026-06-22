#!/usr/bin/env bash
# Run Agent Identity fully locally in LIVE mode with one command.
#
#   ./scripts/local-live.sh            # Speculos + the app, then open http://localhost:3000
#
# It starts the Speculos Ledger emulator and the Next.js app together, points
# the app at the emulator, and shuts the emulator down cleanly when you press
# Ctrl-C. For a no-emulator preview use DEMO mode instead: `npm run build && npm run start`.
#
# Overrides (env vars):
#   ELF=./speculos/ethereum.elf   path to the Ethereum app ELF
#   MODEL=nanosp                  Speculos device model (must match the ELF)
#   SPECULOS_PORT=5000            Speculos REST API port
#   PORT=3000                     app port
set -euo pipefail

cd "$(dirname "$0")/.."

ELF="${ELF:-./speculos/ethereum.elf}"
MODEL="${MODEL:-nanosp}"
SPECULOS_PORT="${SPECULOS_PORT:-5000}"
APP_PORT="${PORT:-3000}"
SPECULOS_URL="http://localhost:${SPECULOS_PORT}"

red() { printf '\033[31m%s\033[0m\n' "$1"; }
grn() { printf '\033[32m%s\033[0m\n' "$1"; }

# --- preflight checks ------------------------------------------------------
if ! command -v speculos >/dev/null 2>&1; then
  red "Speculos is not installed. Install it once with:"
  echo "  pip install speculos"
  echo "  sudo apt-get install -y qemu-user-static   # provides qemu-arm-static"
  exit 1
fi

if [ ! -f "$ELF" ]; then
  red "Ethereum app ELF not found at: $ELF"
  echo "Put a Nano S Plus (or matching MODEL) ethereum.elf there, e.g.:"
  echo "  mkdir -p speculos && cp /path/to/ethereum.elf speculos/ethereum.elf"
  echo "Get it from app-ethereum CI artifacts or build it with ledger-app-builder."
  exit 1
fi

# --- start Speculos --------------------------------------------------------
# Run it in its own process group (setsid) so we can tear down the whole tree
# (the launcher plus its qemu child and REST API server) on exit.
grn "Starting Speculos (model=${MODEL}) on ${SPECULOS_URL} ..."
setsid speculos -m "$MODEL" --display headless --api-port "$SPECULOS_PORT" "$ELF" \
  >/tmp/agent-identity-speculos.log 2>&1 &
SPECULOS_PID=$!

cleanup() {
  trap - EXIT INT TERM
  echo
  grn "Shutting down ..."
  # stop the app (next dev forks a worker, so kill its children too)
  if [ -n "${APP_PID:-}" ]; then
    pkill -P "$APP_PID" >/dev/null 2>&1 || true
    kill "$APP_PID" >/dev/null 2>&1 || true
  fi
  # kill the whole Speculos process group
  kill -TERM "-${SPECULOS_PID}" >/dev/null 2>&1 || kill "$SPECULOS_PID" >/dev/null 2>&1 || true
  # belt-and-braces: free both ports
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${SPECULOS_PORT}/tcp" "${APP_PORT}/tcp" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

# wait until the emulator answers
for i in $(seq 1 30); do
  if curl -s --max-time 1 "${SPECULOS_URL}/events?currentscreenonly=true" >/dev/null 2>&1; then
    grn "Speculos is up."
    break
  fi
  if ! kill -0 "$SPECULOS_PID" >/dev/null 2>&1; then
    red "Speculos exited early. Last log lines:"
    tail -n 15 /tmp/agent-identity-speculos.log || true
    exit 1
  fi
  sleep 1
  if [ "$i" -eq 30 ]; then
    red "Speculos did not become reachable in time. See /tmp/agent-identity-speculos.log"
    exit 1
  fi
done

# --- start the app ---------------------------------------------------------
grn "Starting the app on http://localhost:${APP_PORT} (LIVE mode)."
echo "Open http://localhost:${APP_PORT} , click 'Prove with Ledger', and approve on the device panel."
echo "Press Ctrl-C to stop everything."
# Run the app in the background and wait on it, so a Ctrl-C interrupts the wait
# and the cleanup trap fires reliably (a foreground child would defer it).
SPECULOS_URL="$SPECULOS_URL" npx next dev -p "$APP_PORT" &
APP_PID=$!
wait "$APP_PID"
