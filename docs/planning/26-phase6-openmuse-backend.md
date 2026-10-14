# Phase 6 — OpenMuse Backend Inventory (absorption map)

Source: `_sources/OpenMuse/apps/server/src/` (25 files) + `engine/` (8) + `jev/` (3) +
`demo/` (3) + `packages/{domain,integrations,backends}` + `apps/{worker,computer}`.
ORBO homes are `server/src/` paths. Verdicts: **absorb** = port logic as-is under
ORBO ownership; **rewrite** = reimplement against ORBO schema/auth/policy;
**wrap** = keep behind an adapter; **drop** = do not port.
Companion docs: `01-schema-unification.md` (records→tables), `02-api-surface.md`
(route map + aliases), `06-test-strategy.md` (node:test→bun:test port rules).

Method: read `apps/server/src/*.ts`, `engine/*.ts`, `jev/*.ts`, `demo/entry.ts`,
`packages/*/src/*.ts`, `apps/worker/src/server.ts`, and `package.json` scripts;
cross-checked ORBO homes in `server/src/` and counts against `06 §2` (~59 files).
No product code modified. OpenMuse `apps/mobile` is a UI surface, not backend —
only its 8 test files appear below (§4); `apps/computer` is a Docker image plus
two smoke tests with no server logic. `index.ts` vs `worker-entry.ts` differ only
in process role (API+worker vs worker-only on shared `createApp`); both drop.

## 1. Module inventory

