# 35 — Test Quarantine Register (skips, gates, and unblock conditions)

> Status: register only. No product code modified. Verified on disk 2026-10-16.
> Scope: every test quarantine/skip in the repo — `test.skip`, `describe.skip`,
> `skipIf`, `pytest.skip` / `pytest.mark.skipif`, `#[ignore]`, conditional
> `return` guards, and env-gated suites (`TEST_DATABASE_URL`, `ORBO_*=1`,
> `COMPOSIO_API_KEY`, Docker socket). Grep roots: `app/tests`, `server/tests`,
> `tests`, `worker/tests`, `desktop/src-tauri`, `agent-*/tests`, `scripts/*.test.ts`.
> Rule: skips must name cause + unblock; no silent skips (see §3).

## 1. Register (location → scope → reason → unblock → owner)

| # | Location | Scope | Reason (stated) | Unblock condition | Owner/agent |
|---|---|---|---|---|---|
| Q-01 | `tests/smoke/journey.test.ts:104` | `describe.skipIf(!asked)` — "a deployment that is up" (3 tests) | Needs a deployment that is actually up, with licence, model key and Docker; without `ORBO_SMOKE` the file is skipped so `bun run test` stays honest | `ORBO_SMOKE=1` + running deployment (`bash scripts/start.sh`, `ORBO_API_URL`) + `ORBO_SMOKE_COOKIE` session | smoke / server+supervisor |
| Q-02 | `tests/smoke/journey.test.ts:134` | `describe.skipIf(!asked)` — "a Bot acting on its computer" | Same as Q-01: gateway→browser→trail join needs live computers | Same as Q-01 | smoke / server+supervisor |
| Q-03 | `tests/smoke/journey.test.ts:75` | `beforeAll` guard `if (!asked) return` | Companion guard to Q-01/Q-02: no deployment, no setup; cookie/session absence throws with instructions instead of skipping silently | Same as Q-01 | smoke / server+supervisor |
| Q-04 | `supervisor/tests/docker.integration.test.ts:18` | `test.skipIf(!(await available()))` — "supervisor Docker lifecycle in an isolated namespace (seven cases)" | Needs a Docker daemon: checks `DOCKER_SOCKET` exists and `dockerode.ping()` succeeds | Docker daemon up at `DOCKER_SOCKET` (default `/var/run/docker.sock`) | supervisor |
| Q-05 | `server/tests/composio-live.test.ts:52` | `describe.skipIf(!live)` — "Composio, for real" | One real vendor call; skipped without a key so CI and keyless contributors are unaffected | `ORBO_LIVE_COMPOSIO=1` + `COMPOSIO_API_KEY` set (see `bun run test:live-composio`, which exits 1 without a key rather than silently passing) | server / plugins |
| Q-06 | `server/tests/delivery-store.integration.test.ts:62` (`canConnect` 17, probe 47–60) | `describe.skipIf(!livePostgres)` — "delivery store" | "Requires live Postgres via Docker/CI — skipped cleanly without one"; `TEST_DATABASE_URL` missing/unparseable/unreachable stays skipped | `TEST_DATABASE_URL` set to a scratch Postgres + TCP connect succeeds (Docker/CI) | server / delivery |
| Q-07 | `server/tests/notifications.test.ts:352` (`canConnect` 307, probe 337–350) | `describe.skipIf(!livePostgres)` — "notification store (Postgres)" | Same pattern as Q-06: no test database configured → suite stays skipped | Same as Q-06 | server / notifications |
| Q-08 | `server/tests/approvals-policy.test.ts:333` | `test.skip` — "an unreachable reviewer times out closed" | "Quarantined: `AbortSignal.timeout` never fires under Bun on Windows here, so this hangs" | Bun runtime fix for `AbortSignal.timeout` on Windows | server / approvals |
| Q-09 | `agent-orbo-computer/tests/live-screen.test.ts:239` | `describe.skipIf(!asked)` — "a socket that closes while the browser is starting" | Real process + real Chromium; Playwright is only in this directory's `package.json`, never installed by root CI; asked for by name (`bun run test:live-screen`) | `ORBO_LIVE_SCREEN=1` + `agent-orbo-computer` deps installed + Chromium (`bunx playwright install chromium`) | agent-orbo-computer |
| Q-10 | `agent-orbo-computer/tests/live-screen.test.ts:264` | `describe.skipIf(!asked)` — "a socket that another connection replaced" | Same as Q-09 | Same as Q-09 | agent-orbo-computer |
| Q-11 | `agent-orbo-computer/tests/live-screen.test.ts:298` | `describe.skipIf(!asked)` — "a superseded socket closing later" | Same as Q-09 | Same as Q-09 | agent-orbo-computer |
| Q-12 | `agent-orbo-computer/tests/live-screen.test.ts:340` | `describe.skipIf(!asked)` — "printable punctuation from the live screen" | Same as Q-09 | Same as Q-09 | agent-orbo-computer |
| Q-13 | `agent-orbo-computer/tests/live-screen.test.ts:409` | `describe.skipIf(!asked)` — "the wheel, with the ownership check in front of it" | Same as Q-09 | Same as Q-09 | agent-orbo-computer |
| Q-14 | `agent-orbo-computer/tests/live-screen.test.ts:443` | `describe.skipIf(!asked)` — "stopping the computer out from under a viewer" (2 tests: stop, reset) | Same as Q-09 | Same as Q-09 | agent-orbo-computer |
| Q-15 | `agent-orbo-computer/tests/live-screen.test.ts:483` | `describe.skipIf(!asked)` — "typing into a screen that is still opening" | Same as Q-09 | Same as Q-09 | agent-orbo-computer |
| Q-16 | `agent-orbo-computer/tests/live-screen.test.ts:504` | `describe.skipIf(!asked)` — "a screen whose browser will not start" | Same as Q-09 | Same as Q-09 | agent-orbo-computer |
| Q-17 | `agent-orbo-computer/tests/browser-close-announcement.test.ts:57` (guard `beforeAll` 41, `afterAll` 48: `if (!asked) return`) | `describe.skipIf(!asked)` — "a browser closed by something nobody asked for" (idle sweep, cap eviction) | Asked for by name for the same reason as live-screen: `profiles.ts` imports Playwright at module scope, CI does not install it | `ORBO_LIVE_SCREEN=1` + computer deps + Chromium | agent-orbo-computer |
| Q-18 | `agent-orbo-computer/tests/reset-run.test.ts:101` (guards 41/92) | `describe.skipIf(!asked)` — "the run this computer reports" (4 tests) | Same live-screen family; real browsers via `test:live-screen` | `ORBO_LIVE_SCREEN=1` + computer deps + Chromium | agent-orbo-computer |
| Q-19 | `agent-orbo-computer/tests/control-http.test.ts:90` (guards 49/84) | `describe.skipIf(!asked)` — "request handoff through the actual computer HTTP dispatcher" | Real HTTP dispatcher + shell lease without Chromium, but still opt-in because the package's Playwright dep is not installed by the root unit-test lane | `ORBO_CONTROL_HTTP=1` | agent-orbo-computer |
| Q-20 | `agent-orbo-computer/tests/file-download-http.test.ts:90` | `describe.skipIf(!asked)` — "the computer file download endpoint" | Real Chromium download path; opt-in like other computer suites | `ORBO_FILE_DOWNLOAD_HTTP=1` + computer deps + Chromium | agent-orbo-computer |
| Q-21 | `agent-orbo-computer/tests/demonstration-live.test.ts:85` (guards 30/73) | `describe.skipIf(!asked)` — "real human live-screen demonstration" | Live demonstration fixture spawning the real computer process | `ORBO_DEMONSTRATION_LIVE=1` + computer deps + Chromium | agent-orbo-computer |
| Q-22 | `agent-orbo-computer/tests/follows-popup.test.ts:47` | `describe.skipIf(!asked)` — "the page a Bot is on" | Launches a real Chromium; machine running `bun test` is not required to have it | `ORBO_COMPUTER_BROWSER=1` + `bunx playwright install chromium` | agent-orbo-computer |
| Q-23 | `agent-orbo-computer/tests/sign-in.test.ts:99` | `describe.skipIf(!asked)` — "typing a login" | Same real-Chromium reason as Q-22 (private sign-in against a real login page) | `ORBO_COMPUTER_BROWSER=1` + Chromium | agent-orbo-computer |
| Q-24 | `agent-orbo-computer/tests/sign-in.test.ts:157` | `describe.skipIf(!asked)` — "secrets typed into the page are not read back" | Same as Q-23 | Same as Q-23 | agent-orbo-computer |
| Q-25 | `agent-orbo-computer/tests/session-cookies.test.ts:93` | `describe.skipIf(!asked)` — "a session cookie across a restart" | Real Chromium session persistence across restart | `ORBO_COMPUTER_BROWSER=1` + Chromium | agent-orbo-computer |
| Q-26 | `agent-orbo-computer/tests/headed-browser.test.ts:71` | `describe.skipIf(!asked)` — "a browser a person can take over" | Headed (visible) browser a person can take over; needs a display | `ORBO_HEADED_BROWSER=1` + Chromium + display | agent-orbo-computer |
| Q-27 | `agent-orbo-computer/tests/webrtc-proxy.test.ts:28` | `describe.skipIf(!asked \|\| !lan)` — "WebRTC from a Bot's browser" | Real Chromium STUN/UDP egress test; needs a browser AND a non-internal IPv4 LAN address to count packets | `ORBO_COMPUTER_BROWSER=1` + Chromium + LAN IPv4 interface present | agent-orbo-computer |
| Q-28 | `agent-orbo-computer/tests/profile-launch-options.test.ts:20` | `describe.skipIf(!existsSync(playwright))` — "persistent launch options" (`managed`, `local-chrome`) | "The root CI install deliberately excludes this separately deployed package's dependencies" | Install `agent-orbo-computer` deps so `node_modules/playwright/package.json` exists (or merged module that ships Playwright to the test lane) | agent-orbo-computer |
| Q-29 | `agent-orbo-langgraph-agui/tests/test_provider_boundaries.py:610` | `pytest.skip("platform still reports chmod(0) file as readable")` inside `test_configured_chatgpt_auth_file_unreadable_fails_before_fallback` | Conditional guard: `os.access(path, R_OK)` still true after `chmod 0` (Windows / root / FS semantics), so the unreadable-file assertion cannot run | POSIX FS that honors `chmod 0` + non-elevated user | agent-orbo-langgraph-agui |
| Q-30 | `agent-orbo-langgraph-agui/tests/test_provider_boundaries.py:657` | `@pytest.mark.skipif(os.name != "posix", reason="POSIX private file ownership")` — `test_chatgpt_writer_sets_owner_before_replacement` | POSIX file-ownership semantics only | POSIX platform | agent-orbo-langgraph-agui |
| Q-31 | `agent-orbo-langgraph-agui/tests/test_provider_boundaries.py:689` | `@pytest.mark.skipif(os.name != "posix", reason="POSIX private file ownership")` — `test_chatgpt_writer_ownership_failure_keeps_original` | Same as Q-30 | POSIX platform | agent-orbo-langgraph-agui |
| Q-32 | `desktop/src-tauri/src/provider_oauth.rs:942` | `#[ignore]` — `credential_replacement_waits_for_existing_rotation_owner` | "Requires Windows SeSecurityPrivilege/elevation (`Set-Acl SetOwner`)" | Elevated Windows (SeSecurityPrivilege) / privileged CI via `cargo test -- --ignored` | desktop (Tauri) |

