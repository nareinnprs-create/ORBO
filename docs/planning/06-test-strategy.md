# 06 — Test Strategy (PLAN.md §10.C item 28)

Scope: how the three upstream test suites become one ORBO suite — inventory, what to port or
drop, the unified layout, coverage expectations, fixtures, and the environment-gated tests that
must be quarantined. Every path below was read from the tree; no suite is assumed.

Runner of record is **Bun** (`bun test`, `bun:test`). Root `test` is `bun test` with two preloads
(`bunfig.toml:10`); `test:ci` adds a floor (`scripts/test-ci.ts:16`); upstream runner differences
(node:test, vitest, pytest) are the porting cost.

---

## 1. Current ORBO suite inventory

The base is OpenBot: ORBO `server/tests` (294 files) vs `_sources/OpenBot/server/tests` (295) and
`app/tests` (165 vs 166). The OpenBot suite is therefore the ORBO baseline, already rebranded.
"Cases" below are static `test(`/`it(` declarations (an upper bound on executed cases, `test.each`
rows excluded), not Bun's runtime count.

| Directory | Covers | Runner | Files | ~Cases |
|---|---|---|---|---|
| `server/tests/` | Hono API, runtime, governance/audit, computers, plugins, learning, routines, voice, memory, approvals, identity | `bun test` (`bun:test`) | 294 | ~3,500 |
| `server/tests/*.integration.test.ts` | Sub-suite needing a real Postgres | `bun test` + `TEST_DATABASE_URL` | 81 | (in above) |
| `app/tests/` | UI: React components + routes via happy-dom + `@testing-library/react` (85 `.test.tsx` + 80 `.test.ts` test files, plus 5 support/fixture files) | `bun test` | 165 | ~1,000 |
| `tests/` (root) | Repo contracts: workspace, clean-checkout, orbo-package, agent-bot startup, compose | `bun test` | 6 | ~29 |
| `tests/smoke/journey.test.ts` | One end-to-end HTTP journey against a live deployment (gated) | `bun test`, `ORBO_SMOKE=1` | 1 | 5 |
| `worker/tests/` | Worker env parsing + status | `bun test` | 2 | 9 |
| `agent-computer/tests/` | Computer HTTP control + real-Chromium suites (gated by env) | `bun test` | 40 | ~318 |
| `app/src/**`, `server/src/**` | Co-located unit tests (composer draft/picked-files/queue, team-bots, desktop telemetry) | `bun test` | 6 | ~185 |
| `desktop/` | Tauri shell React tests + version script | `bun test` | 6 | ~86 |
| `scripts/*.test.ts` | `test-ci` floor self-test, processes, learning (2 files), restart guard | `bun test` | 5 | small |
| `agent-*/tests/` (11 suites) | Python agent harness regressions | `pytest` | ~40 `.py` | n/a |

Python agent suites with tests, each installed in its own venv by CI (`.github/workflows/ci.yml:328`):
`agent-crewai`, `agent-claude-sdk`, `agent-langgraph-agui`, `agent-llamaindex`, `agent-agno`,
`agent-strands`, `agent-pydantic-ai`, `agent-adk`, `agent-langroid`, `agent-ag2`,
`agent-microsoft`. `tests/learning_harness_contract.py` is the one shared Python contract.

Root discovery walks ~520 Bun test files total (server 294, app 165, agent-computer 40, tests 6,
worker 2, app/src 5, server/src 1, desktop 6, scripts 5). `_sources/**` is ignored on purpose
(`bunfig.toml:17`) so the local run matches CI, which checks out only this repo.

How it runs today (`bunfig.toml`, `server/bunfig.toml`, `server/scripts/test-preload.ts`,
`app/tests/preload.ts`):

- One process, deterministic module graph. `eventsource` is evaluated as ESM once; Base UI is
  evaluated once with a DOM present so its layout effect is not a no-op for later files.
