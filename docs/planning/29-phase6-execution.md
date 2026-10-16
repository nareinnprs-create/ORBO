# 29 — Phase 6 Execution (PLAN §8.6: port OpenMuse screens into unified IA)

> **Status: DRAFT pending reconciliation — research + planning only, no product code modified.**
> `27-phase6-app-inventory.md` + `28-phase6-gmail-calendar-inventory.md` have since landed
> (on disk 2026-10-14 — the "absent" notes in §§2–5/N8/footer below are corrected in place);
> this doc otherwise treats all other `docs/planning/` files as read-only snapshots taken 2026-10-14.
> Reconcile against their FINAL versions before cutting Phase 6 work orders.
> **Reconciliation 2026-10-16:** landed since draft — 27/28 inventories; `packages/ui` 34/34 canonical primitives (`packages/ui/src/` holds 36 component files incl. extras + tokens, verified on disk); `apps/app` Expo placeholder shell (QueryClientProvider + ThemeContext ThemeProvider in root `_layout.tsx`; `eas.json` present; A1 Agents-list screen landed); DIYA `diya` seed row in `examples/orbo/agents.yaml` + `permitted_agents` wiring in `examples/orbo/channels.yaml` + diya-first rule LANDED; coverage tripwire + floors in `scripts/test-ci.ts`.
> W0 decisions DECIDED per freehand directive (reversible): D1:A D2:A D3:A D4:A D9:A D10:A D12:A D14:A (plus D5:A D6:A D7:A D8:B D11:A D13:A D16:A U1:B). Truly still gated: accounts/domain/certs/legal sign-off, R1 assembly, R2, store submissions, EAS builds.
> Wave-1 (verified on disk): `threads` + `notifications` tables + `0053` migration plus `monitors` table + `0054` migration exist; `roleDescription` 2000 end-to-end — form (`app/src/lib/agents/form.ts`) + server parser (`server/src/agents/routes.ts`) + model hint (`app/src/lib/agents/proposal.ts`); compose short service keys in `deploy/compose/docker-compose.yml`; `deploy/` layout landed (`deploy/compose/` + `deploy/charts/orbo-diya/`).
> Phase 6 = PLAN.md §8 item 6: *"Port OpenMuse screens (Documents/Finance/Goals/Activity/Ideas)
> into the unified IA."*

**Sources read once:** `PLAN.md` §6 (OpenMuse rows), §8.6, §9 gates; `09-execution-plan.md`
(WS-04 browser/research, WS-09 work, WS-12 identity/admin, WS-13 finance slices);
`23-phase6-documents-inventory.md`, `24-phase6-finance-inventory.md`,
`25-phase6-goals-activity-inventory.md`, `26-phase6-openmuse-backend.md`.
**Gaps noted explicitly (STALE — corrected 2026-10-14):** `27-phase6-app-inventory.md`
(OpenMuse app-screen inventory) and `28-phase6-gmail-calendar-inventory.md`
(Gmail/Calendar connector inventory) now exist on disk — §§2–5 below
cited OpenMuse mobile/Google paths via `23/26` second-hand and must be re-verified
against landed `27`/`28` before work orders.

**Unified IA homes (PLAN §3):** Home (DIYA) · Chat · **Spaces** (document library:
Pages + Documents/PDF) · Agents · **Work** (activity + routines + goals/tracking +
background runs) · Connections (Gmail/Calendar, MCP, browser/computer) · Settings · Admin.

---

## 1. Phase 6 definition of done (mapped to PLAN §9 gates via 09 §1)

Phase 6 is done when ALL of the following hold (Phase 6 covers only the OpenMuse
portion of the §6 matrix; full-matrix 100% waits for Phase 7+9):

