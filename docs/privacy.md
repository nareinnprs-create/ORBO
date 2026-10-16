# Privacy Notice (draft)

> Status: draft for owner review. Every owner-specific fact is marked
> `[OWNER TODO: ...]`. Do not publish until each placeholder is resolved.
>
> This notice describes what the ORBO software does with data, based on the
> implementation. It is not legal advice.
> `[OWNER TODO: have counsel review before first customer deployment]`.

## 1. What data ORBO handles

| Category | Examples | Where it is stored |
|---|---|---|
| Conversations | Messages, thread titles, channel membership, attachments | PostgreSQL (`threads`, `channels`, `attachments`); conversation content also persists durably in CopilotKit Intelligence (see §2) |
| Attachments | Files attached to channel messages (bytes in the database) | PostgreSQL `attachments` table (`server/src/db/schema/core.ts`); one `pg_dump` restores them |
| Memory | `memory_sources` sync configs, `personal_memories` facts, per-thread learning-container assignment, published Intelligence skills | PostgreSQL (`server/src/db/schema/memory.ts`, `threads.learning_container_id`); learned skills live in Intelligence |
| Credentials and OAuth grants | API keys, MCP bearer tokens, per-person OAuth refresh tokens, connected-app accounts, SSO configs | PostgreSQL `credentials` table, AES-256-GCM encrypted under `KEY_ENCRYPTION_KEY` (`server/src/credentials.ts`); sign-in OAuth tokens encrypted under `BETTER_AUTH_SECRET` (`server/src/auth/index.ts`); SSO configs encrypted (`server/src/auth/encrypt-sso-config.ts`) |
| Identity | Email, name, role, session, SCIM directory records | PostgreSQL (`users`, `sessions`, `accounts`, SCIM tables); role derived from `INITIAL_ADMIN_EMAILS` |
| Audit trail | Tool calls, approvals, sign-ins, configuration changes, computer actions (payloads redacted, §4) | PostgreSQL `audit_events`, append-only; optional OTLP/SIEM export (§2) |
| Operational | Scrubbed shell-command records, page-frame screenshots (sandbox computer mode) | PostgreSQL; commands scrubbed before storage (`server/src/telemetry/scrub.ts`) |

## 2. Where data flows

Personal and conversation data leaves the deployment only through the
integrations below, and only when an administrator or user has configured
and granted them. Nothing is sold. There is no advertising.

