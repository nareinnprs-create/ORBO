# Owner Roadmap — ORBO Independent Internal Product (approved)

Owner approved the full audit master list (session: HEAD agent "orbo"). Goal: fully self-contained,
proprietary, internal-use product with zero CopilotKit dependency. This file is the single source of
truth for wave tracking. HEAD updates it after every wave.

## Decision gates (approved)
- D1 Full self-owned copilot layer (~11 modules, 2 large: agent-loop, client-runtime). No new deps; drop @copilotkit/*.
- D2 KEEP @ag-ui/* protocol packages (open, MIT).
- D3 IdP choice pending owner input at rollout; config must support Entra-GUID/Google/Okta (exists).
- D4 shipped builds must not enable ORBO_SINGLE_USER by default (+ join controls).
- D5 distribution independence: mirror overrides for releases/engine installers/images/npm + offline bundle.
- D6 internal support URL built into app (no public GitHub issues default).
- D7 backup/DR automation + KEY_ENCRYPTION_KEY policy documented.
- D8 CLA TODO closed (reject external PRs by default).
- D9 internal model gateway supported (env already exists; UI later in wave 4).
- D10 mobile: park (decide explicitly in wave 4; web+desktop first).

## Waves (each gets code change + full CI + integration)

### Wave 1 — hardening & stubs (DONE — see ledger)
- [x] [B3] server hostname env (ORBO_SERVER_HOST), honest bound-address log (config.ts:1426, index.ts:3092).
- [x] [B4] POSTGRES_PASSWORD minted + compose interpolation (+ volume-aware legacy probe, .orbo-postgres.json).
- [x] [B5][****] KEK refused when reachable beyond loopback (NODE_ENV=production or reachableAddresses/bindBeyondLoopback).
- [x] [B7] real CSP (tauri.conf.json:24; Tauri injects nonce/hash into script-src at build).
- [x] [B8][%] Start re-pulls missing digest-pinned images; install-fingerprint self-heals (selection change still refuses).
- [x] [B9] windows.rs ours_to_fix wired into UI (typed Blocker object; alternate copy + details disclosure).
- [ ] [B10] org SSO pre-seed/wizard surface — DEFERRED to wave 4 with enterprise config UI (owner approved all; B10 not yet implemented; track here).
- [x] [B11] telemetry default OFF (ORBO_TELEMETRY_*, DO_NOT_TRACK wins, legacy COPILOTKIT_* debug-only); header X-Orbo-Telemetry-Id; CPK_TELEMETRY_ID runtime-literal residue removed in wave 3.
- [x] [B12] worker scheduled-task/service scripts + docs/ops-worker.md.
- [x] [B13] /metrics + /access-log + /health hand-rolled, gates via ORBO_METRICS_TOKEN/ORBO_ACCESS_LOG.
- [x] [B14] restart: unless-stopped on 8 services.
- [x] [B15] ORBO_SESSION_TTL_DAYS/ORBO_SESSION_UPDATE_AGE_SECONDS wired (better-auth 1.7.1, verified typings); TRUSTED_ORIGINS derived from APP_PORT or 3010-trio + loud warn.
- [x] [C16] placeholder /summarize removed (composer/sources.ts deleted, no dangling imports).
- [x] [C17] admin Skills third section (app/tests/skills-others-section.test.tsx).
- [x] [C18] routine-dispatch lounds + wake-up swallows logged.
- [x] [C19] onboarding invented agents removed; empty-state guidance.
- [x] [C19b] active-bot short-circuit (active-bot.tsx +43).
- [x] [C20] prepare_engine server-side fully removed (App.test.tsx stale literals cleaned by HEAD).
- [x] [C8b/A2-8] recorders debug-gated (plan::debug_env + contract test).
- [x] [A5-2.5/D6] no public GitHub support default (Problem.tsx plain text; VITE_ORBO_SUPPORT_URL branded build).

### Wave 2 — distribution independence (DONE)
- [x] Env overrides (exactly as canon above); sha256 pins enforced under mirrors; image digest preserved.
- [x] ORBO_NPM_REGISTRY -> bun install --registry CLI hook (stack.rs install_dependencies), mechanism verified on bun 1.3.14.
- [x] docs/it-deployment.md; offline bundle manifest scripts (manifest only; true offline MITM mirror documented, no --offline flag).
- [x] Operator-map header comments at every read site; 404 remediation mentions overrides.

### Wave 3 — self-owned copilot layer (PENDING; order per A7)
1 run-lock (small) → 2 boot-config-slim + desktop-wizard-slim + telemetry removal (small) →
3 thread-store (large) → 4 skills-store (medium; rename copilotkit_* tools to orbo_*) →
5 headless-run-driver (medium) → 6 agent-loop (large) → 7 client-runtime (large, riskiest) →
8 runtime-http + realtime-events (medium) → 9 transcript migration utility.
Env contract: INTELLIGENCE_* retired; new ORBO-named keys.

### Wave 4 — product must-adds (PENDING)
Join controls; per-user usage/cost metering; DSR export+deletion; enterprise model-gateway UI;
real-roster onboarding + policy acceptance; teams; backup tooling (scripts/backup.sh + rotation);
audit export/date/actor filters; docs/rollout.md + employee quickstart; mobile distribution decision;
SCIM UI; session/brand polish (tray state, installer flow, step ladder).
- D7 backup tooling (scripts/backup.sh snapshot+rotation).
- i18n decision: user must answer explicitly.

### Wave 5 — sweep, polish, verification (PENDING)
Remaining minor items + full regression + docs + notice shipping.

## Standing operational rules
- 7 agents + subagents per wave, supervised by HEAD ("orbo"). Ledger updated after every wave.
- No file edits outside assigned ownership. No commits by agents — HEAD commits per wave after verify.
- Verify every wave: fmt, clippy -D warnings, targeted cargo tests, biome/tests, app tests.
- ship invariant: FIRST_COMPLETE_DEPLOYMENT/CHANGELOG bump at release time only.

---
## Updated ledger (session log)
- W1-2 done: server/src/telemetry/{metrics,access-log,health}.ts + app.ts mount + wake-up swallows; env ORBO_ACCESS_LOG, ORBO_METRICS_TOKEN (read via process.env); .env.example docs pending (R-W1-8).
- W1-3 done: POSTGRES_PASSWORD minted (alphanumeric48), compose interpolation, operator DATABASE_URL precedence. Pending: vault.rs is_secret + POSTGRES_PASSWORD (R-W1-4), volume-aware legacy-password probe for existing installs (R-W1-4). Canon decision: existing-orbo-volume installs get a compatibility probe at first Start.
- W1-7 done: restart unless-stopped on 8 services; scripts/worker-install.{ps1,sh}; docs/ops-worker.md; dev-actor production refusal (note: flags CI fallout -> R-W1-8).
- Canon release/env override names (owner decision, wave 2): ORBO_RELEASES_API_URL, ORBO_RELEASES_TARBALL_TEMPLATE ({version}), ORBO_RELEASES_ASSETS_TEMPLATE ({version}/{asset}), ORBO_RELEASES_TOKEN (host filter follows configured endpoints), ORBO_ENGINE_MIRROR ("{mirror}/{path-after-github.com}"), ORBO_IMAGE_PREFIX (replaces "ghcr.io/nareinnprs-create/orbo" prefix), ORBO_NPM_REGISTRY (bun install registry for offline mirrors; implemented by R-W1-4 in stack.rs, W2-2 documents).
- Recovery round dispatched: R-W1-1 (server config finish), R-W1-4 (self-heal finish + vault + volume probe), R-W1-5 (CSP/telemetry finish + fix tauri.conf.json "" build break), R-W1-6 (app finish), R-W1-8 (ci/chart/docs/.env.example fallout), W2-1 (distribution overrides), W2-2 (offline bundle + IT docs).
- tauri.conf.json pending plugins (PRESERVED TODO, formerly the rejected top-level `"$comment"`; PLAN.md 10.B.14; docs/planning/31-phase8-wrapper-plan.md G3/G4; 05 R7): deep-link (orbo scheme) and updater blocks removed - the keys are inert in Tauri v2 without their crates and there are no handlers/endpoints yet. Re-add alongside tauri-plugin-deep-link + route map once the orbo scheme is owner-confirmed, and tauri-plugin-updater + Builder::plugin init once the release endpoint domain and signing exist; do not invent a URL.
- W1-5/R-W1-5 done: CSP finalized+verified vs installed tauri config schema; telemetry matrix implemented (default off, DO_NOT_TRACK always-wins, legacy COPILOTKIT_* debug-only+deprecation log); ours_to_fix UI wired (typed Blocker, reject mismatched stated flag); Problem.tsx plain-text default; desktop UI suite 152/0 (--timeout 60000 needed on loaded machine; bun 5s default false-fails ~33 rich-UI tests — harness sensitivity, not regressions).
- R-W1-1 done: config.test.ts + single-user 171/171; session TTL/origins/serverHost verified; full server suite classification: all non-live-Postgres failures pre-existing (stall-guard hangs under bun 1.3.14; 8 child-spawn 7s-vs-5s timeouts in 2 untouched files). Key-name canon match confirmed vs .env.example/docs.
- R-W1-4 done: B8a/B8b/record-gates/C20 verified complete; vault is_secret POSTGRES_PASSWORD + test; volume-aware probe .orbo-postgres.json (classify_accept/Refused/Unavailable matrix, report() channel, reset deletes record, 6 tests); ORBO_NPM_REGISTRY hook + tests; full --lib 559 passed.
- R-W1-6 done (recovered from empty-report run, verified by HEAD): all app tasks present in tree; app/tests 1208 pass / 0 fail (181 files); tsc exit 0; biome organizeImports assists pre-existing, not CI-enforced (CI runs lint+format:check only).
- W2-1 done: 7-key canon verified + operator-map headers + defaults-unchanged test; deployment 53, deployment_release 12, install 47 passed; 404 message covers overrides; main.rs environmental test made hermetic by HEAD (clears ambient override env, pins ORBO_RELEASES_API_URL to an unreachable loopback).
- HEAD cross-worker fixes: biome format drift (4 worker files); App.test.tsx stale prepare_engine literals; desktop/TELEMETRY.md updated to default-off optics incl. validate driver description.
- Wave 1 + Wave 2 COMPLETE (B10 deferred to wave 4). Next: HEAD full verification round already done per-worker; commit wave on branch, open PR label full-ci (or close/reopen), merge, then release v0.1.7 per approved release flow. Wave 3 dispatch next: 9-module order, worker split in 7 agents. Known wave-3 residues: CPK_TELEMETRY_ID telemetry.ts:175-181 doc comment, desktop_telemetry.rs:45-56 COPILOTKIT_* literals, server telemetryProperties CPK_TELEMETRY_ID read.
