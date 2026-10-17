#!/usr/bin/env bash
#
# One-line self-host install for ORBO (compose path): prerequisites, .env bootstrap,
# compose up, migrate. Idempotent and safe to rerun.
#
# What rerunning does: `.env` is created from `.env.example` only when absent (never
# overwritten), each secret below is generated only when its key is empty, and
# `docker compose up` is declarative (a service whose configuration has not changed is
# left alone). The compose file is the source of truth for services, profiles and ports;
# this script only selects which of them to bring up, the same way scripts/start.sh does.
#
# By default this ends by handing off to scripts/start.sh, which starts the host API
# server, app and routine worker on top of these services. Pass --no-start to prep
# without launching, or --check-only for a side-effect-free preflight (CI/review).

# Before anything else, and before the `set` line below, which is itself bash-only: this file is
# bash, and being read by `sh` used to end it with exit 1 and no output at all. See that file.
. "$(dirname "$0")/require-bash.sh"

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
LOGS="$ROOT/.logs"
mkdir -p "$LOGS"

COMPOSE_FILE="deploy/compose/docker-compose.yml"
NO_START=false
CHECK_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --no-start) NO_START=true ;;
    --check-only) CHECK_ONLY=true ;;
    -h|--help)
      cat <<'EOF'
Usage: bash scripts/install.sh [--no-start] [--check-only]

Idempotent self-host installer (compose path). Checks prerequisites, creates .env
from .env.example when absent (never overwrites), generates the two loopback Bot
secrets start.sh manages, brings the compose services up, runs migrations, waits for
health, then hands off to scripts/start.sh.

  --no-start    Prep everything but do not launch the server/app (skip the start.sh handoff).
  --check-only  Preflight only: check tools and report which required keys are still
                empty. Touches nothing (no .env, no secrets, no Docker). Exits 1 when
                something required is missing.
EOF
      exit 0
      ;;
    *)
      printf '\033[31m%s\033[0m\n' "Unknown argument: $arg. Try --help."
      exit 1
      ;;
  esac
done

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
info()  { printf '\033[2m%s\033[0m\n' "$1"; }

# The environment first, then .env, then the default: the same resolution order
# scripts/start.sh and scripts/stop.sh use, so a port configured there is the port
# used here. See start.sh for why the grep carries `|| true` under pipefail.
setting() {
  local name="$1" fallback="$2" value="${!1:-}"
  if [ -z "$value" ] && [ -f "$ROOT/.env" ]; then
    value="$(grep -E "^$name=" "$ROOT/.env" | tail -1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/" || true)"
  fi
  printf '%s' "${value:-$fallback}"
}

echo
echo "ORBO self-host install"
echo "======================"
echo

info "1/5  Prerequisites"
missing_tools=0
need() {
  if command -v "$1" >/dev/null 2>&1; then
    info "  $1: found ($(command -v "$1"))"
  else
    red "  $1: missing — install it first (see docs/self-host.md)"
    missing_tools=1
  fi
}
need docker
need bun
need openssl
need curl
if [ "$missing_tools" -ne 0 ]; then
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  red "  docker: the daemon is not reachable. Start Docker Desktop (or dockerd) and rerun."
  exit 1
fi
info "  docker daemon: reachable"
if ! docker compose version >/dev/null 2>&1; then
  red "  docker compose: the compose plugin is missing. Install Docker Compose v2 and rerun."
  exit 1
fi
info "  docker compose: $(docker compose version --short 2>/dev/null || echo available)"
green "  prerequisites ok"

if [ ! -f "$ROOT/.env.example" ]; then
  red ".env.example is missing. Run from the repository root."
  exit 1
fi