- `pretest` generates the app config before route imports need it (`package.json:22`).
- `test:ci` fails if fewer than `MINIMUM_TESTS = 400` tests ran (`scripts/test-ci.ts:16,55`),
  because an import-time throw removes a file's tests from the totals without failing.
- DB integration tests use `TEST_DATABASE_URL` only (`server/tests/support/database.ts:20,42`),
  never the application DB, at `TEST_POOL = { max: 2 }` (`server/tests/support/database.ts:61`).

---

## 2. Upstream test suites — coverage, port vs drop

| Upstream | Runner | Location | Files | What it proves | Port or drop |
|---|---|---|---|---|---|
| **OpenBot** | `bun:test` | `_sources/OpenBot/{server/tests,app/tests,tests}` | 295 + 166 + 6 | The base ORBO already runs | **Ported** — keep as the ORBO baseline. `tests/fintech-package.test.ts` → `tests/orbo-package.test.ts`. |
| **OpenMuse** | `node:test` via `tsx --import ./tests/setup.ts --test` (`_sources/OpenMuse/package.json:16`) | `_sources/OpenMuse/tests` (47 test files), `apps/mobile/test` (8), `apps/worker/tests` (4: three `.test.ts` + `index.test.js`) | ~59 | Model routing/retry/outcome, finance/JEV, documents/PDF, persistence, rate-limit, resource ids, rich threads, search, telemetry, vault, workflows, browser/computer | **Port** finance (`finance*.test.ts`), documents/PDF (`pdf.test.ts`), model provider/retry (`model-*.test.ts`), rich threads, persistence, rate-limit, resource-ids → translate `node:test`→`bun:test` into `server/tests`/`app/tests`. **Reuse** `tests/helpers/{browser,computer,model,search}.ts`. **Drop** Expo/RN-native-only mobile cases and E2B-desktop computer cases (ORBO uses the OpenBot computer). |
| **OpenDots** | `vitest run` (`_sources/OpenDots/package.json:16`) | `_sources/OpenDots/tests` | 48 | Pages/Spaces, page chat/context/review/routes, connections, controls, learning delivery, Slack channels, voice, transcript, research, parallel, security, telemetry | **Port** Pages/Spaces (`page-*.test.ts`, `pages.test.ts`), learning delivery, research/parallel, voice/transcript, channels, security → rewrite to `bun:test`. **Reuse** `tests/fixtures/{model-stream.ts,learning-skills.zip}`. **Drop** anything that collapses into the OpenBot computer/connections superset. |

Porting cost is dominated by **mock APIs**: OpenDots uses `vi.*`/`jest.*` in 28 files; Bun has no
`mock.module` unregister, so those become `spyOn` on the module namespace (see §5). OpenMuse's
`tests/setup.ts` only sets `DO_NOT_TRACK`/telemetry env vars and carries over unchanged.

---

## 3. Merge plan — unified layout, naming, where merged tests live

**Three tiers, by how much of the system a test needs:**

| Tier | Marker | Location | Needs |
|---|---|---|---|
| Unit | `*.test.ts(x)` | co-located next to source for pure units; `server/tests/*.test.ts` / `app/tests/*.test.tsx` otherwise | nothing external |
| Integration | `*.integration.test.ts` | `server/tests/` | Postgres + pgvector (`TEST_DATABASE_URL`) |
| e2e / smoke | `tests/smoke/*.test.ts`, `agent-computer/tests/*` (gated) | root `tests/smoke`, `agent-computer` | Docker, a running stack, Chromium |

**Naming.** Keep the existing conventions rather than inventing new ones:

- Server: `<feature>-<aspect>.test.ts`, feature-prefixed (`computer-*.test.ts`, `agent-*.test.ts`,
  `plugin-*.test.ts`). Suffix `.integration.test.ts` when a live DB is required.
- App: `<surface>-<aspect>.test.tsx` for rendered React; `.test.ts` for pure logic.
- Smoke/e2e: `tests/smoke/<journey>.test.ts`; computer browser suites stay in
  `agent-computer/tests/`.

