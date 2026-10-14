# 01 — Database Schema Unification (PLAN.md §10.C item 22)

Design for collapsing three data models into one Postgres schema. ORBO/OpenBot is the base and the
only source with a real Postgres schema; OpenMuse is one generic key-value table; OpenDots is SQLite.
Nothing here is implemented — this is the design + mapping doc.

## Sources inspected

| Source | Form | Entry points relied on |
| --- | --- | --- |
| ORBO (OpenBot) | Postgres + Drizzle | `server/src/db/schema/*.ts` (21 table files; 23 with `index.ts`+`json.ts`), `server/drizzle.config.ts` (lists 21 explicitly), `server/drizzle/*.sql` |
| OpenMuse | Postgres/PGlite, **one** table | `apps/server/src/db.ts`, `packages/domain/src/{agent,index,computer}.ts`, `apps/server/src/**` |
| OpenDots | SQLite (`node:sqlite`) | `src/server/{store,workspace,pages,computer-store,connection-store}.ts`, `src/shared/*.ts` |

Accuracy note: OpenMuse has **no discoverable physical schema beyond `records`**; its "entities" are
TypeScript interfaces discriminated by a `kind` string. OpenDots has **no Drizzle/Prisma** — tables are
inline `CREATE TABLE` SQL. ORBO tables below are the **current** schema; `channels`/`agents` etc. are
real, and `documents`/`chunks`/`document_acls` were dropped (migration 0010, plus `vector`
extension) and `connector_instances`/`connector_cursors`/`sync_runs`/`webhook_subscriptions`
were dropped (migration 0011).

---

## 1. ORBO (OpenBot) tables — 87

Grouped by subsystem. "Key columns" is abbreviated; every table also carries `created_at`/`updated_at`
where noted in source.

### 1.1 Core identity, auth, vault, audit — `server/src/db/schema/core.ts`
| Table | Purpose | Key columns |
| --- | --- | --- |
| `users` | Person record | id, email, name, groups[], onboarding_step, preferences (jsonb) |
| `sessions` | Sign-in sessions | id, user_id, token, expires_at |
| `accounts` | OAuth/credential accounts (Better Auth) | provider_id, account_id, user_id, issuer, tokens |
| `verifications` | Email/OTP verifications | identifier, value, expires_at |
| `user_roles` | admin/user role | user_id, role |
| `user_instructions` | Standing per-person instructions | user_id PK, instructions |
| `sso_providers` | Enterprise IdPs | issuer, domain, oidc_config, saml_config |
| `revoked_access` | Removed people by email | email PK, revoked_by |
| `deployment_packages` | Tenant package loads | tenant_id, source_path, checksum |
| `audit_events` | Append-only audit trail | actor_user_id, event_type, target_type, payload |
| `credentials` | Encrypted credential vault | kind, provider, encrypted_value, key_id, revoked_at |

### 1.2 SCIM (plugin-owned) — `server/src/db/schema/scim.ts`
`scim_connection_bindings`, `scim_identity_tombstones`, `scim_subjects`, `scim_users`,
`scim_projection_grants`, `scim_groups`, `scim_group_members`.

### 1.3 Agents, coworkers, routines — `core.ts` (`agents`), `coworker.ts`, `lifecycle.ts`
| Table | Purpose | Key columns |
| --- | --- | --- |
| `agents` | Agent registry | id, name, type, configuration (jsonb), package_id, override |
| `agent_profiles` | Bot persona/visibility | agent_id PK, owner_user_id, title, role_description, avatar_seed, visibility, callback_token_hash, deleted_at |
| `agent_preferences` | Per-person hide/pin | user_id, agent_id, hidden_at, pinned_at |
| `routines` | Scheduled instruction | owner_user_id, agent_id, channel_id, instruction, cron, timezone, next_run_at, enabled |
| `routine_runs` | One firing | routine_id, status, waiting, error, source |
| `routine_sweeps` | Sweep bookkeeping | swept_at, owner |
| `bot_lifecycle` | Per-person pause/notify | owner_user_id, agent_id, paused_at, notify |
| `update_routing_preferences` | Per-kind notification routing | owner_user_id, kind, transports[] |

