# Backup and restore

No automated backup ships with ORBO today. There is no backup script in `scripts/`, no backup
service in `docker-compose.yml`, and no scheduled dump anywhere in the tree. The bundled database
in the Helm chart says so explicitly: nothing about that shape gives you backups, failover, or
point-in-time recovery. What follows is what to back up, and how to restore it, using the pieces
the repo already documents.

The design goal, stated in `server/src/db/schema/core.ts`, is that one `pg_dump` restores a
deployment. Attachments live in Postgres rows for exactly this reason: a volume would split the
backup story in two.

## What to back up

1. **PostgreSQL.** This is the deployment: the audit trail, Bot profiles, routines, credentials
   (encrypted), staged attachments, and page snapshots all live here.
   - `docker-compose.yml`: the `postgres-data` volume at `/var/lib/postgresql/data` (pgvector/pg17
     image, database `orbo`).
   - One-container image with `EMBEDDED_POSTGRES=on`: the volume mounted at the **parent**,
     `/var/lib/postgresql` (named `orbo-data` in the documented commands), not at the data
     directory itself. See [deployment.md](deployment.md#what-is-in-the-image-and-what-is-not).
   - Managed database (RDS, Cloud SQL, Azure Database): use the provider's snapshot tooling plus
     a logical dump. The `vector` extension must exist there; see
     [deployment.md](deployment.md#what-is-in-the-image-and-what-is-not).
2. **Secrets and environment: `.env`.** Without the original `KEY_ENCRYPTION_KEY`, the
   credential vault in the restored database cannot be decrypted. The example key is refused
   in production, and the desktop refuses to start on a missing, invalid, or public saved key
   rather than replacing it — so there is no recovery from a lost key by generating a fresh
   one. Back up the whole file: it also
   holds `BETTER_AUTH_SECRET`, OAuth client secrets, provider API keys, `ORBO_COMPUTER_TOKEN`,
   `SUPERVISOR_TOKEN`, `ORBO_MANAGED_AGENT_TOKEN`, `ORBO_AGENT_TOOL_TOKEN`,
   `WORKER_SHARED_SECRET`, and the Intelligence key. The committed `.env.example` holds only
   development placeholders (the example encryption key is refused in production).
3. **`egress.env` (if it exists) and `.langchain/` (if ChatGPT plan sign-in is used).** Per-Bot
   egress proxies live in `egress.env`, not `.env`, and the signed-in plan's renewable token
   lives under `.langchain/`, which is a read-write bind mount precisely so renewals land back
   on the machine.
4. **Deployment fingerprints.** The release version (root `package.json`) and, for image-based
   deploys, that release's `container-images.json` (digest per service). Digests are what
   [releasing.md](releasing.md#deploying-a-release) tells you to deploy, and they are also what
   lets a restore run the exact images the backup was taken from. Note the compose project /
   `ORBO_COMPUTER_NAMESPACE` too: per-Bot volume names derive from it.

Backup schedule, retention, off-site location, backup encryption, and recovery objectives are
[OWNER TODO].

## Backing up

Logical dump against the running database (works for compose, embedded, and managed Postgres):

```sh
pg_dump "postgres://orbo:orbo@localhost:5432/orbo" -Fc -f orbo-backup.dump
```

Copy `.env` (and `egress.env`, `.langchain/` where present) to secure storage separately from
the dump. A backup taken beside `.env` carried live keys into a commit once (see
`tests/clean-checkout.test.ts`): keep secrets out of source control, including backup scripts.

Volume snapshots are a complement, not a substitute: a snapshot of `postgres-data` / `orbo-data`
taken while Postgres is running needs crash recovery on restore, and it captures none of the
files above.

## Restoring

1. Restore `.env` first, and confirm `KEY_ENCRYPTION_KEY` is the original private key. There is
   no recovery from a lost key: vault-encrypted credentials stay unreadable.
2. Provision an empty PostgreSQL with the `vector` extension (pgvector/pg17 image for
   compose/embedded; the administrative role creates the extension once on a managed database).
3. Restore the dump:
   ```sh
   pg_restore -d "postgres://orbo:orbo@localhost:5432/orbo" orbo-backup.dump
   ```
4. Run migrations for the release being restored (`container-images.json` says which one):
   - From a clone: `bun run --filter server db:migrate`, or `bash scripts/start.sh`, which
     applies existing migrations at start.
   - In the one-container image: `docker run --rm --env-file .env --entrypoint sh orbo -c
     "cd /app/server && bun scripts/migrate.ts"` (the `--entrypoint sh` override is
     load-bearing; without it a second server boots against the unmigrated schema — see
     [deployment.md](deployment.md#migrations)).
5. Start the stack and verify health routes, sign-in, and one Bot turn before handing the
   deployment back.

Who may run a restore, and the expected recovery time, are [OWNER TODO].

## What is NOT backed up

- **Agent browser profiles** (`agent-profiles` volume): Bot logins. A restore means signing
  Bots in again.
- **Agent workspaces** (`agent-workspace` volume, `/workspace` per Bot): working files, not
  product state. Back these up separately only if an operator decides they matter
  ([OWNER TODO]).
- **SPIRE data and sockets** (`spire-server-data`, `spire-agent-data`, socket volumes):
  workload identities are reissued at start.
- **Images and build artifacts**: re-pulled by digest from the release's
  `container-images.json`.
- **Managed Intelligence threads and memory**: owned by the Intelligence project, not this
  database. The server refuses to start without its Intelligence values.