| # | PLAN §9 gate | Phase 6 DoD interpretation |
|---|---|---|
| D1 | `bun run lint && bun run typecheck && bun run test && bun run build` pass | Green on every Phase 6 merge. Ported `node:test`→`bun:test` with restorable `spyOn`, never leaking `mock.module` (09 R4, 26 §4). `MINIMUM_TESTS` floor never lowered; per-dir file-count assertions hold. |
| D2 | Compose boots: `orbo-api` healthy, app reachable, browser worker reachable | `deploy/compose` up in WSL2 + Docker. `/api/health` 200; Spaces viewer + Work screens reachable in web export; document import path answers through the governed gateway. |
| D3a | Smoke: governed browser action + `/admin/audit` entry | Document browser-import path (`browser-downloads` dedupe, 23 §1) fires through `computerGateway` with one audit row; no raw `/api/computer/*` mounted (26 R2). |
| D3b | Smoke: Spaces editor + document viewer; mobile web bundle | One space + one page CRUD; one PDF upload → paging/zoom/download round-trip; Expo web export renders Spaces + Work + Finance card (23 §4 steps 2–3, 24 §4). |
| D3c | Smoke: DIYA delegation still works | WS-02 DIYA route unaffected: document/finance/goal work enqueues unified `tasks` via producers only, never a second scheduler (25 R1, 26 R4). |
| D4 | §6 OpenMuse rows checked (subset of matrix 100%) | All 7 OpenMuse §6 rows checked with backing tests: documents pipeline + PDF viewer; activity; goals/watches/backoff; ideas; finance CSV/summary/goal-action; Gmail/Calendar connector; single-owner mode. |
| D5 | Origin sweep zero first-party hits | `rg -i "copilotkit\|openbot\|openmuse\|opendots\|opentag"` zero outside `NOTICE.md`/`LICENSE`/`UPSTREAM.md`. No `openmuse` import paths, no second Hono server, no `records` KV shipped as canonical store. |
| D6 | No second scheduler / store / auth | TaskWorker collapsed to producers enqueueing unified `tasks`; `records` KV only as import shim; Better Auth actor on every route (single-owner shim maps to bootstrap user, never raw owner strings). |

Out of scope for Phase 6: R2 store submission, signing activation, public `/api/v1`,
non-Google finance connectors (24 R3), E2B desktop provider + jev panels (26: drop).

---

## 2. Ordered slice table (every slice grounded in a PLAN §6 row)

Size: S = days, M = 1–2 weeks, L = 2+ weeks / cross-cutting.