Notes:

- `app/tests`, `worker/tests`, `scripts/*.test.ts` (`test-ci`, `start-restart-guard`, `setup-learning`, `self-hosted-learning`, `processes`): no `skip` / `skipIf` / `#[ignore]` matches on 2026-10-16. `desktop/src` hits for `.skip(` are all iterator `.skip(1)` / `args().skip(1)`, not quarantines. `server/src/**/report.skipped` (`culler.ts`, `sweep.ts`, `handoff-runner.ts`, `wake-up.ts`, `summary.ts`) is product runtime bookkeeping, not a test quarantine.
- `beforeAll`/`afterAll` `if (!asked) return` guards travel with their `skipIf` suite (Q-03, Q-17–Q-19, Q-21, live-screen hooks): they prevent fixture setup when the suite is not asked for. They are not separate quarantines.

## 2. Summary counts

Total quarantined test-units: **32 rows** (31 distinct skip gates + 1 guard-only companion Q-03).

By unblock condition:

| Unblock condition | Count | Entries |
|---|---|---|
| Real-browser opt-in env (`ORBO_LIVE_SCREEN` / `ORBO_COMPUTER_BROWSER` / `ORBO_CONTROL_HTTP` / `ORBO_FILE_DOWNLOAD_HTTP` / `ORBO_DEMONSTRATION_LIVE` / `ORBO_HEADED_BROWSER`, + Chromium/Playwright, + LAN for WebRTC) | 19 | Q-09–Q-27 |
| Live Postgres via `TEST_DATABASE_URL` + reachable DB (Docker/CI) | 2 | Q-06–Q-07 |
| Live deployment (`ORBO_SMOKE=1` + up deployment + `ORBO_SMOKE_COOKIE`) | 2 | Q-01–Q-02 |
| Docker daemon (`DOCKER_SOCKET` + `ping`) | 1 | Q-04 |
| External vendor key (`ORBO_LIVE_COMPOSIO=1` + `COMPOSIO_API_KEY`) | 1 | Q-05 |
| Missing optional dep / merged module (Playwright not installed in root lane) | 1 | Q-28 |
| Bun runtime fix (`AbortSignal.timeout` on Windows) | 1 | Q-08 |
| Windows privilege / elevation (`SeSecurityPrivilege`, `cargo test -- --ignored`) | 1 | Q-32 |
| POSIX-only / FS semantics (`os.name == "posix"`, `chmod(0)` honored) | 3 | Q-29–Q-31 |

By mechanism: `describe.skipIf` 27 (incl. 8 in one live-screen file) · `test.skipIf` 1 · `test.skip` 1 · `pytest.skip` 1 · `pytest.mark.skipif` 2 · `#[ignore]` 1. Zero silent skips found: every gate names its cause inline or in the header comment.

## 3. Quarantine hygiene rule

1. Every skip must name its cause AND its unblock in the same file: env flag, reachable service, required key, platform, or upstream runtime fix — plus the exact command that re-enables it (e.g. `ORBO_LIVE_SCREEN=1 bun test …`, `ORBO_LIVE_COMPOSIO=1 COMPOSIO_API_KEY=… bun test …`, `cargo test -- --ignored`).
2. No silent skips: a bare `.skip` / `skipIf(expr)` with no comment is a defect. Env-gated suites fail loudly on missing prerequisites where the gate would otherwise pass vacuously (cf. `test:live-composio` pre-check, smoke `beforeAll` cookie/deployment checks).
3. Guards travel with gates: any `beforeAll`/`afterAll` early-`return` must reference the same flag as its suite's `skipIf` and do no work when unasked.
4. This register is the index: adding, removing, or re-enabling a quarantine updates this file in the same change.
