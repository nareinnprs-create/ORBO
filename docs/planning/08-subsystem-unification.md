# 08 — Unified Subsystem Merge Plan (PLAN.md §3/§6 "one subsystem", phase 7)

Status: design. Phase 2 rebrand complete. Nothing here is implemented — this is the end-state for
phase 7 and the design under which phases 4–6 port surfaces.
Rule being satisfied (PLAN.md §3): *"Where the three overlap (computers, browser workers, memory,
approvals, threads, agent entity), ORBO ships **one** subsystem carrying the **superset** of
behavior."* Each section names the surviving ORBO module ("home"), the behaviors that must
survive from every source, the merge method, and the tests that prove the union.

Reused findings, not duplicated: `01-schema-unification.md` (tables/columns/mapping), `02-api-surface.md`
(route map, aliases, deletions), `03-route-tree.md` (surfaces), `05-mobile-web-parity.md`
(platform leaves), `06-test-strategy.md` (tiers, fixtures, ported suites). ORBO = OpenBot base.
`≡` = present in all three.

Method vocabulary: **absorb** = fold an upstream's behavior into the ORBO module in place;
**wrap** = call the upstream (or its third-party service) through an ORBO adapter without moving it;
**rewrite** = reimplement the upstream behavior in the ORBO module because no ORBO or upstream code
is reusable. One row per subsystem; checklists are the ship requirements.

**Layout note (Phase 3 audit, 2026-10-14):** chosen homes below use the PLAN §3 *target* layout
names (`apps/server`, `apps/browser`, `apps/computer`). The current tree uses top-level
`server/`, `worker/`, `agent-computer/` (verified — no `apps/` directory exists yet), so e.g.
§1's `agent-computer/` *is* the §3 `apps/computer` home and §2's `apps/browser` home has no
current-tree counterpart. `server/src/**` module paths are verified against the tree except
where noted.

---

## 1. Computers

**Sources**

| Upstream | Files |
| --- | --- |
| ORBO | `server/src/computer/{gateway,routes,policy,policy-store,policy-network,policy-dry-run,policy-listener,snapshot-store,page-frames,provider,supervisor,sandbox,client,target,schema,headless-tools,stream-path,deployment-routes}.ts`; `server/src/host-access/{broker,routes,schema,tools}.ts`; `server/src/agents/{computer-access,handoff,handoff-runner,handoff-delivery,handoff-signing,handoff-tool}.ts`; `server/src/db/schema/computer.ts`; `agent-computer/` |
| OpenDots | `_sources/OpenDots/src/server/{computer-store,computer-service,computer-routes,computer-tools}.ts`; `_sources/OpenDots/src/shared/computer-types.ts` |
| OpenMuse | `_sources/OpenMuse/apps/server/{computer,computer-backend,computer-routes,computer-tools,computer-e2b-desktop,browser-console}.ts`; `_sources/OpenMuse/packages/domain/src/computer.ts`; `_sources/OpenMuse/apps/computer/` |

**Behavioral superset checklist**
- ORBO (canonical, must not regress): resolve→policy→audit→act gateway where an unresolvable cited
  ref is refused, deny-beats-allow, fail-closed policy, generation/session staleness checks
  (`gateway.ts`); snapshot/frame persistence across replicas (`snapshot-store.ts`, `page-frames.ts`);
  navigate/snapshot/click/type/key/scroll/read/exec; file list/read/write/download with per-op policy
  intent; human takeover request/take/release/cancel; secret request/supply (value never stored);
  reset/stop/update; per-bot isolation, `/workspace` volume, gVisor option, loopback + token per
  container (`provider.ts`, `supervisor.ts`, `sandbox.ts`); host-access grants (`host-access/`).
- OpenDots: per-agent permission flags `{enabled,browser,files,shell}` (`computer-store.permissions`),
  per-action `begin/finish` audit with `actor:'owner'|'agent'` and bounded 1000-row retention
  (`computer-store.audit`), tool names `computer_<name>` with snapshot requirement (`computer-tools.ts`),
  persistent per-Dot computer start/stop/take/release.
- OpenMuse: view-only `BrowserSession {id,title,url,status,previewUrl}` + `/api/computer/desktop`
  screenshot/actions, E2B desktop backend, per-session serialized command queue, download import.

**Chosen home:** `server/src/computer/` (gateway + routes + policy + snapshots) with `agent-computer/`
as the per-agent image (PLAN.md §3 `apps/computer`).

