# 24 — Phase 6 Finance Inventory (PLAN §6 Finance → WS-13)

> **Status: RESEARCH ONLY — no product code modified.**
> PLAN §6 ship row: "CSV import, categorized spending summary, savings-goal action (OpenMuse)".
> Execution home: `09` WS-13 (size S, W4, off-critical-path) → port in Phase 6 per PLAN §8 ph.6.
> Sources: `_sources/OpenMuse` (finance grep + full reads below); ORBO `server/src`, `app/src`,
> `app/src/routes`, docs `01/02/03/05/06/07/08/09/22`. ORBO greps excluded
> `node_modules/_sources/target/dist`. Line refs verified 2026-10-14.

---

## 1) OpenMuse finance file inventory

Finance is a **task kind + artifact kind**, not a standalone entity. No dedicated
`/finance` route exists anywhere; CSV rides `POST /tasks` with `kind: "finance"`.

| # | Path (exact) | Role in finance flow |
|---|---|---|
| F-01 | `_sources/OpenMuse/apps/server/src/engine/finance.ts` (100 lines) | Sole import/summary logic: `analyzeSpending(csv)` — BOM strip, hand-rolled quoted-CSV parser, header/row validation, cents-exact math, per-category grouping |
| F-02 | `_sources/OpenMuse/apps/server/src/engine/service.ts:36,218-220,865-889` | `:36` imports `analyzeSpending`; `:218-220` finance plan titles (`Validate transactions / Calculate the summary / Save your tracker`); `:865-889` worker branch: `z.string().parse(task.input.csv)` → artifact `kind:"finance"`, title `Spending tracker`, evidence `Your transaction CSV` |
| F-03 | `_sources/OpenMuse/packages/domain/src/agent.ts:30,104,138,161-166` | `:30` `AgentTask.kind` includes `"finance"`; `:104` `AgentArtifact.kind` includes `"finance"`; `:138` `createTaskSchema` accepts `kind:"finance"`; `:161-166` `goalInputSchema` (savings-goal writer) |
| F-04 | `_sources/OpenMuse/apps/server/src/engine/routes.ts:32-46,60-77` | Finance transport: `POST /tasks` (+`/tasks/:id`, `/control`, `/input`) carries `kind:"finance"`; `POST /goals`, `/goals/:id`, `/goals/:id/milestones/:milestoneId` carry the savings goal. **No `/finance` endpoint.** |
| F-05 | `_sources/OpenMuse/apps/server/src/engine/conversation.ts:336,389,471` | `:336` `delegate_task` tool routes `finance`→imported-CSV jobs; `:389` system prompt: only imported CSV supported, no other finance connectors; `:471` empty-state suggestion ("organize your spending") |
| F-06 | `_sources/OpenMuse/apps/server/src/engine/model.ts:26` | Finance (with document/monitor) runs **without a configured model** — guided workflow, unlike `agent`/`plan` kinds |
| F-07 | `_sources/OpenMuse/apps/mobile/src/agent-ui.tsx:640,698-886` | `:640` `ArtifactCard` dispatches `kind==="finance"` → `FinanceArtifact`; `:698-886` summary card: Income/Spending/Remaining tiles, category bars (width vs `spending`), transaction list (first 100), period + source-currency notes |
| F-08 | `_sources/OpenMuse/apps/mobile/src/agent-ui.tsx:902-1029,1288` | CSV entry: `DelegateSheet` `kind:"finance"` shows `Transaction CSV` multiline field + `Try example transactions` (sample mode) + convention note; positive=expense, negative=income. `:1288` Goals screen `Finances` category (`CircleDollarSign`) |
| F-09 | `_sources/OpenMuse/apps/mobile/src/agent-ui.tsx:706-722,838-858` | Savings-goal action: `POST /goals` with `category:"Finances"`, `description:"Inspired by <artifact>"`, fixed milestones `["Choose a savings target","Review spending each week"]`; success → "saved in Goals" |
| F-10 | `_sources/OpenMuse/apps/mobile/src/threads.tsx:301-309` | Entry point: `Delegate task` link row ("A plan, document, or spending summary") opens the delegate sheet |
| F-11 | `_sources/OpenMuse/tests/finance.test.ts` (43 lines) | Quoting/BOM: rejects `"10"0`/`""10`/`"10".00`/`"10" `, multiline quoted fields, `Uncategorized` default, BOM-tolerant headers |
| F-12 | `_sources/OpenMuse/tests/finance-headers.test.ts` (40 lines) | Header rules: duplicate required column rejected (post-normalization), reordered/extra columns accepted, duplicate *irrelevant* columns accepted |
| F-13 | `_sources/OpenMuse/tests/engine.test.ts:138-151` | Exactness: `spending 30.3 / saved 969.7`, cents-exact categories; rejects bad ISO date (`2026-02-31`), 3-decimal amounts |
| F-14 | `_sources/OpenMuse/tests/workflows.test.ts:377-421,423-470,472-499` | Goal linkage: milestone-linked finance task succeeds + preserves manual milestone order; invalid-CSV finance task fails **without** completing milestones; result survives DB restart |
| F-15 | `_sources/OpenMuse/tests/agent-api.test.ts:365-404` | API rules: milestone membership validated (422/404), idempotent `requestId` dedupe, paused-goal tasks start `paused` |
| F-16 | `_sources/OpenMuse/apps/mobile/src/agent-ui.tsx:997-1007` | Sample-mode fixture: `Try example transactions` fills a 4-row CSV (salary −4200 / groceries / subscription / coffee) — reuse as the WS-13 slice-1 demo input |
| F-17 | `_sources/OpenMuse/apps/server/src/engine/service.ts:138-156,733-751` | Snapshot lists `tasks/goals/monitors/ideas/memories/artifacts/notifications/identity` together (`:138-156`); `artifact()` helper (`:733-751`) persists to `agent-artifacts` — finance needs no new store, just the `finance` kind value |