| Slice | Scope (PLAN §6 ground) | Deps | Primary dirs | Acceptance test | Size |
|---|---|---|---|---|---|
| P6-01 Documents pipeline, server (§6 Documents: *"email attachment → PDF → form values → filled copy → reviewed reply → receipt"*) | `artifacts` table + fill lineage; `POST /api/files`, `GET /:id/content` (signed URL), `POST /:id/fill`; `imports` idempotency; 422/413/404/409 contract verbatim (23 §2.3) | 01 §9 #1 threads + #3 spaces; WS-07 threads slice; WS-05 vault | `apps/server/src/pages/`, `apps/server/src/channels/attachments.ts`, `apps/server/src/db/schema/` | Ported `pdf.test.ts` (round-trip, untouched source, checkbox) + `browser-imports-race.test.ts` (one row) green | M |
| P6-02 PDF viewer + fill/share UI (§6 Documents: *"PDF view/paging/zoom/share"*) | `PdfReader.web` first (paging, zoom 50–200%, `#page=&zoom=`, download/print); `FileDetail` fill form + `parentId` badge + share; native `.native.tsx` gated per 05 parity | P6-01; WS-01 route shell + `(tabs)/spaces` tree | `apps/app/**/spaces/**`, `packages/ui/` viewer primitives | Paging + zoom + download round-trip vs real API; fill → open + share smoke; expired-URL refresh message | M |
| P6-03 Finance (§6 Finance: *"CSV import, categorized spending summary, savings-goal action"*) | `analyzeSpending` pure port (BOM/quotes/cents/1–5000 rows) as `finance` task kind; `FinanceArtifact` card (income/spending/remaining, bars, first-100); savings-goal `POST /goals` category `Finances` + 2 fixed milestones | WS-09 tasks/responsibilities; WS-01 UI shell (= 09 WS-13 deps) | `apps/server/src/work/` (+ `routines/finance.ts`), `apps/app/**/work/**`, `packages/integrations/` | Ported `finance.test.ts` + `finance-headers.test.ts` + `engine.test.ts:138-151` verbatim; CSV→summary journey; milestone-link workflows | S |
| P6-04 Goals + watches (§6 Work: *"Responsibilities + Goals/tracking/milestones, recurring watches, alerts, backoff"*) | Goal headers→`responsibilities`, milestones→plan criteria, pause fan-out; new `monitors` + `monitor-pages` baseline; `observe` + page-diff; backoff 5-strike auto-pause; alert dedup keys | WS-09 (09 R5 fatigue/lease rule); 01 §9 threads; notifications home (02 risk #11) | `apps/server/src/responsibilities/`, `apps/server/src/routines/`, `apps/server/src/work/queue.ts` | Ported `monitor-recovery` + `monitor-price-spacing` + `agent-api` goal-pause-pauses-task green; double-fire emits one alert | M |
| P6-05 Activity ledger (§6 Work: *"Activity: durable plans, progress, input, pause/resume/cancel/retry, receipts, SQL leases"*) | Unified `tasks`/`task_runs`/`task_events`; worker claim on `work_items` DB-clock leases + heartbeat; `guard`/`checkpoint`/`event`; review linkage onto approvals (`executing`/`outcome_unknown`, 30-min expiry) | WS-05 vault+gateway; WS-06 approvals; WS-07 threads (= 09 WS-09 deps) | `apps/server/src/routines/`, `responsibilities/`, `work/`, `approvals/`, `activity/activity.ts` (read aggregator only) | Ported `engine` + `persistence` + `prepare-lease-loss` + `step-limit` + `model-outcome` suites; single-claim under skew; lease-expiry interruption | M |
| P6-06 Ideas → proactive (§6 Work: *"Ideas: evidence-backed suggestions, edit/accept/dismiss"*) | Deterministic rules producers (document/coordination/plan) + retirement filters as proactive producer; accept/dismiss/edit-prompt onto `proactive_suggestions` (open/dismissed/started); accept mints goal+task deduped | P6-05 tasks; WS-10 proactive engine (= 09 WS-09 ideas→proactive) | `apps/server/src/proactive/`, `apps/server/src/responsibilities/` | Dismissal-survives-refresh + concurrent-accept-yields-one-goal+task green | S |
| P6-07 Backend absorbs (§6 Agents/Chat/Governance carriers for the above) | Absorb: worker lease/heartbeat/settle, model serial-queue, `analyzeSpending`, page-diff, limiter store, PKCE rotation/singleflight, search caps, domain zod spec, pdf-lib fill, signed-URL HMAC. Rewrite behind gateway: computer/browser routes, ActionService→approvals, conversation tools. Drop: E2B, jev, worker/computer images (26 §1) | Auth shim + `records` importer first (26 §6 step 1) | `apps/server/src/computer/`, `approvals/`, `copilot.ts`, `provider-oauth.ts`, `credentials.ts`, `plugins/` | Ported `actions` + `workflows` + `oauth` + `vault` + `search` + `rate-limit` + `resource-ids` suites per 26 §4 map | M |
| P6-08 App screens (§6 Chat: *"follow-up queue, delegated tasks, inline cards (email/browser/PDF/plan/finance)"* + Spaces/Work surfaces) | Spaces library surfacing (`filled copy` badge); `AgentActivityScreen`/`TaskCard`/`ArtifactCard`; `GoalsScreen`/`GoalCard`/`MonitorCard`; `IdeasScreen`/`IdeaCard`; delegate-sheet CSV field + example rows; thread cards re-hydrate by id (never stored URLs) | P6-01…P6-06 server slices; WS-01 design tokens; C24 route freeze | `apps/app/**/spaces/**`, `apps/app/**/work/**`, `apps/app/**/chat/**`, `packages/ui/` | `app/tests` render + journey: import→fill→reply card; CSV→summary card; goal pause/resume; idea accept/dismiss | M |
| P6-09 Gmail/Calendar connector (§6 Connections: *"Gmail + Google Calendar adapters (OAuth, threads, drafts, event CRUD)"*) | Google as governed connector plugin (vault-held credential, no raw mail routes); `messageId:attachmentId:filename` → `files.import`; reply-draft `attachmentIds ≤10` limits; connection-missing vs empty distinction (26: workspace behavior) | WS-05 vault; WS-06 approvals; P6-01 imports table (= 09 WS-10 Google slice) | `apps/server/src/plugins/` (+ Google connector), `apps/server/src/delivery/`, `apps/server/src/components/` | Ported `google.test.ts` subset; stale-ref 404 / disconnected 409; reviewed-reply send returns `message · <id>` receipt; decline/expire preserved | M |
| P6-10 Single-owner shim (§6 Surfaces: *"Single-owner mode + multi-user mode"*) | Owner→actor shim at route boundary (`local-user`→bootstrap `users` row); HMAC session + signed-URL re-key under ORBO credentials; `owner` string→`owner_user_id` importer with UTC/timestamptz converters; multi-user ACL explicitly deferred | WS-12 Better Auth (= 09 WS-12 deps WS-05) | `apps/server/src/auth/`, `apps/server/src/db/schema/`, `apps/server/src/admin/` | Single-owner sign-in + memory create/recall; import-converter DST/UTC test; no plaintext token in storage/logs (09 R2); no owner-string leak across users | S |

Traceability: P6-01/P6-02→Documents; P6-03→Finance (= 09 WS-13); P6-04/P6-05/P6-06→Work
(= 09 WS-09 split three ways); P6-07→backend carriers (= 26 absorb/rewrite); P6-08→app
surfaces (27 landed 2026-10-14 — re-verify P6-08 against it); P6-09→Connections (= 09 WS-04/WS-10 Google part, 28 landed 2026-10-14 — re-verify P6-09 against it);
P6-10→Identity/Surfaces (= 09 WS-12 single-owner slice).

---

## 3. Dependency order + parallelizable sets

```
W0 design freeze (before any P6 work order)
  01 §9 #1 threads-vs-channels + #3 spaces ownership + notifications home (02 risk #11)
  + C24 route freeze (finance/work viewer homes) + 27/28 landed — re-verify check
        |
W1 tables + auth (gates everything)
  P6-10 shim + P6-05 tables empty + P6-01 artifacts table + P6-04 monitors table
        |
W2 control plane (gates capabilities)
  P6-05 worker leases + P6-07 approvals merge + P6-07 gateway-wrapped computer/browser
        |
W3 capability fan-out (parallel)
  { P6-01 pipeline } ∥ { P6-03 finance logic } ∥ { P6-04 watches } ∥ { P6-06 ideas }
  ∥ { P6-09 connector } — all enqueue unified tasks, share gateway/approvals
        |
W4 surfaces (parallel after server slices)
  { P6-02 viewer } ∥ { P6-08 app screens } ∥ { P6-03 card + goal action }
        |
W5 Phase 6 exit: DoD §1 D1–D5 proven for OpenMuse rows; adapters deleted per 02 §6;
  origin sweep clean; hand off to Phase 7 subsystem-collapse
```

Parallelizable sets: W3 five-way parallel is the main speedup (shared
gateway/approvals/test-harness only). P6-03 finance is off-critical-path and may
slip one wave without blocking R1 (09 §3). P6-02 viewer web-first unblocks native
later (`.native.tsx` split). P6-09 connector review-reply step waits on P6-01 +
approvals; its OAuth/vault slice can start in W1. Critical path: W0 (threads +
spaces decisions) → W1 (shim + tasks/artifacts tables) → W2 (leases + approvals) →
W3 (pipeline + watches) → W4 (viewer + app screens) → W5 (exit sweep).

---

## 4. Smallest shippable first slice per item

| Slice | First slice (independently demonstrable) |
|---|---|
| P6-01 pipeline | `POST /api/files` + `GET /:id/content` for one real PDF with signed URL; `PdfError`→422 / 10 MiB→413 kept; no fill, no mail yet. |
| P6-02 viewer | Web `PdfReader` paging + zoom + download against the P6-01 API; fill form deferred to slice 2. |
| P6-03 finance | One CSV paste → `analyzeSpending` → categorized summary table (sample 4-row fixture from `agent-ui.tsx:997-1007`); savings-goal action deferred. |
| P6-04 goals | One goal CRUD + one milestone toggle + pause-fans-out-to-task; watches deferred to slice 2. |
| P6-05 activity | One task create → claim → checkpoint → receipt on `work_items` with DB-clock lease; input/review deferred. |
| P6-06 ideas | One deterministic rule firing one suggestion + dismiss-survives-refresh; accept→goal+task deferred. |
| P6-07 absorbs | Auth shim + `records` importer + one absorbed pure function (`analyzeSpending` or page-diff) with its ported tests green. |
| P6-08 screens | One thread card re-hydrating one artifact by id in Spaces; delegate sheet + Goals/Monitor cards deferred. |
| P6-09 gmail | Vault-held OAuth connect + one `import-attachment` ref resolving to an `artifacts` row; send/reply deferred behind approvals. |
| P6-10 shim | Single-owner sign-in mapping to bootstrap user + one HMAC-signed content URL round-trip; multi-user deferred. |

---

## 5. Risk deltas vs 09-execution-plan top-10

09 risks still fully in force (R1 threads-identity, R2 plaintext-token cut-over,
R3 ungoverned routes, R4 `mock.module` leakage, R5 scheduler collapse, R8
timestamp/owner mapping, R9 coverage floor). Deltas new or sharpened by 23–26:

| # | Delta vs 09 | Detail | Mitigation |
|---|---|---|---|
| N1 | Byte-store fork (23 R1) sharpens 09 R5 | ORBO `attachments` (channel-scoped bytes) vs OpenMuse files (owner-scoped disk + `parentId`/`source` lineage) tempts two blob stores | Decide once: `artifacts` metadata + bytes-in-`attachments` vs standalone; never two blob stores; enforce in W1 review |
| N2 | Ungoverned fill route (23 R2) sharpens 09 R3 | `POST /:id/fill` is bearer-only upstream; mounting it raw bypasses resolve→policy→audit→act | Ship fill only as governed tool (`fill_pdf` allowlisted + per-agent grant + audit); route-introspection CI test |
| N3 | Fill values are PII adjacent to audit (23 R8) — new | Form values ride task input/state that may be logged; audit must not capture them | Secret-withholding invariant: audit the fill action, never its contents; redaction test |
| N4 | Monitor quiet/dedup subtlety (25 R4) sharpens 09 R5 | `timelessHash`, `monitor:${id}:${seq}:${hash}` keys, baseline-ahead races; naive port double-alerts or swallows changes | Port `observe` + page-diff as a unit with `monitor-recovery`/`price-spacing` tests, never piecemeal |
| N5 | Three failure counters conflated (25 R3) — new | `work_items` attempts vs routine fatigue vs monitor streak answer different questions | Keep all three counters; document ownership; regression test each threshold independently |
| N6 | 771-line `computer.ts` interlock (26 R9) sharpens 09 R3 | Lease/stop/exec jail + stop-quarantine + receipts is the subtlest tree; clean-room rewrite loses safety | Port with `computer*.test.ts` + `prepare-lease-loss` or not at all; no partial port |
| N7 | Sample-vs-live branching infects surfaces (26 R10) — new | `workspace.ts`/`service.ts` sample mode seeds mails/events behind the same code paths | Cut sample mode at the route boundary; ORBO fixtures replace seeded mails; demo determinism test |
| N8 | `27-app` / `28-gmail` missing at draft time — **LANDED 2026-10-14** | P6-08 card inventory and P6-09 Gmail depth (860-line client) were estimated from `23/26` proxies, not the dedicated inventories | Re-verify P6-08/P6-09 UI + send-path line refs against landed `27`/`28` before work orders; server logic proceeds regardless |
| N9 | Notifications homelessness blocks watches (25 R6, 02 risk #11) sharpens 09 W4 | Watch alerts + task-done fan-out have no resource home; P6-04 slice M6 cannot land | DECIDED — D9:A (standalone `GET /api/notifications`) per freehand directive (reversible); `notifications` table landed via `0053` (verified on disk); until R1 assembly watches run quiet (no fan-out) with backoff tests green |
| N10 | pdf-lib/XFA/encrypted + font chain (23 R3–R4) — new supply risk | Third-party native dep; only text/checkbox fill; dropdown/radio inspect as `unsupported`; fill failures surface as font errors | Pin + Phase 9 license scan; preserve verbatim 422s; viewer renders (never fills) unsupported forms |

09 R6 (RN-port stall) and R7 (voice/media) are unchanged but bite P6-02/P6-08
hardest: land web viewer + markdown/activity cards first, gate native
`react-native-pdf` / `Sharing` / `FileSystem` behind the `.native.tsx` split and
the per-platform picker contract (24 R1).

---

## 6. Owner-decision gates (from PLAN §10 via 09 §6; Phase 6 subset)

### A. Required before W1 work orders (block tables/API/UI)

1. **Threads vs channels authority** (01 §9 #1) — DECIDED D1:A (`channels` team surface + unified `threads` attach) per freehand directive (reversible); `threads` + `notifications` tables landed via `0053`, `monitors` via `0054` (verified on disk). Build P6-01 steps 1–4 + P6-05 tables first; defer bindings (same deferral as 16 §5 #4).
2. **Spaces ownership** (01 §9 #3: flatten vs container) — DECIDED D2:A (survive + `owner_user_id` + `agent_spaces`) per freehand directive (reversible); blocks P6-01 `artifacts` bytes decision (N1) and P6-02/P6-08 viewer homes.
3. **Notifications home** (02 risk #11) — DECIDED D9:A (standalone `GET /api/notifications`) per freehand directive (reversible); `notifications` table landed via `0053` (verified on disk).
4. **C24 route freeze**: finance home (Work artifact vs `work/finance` route, 24 Q1) + viewer routes — DECIDED D12:A (finance rides Work task kind) + D4:A (tree freeze) per freehand directive (reversible); blocks P6-08 UI work; server logic proceeds regardless (implementation pending R1 assembly).
5. **`records` keep-or-retire + `monitors`/`goals`/`ideas` table scope** (26 §5; 01 §8) — DECIDED D3:A (normalize fully, shim only) per freehand directive (reversible); `monitors` table landed via `0054`; blocks P6-07 importer + P6-04 tables.
6. **27/28 reconciliation sign-off** — confirm P6-08 card list and P6-09 client subset against the landed inventories (N8). (OPEN — verification before work orders; work orders gated on R1 assembly.)

### B. Defaults executing unless vetoed (PLAN §10.B)

Upstream pin = latest `main` SHA at clone; `0.1.0`; embedded Postgres on +
`DATABASE_URL` override; keep upstream ports; TanStack Query + Zustand (stands per freehand directive; QueryClient landed in `apps/app/app/_layout.tsx`; replaces
3s poll in `agent-workspace.tsx`); Better Auth only; neutral DIYA persona;
`finance` rides `tasks.kind` + `artifacts.kind` (no standalone table); fill is a
governed tool, never a raw route; Google is a governed connector (no new mail
routes v1); E2B/jev dropped.

### C. Explicitly deferred (not Phase 6 gates)

Bank/finance connectors beyond CSV import (24 R3); XFA/encrypted fill support;
native viewer parity beyond the gated split; R2 signing/store accounts; public API.

---

## 7. Appendix — IA mapping + test-port map (re-verify against landed 27/28)

### A. OpenMuse screen → ORBO IA home (PLAN §3; C24 confirms)

| OpenMuse screen (source) | ORBO home | Slice | Note |
|---|---|---|---|
| `FileDetail` + `PdfReader.web/.native` (23 §1.7) | Spaces file viewer under `(tabs)/spaces` | P6-02 | Paging/zoom/share; `parentId` → `filled copy` badge; signed URL minted per open, never stored |
| `FileThreadCard` / `TaskThreadCard` (23 §1.7) | Spaces + Chat inline cards | P6-08 | Re-hydrate files by task id on replay; mail-card `Import` → `importAttachment` then open |
| `FinanceArtifact` summary card (24 F-07) | Work Activity artifact under `(tabs)/work` | P6-03 | Income/spending/remaining tiles + category bars + first-100 list; totals cover all rows |
| `DelegateSheet` finance field + example rows (24 F-08) | Work creation form + Chat delegate sheet | P6-08 | Multiline CSV field + convention note (positive = expense); per-platform picker (24 R1) |
| `GoalsScreen` / `GoalCard` (25 G6) | Work goals section | P6-08 | Milestone toggle, pause/resume, plan-from-goal; pause fans out to live tasks |
| `MonitorForm` / `MonitorCard` (25 G6) | Work watches section | P6-08 | Pause/resume/stop/check-now; quiet-rule dedup behind the card |
| `AgentActivityScreen` / `TaskCard` (25 A11) | Work activity feed | P6-08 | Plans, progress, `waiting_input` prompts, receipts; read from `task_events`, never a second ledger |
| `ActivityScreen` actions inbox (25 A12) | Work approvals inbox view | P6-05 | All/reviewed filter over `approval_requests`; single-execution + decline-persistence |
| `IdeasScreen` / `IdeaCard` (25 I4) | Work suggestions section (proactive) | P6-06 | New-only list + Find-ideas refresh; evidence view + edit-prompt accept/dismiss |
| Goals `Finances` category row (24 F-08 `:1288`) | Responsibilities row, category `Finances` | P6-03 | Two fixed milestones (`Choose a savings target`, `Review spending each week`) for slice 2 |
| Delegate-task entry (`threads.tsx:301-309`) | Chat delegate entry | P6-08 | One row opening the sheet for plan / document / spending summary kinds |
| Browser-downloads notice (`details.tsx:887-899`) | Spaces import receipt | P6-01 | `N PDF downloads added to Files` via `browser-downloads` dedupe |
| `Attach to email` draft action (23 §1.7) | Chat/Connections draft with `attachmentIds` | P6-09 | Opens draft with `attachmentIds:[id]`; limits (`≤10`, subject/body caps) kept verbatim |

### B. Test-port map (per 06 tier rule: logic → `server/tests`, surfaces → `app/tests`)

| OpenMuse suite | ORBO target | Slice |
|---|---|---|
| `pdf.test.ts` + `browser-imports-race.test.ts` | `server/tests/` attachments/pdf + concurrency | P6-01 |
| `finance.test.ts` + `finance-headers.test.ts` + `engine.test.ts:138-151` | `server/tests/finance-*.test.ts` (`bun:test`) | P6-03 |
| `workflows.test.ts:377-499` finance + `agent-api.test.ts:365-404` goal/task races | `server/tests/` work/goal + API suites | P6-03/P6-05 |
| `monitor-recovery` + `monitor-price-spacing` + `page-diff` | `server/tests/` monitors suite | P6-04 |
| `engine` + `persistence` + `prepare-lease-loss` + `step-limit` + `model-outcome` | `server/tests/` work/queue + runner suites | P6-05 |
| `agent-api` ideas (dismiss-survives-refresh, concurrent-accept-once) | `server/tests/` proactive suite | P6-06 |
| `actions` + `workflows` doc flow + `oauth` + `vault` + `search` + `rate-limit` | `server/tests/` approvals/provider/research suites | P6-07 |
| `google.test.ts` (client subset) + stale-ref/disconnected paths | plugin Google tests | P6-09 |
| `apps/mobile/test/*` (8): keep `date-time` + `conversation-queue` logic only | `app/tests/`; drop RN-native + jev-actions | P6-08 |
| `jev*` + `demo-model` + `telemetry` + `openbot` + `computer-e2b` + worker/computer-image | Drop — no ORBO home (26 §4) | — |

Reconciliation checklist before work orders: 27 landed (2026-10-14) → confirm P6-08 card/route
rows above (OPEN — verification before work orders); 28 landed (2026-10-14) → confirm P6-09 client-subset + send-path rows (OPEN — same); 01 FINAL → DECIDED D1:A D2:A D3:A (threads #1, spaces #3, `records` #2; `0053`/`0054` landed); 02 FINAL → canonical `/api/files` +
alias list (OPEN — alias freeze still needs final confirm); 03 FINAL → DECIDED D4:A + D12:A (`(tabs)/spaces` + `(tabs)/work` route freeze incl. finance
home as Work artifact); 05 FINAL → DECIDED D8:B + D13:A + D5:A carve-out (picker + native-split scope decided; EAS builds owner-gated); 06 FINAL → LANDED (coverage floors + runner
rule in `scripts/test-ci.ts`); 22/09 deltas folded into §3 waves.
Truly still gated (stay unchecked/OPEN): accounts/domain/certs/legal sign-off, R1 assembly, R2, store submissions, EAS builds.

---

*Provenance: `PLAN.md` §§3/6/8.6/9/10; `09-execution-plan.md` §§1–6 (WS-04/WS-09/WS-12/WS-13);
`23-phase6-documents-inventory.md` §§1–5; `24-phase6-finance-inventory.md` §§1–6;
`25-phase6-goals-activity-inventory.md` §§1–5; `26-phase6-openmuse-backend.md` §§1–6.
`27-app` + `28-gmail` landed on disk 2026-10-14 — re-verify P6-08/P6-09 refs against them before work orders.
© Opraiz Technology Pvt Ltd · Developer: Narein Rao*