| # | OpenMuse file | Purpose | ORBO home | Verdict |
| --- | --- | --- | --- | --- |
| 1 | `apps/server/src/app.ts` | Hono composition, owner gate, CORS, body-limit, `/api/copilotkit/*` passthrough | `server/src/app.ts` | **rewrite** — mount adapters only, no second server |
| 2 | `apps/server/src/auth.ts` | Single-owner bearer sessions (`system`/`sessions`), HMAC signed URLs | `server/src/auth/` (Better Auth) | **rewrite** — owner→actor shim (`02 §7` risk 1) |
| 3 | `apps/server/src/db.ts` | `records(owner,kind,id,data)` KV Store, CAS, lease claim, PGlite/pg | `server/src/db/schema/*` | **rewrite** — normalize per `01 §§5–7` |
| 4 | `apps/server/src/engine/routes.ts` | tasks/goals/monitors/ideas/memories/identity/notifications CRUD | `server/src/routines/routes.ts`, `responsibilities/routes.ts`, `memory/routes.ts` | **rewrite** — split by resource |
| 5 | `apps/server/src/engine/service.ts` (~1200 lines) | AgentService: task/monitor/idea/document/finance orchestration | `server/src/routines/runner.ts`, `responsibilities/engine.ts` | **rewrite** — schedulers stay ORBO, enqueue `tasks` (`01 §5`) |
| 6 | `apps/server/src/engine/worker.ts` | TaskWorker: 1s poll, CAS lease claim, heartbeat, max 3 in-flight, settle hook | `server/src/routines/runner.ts`, `server/src/work/` | **absorb** — lease/heartbeat/settle pattern |
| 7 | `apps/server/src/engine/conversation.ts` | AG-UI chat agent, 12 tools (mail/calendar/browse/delegate/watch/remember) | `server/src/copilot.ts`, `server/src/intelligence-client.ts` | **rewrite** — tools re-registered on ORBO runtime |
| 8 | `apps/server/src/engine/model.ts` | Model task loop: serial tool queue, cached ops, prepare/ask/finish tools | `server/src/copilot.ts` | **absorb** — serial-queue + idempotent-tool pattern |
| 9 | `apps/server/src/engine/finance.ts` | CSV `analyzeSpending` (BOM/quotes/cents/category totals, ≤5000 rows) | new `server/src/routines/finance.ts` (or plugins util) | **absorb** — pure function |
| 10 | `apps/server/src/engine/page-diff.ts` | Line diff ignoring relative-time ticks, number-change-as-update | monitors feature (`server/src/routines/`, `monitors` table per `01 §5`) | **absorb** — ships with monitors |
| 11 | `apps/server/src/engine/tanstack-agent.ts` | `provider/model` adapter (openai/anthropic/gemini), retry=2 | `server/src/provider-oauth.ts`, `intelligence-client.ts` | **wrap** — keep string parsing + retry constants |
| 12 | `apps/server/src/actions.ts` | ActionService: propose (hash-bind) → decide (claim→execute→receipt), 30-min expiry | `server/src/approvals/service.ts`, `approvals/routes.ts` | **rewrite** — merge into `approval_requests` (`01 §6`) |
| 13 | `apps/server/src/workspace.ts` | Gmail/Calendar snapshot, sample seeding, attachment import | `server/src/plugins/routes.ts` (Google connector) | **rewrite** — no first-class mail in v1 (`02 §7` risk 5) |
| 14 | `apps/server/src/files.ts` | PDF import (10 MB/500 pp), deterministic fill IDs, signed URLs | `server/src/channels/attachments.ts` | **absorb** — UUID-v5 keying, fill pipeline |
| 15 | `apps/server/src/browser.ts` | BrowserService: worker proxy, per-session serial queue, signed preview/console | `server/src/computer/gateway.ts`, `computer/policy.ts` | **rewrite** — via governed gateway (`02 §7` risk 4) |
| 16 | `apps/server/src/browser-console.ts` | Single-HTML screenshot console (no remote code execution) | app browser surface (Phase 6 UI) | **wrap** — reuse HTML, re-sign URLs |
| 17 | `apps/server/src/computer.ts` (771 lines) | ComputerService: lease, docker exec, /workspace jail, desktop receipts/shots | `server/src/computer/routes.ts`, `gateway.ts` | **rewrite** — ORBO policy gateway canonical |
| 18 | `apps/server/src/computer-routes.ts` | start/stop/desktop/commands/files/import/export routes | `server/src/computer/routes.ts` | **rewrite** — alias map in `02 §6` |
| 19a | `computer-backend.ts`, `computer-tools.ts` | Docker backend (inspect-gated, jail binds), agent tool defs | `server/src/computer/provider.ts`, `headless-tools.ts` | **absorb** — backend checks + tool shapes |
| 19b | `computer-e2b-desktop.ts` | E2B desktop provider (VNC stream, `use_desktop` actions) | _(none)_ | **drop** — no E2B in ORBO stack |
| 20 | `apps/server/src/google-auth.ts` | OAuth PKCE, generation rotation, AES-GCM vault, refresh dedupe | `server/src/provider-oauth.ts`, `server/src/credentials.ts` | **absorb** — rotation + singleflight refresh |
| 21 | `apps/server/src/search.ts` | Parallel MCP `web_search`, 1 MiB cap, 30 kB excerpt budget | research path (`proactive/`, plugins) | **wrap** — provider-gated tool |
| 22 | `apps/server/src/jev/{adapter,service,tools}.ts` | TypeSafe choice panels, rank/refine/expire-per-turn | _(none)_ | **drop** — no ORBO home; revisit post-v1 |
| 23 | `config.ts`, `rate-limit.ts`, `errors.ts`, `log.ts` | Env config, IP-bucket limiter, AppError, bg-failure log | `server/src/config.ts`, app middleware | **absorb** — limiter store + shadowed-env warn |
| 24 | `agent.ts`, `index.ts`, `worker-entry.ts`, `demo/*` | Runtime wiring, process hosts, local demo harness | `server/src/copilot.ts`, `worker/` | **drop** — ORBO hosts survive |
| 25 | `packages/domain/src/*.ts` | Zod schemas + `kind` entity interfaces (task/goal/monitor/mail/…) | ORBO route schemas | **absorb** — validation spec (`01 §8` risk: TS-only, re-validate) |
| 26 | `packages/integrations/src/{google,pdf,vault}.ts` | Gmail/Calendar client, pdf-lib fill, AES-256-GCM envelope | `plugins/`, `attachments`, `credentials` vault | **absorb** — client subset + envelope format |
| 27 | `packages/backends/src/openbot.ts` | OpenBot contract adapter (pinned `a96d88c6`) | `agent-computer/`, `computer/client.ts` | **wrap** — contract pin only |
| 28 | `apps/worker/src/*`, `apps/computer/*` | Chromium proxy worker, Docker image + smoke tests | `agent-computer/` | **drop** — ORBO uses OpenBot computer (`06 §2`) |

Verdict totals: absorb 10 · rewrite 10 · wrap 4 · drop 7 (rows 19a/19b split; jev/demo/worker/computer-image/e2b counted in drop).

Absorb means the logic ports with only import-path and owner→actor renames; no
ORBO table or route changes required. Rewrite means the ORBO counterpart already
exists and only the behavior (state machine, validation, safety checks) carries
over. Wrap means the code survives behind a provider flag or adapter, never as a
second server or second auth system.

## 2. Behavior that must survive (per module)

