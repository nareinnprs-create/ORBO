# 19 — Phase 5 Dots→Agents Fold Mapping (research only)

Context: PLAN.md §8.5 folds OpenDots "Dots" into ORBO "Agents", which already
absorb OpenBot "Bots" per `docs/planning/14-phase4-bots-rename-scope.md`.
Read first: `10-phase4-agents-inventory.md` (Agents surface),
`01-schema-unification.md` §4 (agents overlap row). No product code changed.
Verified on disk 2026-10-14. Exact paths below; `_sources/OpenDots` = upstream.

---

## 1) Dots model inventory (10 fields + per-dot capabilities)

Source of truth: `_sources/OpenDots/src/shared/types.ts:78-90` (`Dot`),
`src/server/workspace.ts:23-30,50-53` (DDL + ALTERs), `src/server/workspace-routes.ts:11-22,69-136` (zod + routes).

| # | Field | Type / constraint | Notes |
|---|---|---|---|
| D1 | `id` | TEXT PK, `randomUUID()` | Created in `workspace.ts:133`; never reused |
| D2 | `spaceId` | TEXT NOT NULL | Default destination for saved pages, **not** ownership (`types.ts:81`) |
| D3 | `spaceIds` | via `dot_spaces(dotId,spaceId)` PK | ACL migrated once from `dots.spaceId` (`workspace.ts:49-53`); sorted, deduped (`:135`) |
| D4 | `name` | TEXT, zod 1–40 chars | `workspace-routes.ts:13` |
| D5 | `instructions` | TEXT, zod 3–2000 chars | Standing prompt; `workspace-routes.ts:14` |
| D6 | `researchAllowed` | INTEGER 0/1 ↔ boolean | Explicit tool permission; create requires it (`:76-80`) |
| D7 | `memoryAllowed` | INTEGER 0/1 ↔ boolean | Same gate as D6 |
| D8 | `createdAt` | INTEGER epoch-ms | `ORDER BY createdAt` roster (`workspace.ts:102`) |
| D9 | `learningContainerId` | TEXT NULL (ALTER-added) | Lowercase-hyphen id ≤64; `shared/learning.ts:3-10` |
| D10 | `skillDeliveryEnabled` | INTEGER NOT NULL DEFAULT 0 (ALTER-added) | Requires D9 non-null (`learning.ts:20-21`) |

Per-dot capabilities (not columns on `dots`):

| Cap | Store / route | Shape |
|---|---|---|
| Computer perms | `computer-store.ts:9` `computer_permissions(dotId PK, value JSON)`; `PATCH /dots/:id/computer/permissions` | `{enabled,browser,files,shell}` (`shared/computer-types.ts:2-10`); default all-false (`computer-store.ts:18`) |
| Computer audit | `computer_audit(id,dotId,action,actor,outcome,createdAt)`; cap 1000 pending-excluded, read 50 (`computer-store.ts:39-49`) | actor `owner\|agent`; outcome `pending\|succeeded\|failed` |
| MCP connections | `mcp_connections(id,dotId,name,url,token PLAINTEXT,tools JSON,error,createdAt,updatedAt)` (`connection-store.ts:14`) | Per-dot URL+token; `hasToken` derived, token never leaves server (`:43-48`) |
| MCP approvals | `mcp_approvals(id,threadId,dotId,connectionId,tool,arguments)` + `mcp_actions(threadId,toolCallId,…,approvalId)` (`:15-16,24`) | Gated-call approve-once (`claimAction` `:158-171`); TTL 1h (`connection-types.ts:37`) |
| Threads | `thread_bindings(id,dotId,ownerId,title,createdAt,learningContainerId*)` | Frozen container copy at bind (`workspace.ts:250`); `task_threads(taskId PK,threadId)` links tasks |
| Voice/capture | `calls(…,transcript,anchorMessageId*)`, `captures(threadId PK,value JSON)` | Per-thread, reach via dot's thread |
| Lifecycle | **Global only**: one-row `settings {name,paused,researchAllowed,memoryAllowed}` (`types.ts:9-14`); `PUT` none per-dot | "Pause all Dots" (`client/App.tsx:554`); **no per-dot pause, no DELETE /dots** (routes are `POST /dots`, `PUT /dots/:id` only) |

