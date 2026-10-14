# 25 — Phase 6 Goals/Activity/Ideas Inventory (PLAN.md §8.6 / §6 Work)

> **Status: RESEARCH ONLY — no product code modified.**
> Phase 6 kickoff per PLAN.md §8 item 6 (port OpenMuse screens) + §6 "Work" rows.
> Read-only sources: `_sources/OpenMuse/` (client + server + tests),
> `server/src/{responsibilities,routines,proactive,work,activity}/`,
> `docs/planning/{01-schema-unification,02-api-surface,08-subsystem-unification,09-execution-plan}.md`
> (§6 Routines/Tasks, tasks/runs rows, routines API rows, WS-09/R5).
> Path convention: OpenMuse paths are `_sources/OpenMuse/`-relative; ORBO paths are repo-relative.
> Line counts verified at read time; "role" is the file's job in this area only.

## 1. OpenMuse file inventory

### 1.1 Goals — tracking/milestones, watches, alerts, backoff

| # | File | Role in Goals |
|---|---|---|
| G1 | `packages/domain/src/agent.ts` (166 ln) | `Goal`, `Monitor`, `Evidence` types; `goalInputSchema`, `monitorInputSchema` (change/contains/price_below, interval 1–10080 min) |
| G2 | `apps/server/src/engine/service.ts` (1199 ln) | `createGoal`/`updateGoal`/`setMilestoneDone` (pause fans out to tasks); `createMonitor`/`activateMonitor`/`controlMonitor`; `observe` (baseline, quiet rule, alert keys); `matchesPrice`; monitor failure backoff + 5-strike auto-pause |
| G3 | `apps/server/src/engine/routes.ts` (168 ln) | `POST /goals`, `POST /goals/:id`, `POST /goals/:id/milestones/:milestoneId`, `POST /monitors`, `POST /monitors/:id/control` (all under `/api/agent`) |
| G4 | `apps/server/src/engine/page-diff.ts` | Watch differ: `pageLines`, `withoutRelativeTimes`, `diffPage`, `describePageDiff`, `countPageDiff` — basis of change alerts |
| G5 | `apps/server/src/app.ts` | Mounts `/api/agent` (:159); `POST /api/agent/sample-page` fixture; sample-mode `refreshIdeas` (:119) |
| G6 | `apps/mobile/src/agent-ui.tsx` (1939 ln) | `GoalsScreen`, `GoalCard` (milestone toggle, pause/resume, plan-from-goal), `MonitorForm`, `MonitorCard` (pause/resume/stop/check-now) |
| G7 | `tests/agent-api.test.ts` (590 ln) | Goal validation, milestone completion, goal-pause pauses its task, concurrent milestone completion |
| G8 | `tests/monitor-price-spacing.test.ts` (49 ln) | Price-threshold matching spacing/currency-format cases |
| G9 | `tests/monitor-recovery.test.ts` (830 ln) | Watch recovery: failure streaks, backoff schedule, auto-pause, resume resets |
| G10 | `tests/workflows.test.ts` (555 ln) | End-to-end goal/monitor/idea journey incl. `maintain()` reconciliation |

### 1.2 Activity — durable task plans, progress, input, control, receipts, leases

