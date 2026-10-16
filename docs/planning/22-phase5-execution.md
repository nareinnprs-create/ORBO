# 22 — Phase 5 Execution Plan (PLAN.md §8.5: OpenDots surfaces + Dots→Agents + DIYA)

> **Status: DRAFT pending R1 assembly.** Research + this doc only — no product code modified.
> Other docs/planning files treated as read-only snapshots; parallel workers may refine them.
> W0 owner decisions G1–G8 DECIDED per freehand directive (reversible, 33 + sections).
> Truly still gated before work orders: accounts/domain/certs/legal sign-off, R1 assembly.

**Sources read once at draft time:** `PLAN.md` §6 (parity rows), §8.5 (Phase-5 scope),
§9 (acceptance gates); `docs/planning/08-subsystem-unification.md` (§7 documents,
§5 threads, §4 approvals, merge sequence §10); `09-execution-plan.md` (WS-08 spaces,
WS-02 agents/DIYA, WS-07 chat/threads/calls slices, waves W0–W5, risks R1–R10);
`16-phase5-spaces-inventory.md`, `17-phase5-calls-inventory.md`,
`18-phase5-review-inventory.md`, `19-phase5-dots-fold-mapping.md`.
**Gaps noted explicitly (STALE — corrected 2026-10-14):** `20-phase5-diya-seeding.md` and
`21-phase5-opendots-backend.md` now exist on disk — DIYA-seed and backend-absorb slices
below were grounded in PLAN §3 (DIYA model, IA), §6 rows, 08 §§8/10, and
09 WS-02/WS-10, not in dedicated inventories. Re-verify P5-09/P5-10 against landed 20/21 before work orders.

**Path convention:** PLAN §3 target names (`apps/server`, `apps/app`) map to the current
tree (`server/src/`, `app/src/`) per 08 layout note — `apps/app` Expo placeholder shell
has since landed (TODO stubs per 03 §5, 2026-10-14); no `apps/server` dir yet.
Slices use current-tree paths; target names in parentheses.

---

## 1. Phase-5 definition of done (mapped to PLAN §9 gates)

Phase 5 = PLAN §8 item 5: port OpenDots Spaces/Pages, calls, review cards; fold Dots→Agents;
seed DIYA. Done when ALL hold (subset of §9; full §9 closes at Phase 9):

