# 21 — Phase 5 OpenDots Backend Inventory (server/store → ORBO homes)

Status: research only. No product code modified. All OpenDots paths under
`_sources/OpenDots/src/`; all ORBO homes under `server/src/`.
Merge method vocabulary per `08-subsystem-unification.md`: **absorb** (fold in
place), **wrap** (adapter over third-party/upstream), **rewrite** (reimplement),
**drop** (do not port). Data docs: `01-schema-unification.md` (§N),
API docs: `02-api-surface.md` (§N), tests: `06-test-strategy.md` (§N).

## 1. Module inventory (file → purpose → ORBO home → verdict)

| # | OpenDots file | Purpose (verified) | ORBO home | Verdict |
| --- | --- | --- | --- | --- |
| 1 | `src/server/computer-store.ts` (51 lines) | `computer_permissions` (per-Dot `{enabled,browser,files,shell}`) + `computer_audit` begin/finish, 1000-row retention, last-50 read | `server/src/computer/` (gateway + policy) + `computer_audit` table (01 §5) | **absorb** |
| 2 | `src/server/computer-service.ts` (369 lines) | Supervisor gateway: HMAC per-Dot token, `ensure/stop`, control take/release, audited action dispatch, 4 MB cap + secret redaction, endpoint identity check | `server/src/computer/{gateway,provider,supervisor}.ts` | **absorb** (policy/audit shape) + **rewrite** (HMAC/supervisor wiring) |
| 3 | `src/server/computer-routes.ts` (52 lines) | `GET /dots/:id/computer`, `PATCH …/permissions`, `POST …/{start,stop,take,release,actions}` | `server/src/computer/routes.ts` (`/api/computers/:botId/*`, 02 §5) | **absorb** as adapter, then delete (02 §6) |
| 4 | `src/server/computer-tools.ts` (29 lines) | `computer_<name>` agent tools (all `computerInputs` except `human_*`), snapshot-first prompt | `server/src/computer/gateway.ts` `intentOf` + `headless-tools.ts` | **absorb** |
| 5 | `src/server/connection-store.ts` (185 lines) | `mcp_connections` (**plaintext `token`**), `mcp_approvals` (thread+dot+conn+tool+args), `mcp_actions` claim-once receipt `(threadId,toolCallId)` + `approvalId`, fingerprint/tick | `server/src/plugins/` + `credentials` vault + `approval_receipts` (01 §5, §6) | **rewrite** (token→vault, never copy) + **absorb** (claim/fingerprint) |
| 6 | `src/server/connections.ts` (303 lines) | MCP add/discover/refresh, per-tool `{enabled,requiresApproval}` (readOnlyHint default), deterministic `conn__tool` slugging, 20k-char result normalize/truncate, 401/403 OAuth messaging | `server/src/plugins/{mcp,store,routes,tools}.ts` | **absorb** |
| 7 | `src/server/connection-routes.ts` (151 lines) | `GET/POST /dots/:id/connections`, `POST /connections/:id/refresh`, `PATCH …/tools/:name`, approval read + approval-gated execute-only route, 1h `APPROVAL_TTL_MS` | `server/src/plugins/routes.ts` (`/api/plugins/connections`, `/api/plugins/tools/:name`, 02 §5) + `server/src/approvals/` | **absorb** (execute path → approval rule, 08 §4) |
| 8 | `src/server/connection-tools.ts` (52 lines) | Per-Dot MCP model tools; gated tools return `approval_required` + `createApproval`, never execute inline; re-resolve at call time | `server/src/plugins/tools.ts` + `server/src/approvals/service.ts` | **absorb** |
| 9 | `src/server/workspace.ts` (372 lines) | `spaces`, `dots` (+`dot_spaces` ACL, `learningContainerId`, `skillDeliveryEnabled`), `thread_bindings`, `task_threads`, `calls`, `captures`, seed Everyday/Dot | `server/src/agents/` (dots→agents, 01 §5/§6), new `spaces`/`threads` tables, `server/src/voice/` (calls) | **absorb** |
| 10 | `src/server/workspace-routes.ts` (244 lines) | `/workspace`, `/spaces`, `/dots`, `/conversations`, `/conversations/:id/capture`, `/voice/calls*` (begin/active/compute/end), `/copilotkit/*` passthrough | `server/src/agents/routes.ts`, new `/api/pages`, `server/src/voice/{routes,session-routes}.ts` (02 §5) | **absorb** (dots→agents, voice→voice) + **drop** (`/copilotkit/*` passthrough) |
| 11 | `src/server/pages.ts` (314 lines) | Page CRUD (title ≤160, content ≤100k), `expectedRevision` 409, cycle-safe `parentId`, `page_reviews` idempotent `(threadId,toolCallId)`, `page_threads` reserve/finish/release lease, delete reparents + keeps receipts | new `server/src/pages/` (no ORBO module; 08 §7) + `pages`/`page_reviews`/`page_threads` (01 §5) | **rewrite** (port; 08 §7) |
| 12 | `src/server/page-service.ts` (147 lines) | Page↔thread conversation bind (single-flight, 60s lease, 30s Intelligence bound), save-conversation→page (100k cap, user/assistant only) | new `server/src/pages/` + unified `threads` (08 §5) | **rewrite** (port) |
| 13 | `src/server/page-routes.ts` (159 lines) | Reviewed-page GET/POST, page-context, `/spaces/:spaceId/pages*` CRUD, `:id/conversation`, `/conversations/:id/page` | new `/api/pages`, `/api/pages/:id/conversation` (02 §5) | **rewrite** (port, flatten `spaces` per 02 risk #2) |
| 14 | `src/server/page-tools.ts` (93 lines) | 5 agent tools (list spaces/pages, read/create/edit) with per-call `canAccessSpace` + `forThread` scoping | new `server/src/pages/` tools | **rewrite** (port) |
| 15 | `src/server/store.ts` (313 lines) | `settings`/`setup_telemetry` one-row, `tasks`/`runs`/`events` (claim/lease/invalidate), `memories` upsert, `BEGIN IMMEDIATE` transactions | `server/src/routines/` + `server/src/work/` (leases) + `server/src/memory/` + `tasks`/`task_runs`/`task_events` (01 §5) | **absorb** (lease/invalidate semantics) + **rewrite** (SQLite→Postgres) |
| 16 | `src/server/runner.ts` (106 lines) | 1s tick, single-flight, 90s cap, 100ms ownership polling, abort-on-settings-change, memory gating, no-content logging | `server/src/work/{queue,loop}.ts` + `server/src/routines/runner.ts` | **absorb** (ownership abort, single-flight) |
| 17 | `src/server/research.ts` (202 lines) | `sample` (fictional brief) vs `live`; `requestedUrls` markdown-boundary parse; Parallel vs isolated-browser branch; evidence-only brief + limitations appended; memories as preferences | `server/src/proactive/` + new `apps/browser` worker (08 §2) | **wrap** (Parallel MCP) + **rewrite** (orchestration as task kind) |
| 18 | `src/server/parallel.ts` (200 lines) | Parallel MCP `web_search`→`web_fetch`, ≤5 URLs, 60s bound, dedupe, ≤6000 chars/source, warnings/errors/discard reporting, memories never sent | `server/src/plugins/mcp.ts` (governed connector) | **wrap** (third-party, NOTICE) |
| 19 | `src/server/voice.ts` (301 lines) | OpenAI realtime `POST /v1/realtime/calls` (SDP in/out, ≤100k), 30s connect + 15min active deadlines, single-call guard, 6 compute-turn cap with failed-turn retry, receipt sync via `turn()` + late-transcript + paused-resume | `server/src/voice/{routes,session-routes,sessions,provider}.ts` + `voice_sessions` (01 §6) | **rewrite** (port flow onto ORBO voice + unified threads) |
| 20 | `src/server/learning.ts` (35 lines) + `src/shared/learning.ts` (22 lines) | `learningSelector`: owner-only, Slack-Dot channel bind, thread-inherited `learningContainerId`; slug validation (1–64 lower-hyphen), delivery-requires-container | `server/src/learning/{runtime,settings}.ts` + `agents.learning_container_id` (01 §5; 08 §10) | **absorb** |
| 21 | `src/server/dot-agent.ts` (442 lines) + `tanstack-tools.ts` | Turn orchestrator: 90s cap, wires computer/connection/page/learned-skill tools, `approval_required` + `review_space_page` flows | `server/src/agents/` + `server/src/computer/gateway.ts` + `server/src/approvals/` | **absorb** (gating patterns) + **drop** (CopilotKit/TanStack runtime) |
| 22 | `src/server/app.ts` (251 lines) + `index.ts` | Hono shell: 1 MB `bodyLimit`, `no-store`/`nosniff`, host allowlist (localhost + origin hostnames), origin + `sec-fetch-site` guards, `timingSafeEqual` owner-token gate, JSON-only non-GET; `index.ts` env wiring + 24-char `OWNER_TOKEN` floor | `server/src/app.ts` (enterprise gate; 02 §6) | **drop** (shell) + **absorb** (guard values) |
| 23 | `src/server/platform.ts` + `platform-config.ts` (90 lines) | Runtime assembly (workspace/store/runner/computers/connections/voice/pages); `PlatformConfig` env map (OPENAI_*, BROWSER_*, COMPUTER_*, VOICE_*, Slack, INTELLIGENCE_*); `setupStatus` missing-list | `server/src/config.ts` + `server/src/admin/` | **absorb** (env/set gating) + **drop** (OpenDots wiring) |
| 24 | `src/server/slack-channel.ts` + `shutdown.ts` + `setup-telemetry.ts` | Slack channel turn path (uses `learningSelector` channel bind); graceful `stop()` interrupts runs + aborts all; setup step-viewed telemetry events | `server/src/delivery/` (Slack) + `server/src/work/` (shutdown) | **absorb** (abort-all-on-stop, channel-bind pattern) |
| 25 | `src/server/{headless,dot-agent}.ts` (headless turn) + `runtime-scope.ts` | Headless `turn()` used by runner/voice receipt sync; `opendotsSource` markers (`scheduled_task`, `voice_receipt`); 90s `TURN_TIME_LIMIT_MS` | `server/src/routines/run-turn.ts` + `server/src/work/` | **absorb** (receipt-via-turn, source markers) + **drop** (CopilotKit runtime) |
| 26 | `src/shared/types.ts` (124 lines) | `Task/Run/TaskEvent/Settings/Memory` (epoch-ms), `Dot` (spaceIds, research/memoryAllowed), `Conversation`, `CallReceipt` (connecting/active/ended/failed), `Space` | ORBO zod/drizzle per home (01 §5) | **absorb** (field sets + limits) |
| 27 | `src/shared/computer-types.ts` (106 lines) | `computerPermissionsSchema`, `computerInputs` 16-action zod table (path traversal guard, URL no-credential, size caps), `human_*` set | `server/src/computer/schema.ts` | **absorb** |
| 28 | `src/shared/connection-types.ts` (49 lines) | `Connection/ConnectionTool`, `APPROVAL_TTL_MS` 1h, `connectionActionSchema`, `request_connection_action` tool contract | `server/src/plugins/` + `server/src/approvals/` | **absorb** |
| 29 | `src/shared/{page-review,scheduled-message,voice-receipt,learning}.ts` | `pageReviewSchema` (title 160/content 20k draft), `review_space_page` contract, `opendots:scheduled_task:` / `opendots:voice_receipt:` ID prefixes, learning slug schema | new `server/src/pages/` + `server/src/learning/` | **absorb** |

Verdict totals: absorb 14 · rewrite 8 (rows 2p,5p,11,12,13,14,15p,17p,19) ·
wrap 2 (rows 17p,18) · drop 4 (rows 10p,21p,22,23p,24p,25p).
(23 rows; split-verdict rows counted under each verdict. No product code touched.)

## 2. Per-module behavior that must survive

| Module(s) | Behavior that must survive (no regression) |
| --- | --- |
| computer-store/service | Per-agent `{enabled,browser,files,shell}` flags; `begin→finish` audit (actor owner/agent, pending→succeeded/failed); 1000-row retention; human_* owner-only; per-action re-check loop (50 ms) + post-action re-check; `exec` result strips `command`; secret redaction of all 3 tokens; 409 snapshot-refresh message |
| connection-store/service | `hasToken`-only views; claim-once `INSERT OR IGNORE` → double-click never executes twice; saved result bound to its `approvalId` (409 on mismatch); 1h approval TTL; fingerprint `id:updatedAt` invalidates running turns; refresh merges against current owner settings; tool-name stability (assigned over all tools, enabled or not) |
| workspace | `dot_spaces` ACL incl. default-space validation; `bindThread` inherits Dot `learningContainerId` frozen at creation; `requireThread` owner+Dot scoping; `task_threads` link; `calls` ended-guard + late-transcript-once + anchor; `captures` upsert per thread; seed Everyday/Dot on empty DB |
| pages/page-service | `expectedRevision` 409 + reload message; parent cycle rejection; 160/100k limits; `createReviewed` idempotent per `(threadId,toolCallId)` incl. cross-space and changed-draft 409s; review receipts survive page delete; page-thread lease (60s) + ready flag + single-flight map; save-conversation 100k cap |
| store/runner | Lease claim (`leaseUntil` now+180s) + expiry invalidation with reason events; settings-change (pause/research-off/memory-toggle) interrupts running tasks; repeat-after-success `nextRunAt`; single-flight tick; 90s research cap; 100 ms ownership abort; failures record `fail()` with event text |
| research/parallel | `sample` mode contacts nothing; `requestedUrls` markdown-link splitting + trailing-punct trim + dedupe; max 5 sources, ≤6000 chars each; warnings/errors/discard surfaced as limitations; browser branch requires explicit URL (never invents sources); memories/preferences sent to model only, never to Parallel |
| voice | Single concurrent call; SDP shape validation both directions; 30s activation + 15 min session deadlines; 6 compute-turn cap (attempts count, failed turns retryable); `end()` idempotent + late transcript; receipt records only confirmed decisions; paused-workspace defers Intelligence sync with resume |
| learning | Owner-only selector; channel requires configured Slack Dot; delivery requires container; slug regex; thread container frozen (never backfilled) |
| dot-agent/tanstack | 90s turn cap; `approval_required` → `request_connection_action` → owner route executes stored args (never caller-supplied); review-before-save (`review_space_page`) then wait; learned-skill tools scoped to `copilotkit_load_skill`/`copilotkit_read_skill_file` with snapshot binding |
| shared contracts | `computerInputs` caps (path ≤1024 no-traversal, url ≤2048 no-credentials, text ≤16k, exec ≤8k/1–60s, content ≤100k); dot name ≤40 / instructions ≤2000; memory text ≤2000; task prompt 3–4000 chars; repeat interval 60s–1yr; voice SDP ≤100k, transcript ≤20k, compute request ≤4k + transcript ≤12k |
| platform/index | `BROWSER_SECRET` ≥24 chars (`browser/security.ts` convention per 08 §2); `OWNER_TOKEN` ≥24 chars; setup `missing[]` gates conversations/tasks/voice; `abortAll` on pause; `resumePending` replays deferred voice receipts |
| app shell | 1 MB body cap; `timingSafeEqual` owner-token check; localhost+origin allowlist; `sec-fetch-site: cross-site` reject; `no-store`/`nosniff`; JSON-only non-GET; 24-char `OWNER_TOKEN` floor (`index.ts:22`) |

## 3. Data touchpoints (cite 01/02)

| OpenDots table(s) | Unified target (01 §5, §6) | API mapping (02 §5, §6) |
| --- | --- | --- |
| `dots` + `dot_spaces` | `agents` (+`instructions`,`research_allowed`,`memory_allowed`,`learning_container_id`,`skill_delivery_enabled`) + `agent_spaces` join | `POST /api/dots` → `POST /api/agents`; `PUT /dots/:id` → `PATCH /api/agents/:id` |
| `spaces` | new `spaces` (`owner_user_id` TBD — 01 §9 blocker #3) | Flattened to `/api/pages` v1 unless UI needs container (02 risk #2) |
| `thread_bindings` + `task_threads` + `captures` | new `threads` (+`learning_container_id`, capture column) keyed to unified task | `/api/threads` canonical; `POST /api/conversations` → `POST /api/threads/mint` adapter |
| `tasks` + `runs` + `events` (+`settings`, `setup_telemetry`) | new `tasks`/`task_runs`/`task_events` (keep `interval_seconds`, `lease`, `lease_until`); settings→keyed `settings` | `POST /api/tasks` → `POST /api/routines` adapter; `PUT …/schedule` → routine schedule |
| `memories` | `memories` (widened `personal_memories`): `text`→`content`, `formed_by='person'`, `provenance='opendots'` | `POST/PUT/DELETE /api/memories` → `/api/memory*` adapters |
| `computer_permissions` + `computer_audit` | `computers.permissions` jsonb + new `computer_audit` (`agent_id`, actor/action/outcome) | `/dots/:id/computer*` → `/api/computers/:botId/*` adapters |
| `mcp_connections` (+plaintext `token`) | `credentials` vault row + `mcp_servers` pointer — **encrypt, never copy** (01 §7 step 5) | `/dots/:id/connections` → `/api/plugins/connections` |
| `mcp_approvals` + `mcp_actions` | `approvals` (`approval_kind='mcp'`, `connector_ref`, tool, arguments) + `approval_receipts` `(thread_id,tool_call_id)` key | connection-approval reads → `/api/approvals`; execute path becomes an approval rule (08 §4) |
| `pages` + `page_reviews` + `page_threads` | same-named new tables (direct) | `/spaces/:spaceId/pages*` → `/api/pages*`; reviewed-page → `/api/pages/:id` + conversation |
| `calls` | `voice_sessions` — normalize free-text `transcript` → `{entries[]}` (01 §8) | `/voice/calls*` → `/api/voice/calls` (+`/api/voice/sessions`) |

Conversions on every importer (01 §8): epoch-ms INTEGER → timestamptz; bool-int
(`researchAllowed`, `memoryAllowed`, `skillDeliveryEnabled`, `ready`) → boolean;
`ownerId` string → `users.id` (bootstrap owner; single-owner assumption).

## 4. Tests to port (cite 06)

Per 06 §2 OpenDots is `vitest run` (48 files); port = rewrite to `bun:test`,
converting all `vi.*` mocks to restorable `spyOn` (06 §5, 06 gap #4 — highest
mechanical risk). Reuse `tests/fixtures/{model-stream.ts,learning-skills.zip}` (06 §2).

| OpenDots test(s) | Proves | ORBO home (06 §3) |
| --- | --- | --- |
| `tests/computer.test.ts`, `computer-deployment.test.js` | Permissions/audit, supervisor identity + HMAC gating | `server/tests/computer-*.test.ts` + `computer-*.integration.test.ts` (08 §1) |
| `tests/connections.test.ts`, `connection-card.test.tsx` | Approval claim-once, tool slugging, per-tool approval defaults | `server/tests/plugin-*.test.ts`, `composio-*.test.ts` (08 §8) |
| `tests/{pages,page-service,page-routes,page-review,page-review-card,page-context,page-snapshots,page-document-delete,autosave,markdown,library}.test.*` | Page CRUD/409/cycles/review idempotency/editor | `server/tests/page-*.test.ts` (new) + `app/tests/*-editor.test.tsx` (08 §7) |
| `tests/{runner,store,workspace}.test.ts` | Lease claim/expiry, settings-change interrupt, ACL/threads | `server/tests/routine-*.test.ts`, `work-*.test.ts` (08 §6) |
| `tests/{research,parallel,security,transport}.test.ts` | URL extraction, 5-source cap, SSRF guard, evidence-only brief | Browser/research worker suites (08 §2) |
| `tests/{voice,use-voice,use-voice-control-poll,transcript}.test.*` | Call lifecycle, turn cap, receipt sync, transcript anchoring | `server/tests/voice-*.test.ts` |
| `tests/{learning,learning-delivery}.test.ts` (+`learning-skills.zip`) | Container validation, delivery gating, thread inheritance | `server/tests/learning-*.test.ts` (08 §10) |
| `tests/{app,app-origin,setup-telemetry,telemetry,intelligence-key,shutdown,runtime-scope,headless-runtime}.test.ts` | Body caps, origin/host guards, setup gating, graceful stop | Fold guard values into ORBO app/work tests; **drop** shell-duplicates |

**Drop:** `controls/dark-theme/chat-composer/poll-notice` UI-only (covered by ORBO
design-system 04); `slack-channel*`/`dot-agent-channel` (delivery re-covers);
`computer-card` (ORBO computer UI); `tanstack-agent/headless` runtime-harness
(CopilotKit/TanStack has no ORBO counterpart).

### 4b. OpenDots vitest census (48 files in `_sources/OpenDots/tests/`, per 06 §2)

| Bucket | Files | Verdict |
| --- | --- | --- |
| computer | `computer.test.ts`, `computer-deployment.test.js`, `computer-card.test.tsx` | Port 2, drop 1 (card) |
| connections | `connections.test.ts`, `connection-card.test.tsx` | Port 1, drop 1 (card) |
| pages | `pages`, `page-service`, `page-routes`, `page-review`, `page-review-card`, `page-context`, `page-snapshots`, `page-document-delete`, `autosave`, `markdown`, `library`, `page-chat-request` (12) | Port all 12 |
| tasks/workspace | `runner`, `store`, `workspace`, `transcript.test.tsx` | Port all 4 |
| research | `research`, `parallel`, `security`, `transport` | Port all 4 |
| voice | `voice`, `use-voice`, `use-voice-control-poll` | Port all 3 |
| learning | `learning`, `learning-delivery` | Port both |
| shell/controls | `app`, `app-origin`, `setup`, `setup-telemetry`, `telemetry`, `intelligence-key`, `shutdown`, `runtime-scope`, `headless`, `headless-runtime`, `controls.test.tsx`, `dark-theme`, `chat-composer`, `poll-notice`, `dot-agent-channel`, `slack-channel`, `slack-channel-wiring`, `tanstack-agent` (18) | Fold guard values, drop the rest |

Port total: ~28 files. Drop total: ~20 files. Fixtures reused: `fixtures/model-stream.ts`,
`fixtures/learning-skills.zip` (06 §5).

## 5. Risks

| # | Risk | Detail / mitigation |
| --- | --- | --- |
| 1 | **Plaintext tokens** (highest severity) | `mcp_connections.token` stored in clear (`connection-store.ts:14`), only `hasToken` exposed. Encrypt into `credentials` vault before any surface reads it; never copy the column (01 §7 step 5, 01 §8, 08 §9). |
| 2 | **Ungoverned routes** | `/dots/:id/computer/*`, `/connections/*`, `/api/browsers`-equivalents bypass ORBO policy gateway. Absorb as adapters behind `computerGateway`/approval rules; delete raw control, never alias (02 risk #4, 08 §1). |
| 3 | **SQLite→Postgres conversions** | Epoch-ms, bool-int, `ownerId` strings, JSON-text payloads on every importer (01 §8); `BEGIN IMMEDIATE` → Postgres transactions; `INSERT OR IGNORE/REPLACE` → upserts; WAL/busy-timeout assumptions do not transfer. |
| 4 | **Threads identity blocker** | `channels` vs `threads` vs Intelligence (`intelligence_channel_mappings`) gates pages/routines/memory/learning (01 §9 blocker #1, 08 merge order §1). Owner decision required before porting binds. |
| 5 | **Spaces ownership** | No ORBO counterpart; flatten vs container undecided (01 §9 blocker #3, 02 risk #2). |
| 6 | **Third-party wraps** | Parallel (`parallel.ts`) and OpenAI realtime (`voice.ts`) stay external (NOTICE); no first-party substitute (08 §2). Voice `VOICE_API_KEY` handling must match vault rules. |
| 7 | **Vitest→Bun mock leakage** | `vi.mock` in ~28 OpenDots files leaks under Bun single-process run; every ported file converts to `spyOn` (06 gap #4, 06 §5). |
| 8 | **Status vocabularies** | OpenDots `queued/running/paused/completed/failed/interrupted/cancelled` vs ORBO routine/run states — collapse without losing `interrupted`/`failed` + fatigue semantics (08 §6). |
| 9 | **Secrets in receipts/logs** | Approval/action payloads are JSON text; runner redacts task content from logs. Keep secrets out of `approval_receipts`, `task_events`, transcripts (08 §4, §9). |
| 10 | **Single-owner → multi-user** | `ownerId` string + `OWNER_TOKEN` bearer vs Better Auth sessions; map to bootstrap `users.id`, do not expose owner semantics (02 risk #1, 01 §8). |
| 11 | **Computer namespace binding** | `computer-service.ts:144-176` pins supervisor `botId`/`container` to `${ns}-computer-${id}` and only allows the loopback or `<name>:4100` origin. Port must keep the identity-mismatch + endpoint-binding checks verbatim or a Dot can be pointed at another container. |
| 12 | **No `monitors` in OpenDots** | The task brief names "tasks/monitors": OpenDots has **no monitors table** — only `intervalSeconds` repeat. Monitor behavior comes from OpenMuse (`monitors` kind → `monitors` table, 01 §5). Do not invent an OpenDots monitor port. |

## 6. Suggested port order (respects 08 merge sequence §1–§10)

1. `store.ts` lease/invalidate → `server/src/work/` (+ Postgres conversions, risk #3).
2. `connection-store.ts` claim/fingerprint → `server/src/approvals/` (+ vault cut-over, risk #1).
3. `connections.ts` + `connection-tools.ts` → `server/src/plugins/` (risk #2).
4. `computer-store.ts` + `computer-tools.ts` → `server/src/computer/`; `computer-service.ts` HMAC/supervisor → `provider/supervisor` rewrite.
5. `workspace.ts` dots/threads/calls → agents/threads/voice (blocked on risk #4 owner decision).
6. `pages*.ts` + `page-service.ts` → new `server/src/pages/` (blocked on risk #5).
7. `research.ts`/`parallel.ts` → task-kind + governed MCP connector (wrap, risk #6).
8. `voice.ts` → `server/src/voice/` (risk #6).
9. `learning.ts` → `server/src/learning/` (needs unified threads first).

Out of scope for Phase 5 port: `dot-agent.ts` CopilotKit/TanStack runtime,
`slack-channel.ts` transport (delivery re-covers), OpenDots client UI.
