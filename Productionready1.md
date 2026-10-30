# ORBO Production-Ready — Master Tracker

Audit date: 2026-10-28. All batches approved. Status updated per batch.

Legend: [ ] todo · [~] in progress · [x] done · [!] blocked/deferred (reason)

---

## Batch 1 — Security hardening (server)
- [x] 1.1 Refuse fixed dev tokens (`orbo-dev-supervisor-token`, `orbo-dev-computer-token`, dev worker secret) for prod/network-reachable deployments - `server/src/config.ts`, supervisor startup
- [x] 1.2 Global request-body limit on all API groups + `maxRequestBodySize` on `serve()`
- [x] 1.3 Rate limiting on `/api/*` + explicit better-auth `rateLimit` config
- [x] 1.4 DNS-resolve agent endpoints before server-side fetch (rebinding gap) - `agents/endpoint.ts`, `computer/target.ts`
- [x] 1.5 Security headers middleware: CSP, `X-Content-Type-Options`, `frame-ancestors`
- [x] 1.6 `agent-orbo-computer` image runs non-root (uid 1001); supervisor passes user
- [x] 1.7 Tests for all of the above

## Batch 2 — Deployment config (needs owner input)
- [x] 2.1 Generate `BETTER_AUTH_SECRET`; prepare hardened `.env` template
- [!] 2.2 Remove `ORBO_SINGLE_USER=true`; set `INITIAL_ADMIN_EMAILS` (owner: emails — kept single-user to avoid boot refusal; no OAuth provider configured yet)
- [!] 2.3 `OPENAI_API_KEY` / provider keys (owner: keys — still unset, Bot chat off)
- [x] 2.4 `WORKER_SHARED_SECRET`, `ORBO_AGENT_TOOL_TOKEN`, computer tokens (generated)
- [x] 2.5 Fix dead key `AGENT_STALL_TIMEOUT_MS` → `ORBO_AGENT_STALL_TIMEOUT_MS`
- [!] 2.6 OAuth provider creds, `ORBO_PUBLIC_URL`, domain (owner: pending)

## Batch 3 — Release integrity
- [x] 3.1 `CHANGELOG.md:3` "OpenBot" → ORBO; fix `docs/CHANGELOG.md` false claims
- [x] 3.2 Legal docs: draft all `[OWNER TODO]` with fill-in slots (terms, privacy, SECURITY.md contact, CONTRIBUTING, backup-restore RPO/RTO, versioning)
- [x] 3.3 `agent-orbo-mastra`: pinned deps, scripts, tracked lockfile, frozen install in Dockerfile
- [x] 3.4 `agent-orbo-langgraph-agui`: pin `langchain-openai==1.6.0` in runtime requirements (private API imports)

## Batch 4 — TOP RISK tech debt (server)
- [x] 4.1 TD-03: durable task ledger — migration 0056 (tasks/task_runs/task_events), offer idempotent with queue lease via shared unique key, start/finish/receipt once
- [x] 4.2 TD-06: alerts persisted — monitors/store.ts (dedup-key rows, skip-locked claim); scheduler wiring in 7a
- [x] 4.3 TD-01: ws10-slice deleted; canonical store.callTool path (deny-beats-allow) pinned by test
- [x] 4.4 TD-02: ws11-slice deleted; store.invokeSkill canonical; `/`-text wiring in 7a
- [x] 4.5 TD-04: routine firing via durable ledger; concurrent sweeps fire once (test-pinned)
- [x] 4.6 TD-05: proactive own producer kind; suggestion namespace a DB constraint
- [x] 4.7 Register updated (TD-01..06 resolved notes, TD-09 partial); TD-09 legacy import deferred with TD-07/08

## Batch 5 — Distribution
- [x] 5.1 Delete `apps/app` placeholder scaffold (TD-10) + `packages/ui` (TD-11/12) — deleted; verification agent confirming zero stale refs
- [x] 5.2 Mobile: EAS build/submit config; version 0.1.6 in package.json + app.config.ts; docs/mobile-release.md
- [x] 5.3 Desktop updater/deep-link: docs/desktop-updater.md scaffold (config blocks + minisign steps); owner: domain + keys
- [~] 5.4 Harness token fail-closed at boot (11 python + mastra) — edits on disk; suites under verification