Dots UI: `src/client/WorkspaceDialog.tsx` (create/edit specialist + `ConnectionsSection`), `App.tsx:406` (`nav.dots-nav`), `PageConversation.tsx:122` ("Create specialist"), `ThreadList.tsx`, `Chat.tsx:221`, `ComputerPanel.tsx`, `ConnectionsSection.tsx`.

Dots route inventory (`workspace-routes.ts`, `computer-routes.ts`, `connection-routes.ts`):

| Method + path | Handler | Purpose |
|---|---|---|
| `GET /workspace` | `workspace-routes.ts:42` | Whole state: `{spaces,dots,conversations,setup,calls}` |
| `POST /spaces` | `:51` | Create space (name ≤60, desc ≤500) |
| `POST /dots` | `:69` | Create dot (`spaceId` required + D4–D10) → 201 |
| `PUT /dots/:id` | `:111` | Full-settings update (all of D4–D10 optional except base) |
| `POST /conversations` | `:137` | Bind thread to dot (`dotId,title`) |
| `GET /dots/:id/computer` | `computer-routes.ts:18` | Status + perms + audit + control holder |
| `PATCH /dots/:id/computer/permissions` | `:21` | Partial `{enabled,browser,files,shell}` patch |
| `POST /dots/:id/computer/{start,stop,take,release,actions}` | `:24-36` | Container lifecycle + takeover + governed action (`actor='owner'`) |
| `GET\|POST /dots/:id/connections` | `connection-routes.ts:35-38` | List / add MCP connection (name+url+optional token) |

Lifecycle comparison:

| Aspect | Dots | Agents |
|---|---|---|
| Create | `POST /dots` (any authed owner; setup-gate only on conversations `:147-151`) | `POST /api/agents` (endpoint/auth validated; `bot.created` audit) |
| Update | `PUT /dots/:id` whole-settings replace | `PATCH /api/agents/:id` whole-profile + `sharedApps` exposure check |
| Duplicate | none | `POST :id/duplicate` (`bot.duplicated` on the copy) |
| Hide/pin | none (ordering is `ORDER BY createdAt`) | per-person `agent_preferences` (`hide/unhide`, `pin/unpin`) |
| Pause | global `settings.paused` only | per-person `bot_lifecycle.pausedAt` + notify + routing |
| Delete | **none — no route, no `deleteDot`** (grep `deleteDot\|DELETE.*dots` = 0 hits) | soft-delete `deletedAt` (`DELETE /api/agents/:id` → 204) |
| Audit | `computer_audit` per-dot only | `audit_events` (`bot.created/updated/deleted/hidden/…`) + computer frame refs |

---

## 2) Agents model inventory (3 tables + satellites)

Source: `server/src/db/schema/core.ts:271-282` (`agents`), `server/src/db/schema/coworker.ts:29-81` (profiles/prefs), `server/src/agents/profile-types.ts`, `server/src/agents/routes.ts`, `server/src/db/schema/lifecycle.ts`, `computer.ts`, `team-bots.ts`.