---

## 2) Server / API + data inventory

### 2a) `analyzeSpending` report shape (F-01 `:83-99`)

| Field | Semantics |
|---|---|
| `income` / `spending` / `saved` | Cents-exact floats; expenses positive, income negative; `saved = income − expenses` |
| `count` | Transaction rows (1–5,000 enforced) |
| `categories` | Expense-only groups, desc-sorted `{name, amount}`; empty category → `Uncategorized` |
| `transactions` | `{id: row-<n>, date, description, amount, category}` (internal `cents` stripped) |
| `period` | `{from, to}` min/max ISO date |
| `amountConvention` | "Positive expenses; negative income… no currency conversion" |

### 2b) Validation rules (all inside F-01; errors thrown, caught as task failure)

| Rule | Limit |
|---|---|
| Input cap / row count | ≤500 KB string; 1–5,000 rows |
| Headers | Must include `date,description,amount,category` (case/space-tolerant, any order, extras OK); duplicate *required* column rejected |
| Row shape | Exact column count; ISO date (`z.iso.date()`); amount `/^[-+]?\d+(\.\d{1,2})?$/`; cents safe-integer, `|cents| ≤ 1e12` |
| CSV grammar | RFC-style quotes (`""` escape), unclosed-quote and trailing-chars-after-quote rejected; `row-<line>` ids in errors |

### 2c) Task/goal wiring (no finance table — rides `tasks` + `agent-artifacts` + `goals`)

| Step | Mechanism |
|---|---|
| Create | `POST /tasks {prompt, kind:"finance", goalId?, milestoneId?, input:{csv}}` (F-04); plan = 3 fixed steps (F-02) |
| Run | Worker branch (F-02 `:865-889`) → `agent-artifacts` row `kind:"finance"`, summary `"<count> transactions · <spending> spent"` |
| Goal | Optional `goalId/milestoneId`; success completes milestone, failure/cancel never does (F-14); in-app `POST /goals` category `Finances` (F-09) |
| Model-free | Guided branch needs no LLM (F-06); invalid CSV → `failed`, surfaced with retry |