### 1.4 Channels, chat, attachments — `core.ts`, `group.ts`
`channels` (name, summary, last_message, deleted_at), `channel_memberships` (channel_id, user_id,
pinned_at, last_read_at), `channel_agents`, `intelligence_channel_mappings` (user_id, channel_id,
thread_id), `attachments` (bytes bytea, mime_type, upload_group), `group_bot_threads` (channel_id,
agent_id, thread_id), `group_messages` (channel_id, agent_id, thread_id, text, status, details).

### 1.5 Memory — `memory.ts`
`memory_sources` (owner_user_id, agent_id, tool_ref, next_sync_at, sync_status),
`personal_memories` (owner_user_id, source_id, content, provenance, formed_by, formed_by_agent_id,
source_ref, review_state, deleted_at).

### 1.6 Approvals & policy — `approvals.ts`, `computer.ts`
`approval_preferences` (owner_user_id PK, enabled, auto_review, host_commands),
`approval_team_settings`, `approval_requests` (owner_user_id, run_id, tool_call_id, action_digest,
action, status, decision, result), `approval_rules`, `approval_team_rules`, `action_policy` (mode,
deny[], allow[], updated_by).

### 1.7 Computers — `computer.ts`
`computer_snapshot` (computer_id PK, snapshot_id, url, elements jsonb, session),
`computer_page_frame` ((computer_id, tool_call_id) PK, url, frame base64 PNG).

### 1.8 Responsibilities & triggers — `responsibilities.ts`
`responsibilities` (owner_user_id, agent_id, channel_id, thread_id, instruction, success_criteria,
subscriptions), `responsibility_events`, `responsibility_runs`, `responsibility_source_bindings`,
`responsibility_triggers` (kind, config, credential_id).

### 1.9 Proactive research — `proactive.ts`
`proactive_settings` (owner_user_id, agent_id, channel_id, focus, interval_minutes, next_run_at),
`proactive_suggestions` (setting_id, run_id, title, status, source_ref).

### 1.10 Demonstrations & learning — `demonstrations.ts`, `learning.ts`
`demonstrations` (owner_user_id, bot_id, actions jsonb, draft, skill_slug),
`learning_settings` (id PK, settings jsonb), `learning_thread_bindings` (user_id, thread_id,
agent_id, container_id).

### 1.11 Plugins, tools, components — `plugins.ts` (incl. `sandboxed_components`), `components.ts`, `shared-use.ts`
| Table | Purpose | Key columns |
| --- | --- | --- |
| `mcp_servers` | Added MCP server | id, url, vendor, provenance, credential_id, auth_scheme, account_mode |
| `mcp_tools` | Cached tool list | (server_id, name) PK, input_schema, effect, destructive, version |
| `mcp_user_credentials` | Per-person OAuth grant | (server_id, user_id) PK, credential_id, scope |
| `composio_connections` | Composio consent/key cache | (toolkit, user_id) PK, verified, probe_action |
| `brokered_connections` | Delegated accounts | provider, app, holder, user_id, vendor_user_id, verified |
| `skills` | /-invoked instruction packs | slug, title, instructions, owner_user_id, origin |
| `skill_tools` | Declared tools (not grants) | (skill_id, ref) PK |
| `plugin_grants` | Per-Bot grant | (kind, ref, agent_id) PK |
| `components` | Compiled generative-UI component | name PK, draft/published description |
| `component_exclusions` / `component_functions` | Per-Bot withhold / allowed fns | (component_name, agent_id/function_name) |
| `sandboxed_components` | Browser-authored component | name PK, draft/published html/css/js |
| `shared_use_approvals` / `_members` / `shared_use_requests` | Admin approval for shared apps | (agent_id, server_id) |