| # | PLAN §9 gate | Phase-5 DoD interpretation |
|---|---|---|
| D1 | `bun run lint && typecheck && test && build` pass | Green on every merge. Ported OpenDots suites converted `vitest`→`bun:test`, `vi.mock`→restorable `spyOn` (09 R4, 08 merge-seq #6). |
| D2 | Compose boots: `orbo-api` healthy, app reachable, browser worker reachable | `/api/health` 200; Spaces editor served from unified app; no raw `/api/computer/*` route mounted (08 §1 risk). |
| D3a | Smoke: Agent + governed browser action + `/admin/audit` | Dots-folded agent runs one governed page-tool call; audit row names the rule; revoked-space Dot gets 403 with no title leak (16 §2.3). |
| D3b | Smoke: open Spaces editor; launch mobile web bundle | Page CRUD + `expectedRevision` 409 path + autosave round-trip in Expo web export (16 §4 steps 2–6). |
| D3c | Smoke: DIYA delegation works | Seeded DIYA answers in Home, delegates one canned task to one folded agent, collects result in main thread (PLAN §3 DIYA model; 09 WS-02). |
| D4 | Parity §6: OpenDots rows checked | Spaces + Pages editor + review-before-save + realtime-calls rows (§6 Chat/Documents) checked with backing tests; Dots rows checked via Agents superset. PDF pipeline stays Phase 6 (08 §7). |
| D5 | Origin sweep zero first-party hits | `rg -i "copilotkit\|openbot\|openmuse\|opendots\|opentag"` zero outside `NOTICE.md`/`LICENSE`/`UPSTREAM.md`; no `opendots:` receipt prefix, no Dots/specialist copy (17 §4.2, 19 §5). |

Out of scope: OpenMuse PDF pipeline (Phase 6), store submission/signing (R2), public `/api/v1`.

---

## 2. Ordered slice table (every slice grounded in PLAN §6)

Size: S = days, M = 1–2 weeks, L = 2+ weeks. Order = build order (§3 explains gating).

| Slice | Scope (PLAN §6 ground) | Deps | Primary dirs | Acceptance test | Size |
|---|---|---|---|---|---|
| P5-01 | Spaces tables + pages API core (§6 Documents: "Spaces: home for working documents") | W0 decisions (spaces ownership, threads) | `server/src/db/schema/`, `server/src/pages/`, `server/drizzle.config.ts` | Ported `pages` + `page-routes` conflict cases green; concurrent-PATCH revision test | M |
| P5-02 | Pages editor + library/nav + autosave (§6 Documents: "Pages: library, grid/list, nested subpages, visual editor, slash commands, undo/redo, markdown mode, autosave + revision checks") | P5-01 | `app/src/routes/(tabs)/spaces/`, `packages/ui/` (editor card), `app/src/lib/pages/` | Create/edit round-trip; 100k/title caps client+server; 409 shows reload-notice; dirty-guard blocks loss | L |
| P5-03 | Hash→path redirect map (§6 Surfaces: one UI; §6 Documents page-link behavior) | P5-01, route freeze | `app/src/routes/`, `app/src/lib/pages/page-navigation.ts` | Every `#/spaces/:s(/pages/:p)` deep link + agent-tool URL resolves to `(tabs)/spaces/[spaceId]/pages/[pageId]`; bad ids hit `+not-found` | S |
| P5-04 | Calls server contract (§6 Chat: "Realtime calls: WebRTC speech, delegated compute, call controls, minimized view, receipts") | Threads decision; WS-05 vault | `server/src/voice/`, `shared/voice-session.ts`, `server/src/dictation/` (untouched) | Caps pinned (15-min, 6-turn adopt/drop recorded); 1:1 rejection; late-transcript fill; `ask_compute`→`ask_agent` one tool; untrusted-transcript framing kept | M |
| P5-05 | CallView web port (§6 Chat realtime-calls UI half: controls, minimized view, receipts) | P5-04 | `app/src/components/channels/voice-call-widget.tsx`, `app/src/lib/voice/` | Timer + phase captions + 3-button a11y contract + minimized + control-lost copy; transcript-cap tests; no `opendots:` marker | M |
| P5-06 | Native voice spike, gated (§6 Surfaces: one UI → web+iOS+Android; §6 Chat calls parity) | P5-04 (contract frozen) | spike only: `connection.{web,native}`, `recording.{web,native}` leaves; SecureStore/AsyncStorage outbox leaf | Spike report: module choice (`react-native-webrtc`, `expo-audio`/`expo-av`), permission matrix, TURN/STUN finding, contract gaps — not shipped | S |
| P5-07 | Review-before-save flow (§6 Documents: "Review-before-save → creates page in authorized Space") | P5-01 (spaces+`page_reviews`); P5-02 shell | `server/src/pages/` (review endpoints), `packages/ui/` (review card), `server/src/db/schema/` (audit event) | Double-submit one page; 409 on changed draft; deleted-page receipt renders `deleted:true`; `canAccessSpace` re-checked at decision; `page-review*` suites green | M |
| P5-08 | Dots→Agents ETL + fold (§6 Agents entity union; §6 Governance per-tool approval; §6 Chat page-chat wiring via `memoryAllowed`/`researchAllowed`) | Threads decision; P5-01 (spaces/`agent_spaces`) | `server/src/db/schema/` (agents superset cols), `scripts/import-dots.ts`, `server/src/agents/routes.ts` | Importer: epoch→timestamptz, int→bool, `spaceId∈spaceIds`, learning-slug validator; tokens encrypted→vault (never plaintext); `dot-<uuid>` id remap; roster order parity | M |
| P5-09 | DIYA seed (§6 Agents: boss agent; PLAN §3 DIYA model — personal-context + coordinator + everyday-work superset) | P5-08 | `examples/orbo/` (tenant package), `server/src/agents/`, `app/src/routes/` (Home) | DIYA pinned boss in Agents roster; answers in Home; delegates canned task to specialist; group-thread receipt; neutral persona, admin-editable | S |
| P5-10 | Backend absorbs: connectors/computer-audit/mcp-approvals (§6 Connections: "Governed MCP, per-Agent allowlists"; "Per-tool access + approval + pause"; "Browser: read-only public-page service"; Channels Slack allowlist/thread continuation) | Vault (WS-05); approvals (WS-06); P5-08 | `server/src/plugins/`, `server/src/approvals/`, `server/src/computer/` | Per-tool `requiresApproval`/`enabled` → grants+rules; `computer_*` tools via gateway `intentOf`; `mcp_actions` claim-once + 1h TTL; tool-name slugging stable; no ungoverned route mounted | M |

Grounding notes (slice → §6 row → inventory proof): P5-01/P5-02 → Documents Spaces/Pages rows
(16 §§1–4; 08 §7 rewrite-port); P5-03 → Surfaces one-UI + page-link behavior (16 §5.2; 03 §5 target
tree); P5-04/P5-05/P5-06 → Chat realtime-calls row (17 §§1–4; 05 R1/R2 native gaps);
P5-07 → Documents review-before-save row (18 §§1–4; 08 §7 `createReviewed`);
P5-08 → Agents union + Governance approvals rows (19 §§1–5; 08 §§4/6; 01 §5 agents cols);
P5-09 → Agents/DIYA rows (PLAN §3 DIYA model; 09 WS-02 first-slice canned delegation);
P5-10 → Connections/Browser rows (08 §§2/8; 19 §3 `mcp_connections`/`computer_audit` rows).

### Slice grounding detail (PLAN §6 quote → inventory proof → 08 home)

- P5-01 — §6: "Spaces: home for working documents". Proof: 16 §2 (7 tables, 13 endpoints,
  `expectedRevision` 409, `createReviewed` idempotency). Home: new `server/src/pages/` (08 §7);
  ORBO contributes only bytes (`channels/attachments.ts`) + auth/vault. Full port, not a merge.
- P5-02 — §6: "Pages: library, grid/list, nested subpages, visual editor, slash commands,
  undo/redo, markdown mode, autosave + revision checks". Proof: 16 §1 (22 client files:
  `RichEditor`, `markdown.ts`, `slash-commands`, `autosave`, `SpaceLibrary`, `SpaceNav`).
  Editor is Tiptap web-only → markdown-first (16 §5.1). Home: `(tabs)/spaces` routes (03 §5).
