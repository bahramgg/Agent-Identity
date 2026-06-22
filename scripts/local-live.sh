#!/usr/bin/env bash
# Run Agent Identity fully locally in LIVE mode with one command.
#
#   ./scripts/local-live.sh            # Speculos + the app, then open http://localhost:3000
#
# It starts the Speculos Ledger emulator and the Next.js app together, points
# the app at the emulator, and shuts the emulator down cleanly when you press
# Ctrl-C. For a no-emulator preview use DEMO mode instead: `npm run build && npm run start`.
#
# Speculos runner (auto-detected): the native `speculos` CLI if installed,
# otherwise the official Speculos Docker image (which bundles qemu + python +
# speculos, so nothing needs to compile). Force one with SPECULOS_RUNNER.
#
# Overrides (env vars):
#   ELF=./speculos/ethereum.elf   path to the Ethereum app ELF
#   MODEL=nanosp                  Speculos device model (must match the ELF)
#   SPECULOS_PORT=5000            Speculos REST API port
#   PORT=3000                     app port
#   SPECULOS_RUNNER=auto          auto | native | docker
#   SPECULOS_IMAGE=ghcr.io/ledgerhq/speculos:latest
set -euo pipefail

cd "$(dirname "$0")/.."

ELF="${ELF:-./speculos/ethereum.elf}"
MODEL="${MODEL:-nanosp}"
SPECULOS_PORT="${SPECULOS_PORT:-5000}"
APP_PORT="${PORT:-3000}"
SPECULOS_URL="http://localhost:${SPECULOS_PORT}"
RUNNER="${SPECULOS_RUNNER:-auto}"
IMAGE="${SPECULOS_IMAGE:-ghcr.io/ledgerhq/speculos:latest}"
CONTAINER="agent-identity-speculos"
LOG=/tmp/agent-identity-speculos.log

red() { printf '\033[31m%s\033[0m\n' "$1"; }
grn() { printf '\033[32m%s\033[0m\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

# --- ELF present? ----------------------------------------------------------
if [ ! -f "$ELF" ]; then
  red "Ethereum app ELF not found at: $ELF"
  echo "A nanosp ELF ships in this repo at speculos/ethereum.elf — run 'git pull' to get it,"
  echo "or set ELF=/path/to/ethereum.elf and MODEL accordingly."
  exit 1
fi

# --- pick a Speculos runner ------------------------------------------------
if [ "$RUNNER" = "auto" ]; then
  if have speculos; then
    RUNNER=native
  elif have docker; then
    RUNNER=docker
  else
    red "No way to run Speculos found."
    echo "Easiest: install Docker (Docker Desktop with WSL integration, or 'sudo apt install docker.io'),"
    echo "then re-run — this script will use the official Speculos image, no other setup needed."
    echo "Or install Speculos natively: pipx install speculos  (plus qemu-user-binfmt)."
    exit 1
  fi
fi

# --- start Speculos --------------------------------------------------------
if [ "$RUNNER" = "docker" ]; then
  if ! have docker; then red "SPECULOS_RUNNER=docker but docker is not installed."; exit 1; fi
  grn "Starting Speculos via Docker (model=${MODEL}) on ${SPECULOS_URL} ..."
  echo "(first run pulls the image, which can take a minute)"
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  ELF_DIR="$(cd "$(dirname "$ELF")" && pwd)"
  ELF_NAME="$(basename "$ELF")"
  docker run --rm --name "$CONTAINER" \
    -v "${ELF_DIR}:/speculos/apps" \
    -p "${SPECULOS_PORT}:${SPECULOS_PORT}" \
    "$IMAGE" -m "$MODEL" --display headless --api-port "$SPECULOS_PORT" \
    "apps/${ELF_NAME}" >"$LOG" 2>&1 &
  SPECULOS_PID=$!
else
  grn "Starting Speculos (model=${MODEL}) on ${SPECULOS_URL} ..."
  # own process group (setsid) so we can tear down the launcher + qemu child + API server
  setsid speculos -m "$MODEL" --display headless --api-port "$SPECULOS_PORT" "$ELF" \
    >"$LOG" 2>&1 &
  SPECULOS_PID=$!
fi

cleanup() {
  trap - EXIT INT TERM
  echo
  grn "Shutting down ..."
  if [ -n "${APP_PID:-}" ]; then
    pkill -P "$APP_PID" >/dev/null 2>&1 || true
    kill "$APP_PID" >/dev/null 2>&1 || true
  fi
  if [ "$RUNNER" = "docker" ]; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  else
    kill -TERM "-${SPECULOS_PID}" >/dev/null 2>&1 || kill "$SPECULOS_PID" >/dev/null 2>&1 || true
  fi
  if have fuser; then
    fuser -k "${APP_PORT}/tcp" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

# --- wait until the emulator answers ---------------------------------------
# Generous timeout: a first-time Docker image pull can take a while.
for i in $(seq 1 180); do
  if curl -s --max-time 1 "${SPECULOS_URL}/events?currentscreenonly=true" >/dev/null 2>&1; then
    grn "Speculos is up."
    break
  fi
  if ! kill -0 "$SPECULOS_PID" >/dev/null 2>&1; then
    red "Speculos exited early. Last log lines:"
    tail -n 20 "$LOG" || true
    exit 1
  fi
  sleep 1
  if [ "$i" -eq 180 ]; then
    red "Speculos did not become reachable in time. See $LOG"
    exit 1
  fi
done

# --- start the app ---------------------------------------------------------
grn "Starting the app on http://localhost:${APP_PORT} (LIVE mode)."
echo "Open http://localhost:${APP_PORT} , click 'Prove with Ledger', and approve on the device panel."
echo "Press Ctrl-C to stop everything."
# Run the app in the background and wait on it, so Ctrl-C interrupts the wait
# and the cleanup trap fires reliably (a foreground child would defer it).
SPECULOS_URL="$SPECULOS_URL" npx next dev -p "$APP_PORT" &
APP_PID=$!
wait "$APP_PID"
