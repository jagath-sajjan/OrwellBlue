#!/usr/bin/env bash
# Start the full OrwellBlue stack (API + watchdog + Next.js UI) for live demos.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Clear stale demo markers so a previous self-destruct run doesn't block startup.
if [[ -f "data/.wrapper_compromised" || -f "data/SELF_DESTRUCT.lock" ]]; then
    warn "Clearing stale wrapper compromise markers..."
    rm -f data/.wrapper_compromised data/SELF_DESTRUCT.lock
fi

# Capture the user's currently selected Docker endpoint *before* we switch configs.
DOCKER_ENDPOINT=$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null || true)

# Use an isolated Docker config to avoid stale credential helpers.
export DOCKER_CONFIG="${PROJECT_ROOT}/.docker"
mkdir -p "$DOCKER_CONFIG"
if [[ ! -f "${DOCKER_CONFIG}/config.json" ]]; then
    echo '{}' > "${DOCKER_CONFIG}/config.json"
fi

# Preserve the user's currently selected Docker endpoint (Colima, Desktop, etc.).
if [[ -z "${DOCKER_HOST:-}" && -n "$DOCKER_ENDPOINT" ]]; then
    export DOCKER_HOST="$DOCKER_ENDPOINT"
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[orwellblue]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[orwellblue]${NC} $1" >&2
}

error() {
    echo -e "${RED}[orwellblue]${NC} $1" >&2
}

# 1. Verify Docker daemon is reachable.
if ! docker info >/dev/null 2>&1; then
    error "Docker daemon is not reachable."
    error "Start Docker Desktop, OrbStack, or run 'colima start' and try again."
    exit 1
fi

# 2. Pre-pull the sandbox base image so first spawn has no latency.
log "Pre-pulling python:3.12-slim sandbox image..."
docker pull python:3.12-slim

PIDS=()
API_URL="http://localhost:8000"

cleanup() {
    log "Received shutdown signal; cleaning up demo processes and containers..."

    # Kill each tracked background process and its immediate children.
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            pkill -P "$pid" 2>/dev/null || true
            kill "$pid" 2>/dev/null || true
        fi
    done

    sleep 1

    # Remove any leftover managed agent containers.
    for container in $(docker ps -aq --filter label=orwellblue.managed=true 2>/dev/null); do
        warn "Removing leftover container: $container"
        docker rm -f "$container" >/dev/null 2>&1 || true
    done

    log "Cleanup complete."
    exit 0
}

trap cleanup INT TERM

# 3. Start FastAPI server.
log "Starting FastAPI server on ${API_URL}..."
uv run uvicorn api.main:app --host 0.0.0.0 --port 8000 &
PIDS+=("$!")

# Wait until the API is healthy.
for _ in {1..30}; do
    if curl -sf "${API_URL}/health" >/dev/null 2>&1; then
        log "FastAPI server is healthy."
        break
    fi
    sleep 0.5
done

# 4. Start the watchdog daemon.
log "Starting OrwellBlue watchdog daemon..."
uv run python -m core.watchdog &
PIDS+=("$!")
sleep 1

# 5. Start the Next.js mission-control UI.
if [[ -d "ui" ]]; then
    log "Starting Next.js mission control UI on http://localhost:3000..."
    (
        cd ui
        NEXT_PUBLIC_API_URL="${API_URL}" npm run dev
    ) &
    PIDS+=("$!")
else
    warn "No 'ui/' directory found; skipping frontend startup."
fi

log "All services launched. Press Ctrl+C to stop."

# Block until any background process exits (then cleanup runs via trap).
wait
