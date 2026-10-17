# Self-hosting ORBO

One-line install, from a clone:

```sh
bash scripts/install.sh
```

That is the compose path: it checks prerequisites, creates `.env` from `.env.example`
when absent (never overwrites), generates the two loopback Bot secrets, brings the
compose services up, runs the database migrations, waits for health, then hands off to
`scripts/start.sh`, which starts the API server, the app and the routine worker. Safe
to rerun at any point. Variants:

```sh
bash scripts/install.sh --check-only   # preflight: tools + which required keys are still empty; touches nothing
bash scripts/install.sh --no-start     # prep everything, but do not launch the server/app yet
```

## What the installer does, step by step

1. **Prerequisites.** Requires `docker` (with the daemon reachable), the Docker Compose
   v2 plugin (`docker compose version`), `bun`, `openssl` and `curl`. Anything missing
   stops the run with the tool named.
2. **Environment file.** Copies `.env.example` to `.env` when `.env` does not exist.
   An existing `.env` is never overwritten or merged.
3. **Bot secrets.** Generates `ORBO_MANAGED_AGENT_TOKEN` and `ORBO_AGENT_TOOL_TOKEN`
   with `openssl rand -base64 32` when empty and writes them back to `.env` — the same
   two secrets, generated the same way, as `scripts/start.sh`. Every other secret is
   deployment-owned and only reported, never invented.
4. **Required-key report.** Prints which of `KEY_ENCRYPTION_KEY`, `INTELLIGENCE_API_KEY`,
   a model key and sign-in are set and which still need filling. Missing keys do not
   stop the install (compose and migrations do not need them); the server refuses to
   start without them, so fill them before relying on the deployment.
5. **Compose up.** Runs `docker compose -f deploy/compose/docker-compose.yml up -d
   --build` with the same service selection as `scripts/start.sh`: `postgres` and
   `orbo-computer` always, `supervisor` when `ORBO_ONE_COMPUTER_EACH=true` (the
   default), `orbo-bot` except on Anthropic-only deployments, and `orbo-langgraph`.
   The `harness` profile (the `orbo-harness` service) is included only when
   `PICKED_HARNESS_IMAGE` is set, because an empty image fails the whole `up`.
6. **Migrations.** Runs the `migrate` compose service once (`run --rm --build`),
   which applies the schema against `postgres`. A failure stops the run and names
   `.logs/migrate.log`.
7. **Health.** Waits for the computer and Bot `/health` endpoints to answer, then
   `exec`s `scripts/start.sh`, which prints the app URLs (`http://localhost:3010`,
   `/bot`, `/bots`, admin pages) and how to stop everything.

## Requirements

**Tools:** Docker with a running daemon, Docker Compose v2, Bun, OpenSSL, curl.
`--check-only` verifies these without touching anything.

**Ports (all loopback-bound by the compose file):** 5432 (PostgreSQL), 4100 (Bot
computer), 4200 (reference Bot), 4201 (framework Bot), 4500 (supervisor), plus 3001
(API server) and 3010 (app) once `start.sh` runs. A conflict is reported with the
process named; rerun with `<NAME>_PORT=<free port>` (e.g. `APP_PORT=3020`).

**Keys to fill in `.env`:**

| Key | How to get it |
| --- | --- |
| `KEY_ENCRYPTION_KEY` | `openssl rand -base64 32`. The example value is public and refused in production. |
| `INTELLIGENCE_API_KEY` | `npx --yes copilotkit@latest login` then `npx --yes copilotkit@latest project select`. The server refuses to start without it. |
| A model key | `OPENAI_API_KEY`, or `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` for the provider you configured (`BOT_PROVIDER`). |
| Sign-in | One provider (`GOOGLE_OAUTH_*`, `MICROSOFT_OAUTH_*` or `OKTA_OAUTH_*` with `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `INITIAL_ADMIN_EMAILS`), or `ORBO_SINGLE_USER=true` — on a private address only. A public address with single-user refuses to start. |

Serving this on the public internet additionally wants TLS in front (reverse proxy or
platform ingress) and a real sign-in provider. See `docs/deployment.md` for the
authentication rules and the minimum sizing (2 GB RAM floor, 4 GB recommended).

## Which shape to run

| | Single container | Compose (this guide) | Helm chart |
| --- | --- | --- | --- |
| Image / entrypoint | `ghcr.io/nareinnprs-create/orbo:latest` (`docker run`, optional `EMBEDDED_POSTGRES=on`) | This repo, `deploy/compose/docker-compose.yml` | `deploy/charts/orbo-diya`, EKS / GKE / AKS / self-hosted cluster |
| Best for | A deployment with no clone and no build; PaaS (Cloud Run, ECS, Railway, Render, Fly.io) | Laptop development and a single server you SSH into | Production on Kubernetes |
| Database | Embedded in the container or managed (`DATABASE_URL`) | Compose `postgres` service (volume `postgres-data`) or managed | Bundled or managed via an existing Secret |
| Per-Bot computers | No (one shared browser) | Yes, when `ORBO_ONE_COMPUTER_EACH=true` (supervisor service) | Yes |
| Routine schedule | External cron / scheduled job running `bun scripts/fire-routines.ts` | `start.sh` worker loop locally; CronJob shape in real deployments | CronJob included |
| Replicas / scaling | More replicas fine (snapshot state is in Postgres) | One stack per host | Full scaling, migration Job |
| Reference | `docs/deployment.md` | This file + `scripts/install.sh` | `deploy/charts/orbo-diya/README.md` |

What the single container leaves out (supervisor, routine schedule, staged-attachment
sweep) is load-bearing for a real deployment — read `docs/deployment.md` before
choosing it.

## Updating

- **Compose:** `git pull` and rerun `bash scripts/install.sh`. It rebuilds changed
  images and reapplies migrations; volumes (database, files, browser profiles) are
  untouched.
- **Single container:** pull the new tag and rerun the migration step from
  `docs/deployment.md` before starting it (replicas must not migrate on boot).
- **Helm:** upgrade per `deploy/charts/orbo-diya/README.md`; its migration Job runs
  with the release.

Pin releases by digest (`container-images.json`) rather than the moving `latest` tag;
see `docs/releasing.md`.

## Uninstalling

- Laptop stack: `bash scripts/stop.sh` stops the app, worker, server, compose
  services and per-Bot computers. Nothing is deleted — volumes keep the database,
  files and browser profiles for next time.
- Remove the compose deployment but keep data: from the repo root,
  `docker compose -f deploy/compose/docker-compose.yml down`.
- Remove everything including data: the same `down` with `-v`. That deletes the
  PostgreSQL volume — the audit trail is the product, so export first
  (`docs/backup-restore.md`).
- Single container: `docker rm` the container and its data volume (or keep the volume
  for the next deploy).