**Where new merged-feature tests live** (the union, PLAN §6 rows that no upstream tests):

| Merged subsystem | Unit / integration | e2e |
|---|---|---|
| One computer subsystem | `server/tests/computer-*.test.ts` + `computer-*.integration.test.ts` | `agent-computer/tests` |
| One approvals/audit superset | `server/tests/approvals-*.test.ts`, `audit-*.integration.test.ts` | `tests/smoke/journey.test.ts` |
| One memory subsystem | `server/tests/memory*.test.ts`, `memory-store.integration.test.ts` | smoke |
| One documents/Spaces model | `server/tests/page-*.test.ts` (new, ported from OpenDots) + `pdf`/artifact coverage (ported `pdf.test.ts`) | `app/tests/*-editor.test.tsx` |
| One connections/plugins + browser/research worker | `server/tests/plugin-*.test.ts`, `composio-*.test.ts` | smoke |
| DIYA delegation (cross-subsystem journey, not a subsystem: threads + routines per 08 §§5–6) | `server/tests/group-conversations*.test.ts` | `tests/smoke/` |

Ported upstream files land by tier: logic → `server/tests`, rendered surfaces → `app/tests`,
cross-stack journeys → `tests/smoke`. A ported file keeps its upstream name where the feature name
survives the rebrand (`page-review.test.tsx` → `app/tests/page-review.test.tsx`).

**Assumption (shared with 07 §2.9 and 08 §7):** ported OpenMuse `finance*.test.ts` land by the same
tier rule (logic → `server/tests`, rendered surfaces → `app/tests`); the Finance screen home is
undecided pending the C24 route tree, so no Finance e2e path is named yet.

**Proposed CI job split** (today one `test` job runs everything on ubuntu, plus a macos/windows
`startup` job that runs only `app/tests/build-cache.test.ts`, `.github/workflows/ci.yml:256,311`):

| Job | Runner | Runs | Gate |
|---|---|---|---|
| `unit` | ubuntu **+ windows** matrix | `bun test` with DB/browser/live tests skipped; no docker | every push |
| `integration` | ubuntu, `pgvector/pgvector:pg17` service | `test:ci` (keeps the 400 floor), DB tests included | every push |
| `python` | ubuntu matrix | `pytest` per agent-* | every push |
| `browser` | ubuntu | `agent-computer` Chromium suites (`ORBO_COMPUTER_BROWSER=1`) | every push or `full-ci` |
| `smoke` | ubuntu, Docker available | `docker compose` + `ORBO_SMOKE=1` journey | `full-ci` label, main, release |

Windows is added to `unit` so native-path regressions fail instead of being silently skipped (§6).
Docker is available in CI (`image`, `component-dockerfiles` jobs), so `smoke` and `integration` can
keep using it.

---

## 4. Coverage target and what "done" means per phase

No coverage tooling is wired today — there is no `c8`/`nyc`/`--coverage` in any `package.json` or
script. Adopt Bun's built-in `bun test --coverage` and record the threshold in `scripts/test-ci.ts`
alongside `MINIMUM_TESTS`.

| Area | Line | Branch | Rationale |
|---|---|---|---|
| `server/` overall | 80% | 75% | API + runtime are the product's contract |
| Governance path (gateway resolve→policy→audit→act, credentials, secrets) | 95% | 90% | fail-closed; PLAN §6 "Governance and safety" |
| `app/` overall | 70% | — | UI is presentation over tested server logic |
| `agent-computer/` | 75% | — | browser control is the highest-risk join |
| Ported upstream features | parity | — | the ported test file must pass before its upstream copy is dropped |

**Done per phase** (PLAN §8). The floor (`MINIMUM_TESTS`) is never lowered to make a phase pass.