### 1.12 Delivery, team bots, admin, work, voice
- `delivery.ts`: `delivery_bindings`, `delivery_challenges`, `delivery_inbox`, `delivery_outbox`, `push_devices`.
- `team-bots.ts`: `team_bot_publications`, `team_bot_audience`, `team_bot_assignments`, `team_bot_consents`, `team_bot_consent_defaults`.
- `admin.ts`: `capability_settings`, `enterprise_settings`, `network_policies`, `action_records`, `model_usage`.
- `passwords.ts`: `saved_logins`, `sign_in_requests`.
- `work.ts`: `work_items` (kind, key, run_at, claimed_by, lease_until, attempts, finished_at).
- `voice.ts`: `voice_sessions` (channel_id, user_id, transcript, summary).

---

## 2. OpenMuse tables / entities — 1 physical, ~32 logical kinds observed

`records(owner text, kind text, id text, data jsonb, updated_at timestamptz, PRIMARY KEY(owner,kind,id))`

Every OpenMuse "entity" is a row here, selected by `kind` and typed by a TS interface in
`packages/domain/src/*.ts`. Kinds discovered by scanning `apps/server/src/**`:

| kind | Entity (interface) | Key fields | Domain file |
| --- | --- | --- | --- |
| `tasks` | AgentTask | title, prompt, kind, status, plan[], evidence[], goalId, nextRunAt, leaseId | `agent.ts` |
| `runs` | task run record (worker) | taskId, status, result, error | `worker.ts` (distinct from `run-events`) |
| `run-events` | RunEvent | taskId, date, kind, title, detail | `agent.ts` |
| `monitor-pages` | MonitorPage | monitor snapshot | `service.ts` |
| `goals` | Goal | title, category, status, milestones[] | `agent.ts` |
| `monitors` | Monitor | taskId, url, condition, intervalMinutes, status, nextCheckAt | `agent.ts` |
| `ideas` | Idea | title, reason, evidence[], prompt, status, taskId | `agent.ts` |
| `memories` | AgentMemory | text, source, createdAt | `agent.ts` |
| `agent-artifacts` | AgentArtifact | taskId, kind, title, summary, data | `agent.ts` |
| `notifications` | AgentNotification | taskId, title, body, read | `agent.ts` |
| `agent-settings` (id `identity`) | AgentIdentity | name, tone, avatar, showChatUpdates | `agent.ts` |
| `actions` | ActionProposal | kind, data, status, hash, expiresAt, taskId | `index.ts` |
| `activity` | ActivityEntry | title, detail, status, actionId | `index.ts` |
| `files` | Artifact | name, mimeType, size, pageCount, url, fields[] | `index.ts` |
| `browsers` | BrowserSession | title, url, status, previewUrl | `index.ts` |
| `mail` | Mail | from, to[], subject, body, unread, threadId | `index.ts` |
| `events` | CalendarEvent | calendarId, title, start, end, attendees[] | `index.ts` |
| `conversations` | Conversation | title, threadId | `app.ts:232` |
| `drafts` | email draft | to[], subject, body | `app.ts:190` |
| `settings` | config (id google/seeded) | enabled, value | `workspace.ts:170` |
| `sessions` | session | token/user | `auth.ts:24` |
| `credentials` (id google) | Credential | connectionId, secret | `google-auth.ts` |
| `oauth` | OAuth state | owner, verifier | `google-auth.ts:124` |
| `imports` | import job | status | `workspace.ts:113` |
| `system` (id `worker-status`) | worker heartbeat | lastTickAt | `service.ts:149` |
| `conversation-settings` (id `main`) | main-thread pointer | threadId | `app.ts` (main-thread route) |
| `chat-browsers` | per-thread browser | threadId | `browser.ts` |
| `browser-downloads` | browser download → file | fileId | `browser.ts` |
| `computer-state` (id `lease`) | computer lease | operation | `computer.ts` |
| `computer-desktop-actions` | desktop action log | receipt | `computer.ts` |
| `search-sessions` | search session | — | `search.ts` |
| `sample-pages` (id `availability`) | sample-mode page | text | `engine/routes.ts` (sample mode only) |