if [ "$CHECK_ONLY" = "true" ]; then
  info "2/5  Required keys (preflight — nothing will be written)"
  problems=0
  check_key() {
    local name="$1" hint="$2" value
    value="$(setting "$name" "")"
    if [ -z "$value" ]; then
      red "  $name: MISSING — $hint"
      problems=1
    else
      info "  $name: set"
    fi
  }
  if [ "$(setting KEY_ENCRYPTION_KEY "")" = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" ] \
    || [ -z "$(setting KEY_ENCRYPTION_KEY "")" ]; then
    red "  KEY_ENCRYPTION_KEY: missing or still the public example value — generate one: openssl rand -base64 32"
    problems=1
  else
    info "  KEY_ENCRYPTION_KEY: set"
  fi
  check_key INTELLIGENCE_API_KEY "from: npx --yes copilotkit@latest login && npx --yes copilotkit@latest project select"
  if [ -z "$(setting OPENAI_API_KEY "")" ] && [ -z "$(setting ANTHROPIC_API_KEY "")" ] \
    && [ -z "$(setting GOOGLE_API_KEY "")" ] && [ -z "$(setting CLAUDE_CODE_OAUTH_TOKEN "")" ]; then
    red "  model key: MISSING — set OPENAI_API_KEY (or ANTHROPIC_API_KEY / GOOGLE_API_KEY)"
    problems=1
  else
    info "  model key: set"
  fi
  if [ "$(setting ORBO_SINGLE_USER "")" != "true" ] \
    && [ -z "$(setting GOOGLE_OAUTH_CLIENT_ID "")" ] \
    && [ -z "$(setting MICROSOFT_OAUTH_CLIENT_ID "")" ] \
    && [ -z "$(setting OKTA_OAUTH_CLIENT_ID "")" ]; then
    red "  sign-in: MISSING — configure a provider (GOOGLE_/MICROSOFT_/OKTA_OAUTH_*) or set ORBO_SINGLE_USER=true on a private address only"
    problems=1
  else
    info "  sign-in: set"
  fi
  if [ "$problems" -ne 0 ]; then
    echo
    red "Preflight failed: fill the keys above in .env, then rerun without --check-only."
    exit 1
  fi
  echo
  green "Preflight passed."
  exit 0
fi

info "2/5  Environment file"
if [ ! -f "$ROOT/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  info "  Created .env from .env.example. Fill in the required keys (step 3 reports them)."
else
  info "  .env exists, left alone (never overwritten by this script)."
fi

# The two secrets scripts/start.sh manages, generated the same way and written back the
# same way. Both guard loopback-bound Bot ports, so a generated-and-persisted value is
# the right default here; every other secret (KEY_ENCRYPTION_KEY, BETTER_AUTH_SECRET,
# provider keys) is deployment-owned and only reported in step 3, never invented.
ensure_secret() {
  local name="$1" value
  value="$(setting "$name" "")"
  if [ -z "$value" ]; then
    value="$(openssl rand -base64 32)"
    if grep -qE "^${name}=" "$ROOT/.env"; then
      # A present but empty line, which is what .env.example ships.
      local tmp
      tmp="$(mktemp)"
      grep -vE "^${name}=" "$ROOT/.env" > "$tmp"
      printf '%s=%s\n' "$name" "$value" >> "$tmp"
      mv "$tmp" "$ROOT/.env"
    else
      printf '\n%s=%s\n' "$name" "$value" >> "$ROOT/.env"
    fi
    info "  Generated $name and wrote it to .env."
  else
    info "  $name: already set, left alone"
  fi
  export "$name=$value"
}
ensure_secret ORBO_MANAGED_AGENT_TOKEN
ensure_secret ORBO_AGENT_TOOL_TOKEN

info "3/5  Required keys (fill what is missing, then rerun — nothing below needs them)"
if [ "$(setting KEY_ENCRYPTION_KEY "")" = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" ] \
  || [ -z "$(setting KEY_ENCRYPTION_KEY "")" ]; then
  red "  KEY_ENCRYPTION_KEY: missing or the public example value (refused in production) — openssl rand -base64 32"
else
  info "  KEY_ENCRYPTION_KEY: set"
fi
if [ -z "$(setting INTELLIGENCE_API_KEY "")" ]; then
  red "  INTELLIGENCE_API_KEY: missing — the server refuses to start without it (see README.md)"
else
  info "  INTELLIGENCE_API_KEY: set"
fi
if [ -z "$(setting OPENAI_API_KEY "")" ] && [ -z "$(setting ANTHROPIC_API_KEY "")" ] \
  && [ -z "$(setting GOOGLE_API_KEY "")" ] && [ -z "$(setting CLAUDE_CODE_OAUTH_TOKEN "")" ]; then
  red "  model key: missing — OPENAI_API_KEY (or ANTHROPIC_API_KEY / GOOGLE_API_KEY)"
else
  info "  model key: set"
fi
if [ "$(setting ORBO_SINGLE_USER "")" != "true" ] \
  && [ -z "$(setting GOOGLE_OAUTH_CLIENT_ID "")" ] \
  && [ -z "$(setting MICROSOFT_OAUTH_CLIENT_ID "")" ] \
  && [ -z "$(setting OKTA_OAUTH_CLIENT_ID "")" ]; then
  red "  sign-in: no provider and ORBO_SINGLE_USER is not true — the server refuses to start (private address + ORBO_SINGLE_USER=true is the quick path)"
else
  info "  sign-in: set"
fi

info "4/5  Compose services"
APP_PORT="$(setting APP_PORT 3010)"
SERVER_PORT="$(setting SERVER_PORT 3001)"
ORBO_COMPUTER_PORT="$(setting ORBO_COMPUTER_PORT 4100)"
BOT_PORT="$(setting BOT_PORT 4200)"
LANGGRAPH_PORT="$(setting LANGGRAPH_PORT 4201)"
SUPERVISOR_PORT="$(setting SUPERVISOR_PORT 4500)"
BOT_PROVIDER="$(setting BOT_PROVIDER openai | tr '[:upper:]' '[:lower:]' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
ONE_COMPUTER_EACH="$(setting ORBO_ONE_COMPUTER_EACH true)"
PICKED_HARNESS_IMAGE="$(setting PICKED_HARNESS_IMAGE "")"
SUPERVISOR_TOKEN="$(setting SUPERVISOR_TOKEN orbo-dev-supervisor-token)"
ORBO_COMPUTER_TOKEN="$(setting ORBO_COMPUTER_TOKEN orbo-dev-computer-token)"
WORKER_SHARED_SECRET="$(setting WORKER_SHARED_SECRET orbo-dev-worker-secret)"
export APP_PORT SERVER_PORT SUPERVISOR_TOKEN ORBO_COMPUTER_TOKEN WORKER_SHARED_SECRET
export ORBO_COMPUTER_PORT BOT_PORT LANGGRAPH_PORT SUPERVISOR_PORT

# The same service selection scripts/start.sh makes: postgres and the computer always,
# the supervisor for one-computer-each, both shipped Bots except the OpenAI-only sample
# on an Anthropic deployment. The harness service lives behind the `harness` profile in
# the compose file (an unset PICKED_HARNESS_IMAGE would otherwise fail the whole up),
# so the profile is passed only when a harness was actually picked.
SERVICES=(postgres)
if [ "$ONE_COMPUTER_EACH" = "true" ]; then
  SERVICES+=(supervisor)
fi
SERVICES+=(orbo-computer)
if [ "$BOT_PROVIDER" = "anthropic" ]; then
  info "  orbo-bot: skipped for Anthropic (OpenAI-only sample)"
else
  SERVICES+=(orbo-bot)
fi
SERVICES+=(orbo-langgraph)
PROFILE_ARGS=()
if [ -n "$PICKED_HARNESS_IMAGE" ]; then
  PROFILE_ARGS=(--profile harness)
  SERVICES+=(orbo-harness)
fi
# Quiet progress, for the reason start.sh documents: with stdout redirected newer Compose
# picks its interactive build display and stops with "failed to get console". The branch
# below is for macOS's bash 3.2, where expanding an empty array under `set -u` fails the
# run: the profile args only exist when a harness was picked, so only expand them then.
if [ "${#PROFILE_ARGS[@]}" -gt 0 ]; then
  COMPOSE_PROGRESS=quiet docker compose -f "$COMPOSE_FILE" "${PROFILE_ARGS[@]}" up -d --build "${SERVICES[@]}" >/dev/null
else
  COMPOSE_PROGRESS=quiet docker compose -f "$COMPOSE_FILE" up -d --build "${SERVICES[@]}" >/dev/null
fi
green "  compose services up: ${SERVICES[*]}"

if ! docker compose -f "$COMPOSE_FILE" run --rm --build migrate >"$LOGS/migrate.log" 2>&1; then
  red "  Migrations did not apply. The database is not the schema this server expects."
  red "  Log: $LOGS/migrate.log"
  exit 1
fi
green "  migrations applied"

wait_for() {
  local url="$1" name="$2" tries="${3:-60}"
  for _ in $(seq 1 "$tries"); do
    if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
      green "  $name ready"
      return 0
    fi
    sleep 1
  done
  red "  $name never became ready at $url"
  red "  Log: $LOGS/${name}.log"
  exit 1
}
wait_for "http://localhost:$ORBO_COMPUTER_PORT/health" "orbo-computer"
if [ "$BOT_PROVIDER" != "anthropic" ]; then
  wait_for "http://localhost:$BOT_PORT/health" "orbo-bot"
fi
wait_for "http://localhost:$LANGGRAPH_PORT/health" "orbo-langgraph"

info "5/5  Next steps"
cat <<EOF

$(green "Self-host prep complete.")
  Database migrations are applied and the compose services answer health checks:
    - Bot computer:  http://localhost:$ORBO_COMPUTER_PORT/health
    - Framework Bot: http://localhost:$LANGGRAPH_PORT/health

EOF
if [ "$NO_START" = "true" ]; then
  cat <<EOF
Next steps:

  1. Fill any missing keys from step 3 in .env (server, Intelligence, model, sign-in).
  2. Launch the API server, app and routine worker: bash scripts/start.sh
  3. Open the app: http://localhost:$APP_PORT
     Direct Bot chat: http://localhost:$APP_PORT/bot · Bots: http://localhost:$APP_PORT/bots

Full guide: docs/self-host.md · Manual single-container path: docs/deployment.md
Stop everything: bash scripts/stop.sh
EOF
  exit 0
fi

info "Handing off to scripts/start.sh (API server, app, routine worker)"
echo
exec bash "$ROOT/scripts/start.sh"