## Batch 6 — Hygiene + upgrades
- [ ] 6.1 `.gitignore`: `.orbo-deployment`, `.orbo-prepared.json`, `.orbo-dependencies.json`, `container-images.json`, `.secrets/`
- [x] 6.2 `biome check --write` repo-wide (105 files fixed) + verify clean; `.venv` ignore added. (Adding `biome check` to CI = deferred: ci.yml is owner-dirty; recommend in final report.)
- [ ] 6.3 Docker dead scope: remove `@orbo/ui` filter + stale manifests (`Dockerfile`, `server/Dockerfile`)
- [ ] 6.4 Supervisor image non-root variant (socket group)
- [ ] 6.5 `renovate.json` → `config:recommended`; `@types/node` alignment
- [x] 6.6 Dependency majors — FRONTEND: vite 8/plugin-react 6/motion 14/happy-dom 21/react 19.3.1/zod 4.6.7/better-auth 1.7.14/tauri 2.12.4. SERVER: twilio 6, eventsource 5, @ag-ui/mastra 2, OTel 3.0 family, hono/drizzle/mastra/copilotkit/MCP minors, jose unified. **TS 7 DEFERRED** (app/tests classic compiler API + lib.dom breaks; exact list in log — owner decision).
- [ ] 6.7 Python harness pins: fastapi/uvicorn/litellm alignment across images
- [ ] 6.8 `shared/attachments.ts` known defect: fix or ticket

## Batch 7 — Backend/frontend polish (SHOULD FIX)
- [x] 7.1 DB pool: `statement_timeout` (30s) + `idle_in_transaction_session_timeout` (60s), env-configurable `DATABASE_*_TIMEOUT_MS`, URL params win
- [x] 7.2 Worker: SIGINT/SIGTERM finish-tick drain; `/live` on WORKER_LIVENESS_PORT (3002 default, 0=off); WORKER_SHARED_SECRET ≥24 chars (dev default bumped to 29-char value everywhere incl. desktop env.rs)
- [x] 7.3 `/health` probes Intelligence (2s race, distinct `degraded: intelligence`, redaction asserted)
- [x] 7.4 Computer token out of WS query string: first-message `{"type":"auth","token"}` handshake both sides, 4401 + 5s deadline; query path still honored
- [x] 7.5 Global `app.onError`: JSON body, withoutStatement hygiene, HTTPExceptions pass through
- [x] 7.6 SPIRE: tests/spire-insecure-bootstrap.test.ts guard + docs/deployment.md production workload-identity section
- [x] 7.7 `WORKER_SHARED_SECRET` min length (worker refusal; server-side floor = residual)
- [x] 7.7b TD-06 monitor scheduler wired into index.ts sweeps; TD-02 `/slug` text→turn-runner seam closed (plugins/invocation-turn.ts)
- [x] 7.8 App: root error boundary; 401/session-expiry recovery; sign-out error handling
- [x] 7.9 App: trim eager bundle — MEASURED, REVERTED: the 1,100 kB chunk is `@copilotkit/web-inspector` via dynamic import (Δ 0.0% on experiment); real eager weight is CopilotKit runtime pulled by `_app` provider — not an import-site fix. No churn kept.

## Final
- [x] F.1 Full typecheck (server/app/worker/supervisor/desktop) + lint + format — **all 8 gates exit 0**
- [x] F.2 Full test suite — server 4587/14fail(9 flake+5 env, all solo-classified) · app 1220/0 · computer 382/12(Windows class) · worker+supervisor 68/0 · compose 19/0 · root green (workspace 36/0, symlink fixed) · mastra 38/0 · floors met (329/183/8/5); **coverage tripwire fails (pre-existing): gateway.ts 92.61% < 95%**
- [x] F.3 Compose config + token guards + `docker build --check` 5/5 (real image build cut per approval)
- [x] F.4 Full report — below

---

## FULL REPORT — 2026-10-30

### Verdict
**Loopback development deployment: GO.**
**Network-exposed production: NO-GO** until the 5 conditions below are met.