Owner is a plain string (no `users` table exists in OpenMuse).

---

## 3. OpenDots tables — 21

All SQLite; timestamps are epoch-ms INTEGER, secrets are plaintext columns.
`*` = added by later `ALTER TABLE` in `workspace.ts` (not in the initial `CREATE TABLE`).

| File | Table | Purpose | Key columns |
| --- | --- | --- | --- |
| `store.ts` | `settings` | One-row config | id=1, value (json: name, paused, researchAllowed, memoryAllowed) |
| `store.ts` | `setup_telemetry` | Setup state | id=1, value |
| `store.ts` | `tasks` | Scheduled/queued task | prompt, status, intervalSeconds, nextRunAt, lease, leaseUntil |
| `store.ts` | `runs` | One task run | taskId, status, startedAt, finishedAt, result, error |
| `store.ts` | `events` | Task event log | taskId, runId, text |
| `store.ts` | `memories` | Free-text memory | text |
| `workspace.ts` | `spaces` | Workspace container | name, description |
| `workspace.ts` | `dots` | Agent | spaceId, name, instructions, researchAllowed, memoryAllowed, learningContainerId*, skillDeliveryEnabled* |
| `workspace.ts` | `dot_spaces` | Agent↔space ACL | (dotId, spaceId) |
| `workspace.ts` | `thread_bindings` | Conversation | dotId, ownerId, title, learningContainerId* |
| `workspace.ts` | `task_threads` | Task→thread link | taskId PK, threadId |
| `workspace.ts` | `calls` | Voice call receipt | threadId, status, transcript, anchorMessageId* |
| `workspace.ts` | `captures` | Per-thread capture | threadId PK, value |
| `pages.ts` | `pages` | Document page | spaceId, parentId, title, content, revision, sourceThreadId |
| `pages.ts` | `page_reviews` | Page review receipt | (threadId, toolCallId) PK, pageId, spaceId, draft |
| `pages.ts` | `page_threads` | Page↔thread binding | (pageId, dotId) PK, threadId, ready, leaseUntil |
| `computer-store.ts` | `computer_permissions` | Per-agent perms | dotId PK, value (json) |
| `computer-store.ts` | `computer_audit` | Computer-use audit | dotId, action, actor, outcome |
| `connection-store.ts` | `mcp_connections` | MCP server + **plaintext token** | dotId, name, url, token, tools |
| `connection-store.ts` | `mcp_approvals` | Gated-call approval | threadId, dotId, connectionId, tool, arguments |
| `connection-store.ts` | `mcp_actions` | Approval receipt | (threadId, toolCallId) PK, status, result, approvalId |

---

## 4. Overlap analysis