| # | File | Role in Activity |
|---|---|---|
| A1 | `packages/domain/src/agent.ts` | `TaskStatus` (9 states), `TaskStep`, `AgentTask` (plan/evidence/input/state/leaseId/leaseUntil/attempts), `RunEvent` |
| A2 | `packages/domain/src/index.ts` (208 ln) | `ActionProposal` (review state machine), `ActivityEntry` (client inbox row) |
| A3 | `apps/server/src/engine/service.ts` | `snapshot`/`detail`/`createTask` (idempotent, 20-open-task cap, goal-pause inheritance), `control` (pause/resume/cancel/retry), `answer` (input+fields), `prepare`/`execute`/`finish`/`publishOutcome`, `artifact`, `notify` |
| A4 | `apps/server/src/engine/worker.ts` (257 ln) | `TaskWorker`: CAS claim, `leaseMs` 60s default, heartbeat renewal at lease/3, `guard`/`checkpoint`/`event`, `LostLeaseError`, `runs` ledger, 3-task in-flight cap |
| A5 | `apps/server/src/engine/model.ts` | `executeModelTask` — model-backed `agent`-kind task execution |
| A6 | `apps/server/src/engine/routes.ts` | `POST /tasks`, `GET /tasks/:id`, `POST /tasks/:id/control`, `POST /tasks/:id/input` |
| A7 | `apps/server/src/actions.ts` | `ActionService`: propose/decide, 30-min expiry, idempotency-key ids, hash re-check (409 on change) |
| A8 | `apps/server/src/app.ts` | `POST /api/actions`, `POST /api/actions/:id/decide` (:176–187) |
| A9 | `apps/server/src/db.ts` | `Store`: `put`/`compareAndSwap`/`insertIfAbsent`/`scan`/`listByStatus` — every mutation is owner-scoped CAS |
| A10 | `apps/server/src/worker-entry.ts` | Separate worker process entry (PGlite cannot cross processes; pg for multi-process) |
| A11 | `apps/mobile/src/agent-ui.tsx` | `AgentActivityScreen`, `TaskCard`, `ArtifactCard` — plans, progress, input prompts, receipts |
| A12 | `apps/mobile/src/screens.tsx` (:1069) | `ActivityScreen` — actions inbox with all/review filter |
| A13 | `apps/mobile/src/agent-workspace.tsx` (98 ln) | `AgentWorkspaceProvider` — snapshot context, `mutate`/`delegate` client |
| A14 | `tests/engine.test.ts` (244 ln) | Worker claim/lease unit behavior |
| A15 | `tests/{persistence,prepare-lease-loss,step-limit,model-outcome}.test.ts` | Restart recovery, lease-loss prepare path, step caps, outcome publication |

### 1.3 Ideas — evidence-backed suggestions, edit/accept/dismiss

| # | File | Role in Ideas |
|---|---|---|
| I1 | `packages/domain/src/agent.ts` | `Idea` (title/reason/evidence/prompt/kind/input, new/dismissed/accepted) reusing `Evidence` |
| I2 | `apps/server/src/engine/service.ts` | `refreshIdeas` (document/coordination/plan rules; sent+completed retirement; CAS-safe), `decideIdea` (accept creates goal+task with dedupe, reuses handling task; dismiss), `mailEvidence` |
| I3 | `apps/server/src/engine/routes.ts` | `POST /ideas/refresh`, `POST /ideas/:id` (accept/dismiss + optional prompt edit) |
| I4 | `apps/mobile/src/agent-ui.tsx` | `IdeasScreen` (new-only list, Find-ideas refresh), `IdeaCard` (evidence view, edit-prompt accept/dismiss) |
| I5 | `tests/agent-api.test.ts` | Dismissal survives refresh; concurrent acceptance yields exactly one goal + one task |

**Area counts:** Goals 10 files · Activity 15 files · Ideas 5 files (30 rows; `service.ts`/`routes.ts`/`agent.ts`/`agent-ui.tsx` span areas).

## 2. ORBO counterpart inventory