### What was done (all batches, 431 files changed, uncommitted)
- **B1 Security**: dev-token refusal beyond loopback (server+supervisor) · global bodyLimit ~1MB · rate limiter on /api/* (env-tunable) + explicit better-auth rateLimit · DNS-resolve+blocklist on agent endpoints at dial time (redirect hops re-checked) · security headers (nosniff/referrer/X-Frame-Options/CSP) · computer image non-root uid 1001 (compose+supervisor enforce)
- **B2 Deployment**: 6 secrets generated into `.env`; dead stall key fixed; single-user kept until OAuth exists (owner)
- **B3 Release**: changelog origin fixes; 29 legal owner slots drafted (terms/privacy/SECURITY/CONTRIBUTING/backup/versioning); mastra pinned+lockfile+frozen install; langgraph-agui private-API pins
- **B4 Tech debt**: TD-01..06 collapsed — migration 0056 unified task ledger (idempotent offers, start/finish/receipt-once), routine+proactive durable producers, monitor alerts persisted (skip-locked claim), ws10/ws11 parallel paths deleted, TD-09 partial (FK)
- **B5 Distribution**: apps/app + packages/ui deleted (TD-10/11/12); mobile 0.1.6 + full EAS config; boot-token fail-closed in 11 python harnesses + mastra; desktop-updater + mobile-release docs
- **B6 Hygiene/upgrades**: gitignore state files; Docker dead scope removed; supervisor non-root (DOCKER_GID); renovate tuned; @types/node aligned; python pins (fastapi 0.144.0*, litellm 1.106.0+mcp 2.3.0, ag-ui-crewai 0.3.1+crewai 1.6.1, microsoft fastapi 0.141.1 per constraint); biome clean repo-wide; deps: vite 8+rolldown (entry 616→283kB), react 19.3.1, better-auth 1.7.14, twilio 6, eventsource 5, @ag-ui/mastra 2, OTel 3.0, copilotkit 1.83, MCP 1.32.2; **TS stays 5.9.3** (7 blocked by app tests — owner decision)
- **B7 Polish**: DB statement/idle timeouts; worker SIGTERM drain + /live + secret floor (29-char dev default everywhere incl. desktop env.rs); /health probes Intelligence (degraded states, redaction); WS computer-token moved to first-message auth (both sides); global app.onError (JSON, leak-proof); SPIRE guard + docs; app error boundary + 401 recovery + sign-out fix; TD-06 scheduler + TD-02 /slug seam wired
- **Cross-batch fixes**: learning-mastra token env; metrics Intelligence stub; tool-selection developer-role regression (A/B-proven); litellm mcp gap; crewai LOCALAPPDATA; desktop env.rs secret bump; biome .venv ignore

### Verification (F-gate, 2026-10-30)
- Static: tsc ×5 = 0 · lint 0 · biome check 0 · format 0
- Tests: server 4587 pass / 14 fail → **9 flake (pass solo) + 5 env (Windows/openssl/loopback)** · app 1220/0 · computer 382/12 (Windows process class) · worker+supervisor 68/0 · compose 19/0 · root+mastra green · CI floors met (329/183/8/5 files)
- Compose: config validates, token guards fire, `docker build --check` 5/5
- Known: coverage tripwire fails **pre-existing** (gateway.ts 92.61%<95% → `test:ci` exit 1 on any machine); flake band driven by local Postgres loopback at 868ms (co-tenant containers)

### Production NO-GO conditions (flip all 5)
1. `bun run test:ci` exits 0 on Linux CI (tripwire + real bash/signal semantics)
2. All 431 files committed + reviewed
3. Fresh secrets for the 5 public dev tokens (compose refuses boot without them; exposure demands new ones)
4. Flake band confirmed collapsed on healthy CI Postgres
5. Real `docker compose build` + end-to-end stack smoke

### Owner owes (launch blockers)
INITIAL_ADMIN_EMAILS + OAuth creds · OPENAI_API_KEY · real INTELLIGENCE_API_KEY · legal fill-ins + counsel · desktop domain+minisign · EAS org/stores · rustup for local desktop builds

---

## Log
- 2026-10-28: Tracker created. Audit complete (6 agents). Batch 1 starting.
- 2026-10-28: Batch 3 DONE (changelog origin fixes; 29 legal owner slots drafted; mastra pinned+lockfile+frozen install; langgraph-agui private-API pins). Note: pre-existing 5 anthropic-header test fails in langgraph-agui (unpinned transitive `anthropic`) — follow-up.
- 2026-10-28: Batch 6a DONE (gitignore state files; Docker dead scope removed; supervisor non-root DOCKER_GID; renovate config:recommended; @types/node ^24; python pins aligned fastapi 0.144.0 / litellm 1.106.0; attachments defect → TODO(deferred), product decision).
- 2026-10-28: Batch 1 ~90% on disk (typecheck 0 err); interrupted; 13 test fails — finisher agent running.
- 2026-10-28: Deferred/owner-pending: desktop updater (domain+minisign), macOS notarization, OAuth creds, legal owner slots, apps/app deletion owner-visible, anthropic transitive pin.
- 2026-10-28: Batch 2 DONE within owner limits: 6 secrets generated into `.env` (values never echoed), dead stall key fixed, single-user kept (no OAuth provider yet — removing it would refuse boot). Owner still owes: INITIAL_ADMIN_EMAILS, OPENAI_API_KEY, OAuth creds, ORBO_PUBLIC_URL, real INTELLIGENCE_API_KEY.
- 2026-10-28: Batch 5 agent running (apps/app+packages/ui deletion, mobile EAS, harness boot-token fail-closed, desktop updater doc). Batch 4 agent running (TD-01..06 collapses). Batch 7b agent running (app error boundary, 401 recovery, sign-out, bundle trim).
- 2026-10-28: Batch 7b DONE: session-expiry signal bus (client.ts) + QueryCache/MutationCache 401 handling; AppErrorBoundary + router defaultErrorComponent; sign-out failure surfaced on /sign; 12 new tests. app tsc 0 err, lint clean, 1220 pass/0 fail. Bundle trim honestly reverted (measured Δ0.0%).
- 2026-10-28: HYGIENE NOTE: local bun drifted 1.3.14 → 1.4.4 mid-session (some install upgraded it); packageManager still pins 1.3.14 matching Dockerfile/desktop. Tests pass on 1.4.4. Align decision deferred to 6.6.
- 2026-10-28: Batch 1 VERIFIED DONE: security suites 149 pass, compose 19 pass/0 fail (2 prior fails were machine-state: ambient python3 lacked pinned langchain set - installed ag-ui-langgraph/langgraph 1.2.18/langchain 1.4.7/langchain-openai 1.6.0/langchain-anthropic 1.7.7/langchain-google-genai 4.4.2 into python3). Batch 6c agent running (app+desktop dep majors; server majors deferred until Batch 4 lands).
- 2026-10-28: Batch 6c (frontend majors) DONE: vite 8.3.5 + rolldown codeSplitting migration (old manualChunks was a silent no-op even on vite 7), plugin-react 6, motion 14, happy-dom 21 (+preload WAAPI shim), react 19.3.1, zod 4.6.7, better-auth 1.7.14, desktop tauri api/cli 2.12.4. App suite 1220/0 one-shot (prior load-flake root-caused: detail-panel not draining react before happy-dom unregister - fixed). Entry chunk 616 to 283 kB; build time halved. No reverts. Server majors (TS7, twilio 6, eventsource 5, @ag-ui/mastra 2, OTel 3) queued behind Batch 4.
- 2026-10-29: Batch 4 DONE: TD-01..06 collapsed. Migration 0056 unified task ledger (tasks/task_runs/task_events, idempotent offer via unique key = queue (kind,key), start-once/finish-once/receipt-once); TD-04 routine producer durable; TD-05 proactive own producer kind; TD-06 alerts persisted (monitors/store.ts, dedup-key rows, skip-locked claim); TD-01/02 ws10/ws11 slices deleted (canonical store paths + new audit events); TD-09 partial (monitors.task_id FK). 65 new tests + 157 adjacent green on real Postgres (container orbo-test-pg, 57 migrations). Deferred: TD-06 scheduler + TD-02 index.ts wiring (owner held index.ts) -> handed to 7a; TD-09 legacy import -> with TD-07/08 later. KNOWN BROKEN left behind: server tsc fails auth/index.ts (better-auth 1.7.1 vs 1.7.14 dual core) -> 7a fixing first.
- 2026-10-29: Batch 5 edits LANDED (agent died in verification on network error): apps/app + packages/ui deleted, mobile 0.1.6 + full eas.json with owner slots, docs/mobile-release.md + docs/desktop-updater.md written, boot-token guards in 11 python mains + mastra, register updated. Verification agent running (stale-ref sweep, 11 pytest suites, mastra, mobile typecheck, ci.yml residue).
- 2026-10-29: Batch 7a DONE (all 8 items + auth tsc verified green: single @better-auth/core 1.7.14). Server suite 4447-4578 pass; every failure reproduced on pristine HEAD = documented flake baseline. Worker/supervisor/computer tsc 0. Residuals: server config doesn't enforce worker-secret floor; worker drain not live-exercised (POSIX signals on Windows); monitor sweep + /skill wiring are boot-path glue covered by integration suites.
- 2026-10-29: Batch 5 verification DONE: stale-ref sweep clean (zero live refs to apps/app/packages/ui/ai.orbo.app); boot-token guards green in all 11 harness suites + mastra 38/0; mobile typecheck 0, eas.json valid, mobile lockfile version fixed to 0.1.6. Fixed post-verification: litellm 1.106.0 mcp gap (mcp==2.3.0 added to adk/agno/crewai/llamaindex/strands — would have reddened CI); crewai test env LOCALAPPDATA gap (13 Windows fails root-caused to crewai trace manager Path(None)); microsoft fastapi reverted to 0.141.1 (agent-framework-ag-ui caps <0.142.0). Deferred: langgraph-agui docker-timeout test (network); harness suites verified on py3.13 not CI's 3.12 (3.12 install broken on this machine).
- 2026-10-29: Batch 6d agent running (server majors: TS7, twilio 6, eventsource 5, @ag-ui/mastra 2, OTel 3 family, minors). cargo/rustc NOT INSTALLED — desktop env.rs string edit unverified by rustc (literal-only change, low risk).
- 2026-10-29: Batch 6d DONE: twilio 6.2.0, eventsource 5.1.4, @ag-ui/mastra 2.0.1 (bridge API compatible, no revert), OTel family moved to 3.0.0 line (api-logs REMOVED — merged into @opentelemetry/api 1.10.0), hono 4.13.14, drizzle 0.45.4, zod 4.6.7, @mastra/core 1.80, @copilotkit/runtime 1.83 (@ag-ui/client 1.0.2 lockstep), MCP SDK 1.32.2, jose unified via bun update (fixed dual @better-auth/core). **TypeScript 7 DEFERRED with exact blockers**: TS7.0.2 green on server/worker/supervisor/desktop but app/tests use classic compiler API (form-submit-controls) + lib.dom breaks (WebSocket.readyState narrowing, IntersectionObserver.scrollMargin); TS6.0.3 same lib.dom breaks; fell back to 5.9.3 all-green. Full server suite 4540 pass, failures = documented flakes + 2 cross-batch breaks.
- 2026-10-29: Cross-batch breaks FIXED: learning-mastra child now carries ORBO_MANAGED_AGENT_TOKEN (boot guard); metrics.test spins an Intelligence stub (health probe would 503). 8/8 green. TS7 = owner decision item.
- 2026-10-29: 6.2 DONE: repo-wide `biome check --write` (105 files), `biome check .` fully clean, `bun run lint` green (1408 files), format clean. `.venv` in biome ignores; compose:639 warning fixed house-style.
- 2026-10-29: F-gate agent running (F.1 static gates, F.2 all suites vs documented baselines, F.3 compose config + docker build --check; no image build per approved cut). Final report follows its verdict.
- 2026-10-30: F-gate DONE (stalled once, kicked, re-ran foreground). VERDICT: loopback dev GO / production NO-GO (5 conditions). One real regression found+fixed: mastra/@ag-ui upgrades emit system prompt as role `developer` — tool-selection test widened (held in 630s full run). Test-DB data fix (stale credentials row). Full report below. NOTE: local Postgres loopback degraded 309ms→868ms (co-tenant containers) inflating flake count.
- 2026-10-29: crewai resolution: pinned ag-ui-crewai==0.3.1 + crewai==1.6.1 (verified = today's float resolution; deterministic now). LOCALAPPDATA test-env fix kept. REMAINING 14 crewai suite fails are Windows-local-only (same under 0.1.2/0.130.0 AND 0.3.1/1.6.1; Linux CI unaffected): child probe's synthetic provider receives [] messages instead of [system,user] — deep-diagnosed, deferred; the suite's role-preservation path needs a Windows probe investigation or CI parity run. Not a regression from any batch change.