| Concept | ORBO | OpenMuse | OpenDots | Difference that matters |
| --- | --- | --- | --- | --- |
| **Agents** | `agents` + `agent_profiles` + `agent_preferences` | none (single persona `agent-settings`) | `dots` + `dot_spaces` | ORBO has type/visibility/callback token; OpenDots has per-agent space ACL incl. learning container |
| **Threads/messages** | `channels` + `channel_memberships` + `group_messages` + `intelligence_channel_mappings` (history external) | `conversations`, `drafts` | `thread_bindings`, `task_threads`, `captures` | Three names for a conversation; ORBO ties to agent+user+Intelligence thread; OpenDots to a Dot+owner |
| **Memory** | `personal_memories` + `memory_sources` (sources, provenance, sync) | `memories` (text, source) | `memories` (text) | ORBO is rich (formed_by, dedupe digest, review); others are one text blob |
| **Approvals** | `approval_requests` + `approval_rules` + team rules + prefs + `action_policy` | `actions` (ActionProposal, status machine) | `mcp_approvals` + `mcp_actions` (receipts) | ORBO = rule engine + inbox; OpenMuse = proposed external write; OpenDots = per-MCP-call approval/receipt |
| **Computers** | `computer_snapshot` + `computer_page_frame` + `action_policy` | `browsers` (session view) + `ComputerSnapshot` type | `computer_permissions` + `computer_audit` | ORBO persists policy+snapshot+frame; OpenDots perms+audit; OpenMuse view-only |
| **Tasks/routines** | `routines` + `routine_runs` + responsibilities + proactive + `work_items` | `tasks` + `runs` + `run-events` + `monitors` | `tasks` + `runs` + `events` | Cron (ORBO) vs interval (OpenDots) vs `nextRunAt`+monitor (OpenMuse); all need lease/run-history |
| **Documents/pages** | dropped (`documents`/`chunks`/`document_acls` in 0010) | `files`, `imports` | `pages` + `page_reviews` + `page_threads` | OpenDots owns a real page CRUD + revisions; ORBO currently has none |
| **Users** | `users` + `sessions` + `accounts` + `verifications` | `sessions` (kind), owner string | `ownerId` string only | Only ORBO has multi-user; others are single-owner |
| **Credentials** | `credentials` vault + `mcp_user_credentials` + `saved_logins` + `brokered_connections` | `credentials` (kind), `oauth` (kind) | `mcp_connections.token` (plaintext) | ORBO vault is encrypted + FKs; OpenDots stores tokens in the clear |
| **Connectors/plugins** | `mcp_servers` + `mcp_tools` + `skills` + `plugin_grants` + `composio_connections` | `settings` (google), workspace connections (browser/mail/calendar) | `mcp_connections` + tools json | ORBO is a governed registry; OpenDots is per-Dot URL+token; OpenMuse is mostly implicit |
| **Auth** | Better Auth (`accounts`, `sessions`, SSO, SCIM) | `sessions` kind + `oauth` kind (single-owner bearer) | owner-token middleware only | Only ORBO has real multi-user auth; map owner strings to `users.id` |
| **Learning** | `learning_settings` + `learning_thread_bindings` | none | `learningContainerId` cols + `skillDeliveryEnabled` (no dedicated table) | ORBO has bindings tables; OpenDots has per-Dot/per-thread container fields |

---

## 5. Proposed unified Postgres schema

Principle: keep ORBO's tables as canonical, add nullable superset columns from OpenDots/OpenMuse for
the overlapping concepts. One table per concept; features with no overlap keep their own table.