---

## 3) ORBO gap analysis — no finance home (confirmed)

| Area | Evidence | Gap |
|---|---|---|
| `server/src` | `work/` = only `culler.ts,loop.ts,queue.ts`; `responsibilities/` = 13 files (bindings/engine/routes/store/tools/triggers/…) with **no** finance/import/summary module; `finance\|csv\|spending\|savings` grep hits are incidental only (`suspending`, `.csv`-as-`text/csv` mime note, `spending a consent`) | No `analyzeSpending` equivalent, no `finance` task kind, no CSV-import path |
| `app/src` | 60 route files under `app/src/routes` (`responsibilities.tsx`, `routines.tsx`, …) — **zero** finance routes; `finance\|spending\|savings` grep hits are unrelated (`august.csv` placeholder prose, `spending money` approval copy, `.csv` attachment extension) | No import screen, no summary card, no goal action |
| Schema (`01`) | `tasks` superset + new `goals/ideas/artifacts/activity/notifications` tables planned; finance has no table (correct — rides tasks+artifacts) | `tasks.kind`/`artifacts.kind` enums need a finance value at port time |
| Routes (`03` §5) | Finance "folds into Work/Activity artifacts"; `(tabs)/work` is the named home, but **no finance route drawn** | Import UI + summary placement uncommitted |
| Design (`07` §2.9 F1) | Finance TBD/pending C24, uncounted in the 58-screen total; same `PageShell/PageRows/Item` pattern *when placed* | No visual spec beyond E/L/X/S row |
| Subsystems (`08` §7.7) | "Finance behaviors have no dedicated merge section… assumed tracked under Documents pipeline + agent producers; needs owner confirmation" | Merge owner unconfirmed |
| Tests (`06`) | Port `finance*.test.ts` (`node:test`→`bun:test`); screen home undecided so **no e2e path named** | Logic portable now; UI tests blocked on home |
| Execution (`09` WS-13) | S-size, W4, deps WS-01+WS-09, dirs `apps/server/src/work/ + **work** + integrations`; first slice = CSV→summary table, goal action deferred; off-critical-path | Scheduled but unstarted |
| Parity (`05`) | Finance = "CSV import, categorized summary, savings-goal action (F1 picker on native)"; R9 `screenPickedFiles()` is `File[]`-based, RN yields URIs | Per-platform picker gap is the one named native risk |
| Phase 5 (`22`) | No WS-13/finance mention (only goals-in-general via responsibilities/DIYA) | Phase 5 did not cover finance — clean Phase 6 start |
| API (`02` §5) | ORBO canonical: `/api/responsibilities` + triggers; OpenMuse `/api/agent/{tasks,goals,monitors,ideas}` maps with goals→responsibilities (`02`:200,276,321); no finance endpoints on either side | Finance arrives through the task-creation endpoint, not a new route family |
| Components (`04`) | Component inventory names OpenMuse `ArtifactCard`/`DelegateSheet`/goals screens as port sources (`04`:122); `packages/ui` convergence is pending C25 (`05` R6) | Finance card has named source components but no target primitive yet |

---

## 4) Merge plan (recommended homes)

