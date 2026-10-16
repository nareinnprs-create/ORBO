# ORBO — Master Plan

> **Product:** ORBO
> **Boss agent:** DIYA (the primary orchestrator inside ORBO)
> **Owner:** Opraiz Technology Pvt Ltd · **Developer:** Narein Rao
> **Status:** Phases 1–2 complete and pushed; Phase 3 designs in `docs/planning/01–09`; Phase 4 kickoff done (10–15 + `apps/app` scaffold); Phase 5 kickoff done (16–22); Phase 6 kickoff done (23–29); Phase 7 executing; Phase 8 kickoff done (30–31); Waves 1–3 done + freehand execution (W0 slate, service/image names, deploy/ layout, scheme orbo:, permitted_agents, catalog fixes, legal/security/privacy runs) — CI green baseline; accounts/domain/certs/legal sign-off owner-only.

This document is the single source of truth for merging three upstream products into one
unified product, **ORBO**, with a single interface and no visible origin traces. Upstream
projects are referenced only in `NOTICE.md` and `UPSTREAM.md` (provenance), never in
first-party code, UI, docs, or configuration.

---

## 1. Locked decisions

| Area | Decision |
|---|---|
| Product | **ORBO**; **DIYA** = boss agent |
| Base | **OpenBot** core; package manager **bun** |
| UI | **One Expo Router app** (React Native + `react-native-web`) → web/iOS/Android; **Tauri** desktop |
| Features | **Union of all three products**, one implementation each — nothing dropped |
| Platforms | Web, iOS, Android, Windows desktop, macOS desktop, Linux desktop |
| Release order | **Self-hosted / direct first**, then mobile + desktop stores |
| Signing | Accounts not yet held → **deferred**; build configs prepared, submission later |
| Git | Fresh `git init`, no upstream history; new **private** repo; **detached** from upstream |
| Intelligence | **Keep** CopilotKit Intelligence (documented in `NOTICE.md`) |
| Telemetry | **Disabled** by default |
| Model | **No default**; admin picks on first run |
| ORBO license | **Proprietary / all-rights-reserved**; MIT notices preserved for derived code |
| Copyright | © Opraiz Technology Pvt Ltd · Developer: Narein Rao |
| Agents | Shipped catalog **rebranded to ORBO agents**, DIYA boss |
| DIYA persona | **Neutral** default prompt, admin-customizable |
| Data | Fresh install only |
| Language | English only |
| Auth default | Single-owner |
| Assets | Provided by owner (logo, colors, fonts, domain) |

---

## 2. Constraints and ground rules

**Legal**
- All three upstream repos are **MIT licensed**. MIT requires preserving copyright and
  permission text. Brand traces are removed everywhere first-party; the required notices
  live in `NOTICE.md` + `LICENSE`. No copyright text is deleted.
- ORBO itself ships **proprietary**.

**Technical — irreducible third-party surface** (cannot be removed without rewriting the runtime):
- Published `@copilotkit/*` SDKs, CopilotKit **Intelligence** endpoints (mandatory for
  threads/memory), AG-UI protocol packages, `ghcr.io/copilotkit/*` images, Channels SDK,
  Parallel search MCP, Composio. All are catalogued in `NOTICE.md`.

**Environment**
- Development/build verification uses **WSL2 + Docker** (repo lives on Windows at `C:\Users\manag\ORBO`).
- No local Mac. iOS/Android release via **EAS cloud**; macOS desktop via **GitHub Actions macOS runner**.

**Toolchain**
- Single package manager: **bun**. OpenMuse (pnpm) and OpenDots (npm) lockfiles are discarded;
  one `bun.lock` is regenerated from OpenBot's dependency graph after porting.

---

## 3. Target architecture