| From | Behavior | Why it matters |
| --- | --- | --- |
| actions.ts | Hash-bound decide, single-claim `db.claim`, expiry→`expired`, `outcome_unknown` on ambiguous failure | Prevents double-execute + silent dupes; maps to `approval_requests.action_digest` |
| engine/worker.ts | CAS lease claim, heartbeat renewal, abort-on-lost-lease, `waiting_approval` expiry sweep | Exactly-once task execution across restarts |
| engine/service.ts | Monitor state machine (pause/resume/stop/check), failure backoff (5 strikes→pause), change-vs-timeless-hash quiet | Watch reliability without spam |
| engine/service.ts | Idea dedupe (sent/completed suppression, CAS accept), goal-pause fans out to tasks | No duplicate suggestions; goal control is real |
| files.ts | Deterministic file IDs per operation key, link-based atomic publish, fill-never-mutates-original | Retry-safe uploads; audit trail intact |
| computer.ts | Exclusive lease, stop-quarantine, `/workspace` jail, idempotent command/desktop receipts | Safety core of computer use; non-negotiable |
| browser.ts | Per-session serial queue, ownership-record-before-worker-call, download→file dedupe | Ordering + no orphan sessions |
| google-auth.ts | PKCE + generation rotation, refresh singleflight, scope-elevation on connect | No token replay across reconnects |
| search.ts | 1 MiB response cap, invalid-entry drop counter, 30 kB excerpt budget, untrusted-data framing | Cost + prompt-injection hygiene |
| rate-limit.ts | Pre-auth IP key (never Authorization-derived), `trustProxy` gate, test socket degrade | No bucket-minting bypass |
| finance.ts | Strict CSV grammar (BOM, quotes, ISO dates, cents math, 1–5000 rows) | Money math must not drift |
| page-diff.ts | Relative-time blanking, pairing without double-count | Monitors stay quiet on clock ticks |
| tanstack-agent.ts | `provider/model` parse, per-provider retry (MODEL_MAX_RETRIES=2), no retry after stream start | Provider behavior parity without SDK drift |
| workspace.ts | Sample seeding (4 mails, 3 events, 1 proposal), connection-missing vs empty distinction | Demo determinism; callers must tell "disconnected" from "no events" |
| auth.ts | 15-min HMAC signed URLs for file/content + browser preview/console | Private blobs stay unguessable after Better Auth cutover |
| app.ts | 12 MB body limit, Zod→422 / AppError→status / PdfError→422 envelope | Error-shape contract clients rely on |
| engine/model.ts | `finish_task` writes report artifact before outcome; `ask_user` freezes tool queue | Every terminal task leaves an artifact; no post-pause side effects |
| db.ts | `insertIfAbsent` + `compareAndSwap` optimistic concurrency on every mutation | Race safety without distributed locks; keep CAS discipline in PG |
| computer-backend.ts | Docker inspect gates (readonly rootfs, dropped caps, pinned network mode, memory/pids limits) | Container escape posture; re-assert in ORBO provider |
| engine/service.ts | Document flow: find-PDF → wait-for-fields → fill-copy → email proposal → approval gate | Doc automation never sends without review; preserve the gate order |
| engine/service.ts | `artifact()` keyed by `hash(taskId:key)` — repeat runs overwrite, never duplicate | Idempotent artifacts under worker retries |

## 3. Data / API touchpoints