| Destination | What is sent | When | Code reference |
|---|---|---|---|
| CopilotKit Intelligence (managed service, default `https://api.intelligence.copilotkit.ai`, gateway `wss://realtime.intelligence.copilotkit.ai`; self-hosting supported) | Thread/message content, per-user thread scope, memory/learning containers and skills; `INTELLIGENCE_API_KEY` as project credential. Required: the server refuses to start without it — there is no offline mode. | Every conversation turn | `server/src/config.ts` (`runtimeCapabilities`), `server/src/copilot.ts`, `server/src/intelligence-client.ts` |
| Model provider (OpenAI by default; Anthropic or Google if the operator configures them, or any OpenAI-compatible endpoint via `OPENAI_BASE_URL`) | Prompts, conversation context, tool definitions and tool results for the active Bot | Every Bot answer | `.env.example` (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OPENAI_BASE_URL`, `BOT_MODEL`); `server/src/provider-oauth.ts` |
| Transcription / voice providers (only if configured) | Audio and voice session data | Dictation and live-voice calls | `.env.example` (`TRANSCRIPTION_*`, `VOICE_*`) |
| Parallel Search MCP (`https://search.parallel.ai/mcp`) | Model-selected search queries, requested public URLs, a session identifier. Full conversations are not forwarded. Anonymous entry sends no credential; API-key entry sends the deployment's Parallel key as a Bearer token. | Only when a Bot granted `web_search`/`web_fetch` performs public-web research | `server/src/plugins/catalogue.ts`, `docs/parallel-research.md` |
| Google Drive (first-party connector) | The asker's own Drive file reads, authorized by their own OAuth grant. Scope is read-only: `https://www.googleapis.com/auth/drive.readonly`, with `access_type=offline` + `prompt=consent` so a refresh token is issued. Revocation is sent to Google (`https://oauth2.googleapis.com/revoke`). | Only when a person connects their Google account and a Bot reads their Drive | `server/src/plugins/catalogue.ts` (`google-drive` entry), `server/src/plugins/google-drive-rest.ts` |
| Notion (first-party connector) | The asker's own pages/databases, authorized per-page on Notion's consent screen (Notion exposes no scope strings; the deployment's write-tool list plus action policy is the write barrier). Client registered dynamically (RFC 7591). | Only when a person connects their Notion account and a Bot uses it | `server/src/plugins/catalogue.ts` (`notion` entry) |
| Composio broker (`https://backend.composio.dev`) — Gmail, Calendar, Slack and hundreds of other apps | Tool arguments and results for the connected app, plus the ORBO user id so one person's connections are never reachable from another's. Connected under the deployment's single `COMPOSIO_API_KEY`. There is no first-party Gmail/Calendar connector: mail and calendar access happens only through this broker, only after the person connects their account. | Only when the operator sets `COMPOSIO_API_KEY` and a person connects an app | `server/src/plugins/composio.ts`, `server/src/plugins/composio-adapter.ts`, `server/src/config.ts` |
| Sign-in identity providers (Google, Microsoft Entra, Okta — whichever the operator configures) | OAuth sign-in exchange: identity claims (email/profile) used to identify the person. This is sign-in only; Drive/Notion data access uses the separate per-connector grants above. | Every sign-in | `server/src/auth/index.ts`, `server/src/config.ts` (`authConfig`) |
| Operator's SIEM / OpenTelemetry collector (only if configured) | Redacted audit rows as OTLP log records (commands scrubbed, secrets redacted) | Only when the operator sets an `OTEL_EXPORTER_OTLP_*` endpoint | `server/src/telemetry/otel.ts` |
| Desktop telemetry (desktop builds only) | Closed-enum setup events (`oss.desktop.*`), install UUID, distribution/platform/arch/engine/version metadata. No prompts, answers, credentials, file names, paths, hostnames, emails, model names, or URLs. Opt out with `COPILOTKIT_TELEMETRY_DISABLED=true` or `DO_NOT_TRACK=1`. | Desktop app setup and activation | `desktop/TELEMETRY.md`, `server/src/desktop-telemetry.ts` |
| Model/computer harness endpoints the operator registers | Prompts and tool callbacks sent to the registered AG-UI endpoint | Bot turns routed to that endpoint | `server/src/config.ts` (`managedAgentConfig`) |

## 3. Telemetry and analytics: what is on and off by default

- Server audit/SIEM export is **off** unless the operator sets an
  `OTEL_EXPORTER_OTLP_*` endpoint, and `ORBO_OTEL_EXPORT=off` disables it
  with an endpoint still set (`server/src/telemetry/otel.ts`).
- Composio SDK tracking is **off**: the client is constructed with
  `allowTracking: false` and `disableVersionCheck: true`, so no
  `SDK_INITIALIZED` metric reaches `telemetry.composio.dev` and no npm
  version check runs at boot (`server/src/plugins/composio-adapter.ts`).
- CopilotKit runtime telemetry carries only `accessibility_title` and
  closed desktop-distribution properties on events the runtime already
  emits (`server/src/copilot.ts`, `server/src/desktop-telemetry.ts`).
- Desktop-app telemetry is **on** by default and discloses itself at
  Welcome; it is closed-schema (enum events and metadata only) and opts
  out via `COPILOTKIT_TELEMETRY_DISABLED=true` or `DO_NOT_TRACK=1`
  (either value `true` or `1`; quit and relaunch after changing the
  environment; opting out removes pending desktop events and prevents
  recording or replay) (`desktop/TELEMETRY.md`).
  Current truth (interim default — confirm with counsel; no behavior
  change): the desktop emitter is constructed with `enabled: true` and
  `endpoint` taken from the `COPILOTKIT_TELEMETRY_URL` environment
  variable or `None` (`desktop/src-tauri/src/desktop_telemetry.rs`); with
  no endpoint set, events queue locally (at most 256, oldest dropped on
  overflow) and no delivery is attempted (`desktop/src-tauri/src/telemetry.rs`).
  `[OWNER TODO: decide whether desktop telemetry stays opt-out or becomes opt-in for customer builds, and name the telemetry endpoint/processor in the published notice]`.

## 4. Retention and deletion

- The audit trail is append-only and kept **forever** unless the operator
  sets `AUDIT_RETENTION_DAYS` (whole days, ≥ 1). The database refuses
  deletes outside a declared retention sweep (`server/src/audit-retention.ts`,
  `server/src/config.ts`, migration `0007`).
  Interim default — confirm with counsel: this notice states the software
  default (keep forever unless the operator sets `AUDIT_RETENTION_DAYS`);
  no fixed hosted/customer period is chosen here.
  `[OWNER TODO: choose a fixed retention period in days for hosted/customer deployments and state it here]`.
- Secrets in audit payloads are replaced with `[REDACTED]` before storage
  (token, secret, password, credential, prompt, content, result, tool
  arguments/results, and related key spellings in `server/src/audit.ts`).
  Shell commands kept for Action Recording are scrubbed of secrets before
  storage (`server/src/telemetry/scrub.ts`).
- Bot-formed memories are scoped to the Bot and app they were read from;
  revoking the app withdraws the memory (`server/src/db/schema/memory.ts`).
  Interim default — confirm with counsel: memories are retained until the
  person or operator deletes them or the app grant is withdrawn; no
  automatic memory expiry ships in the repo.
- Attachments live in the database and are removed with their channel.
  Interim default — confirm with counsel: attachments are retained until
  their parent channel is deleted; copies in operator backups persist per
  the operator's backup policy.
- Sandbox page-frame screenshots are purged after 30 days
  (`FRAME_RETENTION_MS` in `server/src/computer/page-frames.ts`, swept by
  `startRetentionSweeps` in `server/src/audit-retention.ts`) and cleared
  with the computer profile on wipe (interim default — confirm with
  counsel; records current behavior, no change).
- Backups: no automated backup ships with ORBO today (`docs/backup-restore.md`
  describes manual `pg_dump`/`pg_restore`); schedule, retention, off-site
  location, encryption, and recovery objectives are operator-defined.
  `[OWNER TODO: state the backup schedule and retention for hosted/customer deployments]`.
- Account deletion: the operator handles deletion requests against the
  deployment database and forwards them to Intelligence, Composio, and
  provider grants (§5.5); no automatic account-deletion timeline ships in
  the repo.
  `[OWNER TODO: state the account-deletion timeline for hosted/customer deployments]`.

## 5. Operator duties (self-hosted and customer deployments)

The operator of a deployment is the data controller for what that
deployment processes. They must:

1. Replace `KEY_ENCRYPTION_KEY` (production refuses the example key),
   set `BETTER_AUTH_SECRET`, and configure a sign-in provider before
   exposing the deployment; never run `ORBO_SINGLE_USER=true` on a
   reachable address (`server/src/config.ts`, `.env.example`).
2. Decide `AUDIT_RETENTION_DAYS`, backup/restore, and account-deletion
   handling, and disclose them to their users.
3. Review each connector before granting it: Intelligence project,
   model provider, Parallel key, Google/Notion consent screens,
   `COMPOSIO_API_KEY`, and any OTLP/SIEM endpoint.
4. Treat `COMPOSIO_API_KEY`, model keys, and the computer token as
   deployment secrets; per-person OAuth grants stay per-person.
5. Forward data-subject requests (access, correction, deletion) to the
   systems above, including Intelligence, Composio, and Google/Notion,
   where the deployment does not hold the copy.
   Interim default — confirm with counsel: until a dedicated runbook
   ships, operators follow `docs/backup-restore.md` (backups/restore),
   `docs/configuration.md` (provider/retention notes), and the audit
   trail at `/admin/audit` for evidence.
   `[OWNER TODO: provide the operator runbook and support contact for such requests]`.

## 6. Self-host notes

- Data at rest is the operator's PostgreSQL (plus Intelligence, managed
  or self-hosted via the Enterprise Helm chart — see `.env.example`).
  One `pg_dump` restores the deployment's own tables.
- Intelligence self-hosting keeps threads/memory inside the operator's
  infrastructure; the managed default sends them to CopilotKit's service.
  `[OWNER TODO: confirm the Intelligence DPA/subprocessor terms for the managed default and link them here]`.
- Model traffic stays with the configured provider/endpoint; a
  self-hosted OpenAI-compatible endpoint keeps prompts in-house.

## 7. Contact and ownership

- Company legal name: Opraiz Technology Pvt Ltd (`PLAN.md`, `LICENSE`).
  `[OWNER TODO: registered address]`.
- `[OWNER TODO: privacy contact email]`.
- `[OWNER TODO: support URL and data-request procedure]`.
- `[OWNER TODO: governing law / jurisdiction]`.
- `[OWNER TODO: effective date and change history for this notice]`.

## Sources

Implementation facts above cite file paths. Runtime service names and
endpoints are also catalogued in `NOTICE.md` §2. Connector behavior is
documented per-connector in `docs/plugins/composio.md`,
`docs/plugins/google-drive.md`, `docs/plugins/notion.md`, and
`docs/parallel-research.md`; desktop telemetry in `desktop/TELEMETRY.md`.