### Repository layout
```
ORBO/
├─ apps/
│  ├─ app/        # THE single UI: Expo Router (RN + RN-web) -> web/iOS/Android
│  ├─ server/     # Hono API + runtime + governance/audit (OpenBot core)
│  ├─ worker/     # routines / background work
│  ├─ browser/    # Playwright browser + research worker
│  ├─ computer/   # per-Agent Linux computer image
│  └─ desktop/    # Tauri shell wrapping the web export (no separate UI)
├─ packages/
│  ├─ ui/         # SOLE design system: tokens, primitives, screen compositions
│  ├─ domain/     # shared types + validation
│  ├─ integrations/  # Google, browser, Slack/Channels, MCP adapters
│  └─ backends/   # agent/computer backend adapters
├─ examples/orbo/ # tenant package (was examples/fintech) shipping DIYA + ORBO agents
├─ deploy/
│  ├─ compose/    # docker-compose*.yml
│  └─ charts/orbo-diya/   # was charts/openbot
├─ docs/
├─ scripts/       # renamed start/stop scripts (bash; WSL)
├─ _sources/      # git-ignored upstream clones (pinned SHAs)
├─ LICENSE  NOTICE.md  UPSTREAM.md  README.md  PLAN.md  .env.example
```

### Rules
- All three source UIs converge into `apps/app` + `packages/ui`. The OpenBot Vite app,
  OpenDots web app, and OpenMuse app-as-shell are **deleted** once ported.
- All business logic lives in `apps/server`. The UI is presentation only.
- Where the three overlap (computers, browser workers, memory, approvals, threads,
  agent entity), ORBO ships **one** subsystem carrying the **superset** of behavior.

### DIYA — boss agent model
- **DIYA** is the default agent seeded on every ORBO deployment (configuration, not code).
- DIYA **orchestrates**: routes work to other agents, opens group conversations, delegates
  tasks, collects results, and reports back in the main thread.
- DIYA carries the superset of "general" roles: personal-context assistant (OpenMuse),
  workspace/specialist coordinator (OpenDots), everyday work + company knowledge (OpenBot).
- All other entities unify into **Agents** (OpenDots "Dots", OpenBot "Bots", OpenMuse
  "personal agent"). DIYA is boss at the top.
- DIYA owns boss-agent capabilities: delegation, group-channel creation, responsibility/goal
  ownership, unified approvals/audit trail.

### Unified information architecture (one navigation)
- **Home** — DIYA's surface; the default conversation the user lands on.
- **Chat** — unified conversations; 1:1 or group; specialists = Agents.
- **Spaces** — document library: OpenDots Pages editor + OpenMuse Documents/PDF.
- **Agents** — DIYA (pinned boss) + all other agents; profile, tools, reach, memory, approvals, routines.
- **Work** — activity + routines + goals/tracking + background runs.
- **Connections** — Gmail/Calendar, MCP, Slack/Channels, browser/computer.
- **Settings** — profile, memory, notifications, approvals, accounts, appearance.
- **Admin** — boundaries, audit, credentials, people, computers, plugins, components, skills, learning, identity.

---

## 4. Rebrand token map (apply longest-token-first, repo-wide)

| From | To |
|---|---|
| `CopilotKit/OpenBot`, `OpenBot`, `openbot` | `ORBO` / `orbo` |
| `OpenMuse`, `openmuse` | `ORBO` / `orbo` |
| `OpenDots`, `opendots` | `ORBO` / `orbo` |
| `OpenTag`, `opentag` | `orbo-tag` (or drop if unused) |
| npm scope `@copilotkit/*` (our packages only) | `@orbo/*` |
| workspace pkgs `openbot`, `openmuse` | `orbo`, `@orbo/*` |
| env `OPENBOT_*`, `OPENMUSE_*` | `ORBO_*` |
| env `COMPUTER_*`, `AGENT_*` (ours) | `ORBO_COMPUTER_*`, `ORBO_AGENT_*` |
| `CPK_INTELLIGENCE_API_KEY` | keep (Intelligence field name) |
| dirs `agent-*` | `agent-orbo-*` |
| docker service/image `openbot`, `openmuse-*` | `orbo`, `orbo-api`, `orbo-browser` |
| DNS/labels telemetry `accessibility_title`, tags | removed (telemetry disabled) |
| DB schema/role `openbot` | `orbo` |
| `examples/fintech` | `examples/orbo` |
| Helm `charts/openbot` | `deploy/charts/orbo-diya` |
| `ghcr.io/copilotkit/openbot` | leave (third-party → NOTICE) |
| `api.cloud.copilotkit.ai`, `docs.copilotkit.ai` | leave (third-party → NOTICE) |
| badges/links to copilotkit.ai, trendshift, render.com | removed from docs |