- P5-03 — §6 Surfaces: "One UI" + Documents page-link behavior. Proof: 16 §5.2 (hash links
  `#/spaces/:s/pages/:p` in `page-tools.ts:22`, `page-context.ts:12`, RichEditor ctrl-click).
  Target tree uses real paths (03 §5) → redirect map required; agent tools emit new shape day one.
- P5-04 — §6 Chat: "Realtime calls: WebRTC speech, delegated compute, call controls, minimized
  view, receipts" (server half). Proof: 17 §1b (5 endpoints, `VoiceService` OpenAI-only, 15-min
  cap, 6-turn compute cap, `jobs.size` single-flight). ORBO `server/src/voice/` is the superset
  (WebRTC + xai WebSocket); keep ORBO picker, rebind `threadId`→`channelId`, keep 1:1 rule.
- P5-05 — §6 Chat realtime-calls (UI half). Proof: 17 §1a (`CallView` 128 lines: timer, captions,
  3-button a11y, minimize) + `useVoice` 365 lines (control poll, keepalive end, `ask_compute`).
  Survivor: ORBO `voice-call-widget.tsx` + `session.ts`; port caption copy + control-lost UX (17 §4.2).
- P5-06 — §6 Surfaces one-UI (native) + Chat calls parity. Proof: 17 §2c (`mobile/package.json`
  zero audio deps; desktop mic = packaging only + `MACOS_MICROPHONE.md` protocol). Follows 05 §3
  platform-split rules (`.web`/`.native` leaves, capability guards); findings only, not shipped.
- P5-07 — §6 Documents: "Review-before-save → creates page in authorized Space". Proof: 18 §1
  (1 HITL tool + 1 card + 2 endpoints + `page_reviews` receipt outliving delete) + §3 gap
  (no ORBO equivalent confirmed). Home: `server/src/pages/`; new table, never `approval_requests`.
