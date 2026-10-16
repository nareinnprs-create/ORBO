# Phase 9 — Feature Parity Status (PLAN.md §6)

> Research + status only. No product code modified. Snapshot of the tree at Phase 9 kickoff:
> Phases 1–2 merged; Phase 7 executing; Phase 8 kicked off (docs 30–31); Phases 4–6 port
> merges have **not** run. Source: full read of PLAN.md §6 + spot-checks of `server/src`,
> `server/tests` (313 files, verified on disk 2026-10-16), `apps/app`, `examples/orbo`, `desktop`, `docs/planning/01–31`.
> Status rule: DONE = shipped in tree with file+test evidence (cited). PLANNED = design doc +
> execution slice, not yet merged. BLOCKED = gated on a W0 owner decision (cited). ABSENT = no
> design. Nothing is marked DONE without both.

## Summary counts (50 rows)

| Status | Count | Rows |
|---|---|---|
| DONE | 21 | Meet-1–Meet-4, G1–G7, C1, W2, Sk3–Sk4, Id1–Id2, Id4–Id5, Su2–Su3 |
| PLANNED | 24 | Meet-5, D3, W1, W3–W6, Conn1–Conn7, Sk1–Sk2, Id3, F1, C2–C4, D2 |
| BLOCKED | 5 | C5, D1, D2b, D5, Su1 |
| ABSENT | 0 | Every row has at least a design doc; the gap is execution, not design |

Key: Meet = Agents/computers · G = Governance · C = Chat · D = Documents · W = Work ·
Conn = Connections · Sk = Skills · Id = Identity · F = Finance · Su = Surfaces.

## Method