| Touchpoint | OpenMuse form | ORBO target | Note |
| --- | --- | --- | --- |
| `records` KV + ~32 `kind`s | `db.ts`; kinds listed `01 §2` | New `tasks`, `task_runs`, `task_events`, `monitors`, `goals`, `ideas`, `artifacts`, `threads`, `pages` | Importer: `SELECT data WHERE kind=$1`; epoch/ISO→timestamptz (`01 §7`) |
| Single-owner `owner` string | `c.get("owner")` on every route | `users.id` via Better Auth actor | Shim maps `local-user`→bootstrap user; multi-user semantics undefined (`01 §8`, `02 §7`) |
| Ungoverned `/api/browsers/*`, `/api/computer/*` | raw control routes | `computerGateway` + `action_policy` | Never mount raw control (`02 §7` risk 4) |
| `credentials`/`oauth` kinds (AES-GCM) | `google-auth.ts`, `vault.ts` | `credentials` vault + `mcp_user_credentials` | Re-encrypt on import; envelope `v1.nonce.tag.ct` |
| `sessions`/`oauth` kinds | `auth.ts` | Better Auth `sessions`/`accounts` | Token-hash lookup → session table; drop file signing key |
| `mail`/`events` kinds | workspace cache | deferred (`mail_messages`/`calendar_events` only if mail ships) | `01 §8`: defer until Finance/mail committed |
| `conversations`/`drafts`/`chat-browsers` | chat state | `threads`/`messages` (status=draft) | Resolve `threads`-vs-`channels` owner decision first (`01 §9`) |
| `computer-state` lease, `computer-desktop-actions` | receipts | `computer_snapshot` + `computer_page_frame` | Receipts merge, screenshots stay out of PG |
| `worker-status` heartbeat, `system` kind | liveness | `work_items` claim / runner heartbeat | Keep tick file out of app DB |
| Route aliases | 8 legacy paths | canonical `/api/*` map | `02 §6` table is the alias list |
| Body-limit + PDF caps | 12 MB bodies, 10 MB uploads, 500-page ceiling | attachments + computer PDF paths | Caps enforced at route AND service (not one layer) |
| CORS allowlist | `allowedOrigins` + `publicUrl` origin, credentialed | ORBO same-origin (deliberately no CORS) | Drop CORS; keep origin check only if cross-origin ships |
| CopilotKit passthrough | `ALL /api/copilotkit/*` + SSE string→bytes fix | `app.route("/", copilotHandler)` | Reconcile at route-tree step, not here (`02 §7` risk 12) |
| Signed-URL query auth | `owner/expires/signature` on file + preview + console | attachment/content + browser preview | Keep HMAC scheme; re-key under ORBO credentials |
| Rate-limit config | 120 req/min/IP bucket, 10k entries, pre-auth | ORBO gateway middleware | Same numbers as starting point; tune under load |
| On-disk blobs | `dataDir/files/*.pdf` (0600), `desktop-screens/<hash>.jpg` | attachments bytes + screenshot store | Blobs stay on disk, never in PG; keep 0600 perms |
| `agent-settings` identity | single persona row (`identity`) | `agent_profiles` + user preferences | One persona → profile row, `type='built_in'` (`01 §5`) |
| `imports` idempotency | mail-attachment → artifact recorded once per connection | attachment dedupe | Same reference never imports twice |
| `conversation-settings` main pointer | `insertIfAbsent` thread bootstrap | thread mapping on first read | Lazy-create, never overwrite an existing thread |

## 4. Tests to port (`node:test` via `tsx`, 47 files + 8 mobile + 4 worker ≈ 59)

Runner: `tsx --import ./tests/setup.ts --test` (`package.json:16`); helpers in
`tests/helpers/{browser,computer,model,search}.ts`. Convert `node:test`→`bun:test`
per `06 §§2–5` (no `mock.module` in ported files — `spyOn` only).

| Test file(s) | Proves | Port → | Drop? |
| --- | --- | --- | --- |
| `finance.test.ts`, `finance-headers.test.ts` | CSV grammar + analyzer | `server/tests/finance-*.test.ts` | — |
| `pdf.test.ts` | inspect/fill, XFA/encrypted rejects | `server/tests/` attachments/pdf | — |
| `model-provider.test.ts`, `model-retry.test.ts`, `model-outcome.test.ts`, `model-worker.test.ts` | Routing, retry, outcome | `server/tests/` provider/runner | — |
| `actions.test.ts`, `workflows.test.ts`, `engine.test.ts` | Propose/decide machine, doc/finance flows | `server/tests/approvals-*.test.ts` | — |
| `monitor-recovery.test.ts`, `monitor-price-spacing.test.ts`, `page-diff.test.ts` | Watch backoff, quiet ticks | `server/tests/` monitors | — |
| `oauth.test.ts`, `vault.test.ts` | PKCE/rotation, AES envelope | `server/tests/provider-oauth.test.ts`, credentials | — |
| `persistence.test.ts`, `rate-limit.test.ts`, `resource-ids.test.ts` | KV CAS, limiter, deterministic IDs | `server/tests/` store/rate-limit | — |
| `search.test.ts`, `search-results.test.ts` | MCP search caps/budgets | `server/tests/` research | — |
| `rich-threads.test.ts`, `conversation-*.test.ts` (4) | Thread + tool wiring | `server/tests/`, `app/tests/` | — |
| `api.test.ts`, `agent-api.test.ts`, `auth-startup.test.ts`, `config.test.ts`, `domain.test.ts`, `log.test.ts` | Routes, session boot, env, schemas | `server/tests/` equivalents | — |
| `browser.test.ts`, `computer-api.test.ts`, `computer.test.ts`, `computer-runner.test.ts` | Proxy ordering, receipts | `server/tests/computer-*.test.ts` (adapted to gateway) | — |
| `google.test.ts`, `gateway-chat-completions.test.ts` | Gmail/Calendar client, chat-completions opt-in | plugin Google tests | — |
| `browser-imports-race.test.ts`, `prepare-lease-loss.test.ts`, `browser-fixture-runner.test.ts` | Race/lease-loss guards | `server/tests/` concurrency | — |
| `jev*.test.ts` (3), `conversation-jev.test.ts`, `demo-model.test.ts` | Choice panels, demo model | — | **drop** (no home) |
| `computer-e2b-desktop.test.ts`, `apps/worker/tests/*`, `apps/computer/*.test.ts` | E2B/Docker provider specifics | — | **drop** (ORBO computer wins) |
| `telemetry.test.ts`, `openbot.test.ts`, `step-limit.test.ts` | DO_NOT_TRACK env, contract pin, step cap | — | **drop** (ORBO owns telemetry/runtime) |
| `apps/mobile/test/*` (8) | RN date/markdown/queue/jev | `app/tests/` only for `date-time`, `conversation-queue` logic | **drop** RN-native + jev-actions |