- P5-08 — §6 Agents entity union ("one implementation", PLAN §3) + Governance approvals +
  Chat page-chat wiring. Proof: 19 §§1–3 (10 Dot fields → agents superset cols; `dot_spaces`→
  `agent_spaces`; `computer_permissions`/`computer_audit` carry-over). ETL only, no `/dots/*` mount.
- P5-09 — §6 Agents catalog + PLAN §3 DIYA boss model (orchestrates, opens group channels,
  owns responsibilities/goals, unified approvals/audit). Proof: 09 WS-02 acceptance (DIYA
  delegates to specialist, group-thread receipt); persona neutral, admin-editable (PLAN §10.B.18).
   `20-phase5-diya-seeding.md` has since landed (2026-10-14) — re-verified against it; owner approval RECORDED (D11:A per freehand directive, reversible). DIYA seed row (`diya`) present in `examples/orbo/agents.yaml` + `permitted_agents` wiring in `examples/orbo/channels.yaml`. diya-first rule LANDED (`diya`-first clause in `app/src/lib/agents/default-agent.ts`, verified on disk 2026-10-16).
- P5-10 — §6 Connections: governed MCP + per-tool approval + read-only browser + Parallel +
  Channels Slack reach. Proof: 19 §3 (`mcp_connections`→vault, `mcp_approvals`/`mcp_actions`→
  rules+receipts) + 08 §§2/8 (browser worker, connectors). Respects 02 risk #4 (no raw routes).

---

## 3. Dependency order + parallelizable sets

```
W0 (freeze) → P5-01 (tables+API) → P5-02 (editor) ─┬→ P5-07 (review)
                                                   └→ P5-03 (redirects, with route freeze)
W0 (threads) → P5-04 (voice contract) → P5-05 (CallView) → P5-06 (spike, gated)
W0 (threads+spaces) → P5-08 (ETL) → P5-09 (DIYA) → P5-10 (backend absorbs)
P5-07 needs P5-02 shell; P5-10 needs P5-08 agent ids + WS-05/WS-06 gate.
```

| Set | Slices | Parallelizable? | Exit gate |
|---|---|---|---|
| A — Data foundation | P5-01, P5-04 (contract), P5-08 (ETL design) | P5-01 ∥ P5-04 after W0; P5-08 design ∥ both, import runs after P5-01 lands | Migrations + contract tests + importer dry-run green |
| B — Surfaces | P5-02, P5-05 | Yes, after A (different dirs, no shared files) | Editor smoke + widget tests green |
| C — Glue | P5-03, P5-07, P5-09 | P5-03 ∥ P5-07 ∥ P5-09 after B/A respectively | Redirect map + review idempotency + DIYA delegation smoke |
| D — Absorb + spike | P5-06, P5-10 | Yes, after C (spike reads frozen contract; absorbs read folded agents) | Spike report filed; no ungoverned route; tool-name stability test |

Critical path: W0 freeze → P5-01 → P5-02 → P5-07 → P5-08 → P5-09 → P5-10.
Off-path: P5-06 spike can slip one wave; P5-03 can land with any B slice; P5-04/P5-05
run parallel to P5-01/P5-02 until receipt schema needs thread identity.

Wave narrative (per 09 §3 waves, Phase-5 lanes only): W0 resolves G1–G8 so table DDL
(`spaces`, `pages`, `page_reviews`, `page_threads`, `agent_spaces`, agents superset cols)
and the voice-contract decisions are never re-litigated mid-port. Set A proves storage +
contract first because every receipt (`page_reviews`, call receipts) keys on thread
identity — building UI before G2 lands orphans bindings (08 merge-seq blocker 1).
Set B fans out to the two UI surfaces (editor, CallView) which share no files and can
use separate workers. Set C closes the loops users see (deep links, review card, DIYA
delegation smoke). Set D absorbs backends only after folded agent ids exist, so vault
pointers and approval receipts reference real rows; the native spike reads the frozen
contract and writes no product code, so it never blocks R1.

---

## 4. Smallest shippable first slice per item