| # | File | Counterpart role |
|---|---|---|
| O1 | `server/src/routines/routes.ts` (213 ln) | Routines page: list, run-now, enable/disable, delete — deliberately no create/edit (conversational via `plugins/builtin-routines.ts`) |
| O2 | `server/src/routines/store.ts` (1005 ln) | Cron routines: `MAX_ENABLED_ROUTINES=20`, timezone `next_run_at`, manual-run start |
| O3 | `server/src/routines/runner.ts` (260 ln) | Headless firing turn; **fatigue rule** (consecutive-failure count in `routine_runs`, distinct from per-firing attempts) |
| O4 | `server/src/routines/{schedule,sweep,run-turn}.ts` | Cron math + `MINIMUM_INTERVAL_MS`; due-sweep; turn execution |
| O5 | `server/src/responsibilities/routes.ts` (332 ln) | **"User-owned goals"** — CRUD, runs, progress, actions; trigger + GitHub/Slack/email bindings |
| O6 | `server/src/responsibilities/{store,engine}.ts` (478/176 ln) | Goal persistence; dispatch with 15-min leases via work queue |
| O7 | `server/src/responsibilities/triggers.ts` (674 ln) | Trigger kinds/config/secrets — the recurring-watch analogue for provider events |
| O8 | `server/src/proactive/routes.ts` (97 ln) | `/api/proactive`: settings + suggestions lifecycle endpoints |
| O9 | `server/src/proactive/{engine,store,types}.ts` (468/255/118 ln) | Background-research turns; suggestion status open/dismissed/started; 60–1440 min cadence, ≤5 suggestions/≤10 memories per run |
| O10 | `server/src/proactive/restriction.ts` + `private-share.ts` | Read-only initiator narrowing; private-share scoping |
| O11 | `server/src/work/queue.ts` (424 ln) | **DB-clock** SQL lease queue (`SELECT … FOR UPDATE SKIP LOCKED`); attempts bound per firing |
| O12 | `server/src/work/{loop,culler}.ts` (64/229 ln) | Run-after-each scheduler; idle-computer suspension via audit trail |
| O13 | `server/src/activity/activity.ts` (561 ln) | Read-only Activity aggregator: reads routine/responsibility runs, hops, approvals, questions — **never a second ledger** |
| O14 | `server/src/db/schema/` (`coworker,lifecycle,responsibilities,proactive,work`) | `routines`/`routine_runs`/`routine_sweeps`; `responsibilities`/`responsibility_{events,runs,triggers}`; `proactive_{settings,suggestions}`; `work_items` |

Design anchors (read-only): 01 §5 unifies to new `tasks`/`task_runs`/`task_events` + `monitors`, with ORBO
schedulers kept as **producers** in step 1; 02 canonical table maps `/api/routines` ← OpenMuse
`/api/agent/tasks`, `/api/responsibilities` ← `/api/agent/{goals,monitors,ideas}`, `/api/proactive` ← none;
08 §6 prescribes goals→responsibilities, ideas→proactive; 09 WS-09/R5 defer scheduler collapse until
fatigue + lease-expiry parity tests prove out.

### 2.1 API cross-reference (02-verified rows; ORBO canonical → upstream)