**Brand assets:** new logo, color tokens, favicon, `public/` art, PWA manifest, Tauri product
name/metadata, Expo `app.json` name/slug/bundle id → ORBO.

---

## 5. Third-party inventory (content of NOTICE.md)

At minimum, credit and preserve license text for:
- OpenBot, OpenMuse, OpenDots (MIT, CopilotKit) — full license text + copyright.
- `@copilotkit/*` SDKs, CopilotKit Intelligence, AG-UI (`ag-ui-protocol/ag-ui`),
  Channels SDK, `parallel.ai` Search MCP, Composio.
- Playwright / Chromium, PostgreSQL / pgvector, Expo / React Native, Tauri, Bun.
- All transitive dependencies surfaced by the Phase 9 dependency license scan.

Plus: a line stating portions are derived from MIT-licensed projects (see `LICENSE`).

---

## 6. Feature parity matrix (union — the "nothing missing" checklist)

Every row is a ship requirement. `≡` marks features that overlap across upstream products
and collapse into **one** ORBO subsystem.

### Agents and computers
- [ ] Create/configure Agents: name, role, instructions, visibility, AG-UI endpoint + auth header *(OpenBot)*
- [ ] Per-Agent computer: container, `/workspace` volume, persistent browser profile, gVisor option *(OpenBot)*
- [ ] Browser control + human takeover + recorded handover *(OpenBot ≡ OpenDots ≡ OpenMuse)*
- [ ] Shell/terminal in workspace, install packages, process files, command receipts *(OpenBot + OpenMuse)*
- [ ] Files: folders, text edit, PDF transfer to/from Documents *(OpenMuse)*
- [ ] **One computer subsystem** for all of the above

### Governance and safety
- [ ] Single gateway: resolve → policy → audit row → act; fail-closed *(OpenBot)*
- [ ] Boundaries/policy presets; browser/file/MCP/shell rules; `initiator` rules *(OpenBot)*
- [ ] Approvals: per-Agent + team rules + approve-and-run cards *(OpenBot ≡ OpenDots ≡ OpenMuse)*
- [ ] Audit trail (permitted/refused/failed, names the rule) *(OpenBot)*
- [ ] Credentials: write-only, encrypted at rest, redacted *(OpenBot)*
- [ ] Secrets never enter transcript *(OpenBot)*
- [ ] Loopback-by-default / token-per-container *(OpenBot)*

### Chat and conversations
- [ ] Unified chat: text + group (2+ in To:) *(OpenBot)*
- [ ] Streamed AG-UI events, send/stop pill, retained drafts *(OpenMuse)*
- [ ] Continuous conversation with avatar+status, timeline receipts, side panel *(OpenDots)*
- [ ] Follow-up queue, delegated tasks, inline cards (email/browser/PDF/plan/finance) *(OpenMuse)*
- [ ] Rich Threads: durable persistence, main + side chats, rename/archive/restore/replay *(OpenMuse)*
- [ ] Realtime calls: WebRTC speech, delegated compute, call controls, minimized view, receipts *(OpenDots)*

### Documents and knowledge
- [ ] Spaces: home for working documents *(OpenDots)*
- [ ] Pages: library, grid/list, nested subpages, visual editor, slash commands, undo/redo, markdown mode, autosave + revision checks *(OpenDots)*
- [ ] Review-before-save → creates page in authorized Space *(OpenDots)*
- [ ] Documents pipeline: email attachment → PDF → form values → filled copy → reviewed reply → receipt; PDF view/paging/zoom/share *(OpenMuse)*
- [ ] **One document/Spaces model** covering both

### Work
- [ ] Activity: durable task plans, progress, input requests, pause/resume/cancel/retry, receipts, SQL leases *(OpenMuse)*
- [ ] Routines/scheduled tasks, pause/retry, interrupted-run handling *(OpenBot + OpenDots)*
- [ ] Responsibilities + Goals/tracking/milestones, recurring public-page watches, alerts, backoff *(OpenBot ≡ OpenMuse)*
- [ ] Ideas: evidence-backed suggestions, edit/accept/dismiss *(OpenMuse)*
- [ ] Background research *(OpenDots)*
- [ ] **One Work subsystem**