| Unified table | Superset columns (beyond ORBO's) | Rationale |
| --- | --- | --- |
| `agents` (+ `agent_profiles`) | `instructions`, `research_allowed`, `memory_allowed`, `learning_container_id`, `skill_delivery_enabled` | Fold OpenDots `dots` into the agent row; OpenMuse's single persona maps to `agent_profiles`, keep `type='built_in'` |
| `agent_spaces` (new, from `dot_spaces`) | `agent_id`, `space_id` | OpenDots space ACL has no ORBO equivalent; additive join |
| `spaces` (new, from OpenDots) | `name`, `description`, `owner_user_id` | OpenDots Workspace container; ORBO has no spaces table |
| `threads` (new; unify `thread_bindings`+`conversations`+`intelligence_channel_mappings`) | `thread_id`, `channel_id`, `agent_id`, `owner_user_id`, `title`, `learning_container_id`, `source` | One conversation identity; ORBO `channels` remains the team surface, threads attach to it |
| `messages` (new name; extend `group_messages` + `drafts`) | `thread_id`, `agent_id`, `author_user_id`, `text`, `status`, `details` | ORBO `group_messages` is the base; add draft rows here instead of OpenMuse `drafts` |
| `memories` (new name; widen `personal_memories`) | `text` shorthand; keep ORBO columns | OpenDots/OpenMuse rows import as `formed_by='person'`, `provenance='import'` |
| `approvals` (new name; widen `approval_requests`) | `connector_ref`, `tool`, `arguments` jsonb, `approval_kind` (`tool`\|`mcp`\|`action`) | Absorb OpenDots `mcp_approvals` and OpenMuse `actions`; keep ORBO rule tables unchanged |
| `approval_receipts` (new, from OpenDots `mcp_actions`) | `thread_id`, `tool_call_id`, `approval_id`, `status`, `result` | ORBO's `result` is inline; OpenDots keys receipts by turn — keep the turn key |
| `computers` (new, unify perms+state) | `agent_id` PK, `provider`, `state`, `network`, `permissions` jsonb | From OpenDots `computer_permissions` + OpenMuse `ComputerSnapshot`/`computer-state`; ORBO `computer_snapshot`/`computer_page_frame` stay as-is |
| `computer_audit` (new, from OpenDots) | `agent_id`, `actor`, `action`, `outcome` | ORBO has `action_records` (enterprise) but no per-computer audit; additive |
| `tasks` (new, superset) | `title`, `prompt`, `kind`, `status`, `plan` jsonb, `evidence` jsonb, `input`, `state`, `attempts`, `next_run_at`, `lease`, `lease_until`, `goal_id`, `interval_seconds` | Union of OpenDots `tasks` + OpenMuse `AgentTask`; ORBO keeps `routines`/`responsibilities`/`proactive` as higher-level schedulers that enqueue rows |
| `task_runs` (new) | `task_id`, `status`, `started_at`, `finished_at`, `result` jsonb, `error` | Union of OpenDots `runs` + OpenMuse `runs` kind; learn from `routine_runs` shape |
| `task_events` (new) | `task_id`, `run_id`, `kind`, `title`, `detail` | Union of OpenDots `events` + OpenMuse `run-events` kind |
| `monitors` (from OpenMuse) | `task_id`, `url`, `condition`, `value`, `interval_minutes`, `next_check_at`, `last_value` | No ORBO equivalent; keep as its own table (proactive is adjacent but distinct) |
| `pages` (new) | `space_id`, `parent_id`, `title`, `content`, `revision`, `source_thread_id`, `owner_user_id` | From OpenDots `pages`; supersets the dropped ORBO `documents` |
| `page_reviews` / `page_threads` (new) | as OpenDots | Keep; reinforce page↔thread bindings |
| `goals` / `ideas` / `artifacts` / `activity` / `notifications` (new) | OpenMuse field sets | No ORBO equivalent; one table each |
| `users` / `sessions` / `accounts` / `verifications` | ORBO as-is | OpenDots/OpenMuse `ownerId`/owner string becomes `users.id` |
| `credentials` | ORBO vault as-is + `mcp_connections` token → `credentials` row + `mcp_user_credentials` pointer | **OpenDots plaintext tokens must be encrypted into the vault** |
| `settings` (new, keyed) | `scope`, `key`, `value` jsonb | Absorbs OpenDots one-row `settings`/`setup_telemetry` and OpenMuse `settings`/`system` kinds; ORBO keeps `enterprise_settings` |

---

## 6. Mapping: source table → unified table

| Source | Source table | Unified table | Column notes |
| --- | --- | --- | --- |
| ORBO | `agents` / `agent_profiles` | `agents` | Canonical; add OpenDots persona columns |
| OpenDots | `dots` | `agents` | `spaceId`→default `agent_spaces`; `instructions`→profile; bools→new agent columns |
| OpenDots | `dot_spaces` | `agent_spaces` | direct |
| OpenDots | `spaces` | `spaces` | `ownerId`→`users.id` |
| OpenDots | `thread_bindings` | `threads` | `dotId`→`agent_id`; `ownerId`→`owner_user_id` |
| OpenDots | `task_threads` | `threads.task_id` / `task_runs` | thread link moves onto task |
| OpenMuse | `conversations` (kind) | `threads` | owner string→`owner_user_id` |
| ORBO | `group_messages` | `messages` | canonical |
| OpenMuse | `drafts` (kind) | `messages` (status=draft) | add `status='draft'` |
| ORBO | `personal_memories` | `memories` | canonical |
| OpenDots | `memories` | `memories` | `text`→`content`, `formed_by='person'`, `provenance='opendots'` |
| OpenMuse | `memories` (kind) | `memories` | `text`→`content`, `source`→`provenance` |
| ORBO | `approval_requests` | `approvals` | canonical; add `approval_kind` |
| OpenDots | `mcp_approvals` | `approvals` | `connectionId`→`connector_ref`, `tool`+`arguments` |
| OpenMuse | `actions` (kind) | `approvals` | full status→`status`; `hash`→`action_digest` |
| OpenDots | `mcp_actions` | `approval_receipts` | (threadId, toolCallId) key preserved |
| OpenDots | `computer_permissions` | `computers.permissions` (jsonb) | `dotId`→`agent_id` |
| OpenDots | `computer_audit` | `computer_audit` | epoch→timestamptz |
| OpenMuse | `browsers` (kind) | `computers` (state) | view-only; no lease |
| OpenDots | `tasks` | `tasks` | `intervalSeconds`→`interval_seconds`; epoch→timestamptz |
| OpenMuse | `tasks` (kind) | `tasks` | `plan`/`evidence` jsonb; ISO strings→timestamptz |
| OpenDots | `runs` | `task_runs` | direct |
| OpenMuse | `runs` (kind) | `task_runs` | worker run record → `task_runs` |
| OpenMuse | `run-events` (kind) | `task_events` | kind→`kind` |
| OpenDots | `events` | `task_events` | `text`→`detail` |
| OpenMuse | `monitors` (kind) | `monitors` | direct |
| OpenMuse | `goals`, `ideas`, `agent-artifacts`, `activity`, `notifications` | same-named new tables | direct; `agent-artifacts`→`artifacts` (collides with `files`→`artifacts` below — one shared table) |
| OpenDots | `pages` | `pages` | `spaceId`→`space_id`; `dotId` never here (page_threads links) |
| OpenDots | `page_reviews`, `page_threads` | same | direct |
| OpenMuse | `files` (kind) | `artifacts` | merge with `agent-artifacts` |
| OpenMuse | `mail`, `events` (kind) | `mail_messages`, `calendar_events` | new tables; only if the mail/calendar surfaces are ported |
| ORBO | `users`/`sessions`/`accounts`/`verifications` | same | canonical |
| OpenMuse | `sessions` (kind) | `sessions` | owner string→`user_id`; hash/token semantics differ |
| ORBO | `credentials` | `credentials` | canonical vault |
| OpenDots | `mcp_connections` (token) | `credentials` + `mcp_servers` | **encrypt token into vault; server row holds pointer** |
| OpenMuse | `credentials`/`oauth` (kind) | `credentials` | secret→`encrypted_value` |
| OpenDots | `settings`, `setup_telemetry` | `settings` (keyed) | one-row → keyed |
| OpenMuse | `settings`, `system` (kind) | `settings` | scope by owner |
| OpenDots | `calls` | `voice_sessions` | `transcript` schema differs (text vs jsonb entries) — normalize |
| ORBO | `voice_sessions` | `voice_sessions` | canonical |

---

## 7. Migration approach

**Additive migrations, phased — no rewrite.**

1. **ORBO stays the spine.** Keep all 87 tables. OpenMuse/OpenDots tables do not exist in Postgres
   yet, so nothing is dropped or renamed. New unified tables (`spaces`, `threads`, `messages`,
   `tasks`, `task_runs`, `task_events`, `monitors`, `pages`, …) are added as empty tables.
2. **Superset columns** added as **nullable** on existing ORBO tables (e.g. `agents.instructions`,
   `agents.research_allowed`). Follow `server/src/db/schema/*.ts` + one Drizzle migration each, listed
   in `drizzle.config.ts`.
3. **Backfill, per feature port.** When a feature is ported (PLAN §8 phases 4–7), write a one-shot
   importer: OpenDots SQLite → fixture → REST/ETL, and OpenMuse `records` → `SELECT data FROM records
   WHERE kind=$1`. Importers carry the epoch-ms→timestamptz and bool-int→boolean conversions.
4. **OpenMuse compatibility shim (optional).** Until every OpenMuse screen is ported, the `records`
   table can stay and be queried via jsonb expressions (`data->>'status'`, already used in
   `apps/server/src/db.ts`) — add GIN indexes if kept.
5. **Security cut-over.** `mcp_connections.token` must be encrypted into `credentials` before any
   surface reads it; do not import plaintext tokens as-is.
6. **Acceptance.** One `pg_dump` restores the deployment (PLAN §10.B item 10); `bun run typecheck`
   green; no OpenDots SQLite tables remain in the running stack.

## 8. Risks / unknowns

| Risk | Detail | Mitigation |
| --- | --- | --- |
| **Plaintext secrets** | OpenDots stores MCP tokens inline (`connection-store.ts:14`) | Re-encrypt into `credentials` during import; never copy the column |
| **Timestamp model** | OpenDots epoch-ms INTEGER, OpenMuse ISO strings, ORBO timestamptz | One conversion in the importer; verify DST/UTC |
| **Conversation ambiguity** | `channels` vs `threads` vs `conversations`; Intelligence history lives outside the DB (`intelligence_channel_mappings`) | Decide whether `threads` mirrors Intelligence or introduces a parallel store — **needs owner decision** |
| **Single-owner assumption** | OpenDots `ownerId` and OpenMuse `owner` are strings; no users table | Map to a bootstrap ORBO user; multi-user semantics undefined |
| **JSONB query cost** | OpenMuse relies on `data->>'goalId'`/`status` scans | Add GIN indexes if `records` is retained; otherwise normalize on import |
| **Schema authority** | OpenMuse entities are TS interfaces, not DDL — no constraints to copy | Treat domain `.ts` as the field spec; re-validate on import (zod schemas exist in `packages/domain`) |
| **Unmapped OpenMuse kinds** | `conversation-settings`, `chat-browsers`, `browser-downloads`, `computer-state`, `computer-desktop-actions`, `monitor-pages`, `search-sessions`, `sample-pages` have no unified-table target yet | **Unknown:** decide drop vs import (recommend: drop sample-only + ephemeral browser/computer state; map `monitor-pages` with `monitors` if ported) |
| **Duplicate job machinery** | ORBO `routines`/`responsibilities`/`proactive`/`work_items` vs new `tasks` | Keep ORBO schedulers as producers that enqueue `tasks`; do not merge schedulers in step 1 |
| **`calls` vs `voice_sessions`** | transcript shape differs (free text vs `{entries[]}`) | Normalize OpenDots transcripts to entries on import |
| **Scope of mail/calendar** | OpenMuse `mail`/`events` are sample/live; PLAN parity may not require them | Defer `mail_messages`/`calendar_events` tables until the Finance/mail surfaces are committed |

## 9. Blockers requiring an owner decision

1. **`threads` vs `channels`** — is Intelligence's channel thread the unified thread, or does ORBO own a
   `threads` table in parallel? (drives `messages`, `page_threads`, `group_bot_threads`).
2. **Keep or retire `records`** — normalize OpenMuse fully, or keep the KV table as a compatibility
   layer for unported screens.
3. **`spaces` ownership** — OpenDots Spaces have no ORBO analogue; confirm Spaces survive into the
   unified IA (PLAN §8 phase 5 suggests yes).
4. **OpenMuse domain roll-up** — `goals`/`ideas`/`monitors`/`activity` tables are new; confirm they are
   in scope before creating them.
