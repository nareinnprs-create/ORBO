#!/bin/sh
# Migrations, for the embedded database only.
#
# An external database is somebody else's release process: two replicas starting together would
# race, and a failed migration should stop a deploy rather than leave a half-migrated database
# serving. An embedded one has exactly one process and no deploy pipeline, so doing it here is the
# difference between the container working and the operator reading a runbook.
set -eu
[ "${EMBEDDED_POSTGRES:-off}" = "on" ] || exit 0
cd /app/server
export HOME=/home/apiuser
# s6 marks the postgres longrun "up" as soon as it is supervised, which on a warm boot is while
# WAL recovery is still running: migrate then dies on ECONNREFUSED / 57P03 and, being a
# dependency of api, takes the whole container down with it. Wait for real acceptability
# (pg_isready sends no credentials; it only reports whether the server accepts connections).
PG_ISREADY=/usr/lib/postgresql/16/bin/pg_isready
ready=0
i=0
until [ "$i" -ge 60 ]; do
    if "$PG_ISREADY" -h 127.0.0.1 -p 5432 -t 2 >/dev/null 2>&1; then ready=1; break; fi
    i=$((i + 1))
    sleep 1
done
if [ "$ready" -ne 1 ]; then
    echo "migrate: postgres never became ready after 60s" >&2
    exit 1
fi
# `scripts/migrate.ts`, not `drizzle-kit`. The CLI is a development dependency and needs esbuild to
# read its TypeScript config, which `bun install --production` leaves out of this image: asked to
# migrate here it exits 1 without printing why, and the container comes up against an empty database.
exec s6-setuidgid apiuser /usr/local/bin/bun scripts/migrate.ts
