# 34 — Merge-Debt Register: Wave 1–3 Deliberate Duplication (Phase 7 Collapse List)

> Status: register only. No product code modified. Every item verified on disk 2026-10-16.
> Scope: deliberate duplication introduced by Wave 1–3 slice work (09 §4) that Phase 7 proper must collapse.
> Rule: slices prove shape in isolation; Phase 7 deletes the slice once the canonical home absorbs it.
> **2026-10-28:** TD-10, TD-11 and TD-12 are resolved by removal — `apps/app/` and `packages/ui/`
> were deleted outright (the real mobile app is `mobile/`, and every behavior the shells stubbed
> already lived in its canonical home under `app/src`). Their register entries stand as the record
> of why the scaffolds existed; no port-into-scaffold work is owed.
> **2026-10-28 (server batch):** TD-01 through TD-06 are collapsed — the two plugin slices are
> deleted and their jobs are the store's (`store.callTool`, `store.invokeSkill`); the task ledger
> is the `tasks` / `task_runs` / `task_events` tables (migration `0056`); routine firing, proactive
> accept and monitor fan-out write through it. TD-09's in-path steps (the `task_id` FK and the
> fan-out columns) landed with TD-06; its legacy import is still owed. See the RESOLVED notes on
> each entry.
> **2026-10-29 (server batch):** TD-06 is fully resolved — the scheduler now runs
> (`monitorSweep` in `index.ts`, over `runDueWatchChecks`). TD-02's last seam is closed — a chat
> surface's `/` text reaches the turn runner through `plugins/invocation-turn.ts`.

## Collapse order (Phase 7 sequence)

| Order | Item | Why this position |
|---|---|---|
| 1 | TD-03 tasks ledger → DB tables | Unblocks TD-04, TD-05, TD-08 (all hold FK-less `task_id` waiting on it). **Resolved 2026-10-28** |
| 2 | TD-04 routine producer → ledger | Proves one firing path before fan-out grows. **Resolved 2026-10-28** |
| 3 | TD-05 proactive accept link → engine/queue | Second producer onto the same ledger; do with TD-04. **Resolved 2026-10-28** |
| 4 | TD-06 monitor executor → unified tasks | Attaches third producer + fan-out; needs TD-01 done. **Resolved 2026-10-28** |
| 5 | TD-01/02 ws10 + ws11 slices → plugins store | Governance convergence; delete injected-transport/model seams. **Resolved 2026-10-28** |
| 6 | TD-07/08/09 tables → superset importers | Schema collapse once producers are stable. TD-09's schema steps (FK + fan-out columns) landed 2026-10-28 with TD-06; the importers are still owed |
| 7 | TD-10/11/12 UI shells → real behavior | Last: no server coupling, largest surface, mechanical ports. **Resolved 2026-10-28 by deletion** — see the register entries |

## Register

### TD-01 — WS-10 MCP allowlist slice vs canonical plugin store

> **COLLAPSED 2026-10-28.** `ws10-slice.ts` and its tests are deleted. Step (1) had already
> landed — `store.callTool` is the DB-backed grant + policy (deny-beats-allow) + audit path, and
> `plugin-store.integration.test.ts` already proved the ungranted refusal (`mcp.call_rejected`
> with `refusal: "not_granted"` before any network) and the policy's answer on the real transport
> seam. Step (3)'s remainder is done: the literal tool-name pin now lives as a store test
> (`toolNameFor("ws10demo/lookup") === "mcp__ws10demo__lookup"` in the same suite), so the
> mapping can no longer drift from what the model is offered.

| Field | Content |
|---|---|
| Slice | `server/src/plugins/ws10-slice.ts` (301 lines: `Ws10Transport`, `Ws10Tool`, `Ws10RefusedError`, `ws10ToolNameFor`) |
| Canonical home | `server/src/plugins/store.ts` (grants, policy, audit) + `server/src/plugins/tools.ts` (`callTool`, `REFUSAL_MARKER`, `PluginRefusedError`) + `server/src/plugins/mcp.ts` (transport) |
| What was duplicated | Tool-name mapping (`ws10ToolNameFor` mirrors store `toolNameFor` `mcp__` + `__` rule); refusal shape (`Ws10RefusedError.rule: null` mirrors `PluginRefusedError`); audit payload (`mcp.call` / `mcp.call_rejected:not_granted`); one-server/one-tool allowlist mirrors DB grants |
| Why the slice did it | 09 §4 first-slice rule: prove one governed MCP call with zero DB and zero network; injected transport keeps tests hermetic; Composio brokering deferred to slice 2 |
| Collapse plan | (1) Land DB-backed per-tool grants in store; (2) rewire slice tests onto `callTool` + real transport seam; (3) delete `ws10-slice.ts` + its tests, keep literal tool-name pin as store test |
| Risk if never collapsed | Two governance paths: allowlist semantics drift from policy (deny-beats-allow violated in one path); audit rows with same event name but different payload shapes; tool-name mapping forks and breaks model tool calls |