### Connections and tools
- [ ] Governed MCP, per-Agent allowlists, Composio brokering, Google Drive, Notion, Parallel *(OpenBot)*
- [ ] Per-tool access + approval + pause *(OpenDots)*
- [ ] Gmail + Google Calendar adapters (OAuth, threads, drafts, event CRUD) *(OpenMuse)*
- [ ] Browser: read-only public-page service, capture, nav limits *(OpenDots)*
- [ ] Parallel research pipeline *(OpenDots + OpenMuse)*
- [ ] Channels: Slack (allowlist, thread continuation) *(OpenDots)* + Slack/Teams/SMS reach *(OpenBot)*
- [ ] **One connections/plugins subsystem + one browser/research worker**

### Skills and extensibility
- [ ] Personal + deployment skills, `/` invocation, `skill-creator` *(OpenBot)*
- [ ] Automatic Learning: per-Agent Learning containers, evidence routing, published-skill delivery *(OpenDots)*
- [ ] Components: compiled React components, sandboxed playground, publish + grants, data functions *(OpenBot)*
- [ ] Bring any AG-UI agent *(OpenBot)*

### Identity, users, admin
- [ ] Sign-in: Google/Microsoft/Okta + SAML/OIDC registered at runtime, domain routing, single-admin mode *(OpenBot)*
- [ ] People: list/promote/demote/remove *(OpenBot)*
- [ ] Admin console: credentials, approvals, computers, boundaries, components, playground, plugins, skills, learning, people, identity-providers, enterprise, audit *(OpenBot)*
- [ ] Personal context: name, tone, avatar, memories, notifications, connected accounts, saved passwords *(OpenMuse + OpenBot)*
- [ ] Memory: user-managed prefs usable by permitted agents *(all three)*

### Finance
- [ ] CSV import, categorized spending summary, savings-goal action *(OpenMuse)*

### Surfaces and deployment
- [ ] **One UI**: Expo Router → web + iOS + Android; Tauri desktop *(all three)*
- [ ] Docker/compose, embedded Postgres, Helm chart, `/api/health` *(OpenBot)*
- [ ] Single-owner mode + multi-user mode *(all three)*

---

## 7. Platform and release plan

**Release R1 — self-hosted / direct (first)**
- Web static export; Docker/compose self-host; Tauri installers for Windows/macOS/Linux (unsigned initially).

**Release R2 — stores (after accounts exist)**
- iOS + Android via **EAS Build/Submit** (no Mac needed); desktop via Microsoft Store / Mac App Store.

**Mac-less build path**
- iOS + Android → EAS cloud; macOS desktop → GitHub Actions macOS runner; signing/notarization wired but activated once Apple credentials exist.

---

## 8. Execution phases

1. **Acquire and scaffold** — clone the three repos at pinned SHAs into `_sources/` (git-ignored);
   base = OpenBot + bun; add `LICENSE` / `NOTICE.md` / `UPSTREAM.md`; base builds green.
2. **Mechanical rename** — ORBO token map + directory/file renames; regenerate `bun.lock`;
   lint/typecheck/test/build green. **Gate before feature work.**
3. **Unify UI base** — OpenMuse Expo app → `apps/app`; stand up `packages/ui`; wire to server.
   *(First tasks here: schema/API/route unification design — pending items C22–C28.)*
4. **Port OpenBot surfaces** (agents/channels/admin) into the unified app → delete the Vite app.
5. **Port OpenDots surfaces** (Spaces/Pages, calls, review cards); fold Dots → Agents; seed **DIYA**.
6. **Port OpenMuse screens** (Documents/Finance/Goals/Activity/Ideas) into the unified IA.
7. **Unify subsystems** — collapse duplicate computers/browsers/memory/approvals/threads into single supersets.
8. **Desktop** — Tauri wraps the web export; configure 3 OS installers + CI (incl. macOS runner).
9. **Brand + docs + parity matrix + origin sweep + verify.**
10. **Release** — R1 self/direct builds, then R2 store pipeline once credentials exist.