| Layer | Fields |
|---|---|
| `agents` | `id` PK, `name`, `type` enum (`built_in\|remote_ag_ui\|remote_mastra`), `configuration` jsonb (`{endpoint,auth:{credentialId},systemPrompt,remoteAgentId}` — see `profile-store.ts:205-235`), `packageId`, `override` |
| `agent_profiles` | `agentId` PK, `ownerUserId` (nullable, set-null), `title`, `roleDescription` (≤2000), `avatarSeed`, `visibility` enum (`public\|private`), `callbackTokenHash` + `callbackTokenIssuedAt` (hash-only), `deletedAt` (soft-delete) |
| `agent_preferences` | `(userId,agentId)` PK, `hiddenAt`, `pinnedAt` (per-person display, not grants) |
| Lifecycle (per-person) | `bot_lifecycle(ownerUserId,agentId,pausedAt,notify)` + `update_routing_preferences(kind,transports[])` (`lifecycle.ts`); routes `GET /api/bots/attention`, `POST :id/pause|resume`, `PUT :id/notifications`, `GET|POST :id/reset`, `GET :id/activity` (`lifecycle-routes.ts`) |
| Team publishing | `team_bot_{publications,audience,assignments,consents,consent_defaults}` (`team-bots.ts`); `PUT|DELETE /api/team-bots/:botId/publication`, assignments, consents |
| Grants | `plugin_grants(kind,ref,agentId)` PK, handoff (`GET /api/agents/:id/handoff` → `{enabled,canGrant,reachable,grantable}`), `shared_use_*` exposure check on publish (`routes.ts:570-579`) |
| Computer | **No per-agent row.** `computer_snapshot(computerId PK,…)` + `computer_page_frame(computerId,toolCallId)` are ephemeral state; `action_policy` is deployment-global. Access rule: owner/admin/public-only (`computer-access.ts:13-23`) |
| Identity/lifecycle routes | `POST /api/agents` (validates endpoint/auth, `bot.created`), `PATCH`, `POST :id/duplicate`, `hide|unhide`, `pin|unpin`, `POST|DELETE :id/callback-token`, `DELETE` soft (`routes.ts:319-756`); form `app/src/lib/agents/form.ts` (`name≤80,title≤120,roleDescription≤2000,visibility,endpoint,authValue` write-only) |
| UI | 10 routes `app/src/routes/_authed/_app/bots.*` (roster + 8 subpages + direct chat `bot.tsx`), components `app/src/components/{bots,bot-profile,agents}/`, data `app/src/lib/{agents/*,bot-lifecycle/*,team-bots.ts}` (see doc 10 §1–§4) |

Field count: Agents identity = 6 (`agents`) + 8 (`agent_profiles`) + 2 (`agent_preferences`) = **16 columns** + 4 satellite groups (lifecycle, team-bots×5, grants, computer-ephemeral).

---

## 3) Field-by-field fold mapping (Dots → Agents)

| Dots field | Agents target | Verdict | Transform |
|---|---|---|---|
| `id` | `agents.id` / `agent_profiles.agentId` | **map** | Keep UUID string; `dot_spaces`→ new `agent_spaces(agent_id,space_id)` join (01 §5); single-owner `ownerId`→ bootstrap `users.id` |
| `spaceId` (default page dest) | new `agents.default_space_id` NULLABLE FK → `spaces` | **transform** | Scalar→FK; must be member of `spaceIds` (keep `validateSpaceAccess` rule, `workspace.ts:175-181`) |
| `spaceIds[]` | new `agent_spaces` join | **transform** | `INSERT INTO dot_spaces SELECT id,spaceId` rows move verbatim; default = `spaceId` |
| `name` (1–40) | `agents.name` (≤80) | **map** | Widen only; `parseAgentInput` bound stays 80 (`routes.ts:55-60`) |
| `instructions` (3–2000) | `agent_profiles.roleDescription` (1–2000) | **transform** | No truncation: both cap 2000; `built_in` also mirrors into `configuration.systemPrompt` (`profile-store.ts:490`) |
| `researchAllowed` | new `agents.research_allowed` NULLABLE bool | **transform** | INTEGER 0/1→boolean; NULL = unset (ORBO has no equivalent; 01 §5 proposes same) |
| `memoryAllowed` | new `agents.memory_allowed` NULLABLE bool | **transform** | Same as above; memory enforcement stays in Memory subsystem, flag only gates |
| `createdAt` (epoch-ms) | `agents.created_at` timestamptz | **transform** | `to_timestamp(ms/1000)` in importer; roster keeps `ORDER BY createdAt` |
| `learningContainerId` | new `agents.learning_container_id` NULL + `threads.learning_container_id` | **transform** | Keep `validateLearningSettings` (`shared/learning.ts:12-21`); freeze-onto-thread at bind (`workspace.ts:250`) preserved |
| `skillDeliveryEnabled` | new `agents.skill_delivery_enabled` NOT NULL DEFAULT false | **transform** | INTEGER→boolean; requires container (same validator) |
| `computer_permissions` JSON | new `computers(agent_id PK, permissions jsonb)` | **transform** | `{enabled,browser,files,shell}` verbatim; default all-false; ORBO `action_policy` stays global — per-agent JSON is additive, not a replacement |
| `computer_audit` | new `computer_audit(agent_id,actor,action,outcome)` | **map** | epoch→timestamptz; keep 1000-row trim + 50-row read (`computer-store.ts:39-49`) |
| `mcp_connections` (per-dot URL+token) | `mcp_servers` row + `credentials` vault row + `mcp_user_credentials` pointer | **transform (security)** | **Encrypt `token` into `credentials` (kind=`mcp`); never import plaintext** (01 §7.5); `hasToken` stays derived |
| `mcp_approvals` / `mcp_actions` | widen `approval_requests` (`approval_kind='mcp'`, `connector_ref,tool,arguments`) + new `approval_receipts(thread_id,tool_call_id,approval_id)` | **transform** | Claim-once (`claimAction`) + 1h TTL preserved; ORBO rule engine unchanged |
| `thread_bindings` | new `threads(thread_id,agent_id,owner_user_id,title,learning_container_id)` | **transform** | `dotId`→`agent_id`; owner string→`users.id`; ORBO `channels` stay the team surface (01 §8 blocker 1) |
| `task_threads` | `threads.task_id` / `task_runs` FK | **transform** | Link moves onto task row per 01 §6 |
| `calls` / `captures` | `voice_sessions` / thread capture | **transform** | Normalize free-text transcript → `{entries[]}` (01 §7) |
| global `settings.paused` | `bot_lifecycle.pausedAt` per person | **drop (superseded)** | ORBO per-person pause is strictly richer; seed paused→ all `bot_lifecycle` rows only if set |
| Dots UI copy ("Dots", "specialist") | Agents copy ("Agents") | **drop** | Rename per §5; keep redirects |