1. Read PLAN.md §6 in full (50 checkboxes across 10 areas).
2. Spot-checked the tree rather than trusting docs: `rg --files server/src` for module
   presence; `server/tests` listing (313 test files, verified on disk 2026-10-16) for backing evidence; `apps/app`
   routes for UI reality (TODO-stub shell per doc 03 §5); `examples/orbo/agents.yaml`
   for the DIYA seed row (ships at line 75 — landed after doc 20's "no diya id" finding);
   `desktop/` + docs 30–31 for the Tauri wrapper state.
3. Cross-referenced every non-DONE row against its design doc (01–08, 10–29) and execution
   slice (WS-01–WS-14 in doc 09) so each PLANNED row cites doc + slice ID.
4. BLOCKED is reserved strictly for rows gated on a W0 owner decision (01 §9 #1/#3, R6/R10).
   Nothing without both a shipping file and a backing test is marked DONE.

## Per-area rollup

| Area (§6) | DONE | PLANNED | BLOCKED | Note |
|---|---|---|---|---|
| Agents/computers (6) | 4 | 2 | 0 | OpenBot base ships; absorption merges pending (08 §1, WS-03) |
| Governance (7) | 7 | 0 | 0 | Strongest area; remaining work is superset mapping + cut-over (WS-05/06) |
| Chat (6) | 1 | 4 | 1 | Server channels ship; threads identity blocks C5 and downstream |
| Documents (5) | 0 | 2 | 3 | Weakest area with Chat/UI; spaces ownership blocks 3 of 5 |
| Work (6) | 1 | 5 | 0 | Engines ship; unification into one model pending (WS-09) |
| Connections (7) | 0 | 7 | 0 | Plugins/Composio/delivery ship partially; slice-2 adapters pending |
| Skills (4) | 2 | 2 | 0 | Components + AG-UI bring ship; skills store + learning containers pending |
| Identity/admin (5) | 4 | 1 | 0 | Server-side ships; full console UI pending (WS-12) |
| Finance (1) | 0 | 1 | 0 | Design only (doc 24, WS-13) |
| Surfaces (3) | 2 | 0 | 1 | Compose/health/modes ship; One UI gated on R6/R10 |

## Closest to DONE (PLANNED rows with shipping server-side halves)

| Row | Why it is close | What is missing |
|---|---|---|
| W1 Activity | `activity/activity.ts` + `work/{queue,loop}.ts` run today | Unified task model + fatigue/lease proof (WS-09) |
| W3 Responsibilities/Goals | `responsibilities/` engine + triggers + routes run today | Milestone/watch/backoff superset fold (doc 25, WS-09) |
| Conn-2 per-tool access | `plugins/access.ts` + `content-governance.test.ts` run today | OpenDots `mcp_approvals` mapping (WS-06) |
| Conn-6 channels reach | `delivery/{twilio,push,router}.ts` + tests run today | Slack allowlist + thread continuation (doc 11) |
| Conn-1 governed MCP | `plugins/{mcp,broker,composio*}.ts` + `composio-*.test.ts` run today | Slice-2 adapters: Drive/Notion/Parallel/Gmail (WS-10) |
| Sk2 Learning | `learning/` runtime + harness contract run today | Per-Agent containers + published-skill delivery (WS-11) |
| Id3 admin console | `admin/` routes + gate + capabilities run today | 13-section UI; slice 1 covers people + audit only (WS-12) |
| Meet-5 files/PDF | Gateway file ops run today | PDF pipeline + Documents target that does not exist yet (WS-08) |

Honesty notes: Meet-1/G2/Id1 are DONE as *capabilities* but carry rebrand debt (Bots→Agents
rename per docs 14/19; domain routing per 10.A.2). C1 is DONE server-side while its UI is a
stub — the DONE marks the protocol, not the screen. ABSENT is zero: every row has at least
a design doc; the gap is execution, not design.

## Status table

| # | §6 row | Status | Evidence | Next step |
|---|---|---|---|---|
| Meet-1 | Create/configure Agents (+AG-UI endpoint/auth header) | DONE | `server/src/agents/`, `server/tests/agent-{routes,registry,resolver,endpoint,auth-header}.test.ts`; `apps/app/.../agents/index.tsx` | Rename Bots→Agents per docs 14/19, WS-02 |
| Meet-2 | Per-Agent computer (container, /workspace, profile, gVisor) | DONE | `server/src/computer/{provider,supervisor,sandbox}.ts`; `computer-{provider,supervisor,sandbox,fleet-route}.test.ts` | Absorb OpenDots perms + OpenMuse backends (08 §1, WS-03) |
| Meet-3 | Browser control + takeover + handover | DONE | `server/src/computer/gateway.ts`; `computer-{gateway,human-input,handoff-contract}.test.ts`, `agent-handoff*.test.ts` | Map OpenDots `computer_*` tools onto gateway intents (WS-03) |
| Meet-4 | Shell/terminal, installs, files, receipts | DONE | `server/src/host-access/`, `server/src/computer/headless-tools.ts`; `computer-exec-timeout.test.ts` | Route any raw exec paths through gateway (R3, WS-03) |
| Meet-5 | Files: folders, text edit, PDF transfer to Documents | PLANNED | Gateway file ops ship (Meet-4); PDF→Documents needs pipeline | Doc 23 + WS-08 `server/src/pages/` + attachment flow |
| Meet-6 | **One computer subsystem** | PLANNED | Design 08 §1; no `computer_permissions`/`computer_audit` merge yet | WS-03 absorb steps (cols → intent map → provider wrap) |
| G1 | Gateway resolve→policy→audit→act, fail-closed | DONE | `server/src/computer/gateway.ts`; `computer-{gateway,route-governance,policy}*.test.ts` | 95% gateway coverage gate (WS-05) |
| G2 | Boundaries/presets, browser/file/MCP/shell + initiator rules | DONE | `server/src/computer/policy*.ts`; `computer-policy*.test.ts`, `audit-initiator.integration.test.ts` | Preset UX in admin console (WS-05 + WS-12) |
| G3 | Approvals per-Agent + team + approve-and-run cards | DONE | `server/src/approvals/`; `approvals-*.test.ts` (policy/store/execute/questions) | Superset map: ActionProposal + `mcp_approvals` (08, WS-06) |
| G4 | Audit trail (names the rule) | DONE | `server/src/audit*.ts`; `audit*.test.ts` (cursor/limit/retention/initiator) | Smoke: view `/admin/audit` (D3a) |
| G5 | Credentials write-only, encrypted, redacted | DONE | `server/src/credentials.ts`; `credentials.test.ts`, `credential-rotation-leak.integration.test.ts` | OpenDots plaintext-token cut-over first (R2, WS-05) |
| G6 | Secrets never enter transcript | DONE | `connector-tokens-never-reach-computer.test.ts`, `server/src/telemetry/scrub.ts` | Rotation-leak + log-scrub CI assertions (WS-05) |
| G7 | Loopback-by-default / token-per-container | DONE | `server/src/computer/{supervisor,provider}.ts`; `computer-supervisor.test.ts` | Security review incl. browser-login isolation (10.D.34) |
| C1 | Unified chat: text + group (2+ in To:) | DONE | `server/src/channels/`; `group-conversations*.test.ts`, `channel-routes.test.ts` | DIYA group-delegation journey test (WS-07, D3c) |
| C2 | AG-UI stream, send/stop pill, drafts | PLANNED | Server channels ship; `apps/app` chat tab is TODO-stub shell (doc 03 §5) | WS-07 + `packages/ui` chat primitives (WS-01) |
| C3 | Avatar+status, timeline receipts, side panel | PLANNED | `channel-{titler,summary,activity}*.test.ts` server-side only | WS-07 UI port from OpenDots (doc 03, WS-01) |
| C4 | Follow-up queue, delegated tasks, inline cards | PLANNED | Handoff runner ships; no queue/cards UI | WS-07 + WS-09 task unification |
| C5 | Rich Threads (persist, main+side, rename/archive/replay) | BLOCKED | Blocker 01 §9 #1 threads-vs-channels + R1; design 08 §5 | W0 owner decision on identity, then WS-07 |
| C6 | Realtime calls (WebRTC, controls, minimized, receipts) | PLANNED | `server/src/voice/` + session routes ship; doc 17; media path open (R7) | W1 `react-native-webrtc` spike, then WS-07 |
| D1 | Spaces: home for working documents | BLOCKED | Blocker 01 §9 #3 spaces ownership (flatten vs container); doc 16 | W0 decision, then WS-08 tables + UI |
| D2 | Pages (library, editor, slash, undo/redo, markdown, autosave) | PLANNED | Design doc 16; zero `server/src/pages/` code; no Tiptap editor | WS-08 + ported pages/autosave/markdown tests |
| D2b | Review-before-save → page in authorized Space | BLOCKED | Same #3 ownership gate; design doc 18 | W0 decision, then WS-08 review flow |
| D3 | Documents pipeline (email→PDF→fill→reply→receipt, viewer) | PLANNED | Attachments infra ships (`channels/attachments.ts` + tests); no PDF pipeline | Doc 23 + WS-08 (`pdf.test.ts` port) |
| D5 | **One document/Spaces model** | BLOCKED | Gated on #3 like D1/D2b; merge design 08 | W0 decision, then WS-08 single model |
| W1 | Activity (plans, progress, pause/resume/cancel/retry, leases) | PLANNED | `server/src/activity/activity.ts` + `work/{queue,loop}.ts` ship partially | WS-09 unify tasks/runs/events; prove fatigue + lease-expiry |
| W2 | Routines/scheduled, pause/retry, interrupted runs | DONE | `server/src/routines/`; `builtin-routines.test.ts`, `routines/*` routes/schedule/sweep | Keep schedulers as producers during merge (R5, WS-09) |
| W3 | Responsibilities + Goals/milestones, watches, alerts, backoff | PLANNED | `server/src/responsibilities/` engine+triggers ship; milestone/watch superset open | Doc 25 + WS-09 goals→responsibilities fold |
| W4 | Ideas (evidence-backed, edit/accept/dismiss) | PLANNED | `server/src/proactive/` engine+routes ship (delivery vehicle) | Doc 25 + WS-09 ideas→proactive fold |
| W5 | Background research | PLANNED | No research task kind; `apps/browser` absent | WS-04 (research as task kind) + WS-09 |
| W6 | **One Work subsystem** | PLANNED | Design 08 §6; three schedulers + two task models still separate | WS-09 phased collapse after parity tests (R5) |
| Conn-1 | Governed MCP + allowlists + Composio + Drive/Notion/Parallel | PLANNED | `server/src/plugins/{mcp,broker,composio*,access}.ts` + `composio-*.test.ts` ship; slice 2 open | WS-10 slice 2 (Composio/Drive/Notion/Parallel adapters) |
| Conn-2 | Per-tool access + approval + pause | PLANNED | `plugins/access.ts`, `content-governance.test.ts` ship; OpenDots map open | WS-06 `mcp_approvals` mapping (08) |
| Conn-3 | Gmail + Calendar adapters (OAuth, threads, drafts, CRUD) | PLANNED | Design doc 28; only catalogue/config mentions, no adapter module | WS-10 slice 2 Gmail/Calendar port |
| Conn-4 | Browser read-only public-page service + limits | PLANNED | No `apps/browser`; SSRF guard/budgets undesigned-in-code | WS-04 hardened fetch + governance |
| Conn-5 | Parallel research pipeline | PLANNED | Via governed MCP per design; no pipeline code | WS-04 ported research/parallel/transport tests |
| Conn-6 | Channels: Slack allowlist/threads + Teams/SMS reach | PLANNED | `server/src/delivery/{twilio,push,router}.ts` + `delivery-*.test.ts` ship; Slack map open | Doc 11 + WS-07/WS-10 Slack allowlist + continuation |
| Conn-7 | **One connections/plugins + one browser/research worker** | PLANNED | Design 08 §§4/9; `apps/browser` has no counterpart (08 layout note) | WS-04 + WS-10 after WS-03/WS-05 |
| Sk1 | Personal + deployment skills, `/` invoke, skill-creator | PLANNED | `skill-creator`/`bot-creator` granted in `examples/orbo/agents.yaml`; no skills store | WS-11 one `/`-invoked skill end-to-end |
| Sk2 | Automatic Learning (per-Agent containers, routing, delivery) | PLANNED | `server/src/learning/` + `tests/learning_harness_contract.py` ship partially | WS-11 deferred: per-Agent containers + published-skill delivery |
| Sk3 | Components (compiled, sandbox, publish+grants, data fns) | DONE | `server/src/components/`; `component-{catalogue,decision,grants-skills-validation,publication,store}*.test.ts` | Admin playground surface (doc 12, WS-12) |
| Sk4 | Bring any AG-UI agent | DONE | `agent-{endpoint,connection-live,test-connection-headers,callback-token}.test.ts` | Catalog approval per 10.B.17 |
| Id1 | Sign-in Google/Microsoft/Okta + SAML/OIDC runtime + routing | DONE | `server/src/auth/` (sso, scim, organization, roles); `auth-mobile-scheme` + `account-mode` tests | Domain routing needs owner domain (10.A.2) |
| Id2 | People: list/promote/demote/remove | DONE | `server/src/people/`; `admin-people-credentials-validation.test.ts` | Admin UI section (WS-12) |
| Id3 | Admin console (13 sections) | PLANNED | `server/src/admin/` routes+gate ship; full-section UI open; doc 12 | WS-12 (slice 1: people + audit only) |
| Id4 | Personal context (tone, avatar, memories, accounts, passwords) | DONE | `server/src/user-{preferences,instructions}.ts` + routes; memory routes | UI port into Settings (WS-01/WS-12) |
| Id5 | Memory: user-managed prefs usable by permitted agents | DONE | `server/src/memory/` (store/routes/tools/ingestion) | Intelligence billing owner input (10.A.6) |
| F1 | Finance: CSV import, spending summary, savings-goal action | PLANNED | Design doc 24; no finance module in `server/src` | WS-13 (slice 1: CSV→summary; goal action deferred) |
| Su1 | **One UI**: Expo Router → web+iOS+Android; Tauri desktop | BLOCKED | Scaffold only (`apps/app` TODO stubs, `packages/ui` 36 primitives verified on disk 2026-10-16); R6 RN-runtime + R10 desktop-role + R7 media open | W0 decisions (R6/R10), then WS-01 + ref screen A1 native proof |
| Su2 | Docker/compose, embedded Postgres, Helm, `/api/health` | DONE | `docker-compose.yml`; `tests/compose.test.ts`; `/api/health` in `server/src/app.ts` | R1 one-line install docs (10.E.40) |
| Su3 | Single-owner + multi-user modes | DONE | `account-mode.integration.test.ts`; `server/src/auth/organization*` | Bootstrap single-owner→`users` row rule (R8) |

## Critical path to 100%

1. **W0 owner decisions (BLOCKED first):** threads identity (01 §9 #1 → unblocks C5, WS-07) ·
   spaces ownership (01 §9 #3 → unblocks D1/D2b/D5, WS-08) · RN runtime + desktop role
   (R6/R10 → unblocks Su1, WS-01) · brand assets + domain (10.A.1–2 → tokens, IDs, updater).
2. **WS-07 chat/threads** (C2–C6) — threads decision is the top R1 risk; approvals continuation,
   pages, and routines all hang off it.
3. **WS-08 spaces/pages/documents** (D1–D5) — needs WS-07 threads + ownership decision.
4. **WS-03 one computer** (Meet-6) + **WS-06 approvals superset** (G3) + **WS-05 vault cut-over**
   (R2, highest severity) — needs WS-07 for continuation semantics.
5. **WS-09 one Work** (W1/W3–W6) after WS-06/WS-07; **WS-04 browser/research** (Conn-4/5, W5)
   after WS-03; **WS-10 connections** (Conn-1–3, Conn-7) slice 2; **WS-11 skills/learning**
   (Sk1–Sk2); **WS-13 finance** (F1); **WS-12 admin/id** (Id3); **WS-14 R1 packaging** (Su2).
6. **Close-out gates (PLAN §9):** `bun run lint && typecheck && test && build` green +
   `MINIMUM_TESTS`/coverage floors (`scripts/test-ci.ts`) · compose boot + D3a–D3c smokes
   (incl. DIYA delegation — seed row `diya` in `examples/orbo/agents.yaml:75` ships, journey
   test pending per doc 20 + WS-02) · §6 100% checked · origin sweep zero · R1 unsigned
   installers (MSI/DMG/AppImage+deb) per-OS via desktop CI wired into release (`publish-release.yml` desktop job ships exactly what desktop CI proved); R2 store path deferred to accounts (10.A.5/7).

## Risks to the critical path (from 09 §5)

- R1 conversation-identity ambiguity gates threads, approvals continuation, pages, routines.
- R2 OpenDots plaintext-token import is highest severity; vault-first cut-over rides WS-05.
- R3 ungoverned browser/computer routes must go through `computerGateway`, never aliased.
- R6 `packages/ui` RN-port stall: 36 primitives landed (verified on disk 2026-10-16), RN-runtime decision + A1 proof open.
- R10 desktop role confusion (supervisor vs wrapper) needs the R10 W0 decision before Su1.
- R8 timestamp/key conversion + single-owner→`users` bootstrap rule apply to every importer.