| OpenMuse behavior | Recommended ORBO home | Notes / decision |
|---|---|---|
| CSV import (paste/pick → `input.csv`) | **Work task kind** (extend unified `tasks.kind`), entry via Work + chat delegate sheet — **not** a standalone entity | Matches F-02/F-04/F-06 (guided, model-free, receipted) and `09` WS-13 dirs; standalone table/route would duplicate the task lifecycle |
| Categorized summary (income/spending/saved + bars + transactions) | **Work Activity artifact component** (`ArtifactCard`-equivalent under `(tabs)/work`); dedicated `work/finance` route only if C24 grants one | Renders `PageShell/PageRows/Item` per `07` §2.9 when placed; first-100 + totals-cover-all-rows behavior preserved |
| Savings-goal action (`POST /goals` category `Finances`) | **`responsibilities` row** (goals→responsibilities per `02` §5, WS-09) with `Finances` category + the two fixed milestones | Keeps one goals model; milestone-completion semantics from F-14 reused |
| `analyzeSpending` + validation | `apps/server/src/work/` pure function + `server/tests/finance*.test.ts` (`bun:test`, restorable `spyOn` per `06` gap #4) | Pure logic, zero deps beyond `zod` — portable before any UI decision |
| Delegate-sheet CSV field + example rows | Work creation form + chat inline card (per `03` "Finance cards fold into Work/Activity") | Picker must be per-platform (see R1 below) |
| Order | WS-09 (tasks/responsibilities) → WS-13 slice 1 (CSV→summary) → slice 2 (goal action), per `09` §4 | Goal action explicitly deferred to slice 2 |

### Test-port map (per `06` tier rule: logic → `server/tests`, surfaces → `app/tests`)

| OpenMuse test | ORBO target | Note |
|---|---|---|
| `tests/finance.test.ts` + `tests/finance-headers.test.ts` | `server/tests/finance*.test.ts` (`bun:test`) | Pure `analyzeSpending`, no harness; port verbatim (F-11–F-12) |
| `tests/engine.test.ts:138-151` | Same `server/tests` file | Exactness assertions (F-13) |
| `tests/workflows.test.ts:377-499` finance parts | `server/tests` work/goal suite | Needs task+goal store harness; milestone-preservation semantics (F-14) |
| `tests/agent-api.test.ts:365-404` | `server/tests` API suite | Membership/dedupe/paused rules (F-15) |
| `FinanceArtifact` render (F-07) | `app/tests` | Blocked on C24 home — no e2e path named yet (`06` assumption) |

---

## 5) Risks

| # | Risk | Why | Mitigation (source) |
|---|---|---|---|
| R1 | **Per-platform picker** (the `05` F1 risk) | `screenPickedFiles()` takes DOM `File[]`; RN yields URIs+mime, size possibly unknown pre-upload (`05` R9) | Abstract picker per platform behind one contract; enforce 500 KB / 5,000-row reject-before-parse on all platforms |
| R2 | **No screen home (C24)** | `07` V11: import/summary/goal has nowhere to land; `06` ports tests blind; `08` names no merge section | Owner confirms Work-vs-standalone home in Phase 6 kickoff before UI work; server logic proceeds regardless |
| R3 | **Scope creep: bank connectors** | System prompt explicitly disclaims non-Google connectors (F-05); parity row is import-only | Reject connector requests; keep `amountConvention` (source currency, no conversion) verbatim in UI |
| R4 | **Cents/validation parity** | Float-grouped money + strict CSV grammar; lax reimplementation silently misstates spending | Port F-11–F-13 tests verbatim (`bun:test`); keep `row-<n>` error ids and exact-2dp rule |
| R5 | **Mobile budget + backgrounding** | 500 KB parse + 5,000-row summaries on native; worker continues when app closes (F-05) | Parse server-side only; native sends URI/upload, never the full string; rely on durable task + receipt, not foreground parsing |

---

## 6) Open questions for Phase 6 kickoff (owner / C24)

| # | Question | Options / default |
|---|---|---|
| Q1 | Screen home: Work artifact vs standalone route? | Default **Work** (`03` §5, `09` WS-13 dirs); standalone only if C24 route tree grants `work/finance` |
| Q2 | `tasks.kind` value: literal `"finance"` or Work-subtype? | Decided with WS-09 unification; literal is the cheapest faithful port (F-03) |
| Q3 | Picker contract per platform (`05` F1/R9) | One contract: web `File[]`, native URI+upload; reject-before-parse limits enforced identically |
| Q4 | Savings-goal milestones fixed or editable? | OpenMuse fixes two milestones (F-09); keep fixed for slice 2 unless owner asks otherwise |

*© Opraiz Technology Pvt Ltd · Developer: Narein Rao*