Helpers/fixtures to reuse: `tests/helpers/{browser,computer,model,search}.ts` become
`server/tests/support/` builders (pure-override factories, no shared mutable state,
per `06 §5`). Tier mapping per `06 §3`: logic → `server/tests/*.test.ts`,
live-DB → `server/tests/*.integration.test.ts` (`TEST_DATABASE_URL`, pgvector),
journeys → `tests/smoke/`. Ported files keep upstream names where the feature name
survives. `tests/setup.ts` (DO_NOT_TRACK/telemetry env) carries over unchanged.

## 5. Risks

| # | Risk | Mitigation |
| --- | --- | --- |
| 1 | Single-owner → sessions/actors: every OpenMuse service takes `owner: string`; ORBO needs per-request actor + tenant | Auth shim at route boundary (`02 §7` risk 1); services accept actor explicitly |
| 2 | Ungoverned browser/computer routes bypass `computerGateway` + `action_policy` | Port behind policy gateway; add route-introspection test (`02 §7` risks 4, 9) |
| 3 | `records`+`kind` has no constraints; TS interfaces are the only spec | Zod-validate on import; GIN index if `records` is kept as shim (`01 §7–8`) |
| 4 | Scheduler duplication: TaskWorker vs `routines`/`responsibilities`/`proactive`/`work_items` | ORBO schedulers enqueue unified `tasks`; never merge schedulers in step 1 (`01 §8`) |
| 5 | Unmapped kinds (`chat-browsers`, `browser-downloads`, `monitor-pages`, `search-sessions`, `sample-pages`, …) | Drop ephemeral/sample state; co-locate `monitor-pages` with `monitors` (`01 §8`) |
| 6 | `node:test`→`bun:test` conversion + `mock.module` leakage poisons single-process runs | `spyOn`-only rule for ported files (`06 §§4–5`); keep `_sources/**` ignored |
| 7 | Mail/calendar depth (Gmail client 860 lines) tempts a first-class mail model | Connector-only in v1; defer `mail_messages` tables (`01 §8`, `02 §7` risk 5) |
| 8 | E2B-desktop assumptions (public ports, Xfce, `use_desktop`) leak into prompts/tools | Drop provider; keep only provider-neutral tool shapes |
| 9 | `computer.ts` is 771 lines of lease/stop/exec interlock — subtlest code in the tree | Port with its tests (`computer*.test.ts`, `prepare-lease-loss`) or not at all; no clean-room rewrite |
| 10 | Sample-vs-live branching (`workspace.ts`, `service.ts` observe, `google/connect`) infects every surface | Cut sample mode at the route boundary; ORBO fixtures replace seeded mails/events |

Blockers needing owner decision (`01 §9`): `threads`-vs-`channels` authority; keep-or-retire
`records`; whether `monitors`/`goals`/`ideas` tables are in scope for Phase 6.

## 6. Absorption order (suggested)

| Step | What | Depends on |
| --- | --- | --- |
| 1 | Auth shim + `records` importer (`02` risk 1, `01 §7`) | Owner decisions above |
| 2 | `approvals` ← ActionService machine + tests | Step 1 (actor on every decide) |
| 3 | `tasks`/`task_runs`/`task_events` + worker lease pattern + tests | Step 1 |
| 4 | Files/PDF fill + finance analyzer + tests | Step 1 |
| 5 | Monitors + page-diff + watch tests | Steps 3–4 (observe + notify) |
| 6 | Computer/browser behind policy gateway + adapted tests | Steps 2–3 (approvals + leases) |
| 7 | Google connector (OAuth + client subset) + search tool | Steps 2, 4 |
| 8 | Route aliases, introspection test, drop upstream servers | All above (`02 §6`, `02 §7` risk 9) |
