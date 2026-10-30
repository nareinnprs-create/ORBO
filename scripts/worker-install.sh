#!/usr/bin/env bash
#
# Register (or remove or report on) a systemd unit that launches the ORBO routine worker at boot,
# so a host or VM deployment keeps its routine sweep without a shell keeping it alive.
#
# The worker (`worker/src/index.ts`, run as `bun worker/src/index.ts` from the deployment root —
# the very command line scripts/start.sh reasons about) is a bare loop with no HTTP endpoint of
# its own, and outside Kubernetes nothing supervises it. This writes
# /etc/systemd/system/orbo-worker.service with `Restart=on-failure`, `EnvironmentFile=` the
# deployment's env file, and output appended to .logs/worker-service.log, then enables it.
#
# Idempotent: rerunning rewrites the unit file and restarts the service only when the definition
# changed. --remove disables, stops and deletes the unit. --status reports last-run and health.
#
# Init system rather than a cron @reboot line on purpose: the unit is what restarts a worker that
# dies, and a cron entry is not.

. "$(dirname "$0")/require-bash.sh"

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
LOGS="$ROOT/.logs"
UNIT_NAME="orbo-worker"
UNIT_FILE="/etc/systemd/system/${UNIT_NAME}.service"
ENV_FILE="$ROOT/.env"

usage() {
  cat <<'EOF'
Usage: bash scripts/worker-install.sh [--env-file <path>] [--root <path>] [--remove] [--status]

Registers the systemd unit that launches the ORBO routine worker at boot.

  --env-file <path>  Env file the unit sources the worker's settings from
                     (DATABASE_URL, SERVER_INTERNAL_URL, WORKER_SHARED_SECRET). Default: ./.env
  --root <path>      Deployment root: where worker/src/index.ts lives and where the service
                     works. Default: the directory above this script.
  --remove           Disable, stop, and delete the unit.
  --status           Report the unit's state and last run.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --root) ROOT="$2"; shift 2 ;;
    --remove) REMOVE=true; shift ;;
    --status) STATUS=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1. Try --help." >&2; exit 1 ;;
  esac
done
REMOVE=${REMOVE:-false}
STATUS=${STATUS:-false}

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
info()  { printf '\033[2m%s\033[0m\n' "$1"; }

if [ "$STATUS" = "true" ]; then
  if ! systemctl cat "$UNIT_NAME.service" >/dev/null 2>&1; then
    red "$UNIT_NAME.service is not installed."
    exit 1
  fi
  systemctl status "$UNIT_NAME.service" --no-pager -l || true
  info "Recent output: journalctl -u $UNIT_NAME.service -n 50 (stdout is also appended to $ROOT/.logs/worker-service.log)"
  exit 0
fi

if [ "$REMOVE" = "true" ]; then
  if systemctl cat "$UNIT_NAME.service" >/dev/null 2>&1; then
    systemctl disable --now "$UNIT_NAME.service" >/dev/null
    rm -f "$UNIT_FILE"
    systemctl daemon-reload
    green "$UNIT_NAME.service removed."
  else
    info "$UNIT_NAME.service is not installed; nothing to remove."
  fi
  exit 0
fi

if [ ! -f "$ROOT/worker/src/index.ts" ]; then
  red "worker/src/index.ts not found under $ROOT. Not running from a deployment root: pass --root."
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  red "Env file not found: $ENV_FILE. The worker's settings (DATABASE_URL, SERVER_INTERNAL_URL, WORKER_SHARED_SECRET) are read from it; pass --env-file."
  exit 1
fi

# The same three settings scripts/start.sh hands the worker by hand. Refused here before the unit
# exists, for the reason the worker itself refuses at boot (worker/src/env.ts): a unit that starts
# and immediately dies on a missing setting is a scheduled failure nobody is watching.
missing_keys=0
for key in DATABASE_URL SERVER_INTERNAL_URL WORKER_SHARED_SECRET; do
  if ! grep -qE "^$key=" "$ENV_FILE"; then
    red "The env file $ENV_FILE is missing $key=, which worker/src/env.ts refuses to start without. Fix the file and rerun."
    missing_keys=1
  fi
done
if [ "$missing_keys" -ne 0 ]; then
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  red "bun is not on PATH, and the worker runs on it: the unit cannot be pinned to an absolute path. Install bun and rerun."
  exit 1
fi
BUN="$(command -v bun)"

if ! [ -d /run/systemd/system ]; then
  red "This machine's init system does not appear to be systemd (no /run/systemd/system). These units are the launcher this script ships; on anything else, run the worker another way (see docs/ops-worker.md)."
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then
  red "Writing $UNIT_FILE needs root. Rerun with sudo."
  exit 1
fi

mkdir -p "$LOGS"

# `Restart=on-failure` is not there for the tick errors the worker itself swallows (it never exits
# on one); it is there for the boot-time case of Postgres still being down when the service is
# ordered up, and for a crash that took the whole loop down despite it.
written_unit="$(mktemp)"
cat > "$written_unit" <<EOF
[Unit]
Description=ORBO routine sweep worker (host stand-in for the routines CronJob)
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT
ExecStart=$BUN worker/src/index.ts
EnvironmentFile=$ENV_FILE
StandardOutput=append:$LOGS/worker-service.log
StandardError=append:$LOGS/worker-service.log
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

if [ -f "$UNIT_FILE" ] && cmp -s "$written_unit" "$UNIT_FILE"; then
  rm -f "$written_unit"
  # Idempotent, and declarative rather than restarting a healthy service the way
  # scripts/start.sh leaves matching services alone.
  systemctl daemon-reload
  systemctl enable --now "$UNIT_NAME.service" >/dev/null
  green "$UNIT_NAME.service already installed and unchanged; enabled and $([ "$(systemctl is-active "$UNIT_NAME.service" 2>/dev/null)" = "active" ] && echo running || echo not running)."
  info "Check it with: bash scripts/worker-install.sh --status"
  exit 0
fi

install -m 0644 "$written_unit" "$UNIT_FILE"
rm -f "$written_unit"
systemctl daemon-reload
systemctl enable "$UNIT_NAME.service" >/dev/null
systemctl restart "$UNIT_NAME.service"

green "$UNIT_NAME.service installed: starts at boot, runs '$BUN worker/src/index.ts' from $ROOT."
green "Output is appended to $LOGS/worker-service.log."
info "Check it with: bash scripts/worker-install.sh --status"
info "Remove it with: bash scripts/worker-install.sh --remove"
