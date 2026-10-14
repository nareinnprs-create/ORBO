# 09 — Phase 3 Execution Plan (PLAN.md §8 Phases 3–7, §9 Gates)

> **Status: DRAFT — 01–08 structurally verified 2026-10-14; owner decisions in §6 still pending before Wave 0 work orders.**
> Reconcile open blockers (notably 01 §9 #1 threads-vs-channels, #3 spaces ownership) before cutting Wave 0 work orders.
> Research and docs only. No product code modified by this document.

**Sources:** `PLAN.md` §§3, 6, 7, 9, 10 (full read); `docs/planning/01`–`08`
read once at draft time. Every workstream below is grounded in a PLAN §6
parity row. Nothing ships unless §6 is 100% checked.

---

## 1. Phase 3 definition of done (mapped to PLAN §9 acceptance gates)

Phase 3 = PLAN §8 phases 3–7 (unify UI base; port OpenBot surfaces; port
OpenDots surfaces; port OpenMuse screens; unify subsystems). Phase 3 is done
when ALL of the following hold:

| # | PLAN §9 gate | Phase 3 DoD interpretation |
|---|---|---|
| D1 | `bun run lint && bun run typecheck && bun run test && bun run build` pass | Green on every merge to main. `MINIMUM_TESTS` floor (06 §5) never lowered. Ported `node:test`/`vitest` files converted to `bun:test` with restorable `spyOn`, never leaking `mock.module` (06 §11). |
| D2 | Docker compose boots: `orbo-api` healthy, app reachable, browser worker reachable | `deploy/compose` stack up in WSL2 + Docker. `/api/health` 200, web export served, `apps/browser` worker answers governed read. Covers §6 Surfaces + Connections. |
| D3a | Smoke: create Agent, governed browser action, view `/admin/audit` | WS-02 + WS-05 + WS-06 + WS-03 proven end-to-end. Unresolvable ref refused, deny-beats-allow, audit row names the rule. |
| D3b | Smoke: open Spaces editor; launch mobile web bundle | WS-08 editor CRUD + revision check green; Expo web export renders Chat + Spaces (05 F17). |
| D3c | Smoke: DIYA delegation works | WS-02 DIYA seeded boss routes work to a specialist, opens group channel, collects result in main thread (PLAN §3 DIYA model). |
| D4 | Feature-parity matrix 100% (§6 fully checked) | Every §6 checkbox in §2 table below checked with a backing test path (06 §4). No row closed by alias alone. |
| D5 | Origin sweep zero first-party hits | `rg -i "copilotkit|openbot|openmuse|opendots|opentag"` returns zero outside `NOTICE.md`/`LICENSE`/`UPSTREAM.md`. Mascots, capybara, old CSS vars gone (04 G4). |
| D6 | R1 self-host packaging (PLAN §7 + §10.E) | Web static export + compose self-host + Tauri unsigned installers (Win MSI, macOS DMG, Linux AppImage+deb). One-line install documented. |

Out of scope for Phase 3: R2 store submissions (gated on §10.A.5/7 accounts),
signing/notarization activation, public `/api/v1`.

---

## 2. Workstream table (every row grounded in PLAN §6)

Size: S = days, M = 1–2 weeks, L = 2+ weeks / cross-cutting.

| ID | Workstream (PLAN §6 ground) | Scope | Deps | Primary dirs | Acceptance test | Size |
|---|---|---|---|---|---|---|
| WS-01 | Unified UI base + design system + route tree (§6 Surfaces: one UI) | `packages/ui` tokens/primitives/chat/layout; Expo Router tree per 03 §5; port Vite app → `apps/app`, delete Vite shell after parity | 01–05 docs; Wave 0 | `apps/app/`, `packages/ui/`, `app/` (delete after) | `app/tests/*.test.tsx` ported pass; axe zero serious; reference screen A1 frozen | L |
| WS-02 | Agents registry + DIYA seeding (§6 Agents: create/configure Agents) | Unify Bots/Dots/agent → Agents; DIYA pinned boss config; endpoint+auth header, visibility, hide/pin/duplicate | WS-01, schema `agents` | `apps/server/src/agents/`, `apps/app/**agents**`, `examples/orbo/` | Create agent via API+UI; DIYA delegates to specialist, group thread receipt | M |
| WS-03 | One computer subsystem (§6 Agents: per-Agent computer, browser control, shell, files) | Gateway resolve→policy→audit→act; snapshot/frame stores; nav/click/type/exec; files; takeover; gVisor; absorb OpenDots perms/audit + OpenMuse view | WS-05, WS-06 | `apps/server/src/computer/`, `apps/computer/` (`agent-computer/`), `apps/server/src/host-access/` | `server/tests/computer-*.test.ts` + gated Chromium suites; governed browser action audited | L |
| WS-04 | Browser / research worker (§6 Connections: browser read-only service, Parallel pipeline) | `apps/browser` hardened fetch (SSRF guard, budgets); research as task kind; Parallel via governed MCP | WS-03, WS-10 | `apps/browser/`, `apps/server/src/proactive/`, `apps/server/src/work/` | Ported `research/parallel/security/transport` tests; smoke research run | M |
| WS-05 | Governance gateway + policy + audit + credentials (§6 Governance: gateway, boundaries, audit, credentials, secrets, loopback) | Boundaries presets; action_policy; audit trail; encrypted vault; OpenDots plaintext-token cut-over; transcript redaction | Schema 01 §5–§7 first | `apps/server/src/db/schema/`, `apps/server/src/admin/`, `apps/server/src/passwords/` | 95%/90% coverage on gateway path; rotation-leak test; no secret in transcript/log | M |
| WS-06 | One approvals superset (§6 Governance: approvals per-Agent+team+cards) | Rule engine + inbox + resume; widen `approval_requests` + `approval_receipts`; map OpenMuse `ActionProposal` + OpenDots `mcp_approvals` | WS-05, threads (WS-07) | `apps/server/src/approvals/`, `apps/server/src/plugins/shared-use*` | `approvals-*.test.ts`; single-execution + decline-persistence across all 3 sources | M |
| WS-07 | Chat + threads + realtime calls (§6 Chat: unified chat, AG-UI stream, receipts, threads, calls) | Channels/threads/messages unification; send/stop pill, drafts; rename/archive/restore/replay; WebRTC call + receipts | WS-01, WS-05 | `apps/server/src/channels/`, `apps/app/**chat**` | `channel-*/group-conversations*` tests; DIYA group journey; call controls render | L |
| WS-08 | Spaces / Pages / Documents pipeline (§6 Documents: Spaces, Pages editor, review-before-save, PDF pipeline) | New `server/src/pages/`; spaces/pages/reviews/threads tables; Tiptap editor; PDF import/fill/reply; flatten vs container per 01 §9 #3 | WS-07 (threads) | `apps/server/src/pages/`, `apps/server/src/channels/attachments.ts`, `apps/app/**spaces**` | Ported `pages/page-review/autosave/markdown` + `pdf.test.ts`; open editor smoke | L |
| WS-09 | One Work subsystem (§6 Work: activity, routines, responsibilities/goals, ideas, background research) | Unified `tasks/task_runs/task_events/monitors`; schedulers as producers; fatigue rule; leases; goals→responsibilities, ideas→proactive | WS-06, WS-07 | `apps/server/src/routines/`, `responsibilities/`, `proactive/`, `work/` | `routine-*/work-*` tests; fatigue + lease-expiry proven | M |
| WS-10 | Connections + plugins + channels reach (§6 Connections: governed MCP, per-tool approval, Gmail/Calendar, Channels Slack/Teams/SMS) | `server/src/plugins` canonical; per-tool grants; Composio brokering; Google as governed connector (no new mail routes v1); Slack allowlist | WS-05, WS-06 | `apps/server/src/plugins/`, `apps/server/src/components/`, `apps/server/src/delivery/` | `plugin-*/composio-*` tests; per-tool approval defaults; tool-name stability | M |
| WS-11 | Skills + learning + components + bring-AG-UI (§6 Skills: skills, learning, components, any AG-UI agent) | Personal/deployment skills; learning containers; demonstrations→skill; compiled components + sandbox playground | WS-07, WS-10 | `apps/server/src/learning/`, `demonstrations/`, `apps/server/src/components/` | `learning-*/demonstrations-*` tests; ported `learning-delivery` tests | M |
| WS-12 | Identity + admin + memory + personal context (§6 Identity: sign-in, people, admin console, context, memory) | Better Auth only; people; full admin console; personal context; memory superset (dedupe/tombstone/sync) | WS-05 | `apps/server/src/memory/`, `apps/server/src/admin/`, `apps/app/**settings**`, `**admin**` | `memory*` + admin tests; dedupe-survives-delete; single-owner + multi-user modes | M |
| WS-13 | Finance (§6 Finance: CSV import, spending summary, savings-goal) | CSV import + categorized summary + goal action; picker per-platform (05 F1) | WS-01, WS-09 | `apps/server/src/work/`, `apps/app/**work**`, `packages/integrations/` | Ported `finance*.test.ts`; CSV→summary journey | S |
| WS-14 | Desktop + deploy + R1 packaging (§6 Surfaces: compose, embedded Postgres, health; §7 R1) | Tauri wraps web export; 3-OS installers + CI macOS runner; compose + Helm `orbo-diya`; `/api/health` | All above | `apps/desktop/`, `deploy/compose/`, `deploy/charts/orbo-diya/`, `scripts/` | Compose boots; installers build unsigned; health green | M |

Traceability: WS-03→Agents/computers; WS-05/WS-06→Governance; WS-07→Chat;
WS-08→Documents; WS-09→Work; WS-04/WS-10→Connections; WS-11→Skills;
WS-12→Identity; WS-13→Finance; WS-01/WS-14→Surfaces.

---

## 3. Dependency-ordered waves (parallelizable vs gated)

Per 08 §merge-sequence: threads gate approvals/documents/routines; vault
gates connectors/computers; approvals gate computers/routines.

| Wave | Workstreams | Parallelizable? | Gate to exit |
|---|---|---|---|
| W0 — Design freeze | 01 schema map + 02 API map + 03 route map + 04 tokens + 06 test harness + 08 merge plan inputs | Yes — five docs can refine in parallel; one owner review | Owner resolves 01 §9 #1 (threads vs channels) and #3 (spaces ownership); brand purple + fonts signed (04 B2/B3) |
| W1 — Foundations | WS-05 (vault+gateway skeleton) + WS-01 (ui tokens + route shell) + WS-07 threads identity slice | WS-05 ∥ WS-01; WS-07-threads starts once 01 §9 #1 resolved | `threads` table + vault encrypt/decrypt proven; `bun run typecheck` green |
| W2 — Gate + control plane | WS-06 (approvals) + WS-02 (agents+DIYA) + WS-12 memory/admin slice | WS-02 ∥ WS-06 after W1; both need threads+vault | Approval single-execution test; DIYA delegation smoke in dev |
| W3 — Capabilities (parallel fan-out) | WS-03 computers + WS-10 connectors + WS-09 work + WS-11 skills/learning | All four parallel after W2 (shared gateway/approvals) | Per-WS acceptance in §2 table; no ungoverned browser route mounted |
| W4 — Surfaces + knowledge | WS-07 chat/calls remainder + WS-08 spaces/pages/docs + WS-04 browser/research + WS-13 finance | WS-13 ∥ WS-04 ∥ WS-08 after W3; chat remainder needs W2 | Spaces editor smoke; research smoke; finance CSV journey |
| W5 — Ship R1 | WS-14 desktop/deploy + WS-01 parity sweep + brand/docs/parity/origin sweep (PLAN §8 ph.9) | Sequential — gated on W3+W4 | §1 D1–D6 all green; origin sweep zero; R1 installers published unsigned |
| W6 — R2 pipeline (deferred) | EAS builds, store listings, signing activation | Blocked on owner accounts (§6) | EAS iOS/Android build green in CI (no submission until accounts) |

Critical path: W0 → W1 (threads+vault) → W2 (approvals) → W3 (computers) →
W4 (spaces/research) → W5 (R1). WS-13 finance is off-critical-path and can
slip one wave without blocking R1.

---

## 4. Smallest shippable first slice per workstream

| ID | First slice (independently demonstrable) |
|---|---|
| WS-01 | Tokens (`colors/typography/spacing`) + reference screen A1 Agents list in `packages/ui`; route shell with Home + Agents only. |
| WS-02 | Single agent CRUD + DIYA seed config that answers in Home and delegates one canned task to one specialist. |
| WS-03 | One governed `navigate+snapshot` round-trip on one container with one audit row; everything else 403-fail-closed. |
| WS-04 | Read-only `POST /browse` for one public URL with SSRF guard + budget enforced; no research orchestration yet. |
| WS-05 | Vault write→read→rotate→revoke for one credential kind; gateway refuse on unresolvable ref with audit row. |
| WS-06 | One approval request → approve-and-run card → receipt; decline persists until user speaks again. |
| WS-07 | One 1:1 channel thread with streamed AG-UI turn + retained draft; rename/archive deferred. |
| WS-08 | One space + one page CRUD with revision check; editor is plain markdown before Tiptap lands. |
| WS-09 | One cron routine firing one task with run row + receipt; fatigue/lease deferred to slice 2. |
| WS-10 | One MCP server + one tool with per-agent allowlist; Composio deferred to slice 2. |
| WS-11 | One `/`-invoked personal skill end-to-end; learning containers deferred. |
| WS-12 | Single-owner sign-in + one memory create/recall; admin console shows people + audit only. |
| WS-13 | One CSV upload → categorized summary table; savings-goal action deferred. |
| WS-14 | `docker compose up` → healthy API + web reachable + `/api/health`; installers deferred to slice 2. |

---

## 5. Top-10 risk register

| # | Risk (source) | Impact | Mitigation |
|---|---|---|---|
| R1 | Conversation-identity ambiguity: `channels` vs `threads` vs Intelligence history (01 §8/§9 #1, 08 §5) | Gates threads, approvals continuation, pages, routines | Resolve 01 §9 #1 in W0; keep `channels` as team surface + `threads` attach; never mirror Intelligence silently — wrap for liveness only |
| R2 | OpenDots plaintext MCP tokens imported as-is (01 §8, 08 §9) | Credential leak; highest severity | Vault-first cut-over in W1: encrypt into `credentials`, server row holds pointer; test asserts no plaintext in storage/logs |
| R3 | Ungoverned browser/computer routes mounted for parity speed (02 risk #4, 08 §1) | Bypasses policy/audit | Route every browser/desktop action through `computerGateway`; delete raw `/api/computer/*`, never alias; CI route-introspection test |
| R4 | Bun single-process `mock.module` leakage from ported vitest files (06 gap #4) | Green suite that poisons later files; flaky CI | Convert every ported file to restorable `spyOn`; reserve `mock.module` for preload + `*.fixture.tsx`; fail CI on new `mock.module` in tests |
| R5 | Three schedulers + two new task models collapse too early (01 §8, 08 §6) | Lose cron tz/fatigue/lease semantics | Keep ORBO schedulers as producers enqueueing unified `tasks` in step 1; unify orchestration only after parity tests prove fatigue + lease-expiry |
| R6 | `packages/ui` RN-port stalls: web-only Base UI/Tailwind primitives don't run on native (04 G2, 05 R6) | No iOS/Android; §6 Surfaces fails | W0 decision: re-author on RN+RN-web, gallery web-only; reference screen A1 proves native render before fan-out |
| R7 | Native voice/dictation has no media modules; TURN/STUN unknown (05 R1/R2) | Realtime calls + composer dictation miss parity | Spike in W1: `react-native-webrtc` vs server media path; server contract (`/api/voice`, `/api/audio`) shared regardless; degrade to receipts if blocked |
| R8 | Timestamp/key conversion bugs: epoch-ms vs ISO vs timestamptz; single-owner strings vs `users.id` (01 §8) | Silent ordering/auth bugs across importers | One converter per importer + DST/UTC test; bootstrap single-owner → `users` row; never copy owner strings raw |
| R9 | Coverage floor hides dropped suites: 400 floor vs ~3,500 static cases (06 gap #2); no coverage tool | Regressions ship green | Add `bun test --coverage` thresholds (06 §5: server 80%, gateway 95%) to `test-ci.ts`; assert per-directory file counts |
| R10 | Desktop role confusion: current Tauri shell is a setup supervisor, PLAN §3 says web-export wrapper (05 R7) | Wrong installer ships | W0 decision: desktop = web export + local engine supervisor or pure wrapper; register `ai.orbo.*` deep links in both `tauri.conf.json` + Expo `app.json` |

---

## 6. Owner-input / legal / release blockers (from PLAN §10)

### A. Owner inputs — required before or during W0 (PLAN §10.A.1–7)

1. Brand assets (logo, color tokens, fonts) — blocks 04 tokens + avatars + PWA/Tauri metadata.
2. Domain — blocks bundle IDs, links, updater endpoint (B14), CORS/health defaults.
3. Git host + repo name/org — blocks CI, fresh `git init` detached history.
4. npm scope `@orbo/*` vs `@orbo-diya/*` — blocks `packages/*` rename + publish.
5. Expo/EAS org account — blocks native builds + push (05 R3); R2 deferred without it.
6. Intelligence project owner — blocks threads/memory runtime billing + data-flow disclosure.
7. Release accounts (Apple Developer, Google Play, Windows cert) — R2 only; R1 ships unsigned.

### B. Open decisions needing sign-off (PLAN §10.B.8–21, executing default unless vetoed)

Upstream pin = latest `main` SHA at clone; version `0.1.0`; embedded Postgres
on + `DATABASE_URL` override; keep upstream ports; bundle IDs `ai.orbo.app` /
`ai.orbo.desktop`; MSI+DMG+AppImage/deb; Tauri updater placeholder; TanStack
Query+Zustand; Better Auth only; agent catalog names/roles; neutral DIYA
persona; GitHub Actions CI; in-repo docs; logs + `/api/health`, no APM v1.

### C. Design/engineering pending (PLAN §10.C.22–28 → docs 01–08)

C22 schema (01) · C23 API (02) · C24 routes (03) · C25 design system (04) ·
C26 visual approach (07) · C27 parity (05) · C28 test strategy (06). This
09 draft reconciles against their FINAL versions in W0 exit review.

### D. Compliance / legal / ops (PLAN §10.D.29–37) — gate W5 R1

Trademark check ORBO/DIYA · domain+scope availability · transitive license
scan into `NOTICE.md` (incl. Montserrat/Inter OFL) · Privacy Policy + Terms
(Intelligence, Parallel, Google, Composio flows) · data-flow disclosure ·
security review (vault, browser-login isolation, loopback) · backup/restore
docs · proprietary CONTRIBUTING/SECURITY · WCAG 2.2 AA target (07 §5).

### E. Release/ops (PLAN §10.E.38–42) — gate R1 / defer R2

Signing wiring + CI secrets (deferred) · store listings/metadata/screenshots
(deferred) · self-host one-line install + deploy docs (R1) · versioning/
changelog policy · support intake process.

---

## Appendix — reconciliation checklist for final 01–08

- [ ] 01 final: threads-vs-channels (#1) + spaces ownership (#3) + `records` keep/retire (#2) resolved.
- [ ] 02 final: `/api/pages` + `/api/browsers` canonical paths confirmed; alias list frozen.
- [ ] 03 final: Expo route tree frozen; bots→agents redirects mapped.
- [ ] 04 final: purple scale + Montserrat vendored; icon set fixed.
- [ ] 05 final: mobile surface scope (R12) + desktop role (R7) + media path (R1/R2) decided.
- [ ] 06 final: coverage tool + per-dir floors + ported-file runner rule set.
- [ ] 07 final: reference screen choice + 4 wireframes approved.
- [ ] 08 final: merge sequence unchanged or deltas folded into §3 waves above.

*Derived from PLAN.md §§3/6/7/9/10 and docs/planning/01–08 snapshots.
© Opraiz Technology Pvt Ltd · Developer: Narein Rao*