### TD-02 — WS-11 personal-skill slice vs canonical skills/learning store

> **COLLAPSED 2026-10-28; the last seam wired 2026-10-29.** `ws11-slice.ts` and its tests are
> deleted. Steps (1) and (2) are
> the store's now: `store.invokeSkill` parses (`parseSkillInvocation`, canonical in
> `plugins/store.ts`), resolves against the DB `skills` table (owner visibility — null owner is
> the deployment's), checks the `plugin_grants` row for the Bot, audits `skill.invoked` /
> `skill.invoke_rejected` (event types added to `audit.ts`), and refuses through
> `PluginRefusedError` with `rule: null` — the slice's mirrored shape, reused instead of
> reimplemented. Step (3): the slug rule is pinned as a route test in
> `skill-ownership.integration.test.ts` (the route refuses what the parser would never name).
> The one remaining seam is no longer one: a chat surface's `/` text reaches the turn runner
> through `plugins/invocation-turn.ts` (`runTurnOrSkill`), which `index.ts` puts in front of the
> delivery router's person-text turn — text that parses as `/slug …` runs through
> `store.invokeSkill` with the very turn runner as the store's injected `run`, a refusal becomes
> the reply (the audit row was already written), and everything else turns unchanged. Pinned in
> `skill-invocation-turn.test.ts`.

| Field | Content |
|---|---|
| Slice | `server/src/plugins/ws11-slice.ts` (334 lines: `Ws11Skill`, `Ws11Model`, `Ws11RefusedError`, `/slug` parser, slug regex) |
| Canonical home | `server/src/plugins/selection.ts` + `server/src/plugins/routes.ts` (skill registry/visibility) + `server/src/learning/` + `server/src/demonstrations/` (containers, delivery) |
| What was duplicated | Slug rule (duplicates skills-route pattern `^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$`); `/slug` parse/resolve/execute pipeline; refusal shape (`rule: null`); audit payload (`skill.invoked` / `skill.invoke_rejected` mirrors `configuration.changed`) |
| Why the slice did it | Prove one `/`-invoked skill end-to-end with injected model; no DB, no learning containers, no delivery — same seam shape as WS-10 transport |
| Collapse plan | (1) Land DB skills + visibility + grants; (2) rewire parser + executor onto canonical runner; (3) delete `ws11-slice.ts`, keep slug-regex pin as route test |
| Risk if never collapsed | Two skill resolvers disagree on visibility/ownership (somebody-else's skill executable in one path); invocation audit splits across two event vocabularies; model seam stays ungoverned |

### TD-03 — In-memory task ledger vs durable work queue + future `tasks` tables

> **COLLAPSED 2026-10-28 — TOP RISK retired.** The `tasks` / `task_runs` / `task_events` tables
> exist (migration `0056_unified_task_ledger`), and `createTaskLedger` is the DB ledger over
> them: offer is one `insert … on conflict do nothing` against the unique key — the same key
> string the queue's `(kind, key)` idempotence uses — so task creation is idempotent against
> queue lease state by constraint, and a replayed or concurrent firing cannot double-create.
> `startRun` flips the task out of `open` and opens its one run row in one transaction
> (`task_runs.task_id` unique); `finishRun` finishes once; receipts are one per run. Steps (3)
> and (4) are done: produce/accept/finance offer through it, the in-memory ledger is gone, and
> the key-format pin plus the concurrent double-fire proof live in
> `work-ledger.integration.test.ts` and `routine-fire.test.ts` against real Postgres.

| Field | Content |
|---|---|
| Slice | `server/src/work/tasks.ts` (203 lines: `Task` / `TaskRun` / `TaskReceipt`, `TaskLedger.offer/startRun/finishRun`) |
| Canonical home | `server/src/work/queue.ts` (leases, `select … for update skip locked`, DB clock) + future `tasks` / `task_runs` / `task_events` tables (01 §5) |
| What was duplicated | Offer/idempotence contract (`offered: false` mirrors queue `"queued" \| "already"`); task+run+receipt triple prefigures the three tables; key format `${routineId}:${minute}` |
| Why the slice did it | WS-09 slice 1 (09 §4, 08 §6): prove unified-task SHAPE with no DB and no clock (injected `now`); leases/retries/fatigue explicitly deferred to slice 2 on `queue.ts` |
| Collapse plan | (1) Create `tasks` / `task_runs` / `task_events` tables; (2) implement DB ledger over queue leases; (3) migrate `tasks.ts` callers; (4) delete in-memory ledger, keep key-format pin as DB test. ORDER FIRST |
| Risk if never collapsed | **TOP RISK — two firing mechanisms:** in-memory ledger loses work on restart while queue leases double-fire; idempotence keys diverge; schedulers enqueue into a store nothing drains |

### TD-04 — Routine firing producer vs ledger + runner

> **COLLAPSED 2026-10-28.** `fireRoutineTask` offers into the durable ledger (TD-03) as the
> `routine` producer kind; there are no in-memory overloads to delete. Duplicate-fire on
> concurrent sweeps is answered at the storage layer: two replicas firing one due minute run the
> turn once, the loser reporting the lost firing rather than a second run (pinned in
> `routine-fire.test.ts`). Leases/retries/fatigue remain the queue's and the runner's, as planned
> — step (2) was already their shape, so nothing grew here.

| Field | Content |
|---|---|
| Slice | `server/src/routines/produce.ts` (`fireRoutineTask`, `minuteKey`, `RoutineNotDueError`) over `server/src/work/tasks.ts` ledger |
| Canonical home | `server/src/work/tasks.ts` → DB tables (TD-03) + `server/src/routines/runner.ts` (turn execution) + `server/src/routines/schedule.ts` (`nextOccurrence`) |
| What was duplicated | Firing triple (task + run + receipt) constructed per routine-due-minute; `minuteKey` truncation contract pinned literally in tests (same contract `sweep.ts` pins for its offer key) |
| Why the slice did it | Keep schedulers-as-producers (09 R5): `produce.ts` decides what should fire, ledger records it, injected turn keeps model out of the firing test |
| Collapse plan | With TD-03: (1) point `fireRoutineTask` at DB ledger; (2) wire leases/retries/fatigue from queue+runner (slice 2); (3) delete in-memory overloads |
| Risk if never collapsed | Routine firings invisible to unified task views/audit; fatigue rule counts a history the ledger does not carry; duplicate-fire on concurrent sweeps |

### TD-05 — Proactive accept-as-task link vs proactive engine

> **COLLAPSED 2026-10-28.** `acceptSuggestionAsTask` mints through the durable ledger (TD-03),
> and the engine awaits it. Step (2) is done as a schema fact rather than a convention:
> `proactive` is its own producer kind (`{kind: "proactive", id: "proactive:<settingId>"}`), the
> `suggestion:<id>` key namespace is the `tasks.key` unique constraint, and a second accept sees
> the same triple across restarts. The receipt's one-line detail rule is unchanged and still
> pinned. The mint runs after the suggestion flips to `started` in the store (the engine's
> transaction is the store's own conditional resolve, which refuses the second accept before
> the ledger is touched).

| Field | Content |
|---|---|
| Slice | `server/src/proactive/accept.ts` (65 lines: `acceptSuggestionAsTask`, `suggestionTaskKey`, `SuggestionAcceptance`) |
| Canonical home | `server/src/proactive/engine.ts` (queue-backed runs, `PROACTIVE_RUN_KIND`, restriction) + `server/src/work/tasks.ts` ledger (TD-03) |
| What was duplicated | Second task-offer path (`suggestion:<id>` key on the `routine` producer kind as `proactive:<settingId>`); run+receipt triple per acceptance mirrors `fireRoutineTask` |
| Why the slice did it | 25 §3.3: ideas stay suggestions (`open` → `started`, no new tables); accept mints a unified task idempotently so double-accept returns the same triple |
| Collapse plan | With TD-03/TD-04: (1) move accept onto DB ledger inside engine transaction; (2) unify `routine` vs `proactive` producer kinds; (3) keep `suggestionTaskKey` namespacing test |
| Risk if never collapsed | Suggestion accepts and routine firings collide or double-mint (key namespace is code-only, not a DB constraint); receipts readable by feeds leak turn content if detail rule drifts |

### TD-06 — Monitor check executor vs unified tasks + legacy `observe`

> **FULLY RESOLVED 2026-10-29 — the scheduler is wired.** Alerts persist durably AND a clock runs
> them: `index.ts` now drives `monitorSweep` (`repeatAfterEach`, 60s) over `runDueWatchChecks`
> with the other sweeps, stopped on shutdown like the rest, and logs each pass's outcomes. There
> was no legacy in-memory check loop in `index.ts` to remove — the check path was never scheduled
> there, which is why watches were silent rather than duplicated. The durable half landed
> 2026-10-28: a `NotificationWriter` over the
> `notifications` table (the `monitor:<id>:<seq>:<hash>` dedup key as the row id,
> `on conflict do nothing`), `claimDueMonitors` (the due sweep, `for update skip locked`,
> reserving the slot in the claim's own transaction), `persistMonitorUpdate`, and
> `runDueWatchChecks` tying claim → check → fan-out → persist into one call. TD-09's fan-out
> columns (`consecutive_failures`, `alert_sequence`, `last_timeless_hash`) exist so the state
> survives restarts. Proven against real Postgres in `monitor-store.integration.test.ts`: one
> row per firing, replay dedupes, the fifth strike pauses. Step (2) is moot — the legacy
> `observe` executor is not in this tree (nothing imports it; `fanout.ts` already cited it in
> the past tense). `check.ts` remains the pure core the runner drives inside `runDueWatchChecks`.

| Field | Content |
|---|---|
| Slice | `server/src/monitors/check.ts` (200 lines: pure `fetchPage`/`now` injection, `hashWatchText` FNV-1a, `change`/`contains`/`price_below`) |
| Canonical home | Future unified `tasks` enqueue + `server/src/db/schema/monitors.ts` row persistence + `server/src/db/schema/notifications.ts` fan-out (D9 route consumer, 25 R6) |
| What was duplicated | Condition semantics copied row-for-row from legacy `observe` executor; `lastHash`/`lastValue`/`checkedAt`/`nextCheckAt` state shape mirrors monitor row |
| Why the slice did it | 25 M4 first slice: decide fired/not with no network, no timers, no row writes; alert is returned in-memory only; backoff/5-strike auto-pause/quiet-rule/dedup keys deferred to fan-out slice |
| Collapse plan | After TD-03: (1) land fan-out slice (persist state, write notification rows, `monitor:<id>:<seq>:<hash>` dedup); (2) delete legacy `observe` executor; (3) `check.ts` becomes the pure core inside the queued task, not a parallel path |
| Risk if never collapsed | **TOP RISK — silent watches:** checks run but alerts are never persisted (in-memory only by design); legacy `observe` and `check.ts` disagree on `price_below` parsing; no backoff means a flapping page spams once fan-out lands |

### TD-07 — `threads` table vs legacy `thread_bindings` + `conversations`

| Field | Content |
|---|---|
| Slice | `server/src/db/schema/threads.ts` (48 lines: `thread_id` PK, nullable `channel_id`, `learning_container_id`, `source`) |
| Canonical home | Superset `threads` after importers absorb legacy `thread_bindings` (`dotId`→`agent_id`) and `conversations` per 01 §6; `intelligence_channel_mappings` stays the liveness bridge |
| What was duplicated | Conversation identity exists in three places: new `threads` + two legacy tables; additive per 01 §7 (empty table, nullable superset columns) |
| Why the slice did it | W0 D1:A: mint new identity without breaking existing surfaces; direct `/bot` chat keeps no channel so `channel_id` nullable |
| Collapse plan | (1) Land importers (legacy → `threads` with `source='legacy'`); (2) cut readers to `threads`; (3) drop legacy tables in a later migration |
| Risk if never collapsed | Thread identity splits: messages attach to different parents per surface; DIYA group receipts land in the wrong thread; migration debt compounds with every new thread row |

### TD-08 — `notifications` table vs `AgentNotification` + `proactive_suggestions`

| Field | Content |
|---|---|
| Slice | `server/src/db/schema/notifications.ts` (39 lines: owner-scoped, FK-less `task_id`, `read` flag) + `0053` migration |
| Canonical home | Superset `notifications` absorbing legacy `AgentNotification` (`taskId,title,body,read`) per 01 §6; `proactive_suggestions` stays the "consider" surface vs notifications "happened" surface |
| What was duplicated | Alert row shape duplicated from legacy type; `task_id` deliberately FK-less until unified `tasks` lands (same reason as `monitors.task_id`) |
| Why the slice did it | W0 D9:A: record watch/task-done fan-out shape early without refusing every alert on a missing `tasks` table |
| Collapse plan | After TD-03: (1) add `task_id` FK to `tasks`; (2) import legacy notifications; (3) wire monitor fan-out (TD-06) as the first real writer |
| Risk if never collapsed | Orphan alerts (`task_id` pointing at tasks that never existed); two inboxes (suggestions vs notifications) with no routing rule; unread counts disagree per surface |

### TD-09 — `monitors` table vs legacy `Monitor` kind

> **PARTIALLY COLLAPSED 2026-10-28 — steps (1) and (2) landed with TD-06.** `task_id` now
> references `tasks` (nullable, `on delete set null`), and the fan-out columns
> (`consecutive_failures`, `alert_sequence`, `last_timeless_hash`) exist, so watch state and
> backoff persist across restarts. Steps (3) and (4) — importing the legacy `Monitor` kind and
> dropping it — are still owed; the legacy kind is not in this tree, so there is nothing here to
> delete, and the import belongs to the superset-importer slice alongside TD-07/TD-08.

| Field | Content |
|---|---|
| Slice | `server/src/db/schema/monitors.ts` (90 lines: `url/condition/value/intervalMinutes/status/nextCheckAt`, FK-less `task_id`) + `0054` migration |
| Canonical home | Superset `monitors` absorbing legacy `Monitor` (`taskId,url,condition,value,intervalMinutes,status,nextCheckAt`) per 01 §6; owner string → `owner_user_id` on import |
| What was duplicated | Full watch-state row duplicated from legacy kind; `task_id` FK-less until `tasks` lands; backoff/pause/quiet/dedup columns intentionally absent (travel with fan-out slice) |
| Why the slice did it | W0 D4:A + 25 M4: persist watch state while `check.ts` stays pure and fan-out stays quiet (25 R6) |
| Collapse plan | After TD-03/TD-06: (1) add `task_id` FK; (2) add backoff/pause/dedup columns with fan-out slice; (3) import legacy monitors; (4) drop legacy kind |
| Risk if never collapsed | Watches with no unified task, no alert history, and no backoff: a dead URL retries forever at full interval; legacy and new monitors diverge silently |

### TD-10 — `apps/app` Expo placeholder shell vs mobile shell + web canonical

> **RESOLVED 2026-10-28 — resolved by removal.** `apps/app/` was deleted. The real mobile app is
> `mobile/` (Expo shell under test), and the scaffold never gained an export script or a single
> live screen, so there was no behavior to collapse into it — deleting it retires the duplication
> rather than porting it. The rows below record why the scaffold existed.

| Field | Content |
|---|---|
| Slice | `apps/app/app/**` (~65 `*.tsx` TODO stubs per 03 §5, e.g. `app/(app)/(tabs)/work/routines.tsx`, `app/(app)/(tabs)/chat/[channelId].tsx`); root `_layout.tsx` wires providers, no export script |
| Canonical home | `mobile/` (Expo shell under test) + `app/src/` (Vite canonical UI until WS-01 deletes it after parity) |
| What was duplicated | Full route tree exists twice as stubs (`apps/app`) vs real screens (`app/src`, `mobile/app`); placeholder text ("Routines placeholder", "Thread placeholder") stands in for every surface |
| Why the slice did it | WS-01 first step: freeze the Expo Router tree per 03 §5 so deep links exist before any UI is ported; providers wired, screens deferred |
| Collapse plan | Per-route port from `app/src` → `apps/app` behind parity matrix (06 §4, axe zero serious, A1 reference frozen); delete Vite shell only after 100% parity (D4) |
| Risk if never collapsed | Route tree rots: stubs ship as a "mobile app" with no behavior; deep links resolve to placeholder screens; parity matrix claims coverage over empty routes |

### TD-11 — `packages/ui` static Select/Dialog/Combobox/menu shells vs Base-UI behavior

> **RESOLVED 2026-10-28 — resolved by removal.** `packages/ui/` was deleted. The shells never
> gained Base-UI behavior, and every consumer of select/dialog/combobox/menu behavior already
> lived in its canonical home (`app/src/components/ui/*`), so nothing imported the shells for
> anything but copy-paste reference. The TOP RISK below is retired with the trees.

| Field | Content |
|---|---|
| Slice | `packages/ui/src/select.tsx` (235 lines), `dialog.tsx` (181), `combobox.tsx` (354), `dropdown-menu.tsx` (339), `context-menu.tsx` (323): `data-slot` + Tailwind mirror `app/src/components/ui/*` |
| Canonical home | `app/src/components/ui/select.tsx`, `dialog.tsx`, `combobox.tsx`, `dropdown-menu.tsx`, `context-menu.tsx` (Base UI Root/Portal/Positioner, state, keyboard, focus) |
| What was duplicated | Export names, `data-slot`s, Tailwind scale intentionally mirrored so a future port is mechanical; each file header lists deliberate divergences (plain-`<div>` Root, no open/value state, static Content, native trigger buttons, `<hr>` separators, dropped `data-open` animations) |
| Why the slice did it | WS-01: dependency-light visual shells unblock layout/route work without pulling Base UI + Tabler into the new package; behavior port deferred |
| Collapse plan | Per-primitive: (1) add Base UI deps; (2) port Root/Content/trigger state + keyboard/focus + roles; (3) visual-regression against A1 reference; order: Dialog → Select → Combobox → menus |
| Risk if never collapsed | **TOP RISK — lookalike controls:** forms and menus render correctly but accept no keyboard input, trap no focus, announce no roles — axe + a11y claims fail while screenshots pass |

### TD-12 — `packages/ui` Composer + MessageScroller static shells vs chat behavior

> **RESOLVED 2026-10-28 — resolved by removal.** `packages/ui/` was deleted (same decision as
> TD-11). Chat behavior lives only in its canonical homes (`app/src/components/channels/composer/`
> and `app/src/components/ui/message-scroller.tsx`); the stubbed mirrors are gone instead of
> ported.

| Field | Content |
|---|---|
| Slice | `packages/ui/src/composer.tsx` (329 lines), `packages/ui/src/message-scroller.tsx` (234 lines): same `data-slot` mirror of `app/src/components/channels/composer/composer.tsx` and `app/src/components/ui/message-scroller.tsx` |
| Canonical home | App Composer (PromptArea segments, mentions/commands, attachments, dictation, queue, voice-call swap) + app MessageScroller (`@shadcn/react/message-scroller` context, auto-scroll, anchoring, virtualizer) |
| What was duplicated | Full prop API mirrored but behavior stubbed: Composer native `<textarea>` (no segments/auto-grow, `onSubmit` plain text not `ComposerDraft`, decorative attach/mic, no queue); Scroller props reflected as `data-*` only (no auto-scroll/anchoring/virtualizer, `active` explicit, hooks are no-op stubs) |
| Why the slice did it | Same WS-01 call as TD-11: unblock chat layout without `@copilotkit/react-core`, prompt-area, or scroller runtime; call sites typecheck before the behavior port |
| Collapse plan | After TD-11: (1) port Composer segments/mentions/attachments/queue/voice against AG-UI stream; (2) port scroller runtime (context, anchoring, virtualizer, visibility machine); (3) journey test: send/stop/replay in Expo web export |
| Risk if never collapsed | Chat looks complete but drops attachments, mentions, and mid-turn sends; scroll position jumps on prepend; hooks returning `false` hide real unread/scroll state from every caller |

## Verification notes

- `server/src/plugins/ws10-slice.ts`, `ws11-slice.ts` vs `store.ts` + `tools.ts`: headers name the mirrored shapes explicitly.
- `server/src/work/tasks.ts` header disclaims leases/retries/fatigue (slice 2 on `queue.ts`); `server/src/routines/produce.ts` + `server/src/proactive/accept.ts` both import `TaskLedger` from it.
- `server/src/monitors/check.ts` + `server/src/db/schema/monitors.ts` headers both cite 25 M4/R6 quiet fan-out; `server/src/db/schema/notifications.ts` + `threads.ts` cite W0 D1/D4/D9 additive-table rule.
- `apps/app/app/**`: 65 placeholder screens verified via content search; `packages/ui/src/`: five menu/select shells + composer + scroller headers each enumerate divergences from `app/src`. (Both trees were deleted 2026-10-28; this note is the on-disk evidence as it stood.)