**Merge approach: absorb.** Steps: (1) add nullable `research_allowed`/`memory_allowed`-style
permission columns already planned for agents, plus `computer_permissions` jsonb and `computer_audit`
(01 §5); (2) map OpenDots `computer_*` tool names onto the gateway's `intentOf` table so the same
policy rules apply; (3) wrap the OpenMuse E2B/provider backends behind `provider.ts` so no raw
`/api/computer/*` control route is ever mounted (02 risk #4); (4) port `computer_audit` into the
existing audit stream as `computer.action_*` rows (already the gateway's shape).

**Data/API touchpoints:** 01 §5 `computers`/`computer_audit`, mapping 01 §6; canonical `/api/computers`,
`/api/computers/:botId/*`, `/api/computers/policy`, `/api/host-access/*` with adapters for
OpenMuse `/api/computer/*` and OpenDots `/api/dots/:id/computer/*` (02 §5, §6).

**Test coverage:** `server/tests/computer-*.test.ts` + `computer-*.integration.test.ts`;
`agent-computer/tests/` (real Chromium, gated, 06 §6); superset cases for permissions + audit that
neither upstream had. Port `_sources/OpenDots/tests/computer.test.ts`, `computer-deployment.test.js`,
and reuse `_sources/OpenMuse/tests/helpers/computer.ts` (06 §2, §5).

**Risks:** ungoverned upstream browser routes must be deleted, not aliased (02 risk #4); Windows has no
gVisor (05 §5) — keep Linux-only isolation documented; snapshot generation semantics differ between
OpenMuse view model and ORBO generation counters (01 §8).

---

## 2. Browser / Research Worker

**Sources**

| Upstream | Files |
| --- | --- |
| ORBO | browser actions inside `server/src/computer/{gateway,routes}.ts`; Parallel/connectors via `server/src/plugins/mcp.ts`; research producers `server/src/proactive/{engine,routes,store,types}.ts`; queue `server/src/work/{queue,loop,culler}.ts` |
| OpenDots | `_sources/OpenDots/src/browser/{index,security,transport}.ts`; `_sources/OpenDots/src/server/{research,parallel,runner}.ts` |
| OpenMuse | `_sources/OpenMuse/apps/server/{browser,browser-console,search}.ts`; `_sources/OpenMuse/apps/worker/src/{browser,server,proxy,network,downloads,index}.ts` |

**Behavioral superset checklist**
- ORBO: every browser action passes the governed gateway; Parallel is a governed MCP/connector tool.
- OpenDots (isolated read-only service): dedicated Playwright worker, 24-char+ `BROWSER_SECRET`
  bearer auth with `timingSafeEqual`, body limit 16 KiB, JS disabled + service workers blocked +
  downloads off, request budget (50) and resource-type allowlist, 40s deadline, SSRF guard
  (`security.ts`: private/loopback/link-local/ULA blocked, only ports 80/443), `POST /browse` →
  `{url,title,text,screenshot}`, single-flight 429; research pipeline: mode `sample|live`, URL
  extraction from prompt (`requestedUrls`), Parallel MCP `web_search`+`web_fetch` with
  warnings/errors/discard reporting, max 5 sources, evidence-only brief, limitations appended.
- OpenMuse: worker health check + short cache, per-session serial queue, read/navigate/close/reopen,
  preview screenshot, download import into the Documents store, chat-browser association per thread.

**Chosen home:** `apps/browser/` (the Playwright + research worker, PLAN.md §3) + `server/src/proactive/`
for suggestion production. No first-class ORBO research module exists (02 §4 marks browsers a gap).

**Merge approach: wrap + rewrite.** Steps: (1) deploy `apps/browser` as the surviving worker, seeded
from OpenDots `src/browser/*` (hardened read-only fetch) — this is a **wrap** for the third-party
Parallel service; (2) **rewrite** the research orchestration (`research.ts`/`parallel.ts`) as a task
kind that enqueues `tasks` (01 §5) so results land in the unified run ledger; (3) route all
interactive browser actions through `computerGateway`; the OpenMuse worker becomes a provider adapter,
never a raw route (02 risk #4); (4) expose `/api/browsers` only as a governed read/preview resource.

**Data/API touchpoints:** 01 §5 `tasks`/`task_runs`/`task_events` for research runs; canonical
`/api/browsers` (new, from OpenMuse; 02 §5); Parallel stays a governed MCP server (`server/src/plugins`).

**Test coverage:** port `_sources/OpenDots/tests/{research,parallel,security,transport,computer-deployment}.test.ts`;
`_sources/OpenMuse/apps/worker/tests/{lifecycle,close-resilience,docker}.test.ts`; reuse
`_sources/OpenMuse/tests/helpers/{browser,search}.ts` (06 §2, §5). Smoke: research run through the
queue (06 §3).

**Risks:** the isolated browser's SSRF guard must not be bypassed by the interactive computer; two
Playwright stacks (worker fetch vs computer browser) must not both ship as user-facing control
(02 risk #4); Parallel is third-party (NOTICE) — no first-party substitute.

---

## 3. Memory

**Sources**

| Upstream | Files |
| --- | --- |
| ORBO | `server/src/memory/{store,routes,ingestion,tools,types}.ts`; `server/src/db/schema/memory.ts` (`memory_sources`, `personal_memories`) |
| OpenMuse | `_sources/OpenMuse/apps/server/src/engine/routes.ts:99-125` (`/api/agent/memories*`); `_sources/OpenMuse/packages/domain/src/agent.ts` (`AgentMemory`) |
| OpenDots | `_sources/OpenDots/src/server/store.ts:293-312` (`memories`, `saveMemory`, `deleteMemory`); `_sources/OpenDots/src/shared/types.ts` (`Memory`); `app.ts:209-235` |

**Behavioral superset checklist**
- ORBO (canonical): person-managed list/create/update/delete; bot-formed memories with SHA-256
  content dedupe *including deleted rows* (tombstone), `review_state` (`unreviewed|confirmed|edited`),
  `formed_by`/`formed_by_agent_id`/`source_ref`, source-scoped retrieval gated by `eligibleSourceIds`
  and `heldServerIds`; sync sources with `next_sync_at`, `claimSync` lease, `failSync` backoff,
  `completeSync` upsert that preserves edited/deleted rows; delete tombstones block re-import
  (`store.ts`).
- OpenMuse: `{text, source, createdAt}` memory CRUD + `forget`, compare-and-swap edit (409 on change),
  memories injected into research as preferences.
- OpenDots: free-text memory list/save/delete, `memoryAllowed` per Dot gates whether memories are
  passed into a run (`workspace.ts`, `runner.ts`).

**Chosen home:** `server/src/memory/` (`store.ts`, `routes.ts`, `ingestion.ts`, `tools.ts`, `types.ts`).

**Merge approach: absorb.** Steps: (1) import OpenDots `memories.text` → `personal_memories.content`
with `formed_by='person'`, `provenance='opendots'` (01 §6); (2) import OpenMuse `memories` kind the
same way with `provenance=source`; (3) keep ORBO's dedupe/tombstone/retrieval as the single behavior;
(4) honor `memory_allowed` per agent when assembling model context (fold into the agent superset
columns, 01 §5); (5) serve aliases for one release (02 §6).

**Data/API touchpoints:** 01 §5 `memories` (widen `personal_memories`), 01 §6 mapping; canonical
`/api/memory`, `/api/memory/:id`, `/api/memory/sources` with adapters for OpenMuse `/api/agent/memories`
and OpenDots `/api/memories` (02 §5, §6).

**Test coverage:** `server/tests/memory*.test.ts` + `memory-store.integration.test.ts` (06 §3);
ported cases from `_sources/OpenMuse/tests` memory coverage and `_sources/OpenDots/tests/store.test.ts`
(memory section). Prove dedupe-survives-delete and cross-bot retrieval scoping.

**Risks:** three different dedupe notions (ORBO digest vs OpenMuse/OpenDots none) — import must not
resurrect forgotten facts; OpenMuse memories are global (single owner) and ORBO scopes to
`owner_user_id` (01 §8); retrieval limits/budget differ (ORBO 40 rows).

---

## 4. Approvals

**Sources**

| Upstream | Files |
| --- | --- |
| ORBO | `server/src/approvals/{service,policy,store,routes,questions,question-resume,execute,native-context,types}.ts`; `server/src/db/schema/approvals.ts`; `server/src/plugins/shared-use*.ts`; gateway hook `server/src/computer/gateway.ts` |
| OpenMuse | `_sources/OpenMuse/apps/server/src/actions.ts` (`ActionService`); `app.ts:176-182` (`/api/actions`, `/decide`); `_sources/OpenMuse/packages/domain/src/index.ts` (`ActionProposal`, `proposalSchema`, `ActivityEntry`) |
| OpenDots | `_sources/OpenDots/src/server/connection-store.ts` (`mcp_approvals`, `mcp_actions`); `connection-routes.ts` (`connection-approvals`, `connection-actions`); `_sources/OpenDots/src/shared/connection-types.ts` |

**Behavioral superset checklist**
- ORBO (canonical): rule engine with deny/safety/auto-review, personal + team rules, preferences
  (`enabled`, `autoReview`, `hostCommands` capped by team), equivalence digest so a declined action is
  not re-asked until the person speaks, already-waiting suppression, hand-off (do-it-yourself),
  allow-once/allow-always/deny, consume-once resume, outcome-unknown handling, revocation, question
  resume, per-bot + team inbox, audit of every non-trivial decision (`service.ts`).
- OpenMuse: `ActionProposal` status machine `awaiting_review → executing → succeeded|failed|denied|
  expired|outcome_unknown`; 30-minute expiry; idempotency key → deterministic id; hash re-check
  (409 on change); Google-connection identity re-check before execution; activity receipt per
  transition (`actions.ts`).
- OpenDots: per-call approval bound to `{connectionId, tool, arguments}`; receipt keyed
  `(threadId, toolCallId)`; `claimAction` single-flight so a retry never executes twice; `running→done`
  with normalized result; fingerprint invalidates in-flight turns when access changes
  (`connection-store.ts`).

**Chosen home:** `server/src/approvals/` (rule engine + inbox + resume).

**Merge approach: absorb.** Steps: (1) widen `approval_requests` with `approval_kind ('tool'|'mcp'|
'action')`, `connector_ref`, `tool`, `arguments` (01 §5); (2) add `approval_receipts` from OpenDots
`mcp_actions` preserving the `(thread_id, tool_call_id)` key; (3) map OpenMuse states onto ORBO
`status`/`decision` (its `executing/outcome_unknown` are ORBO's consume-once + unknown-outcome path);
(4) map OpenDots connection approvals onto the rule engine so per-call approval is a rule, not a second
mechanism; (5) adapters for `/api/actions/:id/decide` and connection-approval reads (02 §6).

**Data/API touchpoints:** 01 §5 `approvals`/`approval_receipts`, 01 §6 mapping (OpenDots/OpenMuse rows);
canonical `/api/approvals`, `/api/approvals/:id/decision`, `/api/approvals/shared-use` (02 §5).

**Test coverage:** `server/tests/approvals-*.test.ts` + `audit-*.integration.test.ts` (06 §3); port
`_sources/OpenMuse/tests` action tests and `_sources/OpenDots/tests/connections.test.ts` approval paths;
prove single-execution and decline-persistence across all three sources.

**Risks:** OpenDots stores approval/action payloads as JSON text with epoch ms and plaintext-adjacent
data — normalize and never store secrets (01 §8); three status vocabularies must collapse without
losing `expired`/`outcome_unknown`; team-rule semantics are ORBO-only and must not be weakened.

---

## 5. Threads / Messages (Rich Threads)

**Sources**

| Upstream | Files |
| --- | --- |
| ORBO | `server/src/channels/{routes,thread-routes,thread-identity,thread-status,group,summary,attachments,attachment-mime,attachment-parts,events,socket,stall-guard,turn-watchdog,titler,text}.ts`; `server/src/db/schema/{core,group}.ts` (`channels`, `channel_memberships`, `channel_agents`, `intelligence_channel_mappings`, `group_messages`, `group_bot_threads`) |
| OpenMuse | `_sources/OpenMuse/apps/server/src/engine/{conversation,service}.ts`; `app.ts:190-234` (`/drafts`, `/main-thread`, `/conversation`); `_sources/OpenMuse/packages/domain/src/{agent,index}.ts` (`Conversation`) |
| OpenDots | `_sources/OpenDots/src/server/workspace.ts` (`thread_bindings`, `task_threads`, `captures`); `app.ts:137-157`; `_sources/OpenDots/src/shared/types.ts` (`Conversation`) |

**Behavioral superset checklist**
- ORBO (canonical): channels + memberships + group bots; per-channel AG-UI stream over WS
  (`/api/channels/events`), send/stop pill, retained drafts, attachment upload groups; thread minting
  and Intelligence liveness check (`POST /api/threads/mint`, `GET /api/threads/:threadId`);
  `intelligence_channel_mappings` binds `(user, channel, agent)` to a durable thread; summaries,
  titler, stall/turn watchdogs.
- OpenMuse (Rich Threads): durable conversations with rename/archive/restore/replay, main thread vs
  side chats, retained drafts, follow-up queue, inline cards, thread history from Intelligence.
- OpenDots: `thread_bindings` (Dot + owner + title), `task_threads` (task↔thread), `captures`
  (per-thread opaque value), continuation of Slack threads; call receipts anchor to a message.

**Chosen home:** `server/src/channels/` (with `thread-routes.ts`, `thread-identity.ts`).

**Merge approach: absorb.** Steps: (1) add a unified `threads` table while keeping ORBO `channels`
as the team surface (01 §5) — **owner decision required** (01 §9 blocker #1); (2) fold OpenDots
`thread_bindings` and OpenMuse `conversations` into it with `source`/`agent_id`/`owner_user_id`;
(3) move `task_threads` linkage onto the unified task; keep `captures` as a thread column; (4) keep
`group_messages` as canonical `messages`, adding `status='draft'` for OpenMuse drafts; (5) wrap
Intelligence for history/liveness (03 route tree: Chat).

**Data/API touchpoints:** 01 §5 `threads`/`messages`, 01 §6 mapping, 01 §9 blocker #1; canonical
`/api/channels`, `/api/channels/:id/messages`, `/api/threads`; adapters `PUT /api/conversation`,
`GET /api/main-thread` (02 §5, §6).

**Test coverage:** `server/tests/channel-*.test.ts`, `group-conversations*.test.ts` (06 §3); port
OpenDots `transcript.test.tsx`/`workspace.test.ts` and OpenMuse rich-thread tests; `app/tests/*thread*`
for rename/archive/restore/replay. Smoke: DIYA group conversation journey.

**Risks:** the conversation-identity ambiguity (`channels` vs `threads` vs Intelligence) is the single
biggest schema blocker (01 §8, §9); OpenMuse is single-owner and OpenDots `ownerId` is a string (01 §8);
renaming/archiving must not orphan page/routine/approval bindings that key on `thread_id`.

---

## 6. Routines / Tasks

**Sources**

| Upstream | Files |
| --- | --- |
| ORBO | `server/src/routines/{routes,runner,run-turn,schedule,store,sweep}.ts`; `server/src/responsibilities/*`; `server/src/proactive/*`; `server/src/work/{queue,loop,culler}.ts`; `server/src/db/schema/{coworker,lifecycle,responsibilities,proactive,work}.ts` |
| OpenMuse | `_sources/OpenMuse/apps/server/src/engine/{routes,service,worker}.ts` (tasks/control/input, goals, monitors, ideas); `_sources/OpenMuse/packages/domain/src/agent.ts` (`AgentTask`,`Goal`,`Monitor`,`Idea`,`RunEvent`); `worker-entry.ts` |
| OpenDots | `_sources/OpenDots/src/server/store.ts` (`tasks`,`runs`,`events`, claim/lease/invalidate); `runner.ts`; `app.ts:110-186`; `_sources/OpenDots/src/shared/types.ts` |

**Behavioral superset checklist**
- ORBO (canonical): cron routines with timezone + `next_run_at`, run rows, fatigue rule (10 consecutive
  failures auto-disables + notifies once), paused/finished/skipped/waiting outcomes, headless turn with
  no browser, lease-based `work_items` queue with attempts/`lease_until`, responsibilities with
  triggers (github/email/slack), proactive suggestions.
- OpenMuse: durable task plans with `plan[]`/`evidence[]`, pause/resume/cancel/retry, `input` requests
  (`answer` + `fields`), goals + milestones, monitors (`url`,`condition`,`intervalMinutes`,`nextCheckAt`),
  ideas (accept/dismiss), run event log, worker heartbeat.
- OpenDots: interval (seconds) scheduler, `nextRunAt`, SQLite lease (`leaseUntil`), interrupted-run
  handling on lease expiry and on settings change, per-task event log, repeat-after-success.

**Chosen home:** `server/src/routines/` (scheduler/API) with `server/src/work/` (leases/queue) and
`server/src/responsibilities/` + `server/src/proactive/` as higher-level producers.

**Merge approach: absorb + rewrite.** Steps: (1) add unified `tasks`/`task_runs`/`task_events` and
`monitors` (01 §5); (2) keep ORBO cron/routine/responsibility/proactive as *producers* that enqueue
unified tasks — do not merge schedulers in step 1 (01 §8); (3) rewrite OpenDots interval and OpenMuse
`nextRunAt` into the unified scheduler; goals→responsibilities, ideas→proactive suggestions (02 §5);
(4) map OpenDots leases onto `work_items`.

**Data/API touchpoints:** 01 §5 `tasks`/`task_runs`/`task_events`/`monitors`, 01 §6 mapping; canonical
`/api/routines`, `/api/responsibilities`, `/api/proactive`, `/api/notifications`; adapters OpenMuse
`/api/agent/tasks|goals|monitors|ideas` and OpenDots `/api/tasks` (02 §5, §6).

**Test coverage:** `server/tests/routine-*.test.ts`, `work-*.test.ts`, `responsibilit*.test.ts` (06 §3);
port OpenDots `runner.test.ts`/`store.test.ts` and reuse OpenMuse `tests/helpers/model.ts`; prove
fatigue, lease-expiry interruption, and next-run computation.

**Risks:** four schedulers in ORBO alone vs two new models — collapsing schedulers too early loses
fatigue/tz behavior (01 §8); epoch-ms vs ISO vs timestamptz conversion must be exact (01 §8); a unified
task must not orphan the routine/responsibility that produced it.

---

## 7. Documents (Spaces/Pages vs Documents/PDF)

**Sources**

| Upstream | Files |
| --- | --- |
| ORBO | **gap** — `documents`/`chunks` dropped (migrations 0010/0011, 01 §1/§4); bytes only via `server/src/channels/attachments.ts` |
| OpenDots | `_sources/OpenDots/src/server/{pages,page-service,page-tools,page-routes}.ts`; `_sources/OpenDots/src/shared/{page-review,scheduled-message,types}.ts`; `_sources/OpenDots/src/client/editor/{RichEditor,markdown,slash-commands,autosave,use-page-autosave,DocumentMenu}.tsx`; `PageDocument/PageConversation/PageOutline/PageReviewCard/SpaceLibrary/SpaceNav/SpaceWorkspace.tsx` |
| OpenMuse | `_sources/OpenMuse/apps/server/src/files.ts`; `_sources/OpenMuse/packages/integrations/src/pdf.ts`; `app.ts:241-267` (`/api/files`, `/fill`, `/mail/import-attachment`); `_sources/OpenMuse/packages/domain/src/index.ts` (`Artifact`) |

**Behavioral superset checklist**
- OpenDots (canonical for Spaces/Pages): spaces container; page CRUD with title ≤160 / content ≤100k;
  nested `parentId` with cycle rejection; `expectedRevision` optimistic concurrency (409 on change);
  revision increment + autosave; delete reparents children and keeps review receipts; review-before-save
  (`createReviewed`) idempotent by `(threadId,toolCallId)`; page↔thread binding with lease
  (`reserveThread`/`finishThread`/`releaseThread`); save a conversation into a Space with 100k cap;
  markdown + slash commands + undo/redo + visual editor.
- OpenMuse (canonical for Documents/PDF): PDF import (≤10 MiB, ≤500 pages, reject encrypted/XFA),
  inspect fields (text/checkbox/dropdown/radio), fill from values, strip actions/scripts, deterministic
  file id, signed content URL, email attachment → PDF → filled copy → reviewed reply → receipt;
  PDF view/paging/zoom/share (05 F13).

**Chosen home:** new `server/src/pages/` (no existing ORBO module — 02 §4 marks this a gap), reusing
`server/src/channels/attachments.ts` for bytes and the unified `threads` for page conversations.
(The ORBO IA already reserves **Spaces**, PLAN.md §3.)

**Merge approach: rewrite (port OpenDots) + absorb (OpenMuse PDF).** Steps: (1) port `pages.ts` +
`page-service.ts` + `page-routes.ts` to the unified `pages`/`page_reviews`/`page_threads` tables
(01 §5); (2) port the OpenMuse PDF pipeline into the same module and store `files` as `artifacts`
(01 §6); (3) unify editor: OpenDots visual editor + markdown is the single editor; (4) surface as
`/api/pages` and `/api/attachments` (02 §5). Phased per 06 §4: OpenDots pages land with Phase 5,
the OpenMuse PDF pipeline with Phase 6 — one subsystem, two port steps.

**Data/API touchpoints:** 01 §5 `pages`/`page_reviews`/`page_threads`, 01 §5 `spaces`; canonical
`/api/pages`, `/api/pages/:id`, `/api/pages/:id/conversation`; adapters OpenDots
`/api/spaces/:spaceId/pages` and OpenMuse `/api/files` (02 §5; 03 route tree Spaces).

**Test coverage:** port OpenDots `_sources/OpenDots/tests/{pages,page-service,page-routes,page-review,
page-review-card,page-context,page-snapshots,page-document-delete,autosave,markdown,library}.test.*`;
OpenMuse `tests/pdf.test.ts`; `app/tests/*-editor.test.tsx` (06 §3). Smoke: open the Spaces editor.

**Risks:** no ORBO page model exists — every behavior is a port, not a merge; `spaces` ownership is an
open decision (01 §9 blocker #3); revision/conflict semantics must survive the SQLite→Postgres move;
PDF is third-party (`pdf-lib`) and shares the `attachments` byte store, not a new one.

---

## 8. Connectors / Plugins

**Sources**

| Upstream | Files |
| --- | --- |
| ORBO | `server/src/plugins/{mcp,store,routes,tools,transport,oauth,access,account-mode,catalogue,broker,composio,composio-adapter,shared-accounts,shared-use,shared-use-store,shared-use-routes,google-drive-rest,exposure-change,selection,content-governance,share-target,logos,builtin-routines}.ts`; `server/src/db/schema/{plugins,shared-use}.ts`; `server/src/components/` |
| OpenDots | `_sources/OpenDots/src/server/{connection-store,connections,connection-routes,connection-tools}.ts`; `_sources/OpenDots/src/shared/connection-types.ts` |
| OpenMuse | `_sources/OpenMuse/packages/integrations/src/google.ts`; `_sources/OpenMuse/apps/server/src/{google-auth,workspace}.ts`; `app.ts:122,145,161,271-283` (`google/*`, calendars, mail, workspace) |

**Behavioral superset checklist**
- ORBO (canonical): governed MCP servers + per-agent allowlists + grants; cached tool lists with
  effect/destructive/version; Composio brokering + connection confirm/recheck; shared/brokered accounts;
  Google Drive; per-tool exposure changes; `/api/plugins/*`, `/api/components`, `/api/sandboxed`.
- OpenDots: MCP connection add/list/refresh/remove; per-tool `enabled`/`requiresApproval` defaults
  (read-only hint ⇒ no approval); deterministic exposed tool-name slugging unique across a Dot's
  connections; fingerprint-based invalidation; result truncation/normalization; OAuth-unauthorized
  messaging (`connections.ts`).
- OpenMuse: Google OAuth connect/disconnect, calendars/events, mail threads, Gmail drafts, workspace
  settings; credentials stored via integrations.

**Chosen home:** `server/src/plugins/` (`mcp.ts` + `routes.ts` + `store.ts` + Composio/Google).

**Merge approach: absorb + wrap.** Steps: (1) fold OpenDots `mcp_connections` into `mcp_servers` with
its token moved to the vault (see §9; never copy plaintext — 01 §8); (2) map per-tool
`requiresApproval`/`enabled` onto ORBO grants + approval rules (§4); (3) **wrap** the OpenMuse Google
integration as a governed connector/plugin, no new mail/calendar resources in v1 (02 risk #5);
(4) keep Composio as brokered connections; adapters for `/api/connections/:id` etc. (02 §6).

**Data/API touchpoints:** 01 §5 `credentials` + `mcp_servers`, 01 §6 mapping; canonical `/api/plugins`,
`/api/plugins/connections`, `/api/plugins/tools/:name` (02 §5).

**Test coverage:** `server/tests/plugin-*.test.ts`, `composio-*.test.ts` (06 §3); port OpenDots
`connections.test.ts`/`connection-card.test.tsx` and reuse OpenMuse `tests/helpers/*` (06 §2, §5);
prove per-tool approval defaults and tool-name stability.

**Risks:** "connections" is overloaded (OpenDots tool connection vs ORBO plugin) — one canonical
resource (02 risk #3); OpenDots tokens are plaintext (01 §8) — cut-over before any read; Google as a
plugin must not expose raw mail/calendar routes (02 risk #5).

---

## 9. Credentials

**Sources**

| Upstream | Files |
| --- | --- |
| ORBO | `server/src/db/schema/core.ts` (`credentials`, `accounts`); admin credential routes `server/src/app.ts:1046-1119`; `server/src/passwords/{store,service,resume,routes,types}.ts` (`saved_logins`, `sign_in_requests`); `server/src/plugins/{shared-accounts,oauth}.ts`; `server/src/computer/gateway.ts` (`signIn`,`secret`) |
| OpenMuse | `_sources/OpenMuse/packages/integrations/src/vault.ts` (AES-256-GCM versioned envelope); `apps/server/src/google-auth.ts` (`credentials`/`oauth` kinds) |
| OpenDots | `_sources/OpenDots/src/server/connection-store.ts` (`mcp_connections.token` — **plaintext column**) |

**Behavioral superset checklist**
- ORBO (canonical): write-only encrypted vault, key-id rotation, revoke, redaction, never into
  transcript; saved logins + sign-in request flow (submit/use-saved/take-over/finish/cancel); per-agent
  credential resolution; secrets never in audit (`gateway.ts` comments).
- OpenMuse: encrypted secret envelope `v1.nonce.tag.ciphertext` with AAD `openmuse:credential:v1`,
  32-byte base64 key validation, strict decrypt failure (`vault.ts`); per-owner credential/oauth state.
- OpenDots: bearer token held per connection, only the MCP transport reads it (`credentials(id)`);
  never returned in the connection view (`hasToken` only).

**Chosen home:** `server/src/admin/` (credential routes) + `server/src/db/schema/core.ts` (`credentials`)
+ `server/src/passwords/` (saved logins / sign-in requests).

**Merge approach: absorb (algorithm) + rewrite (import).** Steps: (1) keep ORBO vault as canonical;
(2) **rewrite** the OpenDots import so `mcp_connections.token` is encrypted into `credentials` and the
server row holds a pointer (01 §5, §7 step 5) — the plaintext column is never copied; (3) **absorb**
OpenMuse `credentials`/`oauth` rows as `encrypted_value` (its envelope may be preserved or re-encrypted
under ORBO's key); (4) unify secret-withholding in the transcript.

**Data/API touchpoints:** 01 §5 `credentials` (+ `mcp_servers` pointer), 01 §6 mapping, 01 §7
security cut-over; `GET/POST /api/admin/credentials`, `/:id/rotate`, `/:id/revoke` (02 §1);
`/api/passwords`, `/api/sign-in-requests` (02 §5).

**Test coverage:** `server/tests/credential-*.test.ts` (rotation leak already exists,
`credential-rotation-leak.integration.test.ts`), `passwords-*.test.ts`, `sign-in-*.test.ts`; port
OpenMuse vault tests; assert no plaintext token reaches storage or logs.

**Risks:** the highest-severity merge risk is importing OpenDots plaintext tokens; OpenMuse key
format (base64 32-byte) must map to ORBO `key_id`; secrets must never enter `approval_receipts` or the
unified `messages`.

---

## 10. Learning (memory / learning)

**Sources**

| Upstream | Files |
| --- | --- |
| ORBO | `server/src/learning/{runtime,settings,routes,remote}.ts`; `server/src/demonstrations/{draft,recording,store,schedule,routes,types}.ts`; `shared/learning`; `server/src/db/schema/{learning,demonstrations}.ts` |
| OpenDots | `_sources/OpenDots/src/server/learning.ts` (`learningSelector`); `_sources/OpenDots/src/shared/learning.ts` (`learningContainerIdSchema`, `validateLearningSettings`); `workspace.ts` (`dots.learningContainerId`, `skillDeliveryEnabled`, `thread_bindings.learningContainerId`) |
| OpenMuse | none (single persona `agent-settings` only) — no learning subsystem to merge |

**Behavioral superset checklist**
- ORBO (canonical): per-agent learning targets + default target (`selectLearningTarget`); SkillRegistry
  snapshots with revision/freshness/stale status; learned-skill tools (`copilotkit_load_skill`,
  `copilotkit_read_skill_file`); thread→container binding before creation with verified user;
  delivery status; demonstrations → skill draft with required-tool derivation, sensitive-field
  hand-off, and reviewed publication (`draft.ts`, `learning/runtime.ts`).
- OpenDots: per-Dot `learningContainerId` (1–64 lowercase/hyphen slug) and `skillDeliveryEnabled`;
  validation that delivery requires a container; container inherited from the Dot onto a thread;
  selector refuses learning for non-owner / non-configured Slack Dot; thread binding created on first
  channel message.

**Chosen home:** `server/src/learning/` (`runtime.ts` + `settings.ts` + routes), with
`server/src/demonstrations/` as the recording→skill producer.

**Merge approach: absorb.** Steps: (1) map OpenDots `dots.learningContainerId`/`skillDeliveryEnabled`
onto the agent superset columns (`agents.learning_container_id`, `agents.skill_delivery_enabled`,
01 §5) and `thread_bindings.learningContainerId` onto the unified thread; (2) keep ORBO's
`LearningSettings.agents` map + default target as the single resolution path; (3) honor OpenDots'
slug validation on save; (4) keep `demonstrations` as the ORBO-native producer (OpenDots has no
recording→skill path).

**Data/API touchpoints:** 01 §5 `agents` superset columns + `learning_thread_bindings` (01 §1.10);
canonical `GET/PUT /api/admin/learning/{settings,overview,status/:id}` (02 §1); thread-container
binding rides the unified `threads`.

**Test coverage:** `server/tests/learning-*.test.ts`, `demonstrations-*.test.ts`, plus
`tests/learning_harness_contract.py` (06 §1); port OpenDots `tests/{learning,learning-delivery}.test.ts`
and reuse `_sources/OpenDots/tests/fixtures/learning-skills.zip` (06 §2, §5).

**Risks:** OpenDots learning is per-Dot while ORBO is per-agent-target (per-person) — resolution order
must be defined once; Skills/intelligence containers are third-party (NOTICE); a thread's container is
bound once and never backfilled (`runtime.ts`) — imported OpenDots threads must set it explicitly.

---

## Dependency-ordered merge sequence

Merge order is driven by what keys on what: **threads** is the identity every conversation-bound
feature attaches to; **credentials** is the vault connectors and computers read; **approvals** is the
gate computers, connectors and routines pass through; **memory** and **documents** depend on agents +
threads; **learning** depends on memory + threads.

| # | Subsystem | Must come after | Because |
| --- | --- | --- | --- |
| 1 | Threads / Messages | — | Approvals (continuation), documents (page_threads), routines (channel/thread), memory retrieval all key on `thread_id`. |
| 2 | Credentials | 1 | Connectors (§8) and computers (§1 sign-in/secret) read tokens from the vault; OpenDots plaintext cut-over must precede any connector read. |
| 3 | Approvals | 1, 2 | The gateway for computers, connectors and routines; needs threads for continuation and the vault for identity re-checks. |
| 4 | Connectors / Plugins | 2, 3 | Consume vault credentials and the per-call approval rule; produce the MCP tool surface computers act through. |
| 5 | Memory | 2, 4 | Sources are connector tools (`memory_sources.tool_ref`); agent-scoped retrieval feeds threads. |
| 6 | Computers | 3, 4 | Uses the approval gate, vault secrets, and the connector tool surface; per-agent permissions/audit absorb. |
| 7 | Routines / Tasks | 1, 3, 6 | Unified tasks are enqueued by schedulers; headless turns go through approvals and can drive computers. |
| 8 | Browser / Research Worker | 4, 6, 7 | Research is a task kind run through the governed browser; Parallel is a connector. |
| 9 | Documents | 1, 6 | Pages bind to threads and store bytes via attachments; PDF fill can use computer file transfer. |
| 10 | Learning | 1, 5 | Per-thread containers depend on unified threads; learning consumes memory/evidence and skills. |

**Blockers / biggest risks.** (1) The `threads` vs `channels` vs Intelligence decision (01 §9 blocker
#1) — it gates items 1, 5, 6, 7, 9. (2) OpenDots plaintext MCP tokens (01 §8) — the security cut-over
in item 2. (3) No ORBO page/document model exists; Documents is a full port (02 §4, 01 §9 blocker #3).
(4) Ungoverned upstream browser/computer routes must be deleted, never aliased (02 risk #4). (5)
Foreign runtime conversions (SQLite epoch-ms, OpenMuse KV `records`, single-owner strings) touch every
importer (01 §7, §8). (6) Ported OpenDots tests use `vi.mock`, which leaks under Bun's single-process
run (06 gap #4) — every ported file converts to restorable `spyOn`. (7) Finance behaviors
(PLAN §6 CSV import, categorized summary, savings-goal action) have no dedicated merge section
in this doc and no screen home (07 §2.9, pending C24) — assumed tracked under §7 Documents
pipeline + agent producers; needs owner confirmation before Phase 6.

---

© Opraiz Technology Pvt Ltd · Developer: Narein Rao