| Slice | First demonstrable cut |
|---|---|
| P5-01 | One space + one page CRUD with `expectedRevision` 409 via API only (no UI). |
| P5-02 | Read-only library browsing real API data; editor is plain markdown before Tiptap. |
| P5-03 | Static redirect table + one e2e deep-link test; agent tools emit new shape day one. |
| P5-04 | One `POST /api/voice/calls` handshake against ORBO provider with 1:1 rejection + rate-limit test; no UI change. |
| P5-05 | Widget renders timer + captions + minimize against stubbed session; supervision deferred. |
| P5-06 | One-page spike report (module + permission matrix), zero product diff. |
| P5-07 | One HITL `review_space_page` card → approve creates one page; decline writes nothing. |
| P5-08 | One Dot imported to one private agent with space ACL + encrypted token pointer; roster shows it. |
| P5-09 | DIYA seed config answering in Home + one canned delegation to one specialist. |
| P5-10 | One MCP server + one tool behind per-agent allowlist with approval default; Composio deferred. |

---

## 5. Risk register deltas vs 09 (R1–R10 stand; deltas below are Phase-5-specific)

| # | Delta risk (source) | Impact | Mitigation |
|---|---|---|---|
| D1 | Tiptap web-only; no RN entry (16 §5.1; 10 refs in OpenDots `package.json`) | Editor ships web-only or stalls native | Markdown source mode first; visual editor web-only; `.native.tsx` split decision in W0 |
| D2 | Revision concurrency SQLite→Postgres (16 §5.5: `BEGIN IMMEDIATE` + `revision=?`) | Lost updates under Postgres | Row-level `UPDATE … WHERE revision=?` + concurrent-PATCH test before editor ships |
| D3 | Review bypass via direct `create/edit_space_page` tools (18 §5.2) | Agent skips HITL review silently | Review-gated save is the only chat save path; direct tools server/internal only |
| D4 | Drafts stuffed into `approval_requests` (18 §5.1) | Consume/resume/auto-review fire on a save | New `page_reviews` table; review path never calls `approvalService.gate` |
| D5 | `ask_compute` vs `ask_agent` fork (17 §5.5: 6-cap/12k vs 4k/same-agent) | Two delegation tools, divergent audit | Collapse to `ask_agent`; keep untrusted-transcript suffix; pin caps in tests |
| D6 | Global single-call guard vs multi-user caps (17 §5.6: `jobs.size` vs 5/min + 8 concurrent) | Naive port serializes calls across users | Keep both with per-user scope; test two-user concurrency |
| D7 | Control-supervision cost (17 §5.9: 2s poll + `active` route) | Reintroduces per-call server lifecycle ORBO avoids | Explicit adopt/drop decision in P5-04; no silent default |
| D8 | No voice home in 08 (17 §5.3: only "per-call approval" + one receipts line) | Phase 7 re-litigates the voice contract | Slot voice receipts with threads, delegation approval with approvals; rule in 08 or "stays in channels" before Phase 7 |
| D9 | Instructions truncation 2000→1000 (19 §6 R3) | Silent persona cut on import | DECIDED — D10:A at 2000 (reversible); landed end-to-end in form (`app/src/lib/agents/form.ts`) + server parser (`server/src/agents/routes.ts`) + model hint (`app/src/lib/agents/proposal.ts`), verified on disk |
| D10 | Plaintext `mcp_connections.token` cut-over (19 §6 R1; 09 R2) | Credential leak at import | Vault-first: encrypt→`credentials`, row holds pointer; assert no plaintext in storage/logs |
| D11 | Dots/API shape collision (19 §4 C6: `GET /workspace` vs `/api/agents` envelope) | Compat mount temptation | ETL only, no `/dots/*` compat mount; canonical `GET /api/agents` unchanged |
| D12 | Snapshot churn mid Bot→Agent rename (19 §4 C1/C6) | Roster/profile snapshots re-churn | Bot UI copy lands first; Dots strings map straight to final `Agent(s)` copy in one PR |
| D13 | 20/21 missing at plan time (this doc header) — **LANDED 2026-10-14** | DIYA/backend slices rested on 09 + PLAN §3, not inventories | Re-verify P5-09/P5-10 against landed 20/21 at W0 exit before work orders; provisional flag lifts once verified |

---

## 6. Owner-decision gates (no work order cut until resolved; W0 exit review)