| Phase | Done means |
|---|---|
| 1–2 Acquire / rename | `bun run lint && typecheck && test && build` green; floor holds; no test renamed away from its source. |
| 3 Unify UI base | ported Expo/OpenDots surface tests translated to `app/tests/*.test.tsx` and passing. |
| 4 Port OpenBot surfaces | existing `app/tests` + `server/tests` for those surfaces stay green after the Vite app is deleted. |
| 5 Port OpenDots surfaces | Pages/Spaces, calls, review cards: ported vitest tests pass under `bun:test`. |
| 6 Port OpenMuse screens | Documents/Finance/Goals/Activity/Ideas ported tests pass; helpers reused from `_sources/OpenMuse/tests/helpers`. |
| 7 Unify subsystems | every superset test covers the union; an upstream test is dropped only when the superset test subsumes it. |
| 9 Brand + verify | origin sweep zero; parity matrix 100% with each row backed by a test path. |

---

## 5. Fixtures and factories

**Module mocks — `mock.module` leaks.** Bun cannot unregister a `mock.module`, and `mock.restore()`
leaves it in place (`app/tests/composer-queue-attachments.test.tsx:95-102`,
`app/tests/approval-tools.test.tsx:19`, `app/tests/bot-route-default-agent.fixture.tsx:9`,
`app/tests/channel-new-error-state.fixture.tsx:5`, `app/tests/home-fallback-routing.fixture.tsx:7`).

Rule: **prefer a restorable `spyOn` on the module namespace**, restored in `afterAll`. Reserve
`mock.module` for the two boundaries where it is evaluated once by design: the preload
(`server/scripts/test-preload.ts` stubs `@ai-sdk/google-vertex` and evaluates `eventsource`) and
`*.fixture.tsx` files. `mock.module` inside a normal test file leaks into every later file in the
single-process run.

**DB fixtures.**

- `server/tests/support/database.ts` — `testDatabaseUrl()` requires `TEST_DATABASE_URL`, refuses the
  live `orbo` database, and forces `TEST_POOL = { max: 2 }`.
- `server/tests/support/environment.ts` — `testEnvironment(overrides)` is the minimum bootable env;
  config tests build their own inline.
- Postgres + pgvector is mandatory; CI runs `pgvector/pgvector:pg17` and `drizzle-kit migrate`
  (`.github/workflows/ci.yml:262,305`). Migrate a dedicated DB before the integration suite.
- Prefer per-test transactions or unique sentinel ids (see `credential-rotation-leak.integration.test.ts:91`)
  over truncation, because files hold their pools for the whole run.

**DOM fixtures.** `app/tests/preload.ts` registers happy-dom once so Base UI resolves; each DOM test
file still registers/unregisters its own (`app/tests/a2ui.test.tsx:15-17`);
`app/tests/settle-react-work.ts` handles async React settling. `@testing-library/react` +
`user-event` are the interaction tools.