| ORBO canonical | OpenMuse (`/api/agent`, `engine/routes.ts`) | OpenDots (`app.ts`) |
|---|---|---|
| `GET /api/routines`, `/:id/runs` (`routines/routes.ts:94,73`) | `POST /tasks` (:32), `GET /tasks/:id` (:38) | `POST /api/tasks` (:110), `GET /api/tasks/:id` (:157) |
| `POST /api/routines/:id/run` (`routes.ts:50`) | `POST /tasks/:id/control` (:41) | `POST /api/tasks/:id/actions` (:161) |
| `PUT/DELETE /api/routines/:id/enabled`, `/:id` (:105,126) | `POST /tasks/:id/input` (:47) | `PUT /api/tasks/:id/schedule` (:173) |
| `POST /internal/routines/run` (S, `app.ts:1167`) | — (in-process `TaskWorker.tick`) | — |
| `GET/POST /api/proactive/settings`, `/suggestions` | `POST /ideas/refresh`, `POST /ideas/:id` (:87,88) | settings only |
| `/api/proactive/suggestions/:id/{start,dismiss}` | `decideIdea` accept/dismiss | — |
| `GET/POST /api/responsibilities/` (+`:id/runs`, `:id/run`, `:id/progress`) | `POST /goals`, `/goals/:id`, `/goals/:id/milestones/:milestoneId` (:60,63,67) | — |
| `/api/responsibilities/:id/triggers` + github bindings | `POST /monitors`, `/monitors/:id/control` (:78,81) | — |
| nearest: `GET /api/proactive/suggestions` (02 risk #11) | `GET /api/agent/notifications` | — |

## 3. Overlap/gap analysis (map = near-direct move · transform = reshape · new = no counterpart)

### 3.1 Goals

| Capability | ORBO home | Verdict |
|---|---|---|
| Goal CRUD + active/paused/completed | `responsibilities/` ("User-owned goals") | **transform** — milestones have no column; fold into `success_criteria`/plan shape |
| Goal-pause fans out to live tasks | responsibility dispatch/cancel paths | **transform** — reimplement fan-out, keep exactly-once CAS |
| Watches (url/condition/interval/status) | none (01 §5 `monitors` is new) | **new table** — port `Monitor` + `controlMonitor` race discipline verbatim |
| Page observe + diff/quiet/dedup alerts | research/browser task kind (08 §2) | **transform** — `observe` becomes an executor; keep timelessHash quiet rule + `monitor:${id}:${seq}:${hash}` keys |
| Exponential backoff + 5-strike auto-pause | fatigue rule (per-routine, consecutive) | **transform** — keep BOTH counters; never merge (runner.ts conflation warning) |
| Change notifications | none — 02 risk #11 (no notifications resource) | **new** — needs a home before watch alerts can land |

### 3.2 Activity

| Capability | ORBO home | Verdict |
|---|---|---|
| Task CRUD + pause/resume/cancel/retry + input | unified `tasks` + routines/responsibility producers | **transform** — OpenMuse statuses onto unified status; keep 20-open cap + goal-pause inheritance as rules |
| plan[]/evidence[]/progress/events | `tasks` jsonb + `task_events` (01 §5) | **map** — direct column move, ISO→timestamptz |
| Run receipts + action review receipts | `task_runs` + `approval_receipts` (08 §4) | **map** — worker `runs` ledger and `ActionService` outcomes slot in |
| SQL leases + heartbeat + recovery | `work_items` + `queue.ts` | **transform** — adopt DB-clock SQL leases; drop app-clock `leaseUntil` math |
| Approval-gated tasks (`waiting_approval`) | `server/src/approvals/` rule engine | **map** — `awaiting_review→executing→…` onto consume-once + unknown-outcome path |
| Read-only activity feed | `activity.ts` aggregator | **transform** — run-events become a read source, not a second inbox |

### 3.3 Ideas

| Capability | ORBO home | Verdict |
|---|---|---|
| Suggestion lifecycle (new/dismissed/accepted) | `proactive_suggestions` (open/dismissed/started) | **map** — status vocabulary aligns; `started` = accepted+task-linked |
| Accept → creates goal + task (deduped, race-safe) | none — producers don't mint linked work today | **transform** — acceptance must enqueue unified `tasks` + link `run_id` |
| Prompt edit on accept | suggestion detail patch | **map** — small extension of existing patch path |
| Deterministic rules producers (doc/coordination/plan) | proactive model-turn producers | **transform** — keep rules as a cheap deterministic producer alongside turns |
| Sent/completed retirement + evidence links | `source_ref`/memory evidence | **map** — retirement predicates port as producer filters |

## 4. Merge plan per area (all behind 01 §9 blockers: threads identity, spaces ownership)

| Step | Area | Action | Proves |
|---|---|---|---|
| M1 | Activity | Land unified `tasks`/`task_runs`/`task_events` empty; port `AgentTask`→`tasks` mapping (ISO→timestamptz) | Ported `agent-api` task/control/input cases green |
| M2 | Activity | Reimplement worker claim on `work_items` with DB-clock leases; keep `guard`/`checkpoint`/`event` shape | `prepare-lease-loss` + lease-expiry interruption tests green (09 R5) |
| M3 | Activity | Map review linkage onto approvals (`executing`/`outcome_unknown` paths, 30-min expiry) | Single-execution + decline-persistence across sources (08 §4) |
| M4 | Goals | Land new `monitors` (+`monitor-pages` baseline); port `createMonitor`/`controlMonitor`/`observe` + page-diff | Ported `monitor-recovery` + price-spacing suites green |
| M5 | Goals | Fold goal headers→`responsibilities`, milestones→plan criteria; reimplement pause fan-out | Goal-pause-pauses-tasks test green; no orphaned routine links |
| M6 | Goals | Resolve notifications home (02 risk #11), then land alert fan-out with dedup keys | Double-fire watch emits exactly one alert |
| M7 | Ideas | Port rules producers + retirement filters as a proactive producer; map accept/dismiss/edit onto suggestions | Dismissal-survives-refresh + concurrent-accept-once tests green |
| M8 | All | Adapters: OpenMuse `/api/agent/{tasks,goals,monitors,ideas}` → canonical routes for one release, then delete | 02 §6 alias discipline; origin sweep clean |

### 4.1 Ported test suites (OpenMuse `tests/` → ORBO `server/tests/`)

| OpenMuse suite | Lands as | Carries |
|---|---|---|
| `agent-api.test.ts` (task/control/input + goal + idea races) | `routine-*` / `work-*` / `responsibilit*` | 20-open cap, pause fan-out, concurrent-accept-once, dismissal-survives-refresh |
| `engine.test.ts` (worker claim/lease unit) | `work-*` queue unit | Single-claim, heartbeat renewal, expired-lease recovery |
| `workflows.test.ts` (`maintain()` journey) | slice smoke test | Goal→task→monitor→idea round-trip incl. reconciliation |
| `monitor-recovery.test.ts` | monitor suite | Backoff schedule, 5-strike auto-pause, resume reset |
| `monitor-price-spacing.test.ts` | monitor suite | Price-threshold matching cases |
| `persistence` + `prepare-lease-loss` + `step-limit` + `model-outcome` | `work-*` / runner suites | Restart recovery, lease-loss prepare path, step caps, outcome publication |

## 5. Risks (scheduler semantics, lease/fatigue per 09 R5)

| # | Risk | Why it bites | Mitigation |
|---|---|---|---|
| R1 | Four ORBO schedulers + OpenMuse `nextRunAt`/monitor loop collapse too early | Loses cron-tz, fatigue, interval semantics (09 R5, 08 §6) | Producers-enqueue-`tasks` in step 1; unify orchestration only after parity tests |
| R2 | Lease-clock mismatch (app-clock ISO + heartbeat vs DB-clock SQL) | Skewed node writes stillborn leases; double execution (`queue.ts` header) | All lease moments in SQL; ported tests assert single-claim under skew |
| R3 | Three failure counters conflated (queue attempts vs routine fatigue vs monitor streak) | Broken routine spams channel or retries forever (runner.ts header) | Keep all three; document which answers which question |
| R4 | Monitor quiet/dedup subtlety (timelessHash, alertSequence keys, baseline-ahead races) | Naive port double-alerts or swallows real changes | Port `observe` + page-diff as a unit with its tests, not piecemeal |
| R5 | CAS-race discipline lost in translation (resume marking, goal-pause fan-out, accept-once) | Duplicate tasks/goals, resurrected watches | Preserve `compareAndSwap` expected-value patterns row-for-row in SQL |
| R6 | Notifications homelessness (02 risk #11) blocks watch alerts + task-done fan-out | Alerts with nowhere to land get dropped or re-invented per area | Decide notifications home in W0 before M6 |
| R7 | Single-owner OpenMuse rows vs `owner_user_id` scoping | Cross-owner reads on import | Tag `provenance` on import; enforce owner narrowing like `activity.ts` |

*Merge verdicts: Goals — **transform** (split: headers→responsibilities, watches→new monitors); Activity — **transform** (tasks→unified tables, leases→DB-clock queue); Ideas — **map** (onto proactive suggestions, acceptance-link as small transform).*