| Gate | Question | Options + default | Blocks |
|---|---|---|---|
| G1 — Spaces ownership (01 §9 #3; 16 §5.3; 08 §7 risk) | Do `spaces` survive with `owner_user_id`, and what is the multi-user ACL? | A) survive + `owner_user_id` + `agent_spaces` join (DECIDED, 01 §5) / B) flatten pages to owner scope | P5-01, P5-07, P5-08, P5-02 |
| G2 — Threads identity (01 §9 #1; 08 §5; 09 R1) | Canonical conversation identity? (`threads` + `notifications` tables landed via `0053`, `monitors` via `0054`, verified on disk 2026-10-16; DECIDED — A per freehand directive, reversible) | A) `channels` team surface + unified `threads` attach (DECIDED, 08 §5 absorb) / B) channels-only | P5-01 (`page_threads`), P5-04 (receipts), P5-07, P5-08 (`thread_bindings`), P5-10 |
| G3 — Route freeze (03 route tree; 16 §4 step 3) | Final Expo paths for Spaces? | A) `(tabs)/spaces/[spaceId]/pages/[pageId]` + hash→path redirect map (DECIDED D4:A, reversible) / B) alternate tree | P5-02, P5-03, P5-05 mount point, P5-07 Open-page link |
| G4 — Editor native shape (16 §5.1; 05 R6) | Tiptap adapter vs native editor? | A) markdown-first + Tiptap web-only (DECIDED — D5:A carve-out stands, reversible) / B) native editor investment | P5-02 scope; P5-06 spike brief |
| G5 — Voice caps + supervision (17 §4.1 a–c; §5.7/§5.9) | Adopt 15-min/6-turn caps + `active`/control-poll? | A) adopt with per-user scope (DECIDED — D13:A, reversible) / B) drop with reason recorded | P5-04 contract; P5-05 supervision |
| G6 — Instructions width (19 §6 R3) | Extend `roleDescription` to 2000 or truncate+review? (DECIDED — A at 2000, reversible; landed end-to-end in form + parser + model hint, verified on disk) | Owner picked A; no silent cut | P5-08 importer |
| G7 — DIYA catalog + persona (PLAN §10.B.17–18; 20 landed 2026-10-14 — re-verified) | Agent names/roles + neutral DIYA prompt approved? | DECIDED — A: neutral prompt, admin-editable; catalog approved as seeded (`diya` in `examples/orbo/agents.yaml`, `permitted_agents` in `examples/orbo/channels.yaml`, diya-first rule landed) | P5-09 seed content |
| G8 — W0 reconciliation | 01–08 finals + landed 20/21 reviewed? | RECORDED — G1–G8 DECIDED per freehand directive (reversible); 09 appendix checklist + D13 | Any Phase-5 work order |

---

## Reconciliation checklist (W0 exit)

- [x] G1–G8 recorded DECIDED per owner freehand directive (reversible); this doc still DRAFT pending R1 assembly before work orders.
- [x] 20-diya + 21-backend landed (on disk 2026-10-14); P5-09/P5-10 deltas folded (DIYA seed + `permitted_agents` + diya-first rule verified).
- [x] 01 §9 #1/#3 finals match G1/G2; 03 route freeze matches G3; 08 voice home ruled (D13:A).
- [ ] No product code changed by this plan; next step is work orders, not ports. (OPEN — work orders gated on R1 assembly + accounts/domain/certs/legal sign-off.)

## Appendix — traceability + verification

Traceability (slice → 09 workstream → 08 home): P5-01/P5-02/P5-03/P5-07 → WS-08 →
08 §7 Documents (`server/src/pages/`); P5-04/P5-05/P5-06 → WS-07 → `server/src/voice/` +
`app/src/lib/voice/` (08 has no voice section — D8 rules the home); P5-08/P5-09 → WS-02 →
agents superset (01 §5 row 1) + `examples/orbo/`; P5-10 → WS-10/WS-06/WS-03 → 08 §§8/4/1
(`server/src/plugins/`, `server/src/approvals/`, `server/src/computer/` gateway).

Verification note: this file was re-read after writing; line count checked against the
200–350 requirement; exactly one file created (`docs/planning/22-phase5-execution.md`);
no product code modified; no git commands run; other planning docs untouched.

*Derived from PLAN.md §§3/6/8.5/9 and docs/planning/08, 09, 16–19 snapshots (20/21 pending).*
*© Opraiz Technology Pvt Ltd · Developer: Narein Rao*