**Factories.** Prefer builders that return a minimal valid object and take overrides (the shape of
`testEnvironment`, `server/tests/support/database.ts`, and OpenMuse's `tests/helpers/*.ts`). No
shared mutable state between files. Ported fixtures to absorb:
`_sources/OpenMuse/tests/helpers/{browser,computer,model,search}.ts` and
`_sources/OpenDots/tests/fixtures/{model-stream.ts,learning-skills.zip}`.

---

## 6. Known environment-only failures to quarantine

These pass only on a machine that has the named thing. Each already has a gate; the strategy keeps
the gate and lists the test in the appropriate CI job rather than letting it fail everywhere.

| Test / glob | Needs | Gate / handling |
|---|---|---|
| `server/tests/*.integration.test.ts` (81) | Postgres + pgvector + `TEST_DATABASE_URL` | Integration job; throws a named error without it (`server/tests/support/database.ts:20`). |
| `tests/compose.test.ts` | `docker` / `docker compose` | CI `python-harness` job runs it (Docker present); skip locally without Docker. |
| `tests/smoke/journey.test.ts` | running stack, valid licence, Chromium, signed-in session cookie | `ORBO_SMOKE=1` + `ORBO_SMOKE_COOKIE`; skipped otherwise (`tests/smoke/journey.test.ts:45,104`). |
| `agent-computer/tests/{sign-in,session-cookies,follows-popup,demonstration-live,webrtc-proxy}.test.ts` | real Chromium | `ORBO_COMPUTER_BROWSER=1` (`.github/workflows/ci.yml:128-133`). |
| `agent-computer/tests/{live-screen,browser-close-announcement,reset-run}.test.ts` | real Chromium + `agent-computer` deps | `ORBO_LIVE_SCREEN=1` (`package.json:24`). |
| `server/tests/composio-live.test.ts` | `COMPOSIO_API_KEY` + network | `ORBO_LIVE_COMPOSIO=1`; command refuses an empty key (`package.json:25`). |
| `server/tests/provider-oauth.test.ts` (symlink cases) | POSIX symlink/chmod privilege | returns early on `win32` (`:437`, also `:191`, `:351`). Native Windows symlinks need developer mode — **quarantined, not covered on Windows**. |
| `server/tests/{tool-selection-environment-restoration,production-loader-boundary}.test.ts` | POSIX env/paths | `win32` branches (`:32,105` and `:48`). |
| `agent-computer/tests/{local-chrome-startup,browser-runtime}.test.ts` | per-OS Chrome/paths | `test.each(["linux","darwin","win32"])` — runs cross-OS, no skip. |
| `tests/agent-bot.test.ts` | `agent-bot` deps installed | CI installs them separately (`.github/workflows/ci.yml:289`). |
| `app/tests/build-cache.test.ts` | OS temp/filesystem behavior | dedicated `startup` job on macos + windows (`.github/workflows/ci.yml:317,326`). |
| `scripts/{self-hosted-learning,start-restart-guard,processes}.test.ts` | bash shell | WSL/bash via `scripts/require-bash.sh`. |

---

## 7. Gaps and risks

1. **No coverage tooling.** The §4 targets are unenforceable until `bun test --coverage` (or an
   equivalent) is added to `scripts/test-ci.ts`. Blocker for the coverage target.
2. **The floor hides suite size.** `MINIMUM_TESTS = 400` against ~3,500 static server cases means an
   import-time throw could remove hundreds of tests and still pass the floor. Raise the floor, or
   assert per-directory file counts, so a dropped file is visible.
3. **Windows silently skips, not fails.** Symlink/privilege cases return early on `win32`
   (`provider-oauth.test.ts:437`) rather than skipping visibly. A supported OS is partly untested;
   Windows is not in the `unit` job today.
4. **Single-process mock leakage.** `mock.module` cannot be unregistered; ported vitest files use
   `vi.mock` heavily. Every ported file must be converted to restorable `spyOn` or it will poison
   later files. Highest mechanical risk of the merge.
5. **No union/merged-feature tests yet.** The superset subsystems (computer, memory, approvals,
   threads, documents) have no cross-upstream tests; Phase 7 has nothing to run until they are
   written. This is the largest coverage gap against PLAN §6.
6. **Ported-runner conversion.** OpenMuse is `node:test`, OpenDots is `vitest`, Expo mobile tests
   have no ORBO runner. Conversion is manual and per-file; no shim exists.
7. **e2e cannot run on every push.** Docker + licence + live Intelligence are required, so joins can
   merge without a join test unless `full-ci`/release gates are enforced.
8. **Local DB path untested.** The `EMBEDDED_POSTGRES=on` default (PLAN §10 item 10) is not exercised
   by the integration suite, which assumes an external `TEST_DATABASE_URL`.
9. **`_sources/**` must stay ignored** (`bunfig.toml:17`); if the ignore is dropped, the suite doubles
   and upstream mocks resolve against their own paths and throw.
10. **Python suites are independent.** Only `tests/learning_harness_contract.py` is shared; a unified
    harness contract is not yet defined for the merged agent catalog.

**Blockers:** coverage tool choice; Windows native symlink/privilege coverage; licence + session-cookie
secret storage for smoke; a runner decision for ported vitest/node:test files.