---

## 4) Conflicts with the Bots→Agents fold (doc 14)

| # | Conflict | Why it collides | Resolution |
|---|---|---|---|
| C1 | **Naming three-ways**: UI says `Bot(s)` (860+167 hits, 14 §1 rows 10–11), routes say `/bots`, Dots UI says `Dots`/`specialist` | Fold order in 14 §3 is UI→routes→API→data; adding a third vocabulary mid-rename re-churns snapshots | Finish Bot→Agent UI copy first; Dots copy maps straight to final `Agent(s)`, never to interim `Bot` |
| C2 | **ID namespaces**: fixtures `bot-1` (355/42, 14 row 12) vs Dot `randomUUID()` vs agent `id` text PK | Importer collision if a Dot UUID equals a Bot id; tests pin `bot-1` hrefs | Import Dots with `dot-<uuid>` prefix or UUIDv7 remap table; keep `bot-1` fixtures untouched |
| C3 | **Computer bindings**: Bots→Agents assumes one shared computer per Bot with owner/admin/public access (`computer-access.ts`); Dots bind **perms+tokens per dot** (`computer_permissions` + `mcp_connections.token`) | Merging into "one computer subsystem" (PLAN §6) while keeping per-agent tokens splits the vault model | Per-agent `permissions` JSON additive; tokens always via vault (`credentials` kind=`mcp`); access rule stays `computer-access.ts` (owner/admin/public) — Dots gain multi-user scoping they never had |
| C4 | **Lifecycle granularity**: `bot_lifecycle` is per-(person,agent); Dots pause is global one-row `settings` | Naive seed writes one global paused flag into N personal rows or drops it | Seed only when global paused=true (write one row per user); unpaused = no rows (default) |
| C5 | **No Dot delete vs Bot soft-delete**: OpenDots has no `DELETE /dots`; ORBO `DELETE /api/agents/:id` soft-deletes (`deletedAt`) | Fold must not invent hard-delete for imported Dots | Imported Dots get `deletedAt=NULL`; no backfill of delete; document that Dots were previously undeletable |
| C6 | **Envelope/API shape**: `/api/bots` envelope `{bots:[…]}` frozen (14 §3.3); Dots API is `GET /workspace → {spaces,dots,conversations}` (`workspace-routes.ts:42-50`) | Two frozen shapes feeding one Agents roster | New `GET /api/agents` stays canonical; importer is ETL (SQLite→Postgres), not a live proxy — no Dots API compat mount |
| C7 | **Config non-goals**: `BOT_*` env, `bots` spec key, `COMPUTER_BOT_ID` frozen (14 §4) | Dot fields (`researchAllowed`, computer perms) tempt new `DOT_*` env/config keys | No new env keys; all Dot flags are data columns, not config |

---

## 5) Unified Agents model proposal + migration sketch