---

## 9. Acceptance gates

- `bun run lint && bun run typecheck && bun run test && bun run build` pass.
- Docker compose stack boots: `orbo-api` healthy, app reachable, browser worker reachable.
- Smoke tests: create an Agent, run a governed browser action, view `/admin/audit`; open Spaces
  editor; launch the mobile web bundle; DIYA delegation works.
- **Feature-parity matrix 100%** (section 6 fully checked).
- **Origin sweep** (`rg -i "copilotkit|openbot|openmuse|opendots|opentag"`) returns **zero**
  first-party hits outside `NOTICE.md` / `LICENSE` / `UPSTREAM.md`.

---

## 10. Pending items and defaults

### A. Inputs only the owner can provide
1. Brand assets — logo, color tokens, fonts.
2. Domain — for links, bundle IDs, defaults.
3. Git host + repo name/org (e.g. GitHub `opraiz/orbo`).
4. npm scope — `@orbo/*` (assumed) or `@orbo-diya/*`.
5. Expo/EAS account (org) for cloud builds.
6. Intelligence project owner (whose account holds ORBO's project/license).
7. Release accounts (later): Apple Developer, Google Play, Windows cert.

### B. Open decisions — proposed defaults
8. Upstream pin → latest `main` SHA at clone time (recorded in `UPSTREAM.md`).
9. ORBO version → `0.1.0`.
10. DB default → `EMBEDDED_POSTGRES=off` (opt-in `on`); external `DATABASE_URL` supported.
11. Ports → keep upstream, documented centrally.
12. Bundle IDs → `ai.orbo.app` (mobile), `ai.orbo.desktop`; display name ORBO.
13. Installers → Windows MSI, macOS DMG, Linux AppImage + deb.
14. Desktop auto-update → updater removed (no config/crate/endpoint) pending domain + signing.
15. UI state/data → TanStack Query only (no Zustand).
16. Canonical auth → OpenBot Better Auth only.
17. Agent catalog → owner approves names/roles I draft (DIYA boss + rebranded set).
18. DIYA persona → neutral default prompt; admin-editable.
19. CI → new GitHub Actions (lint/test/build, macOS runner); EAS config present but no workflow invokes EAS builds.
20. Docs → in-repo `docs/`.
21. Observability → structured logs + `/health`; no third-party APM for v1.

### C. Design/engineering planning still pending
22. Schema unification (three data models → one Postgres schema) + mapping doc.
23. API surface unification (three servers → one Hono API) + route inventory.
24. Route tree unification → final Expo Router map.
25. Design system spec (component inventory + tokens) before building `packages/ui`.
26. Visual design — wireframes/mockups first, or design-in-code.
27. Mobile vs web parity — where native differs.
28. Test strategy — merge suites; coverage target; fixtures.

### D. Compliance / legal / ops pending
29. Trademark check for ORBO / DIYA.
30. Domain + npm scope availability check.
31. Dependency license audit (full transitive scan) into `NOTICE.md`.
32. Privacy Policy + Terms (data flows to Intelligence, Parallel, Google, Composio).
33. Third-party data-flow disclosure.
34. Security review (credentials, browser-login isolation, loopback).
35. Backup/restore documentation.
36. CONTRIBUTING / SECURITY adapted to a proprietary product.
37. Accessibility target.

### E. Release/ops pending (post-code)
38. Signing/notarization wiring + CI secret storage (deferred until accounts exist).
39. Store listings (metadata, screenshots, privacy labels).
40. Self-host packaging (one-line install, deployment docs).
41. Versioning/changelog policy.
42. Support/intake process.

---

## 11. Provenance

Upstream repositories and pinned commit SHAs are recorded in `UPSTREAM.md`. Mitigation of
origin traces is enforced by the Phase 9 origin sweep (section 9). Required MIT notices are
preserved in `NOTICE.md` and `LICENSE`.

---

© Opraiz Technology Pvt Ltd · Developer: Narein Rao