**Proposal** (superset of 01 §5 row 1): keep `agents` + `agent_profiles` +
`agent_preferences` canonical; add NULLABLE `agents.research_allowed`,
`agents.memory_allowed`, `agents.learning_container_id`,
`agents.skill_delivery_enabled`, `agents.default_space_id` FK; new
`spaces`, `agent_spaces(agent_id,space_id)`, `computers(agent_id PK,
permissions jsonb)`, `computer_audit`; ETL Dots→these; Dots routes/UI retired.

**Data** (one Drizzle migration + importer):
1. `ALTER TABLE agents ADD COLUMN research_allowed boolean, memory_allowed boolean, learning_container_id text, skill_delivery_enabled boolean NOT NULL DEFAULT false, default_space_id text REFERENCES spaces(id)`; `CREATE TABLE spaces/agent_spaces/computers/computer_audit` (list in `server/drizzle.config.ts`).
2. Importer `scripts/import-dots.ts` (one-shot): read SQLite `dots`+`dot_spaces`+`computer_permissions` (+`mcp_connections`→vault encrypt, `thread_bindings`→`threads`); epoch-ms→timestamptz, int→bool, `spaceId∈spaceIds` check, `validateLearningSettings`; `instructions>2000` → truncate+flag file for owner review (see §6 R3).
3. `type` mapping: every imported Dot → `agents.type='built_in'`, `configuration={systemPrompt: instructions}` (mirrors `profile-store.ts:490`); `agent_profiles.visibility='private'`, `ownerUserId`=bootstrap user.

**Routes** (server, additive then retire):
1. Keep `GET|POST /api/agents`, `PATCH /:id`, `duplicate/hide/pin/callback-token` unchanged (`server/src/agents/routes.ts`).
2. Add `GET|PATCH /api/agents/:id/dot-settings` (research/memory/learning/spaceIds) during port so Dots UI has a target; fold into `PATCH /:id` once Expo screen lands; never mount `/dots/*` compat (unlike `/bots` dual-mount — C6).
3. `PUT /api/team-bots/*` untouched; imported Dots start private (no publication rows).

**UI copy** (per 14 §3 step 1, Agents wording final):
- `WorkspaceDialog.tsx` "Meet your next specialist" → `create-agent-dialog.tsx` wizard step; "Create specialist" (`PageConversation.tsx:122`) → "New agent"; `nav.dots-nav` "Dots" (`App.tsx:406,534`) → "Agents"; per-dot computer/connection sections → Agents profile `setup`/`access` subpages (`bots.$agentId.{setup,access}.tsx`).
- Keep `/bots…` redirects (`legacy-routes.ts`) through Phase 5; Dots web app deleted with the Vite app per PLAN §3 rules.

---

## 6) Risks

| # | Risk | Detail | Mitigation |
|---|---|---|---|
| R1 | Plaintext tokens | `mcp_connections.token` in clear (`connection-store.ts:14`) | Encrypt→`credentials` before any surface reads it; audit importer output |
| R2 | Single-owner → multi-user | `ownerId` string, no users table; ORBO rows are per-person | Map to bootstrap user; Dots start `private`; computer access = owner-only until shared |
| R3 | Instructions truncation | 2000 vs `roleDescription` 2000 (bounds match) | No truncation needed; keep the guard — do not silently cut |
| R4 | Timestamp/bool conversion | epoch-ms INTEGER, int-bool vs timestamptz/boolean | One importer conversion; spot-check DST/UTC + `ORDER BY createdAt` parity |
| R5 | Threads vs channels | `thread_bindings` vs `channels`+`intelligence_channel_mappings` (01 §8.1) | Import to `threads`; channels stay team surface; needs owner sign-off before chat port |
| R6 | Snapshot churn | Dots copy touches the same roster/profile snapshots mid Bot→Agent rename (C1) | Sequence: Bot UI copy lands first; Dots strings map directly to final copy in one PR |
| R7 | Scope creep (pages/voice) | `spaces/pages`, `calls/captures` ride along with Dots but belong to Spaces/Work phases | Import spaces+threads only; pages/voice migrate with their own phases (PLAN §8.5–8.7) |

---

© Opraiz Technology Pvt Ltd · Developer: Narein Rao
