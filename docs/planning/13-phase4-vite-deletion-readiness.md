# 13 — Phase 4 Vite-Deletion Readiness (PLAN.md §8.4)

> Status: RESEARCH ONLY — no product code created, modified, or deleted.
> Maps every consumer of the Vite app (`app/` source + `app/dist` output) so the
> Phase 4 kickoff ending ("delete the Vite app") is safe. Target replacement:
> `apps/app` Expo web export (PLAN §3). Excludes `node_modules/_sources/target/dist`.

## 0. Method (what was actually inspected)

- Read: `desktop/src-tauri/tauri.conf.json`, `desktop/package.json`,
  `desktop/vite.config.ts`, `app/package.json`, `app/vite.config.ts`,
  `app/serve.ts`, `app/scripts/serve-or-build.ts`, `scripts/generate-app-config.ts`,
  `scripts/start.sh`, `scripts/test-ci.ts`, `server/src/app.ts` (static block),
  `server/src/production-entry.ts`, `server/Dockerfile`, `Dockerfile`,
  `docker-compose.yml`, `.dockerignore`, `mobile/package.json`, root `package.json`,
  `.github/workflows/ci.yml`, `docs/planning/09-execution-plan.md`.
- Searched (repo-wide, minus `node_modules/_sources/.git`): `APP_DIST_DIR|frontendDist|app/dist`,
  `serveStatic|appDistDir`, `app|dist|vite` in `scripts/`, `.github/`, `desktop/`, `charts/`, `docs/`.
- Rust stack launcher: `desktop/src-tauri/src/stack.rs` (`HOST_PROCESSES`, `APP_SCRIPT`,
  `deployment_problem`) + `env.rs` (`APP_PORT`) via targeted reads.
- `mobile/` and `charts/` returned zero direct hits — recorded as non-consumers,
  not omitted. Unknowns are marked UNKNOWN, never invented.

## 1. Consumer inventory (consumer file:line → what it uses → why)

| # | Consumer (exact file:line) | What it uses | Why it exists |
|---|---|---|---|
| C1 | `package.json:7-12` | workspaces entry `"app"` | `app` is a Bun workspace member |
| C2 | `package.json:13-17` | `build` (`generate:app-config` + `--filter '*' build`), `dev` (`--filter app --filter server`) | root lifecycle drives `app/` |
| C3 | `package.json:24` | `pretest` → `generate:app-config` | tests need generated config first |
| C4 | `scripts/generate-app-config.ts:3-20` | reads `server/src/tenant-package`, writes `app/src/lib/generated/application-config.ts` | bakes tenant brand into the Vite build |
| C5 | `app/package.json:7-14` | `build` (vite), `dev` (vite), `serve` (serve-or-build + `serve.ts`), `prebuild/predev/pretypecheck` hooks | the app's own lifecycle |
| C6 | `app/vite.config.ts:69-92` | `APP_PORT` 3010 + `SERVER_PORT` 3001, `/api` proxy, `host "::"` | dev/preview serving + API proxy |
| C7 | `app/vite.config.ts:23-60` | `announceServerPort` plugin (`window.__ORBO_WS_PORT__`, preview middleware) | bun proxy can't carry WS, so sockets dial server directly |
| C8 | `app/vite.config.ts:171-193` | `defineConfig` (Router + React + Tailwind, `preview: serving`) | build/dev definition |
| C9 | `app/serve.ts:21` | `DIST = join(import.meta.dir, "dist")` | static root for installed serving |
| C10 | `app/serve.ts:43-67` | `fileFor` / `isClientRoute` / `isApiCall` (+ traversal guard) | SPA fallback vs genuine 404 vs API |
| C11 | `app/serve.ts:194-276` | `Bun.serve` static + `/api` fetch/WS proxy (replaces `vite preview`, see header comment) | installed/desktop serving with no Node |
| C12 | `app/scripts/serve-or-build.ts:40-66` | `generate:app-config` → `isReusableBuild` → `vite build`; logs `app/dist` (:50,54) | desktop `serve` entrypoint body |
| C13 | `app/tests/serve.test.ts:152-218` | asserts `DIST/index.html` fallback, `/assets` 404s, traversal refusals | pins C10–C11 behavior |
| C14 | `app/tests/build-cache.test.ts:26,44,130` | `dist/index.html` presence/manifest cache contract | pins C12 reuse/rebuild behavior |
| C15 | `server/src/app.ts:4,1821-1843` | `serveStatic({root})` + `GET *` SPA fallback, `/api` excluded, mounted last | same-origin serving (no CORS anywhere) |
| C16 | `server/src/config.ts:310,1297-1298` | `appDistDir?: string` ← `APP_DIST_DIR` env | switch that turns C15 on; unset in dev |
| C17 | `server/Dockerfile:19,25-36` | `app-build` stage: `COPY app`, `COPY server` (codegen dep), `bun run --cwd app build` | API+app single image |
| C18 | `server/Dockerfile:59-60` | `COPY --from=app-build /app/app/dist app/dist` + `ENV APP_DIST_DIR=/app/app/dist` | ships the built app to the runtime |
| C19 | `Dockerfile:55,78-87` | root-image `app-build` stage (same shape as C17) | all-in-one laptop-equivalent image |
| C20 | `Dockerfile:152-153` | `COPY --from=app-build /src/app/dist app/dist` + `ENV APP_DIST_DIR=/app/app/dist` | same as C18 for the root image |
| C21 | `desktop/src-tauri/src/stack.rs:103-119` | `HOST_PROCESSES` app entry `cwd:"app"`, `package_script: APP_SCRIPT` | desktop launches repo `app/` on the host |
| C22 | `desktop/src-tauri/src/stack.rs:2979,2965-2979` | `APP_SCRIPT="serve"`; `deployment_problem` requires `scripts.serve` in `app/package.json` | old trees without it read as "older deployment" |
| C23 | `desktop/src-tauri/src/stack.rs:131-143,843-871` | vite-via-bun comment; `install_dependencies` (`bun install --frozen-lockfile`) | host-process install contract |
| C24 | `desktop/src-tauri/src/env.rs:44-107` | `ports.app` / `APP_PORT` default 3010 | stack address book |
| C25 | `desktop/src-tauri/src/env.rs:580-590` | app reachable-address list (`localhost`/`127.0.0.1`/`[::1]:{app}`) | health/identity probing |
| C26 | `scripts/start.sh:47-48` | `APP_PORT` default 3010, `SERVER_PORT` 3001 | local dev launcher ports |
| C27 | `scripts/start.sh:155-173` | `identifies_as_orbo app` (`<title>…ORBO` check) | proves the port holds ORBO, not a stray 200 |
| C28 | `scripts/start.sh:414-418` | `(cd app && bun run dev --port "$APP_PORT" --strictPort …)` | starts the Vite dev server |
| C29 | `scripts/stop.sh:81,123` | `stop_port "$APP_PORT" app` (SIGTERM→SIGKILL) | teardown for C28 |
| C30 | `scripts/test-ci.ts:27-35` | `DIR_FILE_FLOORS` `app/tests` floor 160 | suite-size tripwire covers `app/` |
| C31 | `scripts/test-ci.ts:73-74` | coverage probe `app/tests/agent-api-path.test.ts` → `app/src/lib/client.ts` (app floor 70) | per-file line gate on app code |
| C32 | `.github/workflows/ci.yml:311-326` | `startup` job: `bun test app/tests/build-cache.test.ts` (macOS+Windows) | proves cache contract off-Linux |
| C33 | `.github/workflows/ci.yml:424-435` | `build` job: `bun install` + `bun run build` (covers C2→C5) | CI proves the whole tree builds |
| C34 | `.github/workflows/ci.yml:501-556` | `image` job boots `orbo:ci`, probes `/api/capabilities` | proves C20 serves inside the container |
| C35 | `.dockerignore:11` | `app/dist` (plus `**/dist` :10) | keeps local build out of daemon context |
| C36 | `shared/listen-port.ts` (via C6+C11) | `listenPort(APP_PORT/ SERVER_PORT)` | single port-parsing contract both servers share |
| C37 | `examples/orbo/` (via C4, C17) | tenant package read by codegen, `COPY examples` into images | build input, not a consumer itself |

Non-consumers / unknowns (explicitly checked, do NOT migrate):

| # | Path | Verdict | Evidence |
|---|---|---|---|
| N1 | `desktop/src-tauri/tauri.conf.json:7` | NOT a consumer — `frontendDist ../dist` is the desktop's own `desktop/dist` | `desktop/vite.config.ts:9-10` (`outDir dist`, port 3020) |
| N2 | `mobile/` | NOT a consumer — isolated npm/Expo package, zero `app/` imports | `mobile/package.json:1-12`; grep no hits |
| N3 | `.github/workflows/desktop.yml`, `desktop-signing.yml` | NOT consumers — scoped to `desktop/**`, build Tauri shell only | path filters + job bodies read |
| N4 | `.github/workflows/release.yml`, `publish-release.yml` | NOT direct consumers — version/chart/desktop Cargo only | job bodies read; app ships via images (C17–C20) |
| N5 | `charts/orbo-diya/` | UNKNOWN/indirect — zero `APP_DIST\|app/dist` hits; consumes the server image that already contains C18 | re-verify when Helm serves the web export |
| N6 | `tests/smoke/journey.test.ts:46`, `tests/compose.test.ts:279-280` | NOT consumers — API URL :3001 + loopback checks only | bodies read; no `app/dist` dependency |
| N7 | `server/src/production-entry.ts:1-8` | NOT a consumer — eventsource+MCP import shim only | file read in full |

Docs (non-blocking; update after deletion, not before):

| Doc | Lines mentioning the Vite app | Action |
|---|---|---|
| `docs/architecture.md` | `:16` app row (port 3010) | repoint to export |
| `docs/configuration.md` | `:62` `APP_DIST_DIR`, `:404` ports, `:783` port table | repoint env + ports |
| `docs/development.md` | `:41-49` start/stop/dev, `:122` `bun run build` | repoint commands |
| `docs/deployment.md` | one-container § (built app on :3001) | repoint image contents |
| `docs/planning/05,06,09` | `05:18,183` (Tauri R7), `06:144`, `09:41` (WS-01 delete-after) | close the loop this doc opens |

## 2. Per-consumer migration (all required before deletion)

| Consumer(s) | Migration target | Concrete change |
|---|---|---|
| C1–C3 root workspace+scripts | `apps/app` web export | workspaces `app` → `apps/app`; `build`/`dev`/`pretest` drive the export; keep-or-repoint `generate:app-config` |
| C4 codegen output | `apps/app` config path | emit to `apps/app/src/lib/generated/…`; keep `tenant-package` read; update `prebuild` hooks |
| C5–C8 vite config | exporter config | drop `app/vite.config.ts`; Router/proxy/chunking policy re-expressed in export toolchain |
| C9–C12 serve path | export serve entry | port static + `/api`+WS proxy + SPA fallback + WS-port announce; or adopt exporter's server |
| C13–C14 tests | ported suite | port `serve`/`build-cache` tests to export paths; keep traversal + fallback assertions |
| C15–C16 server mount | same shape, new root | `APP_DIST_DIR` → export output dir; keep mount-last + `/api`-excluded fallback + dev-unset |
| C17–C20 images | export build | `COPY app` / `bun run --cwd app build` → export build; `COPY` + `ENV` track new dist path; keep prune comments |
| C21–C25 desktop stack | export host process | `cwd:"app"`/`APP_SCRIPT` → export dir/script; update `deployment_problem` text; `env.rs` ports/addresses |
| C26–C29 local scripts | export launch | `start.sh`/`stop.sh` launch + title check → new app + port; keep `require_free_or_ours`/`wait_for_orbo` |
| C30–C34 CI | export gates | floors/probes/jobs (`startup`, `build`, `image`) reference new paths; `MINIMUM_TESTS` note updated with reason |
| C35 ignore | export output | `app/dist` line → export output (or rely on `**/dist`) |
| C36–C37 shared inputs | unchanged or repointed | `listen-port` reused as-is; `examples/orbo` still copied wherever the export builds |

## 3. Ordered deletion checklist (gates for `git rm app/`)

| Step | Action | Gate (green before next step) |
|---|---|---|
| 1 | Freeze: pin this doc as baseline; forbid new `app/` imports | producer-only grep shows §1 rows and nothing else |
| 2 | Stand up `apps/app` export + serve equivalent (C5–C12 migrated) | export builds; static + `/api`+WS proxy + SPA fallback proven locally |
| 3 | Repoint server mount (C15–C16) | container serves export on :3001; deep-link refresh 200; `/api` miss still JSON 404 |
| 4 | Repoint images + ignore (C17–C20, C35) | both Dockerfiles build; `image` boot-and-serve job green |
| 5 | Repoint desktop + local scripts (C21–C29) | Tauri launches export; `start.sh` full stack up; `stop.sh` clean; old-tree gate text updated |
| 6 | Repoint CI gates (C30–C34) | `lint && typecheck && test && build` green; `test:ci` passes without `app/tests` |
| 7 | Port `app/tests` suite (C13–C14, C30–C31) | parity suites green in new location; probe re-anchored; floors adjusted with written reason |
| 8 | Update docs table (§1 footer) + CHANGELOG | no `3010 Vite` references left outside history |
| 9 | Delete: `git rm -r app/`, drop workspace entry, remove `app/dist` lines | clean-checkout `bun install --frozen-lockfile && bun run build` green; product `app/dist` grep zero |
| 10 | Verify per PLAN §9 | compose boots; smoke (Agent, governed browser, audit, Spaces, DIYA delegation); origin sweep zero first-party hits |

## 4. Risks

| # | Risk | Why it bites | Mitigation |
|---|---|---|---|
| R1 | Same-origin break (C15) | no CORS; split origins fail every `/api`+WS call | keep single-process serving or ship explicit CORS+WS plan before step 3 |
| R2 | Desktop old-tree gate (C22) | trees without `scripts.serve` read as "older" and refuse | version the gate with the export script; cover with a stack.rs test |
| R3 | WS proxy parity (C7, C11) | bun `destroySoon` outage + `__ORBO_WS_PORT__` contract | preserve forward semantics; live-screen + realtime-call smoke |
| R4 | CI floor masking (C30–C31) | removing ~165 `app/tests` files trips floors; silent lowering hides loss | port first (step 7); adjust floors only with written reason |
| R5 | Image regression (C17–C20) | Expo toolchain ≠ Vite; prune assumptions shift | keep multi-stage prune; keep boot-and-serve + supervision-stability steps |
| R6 | `tauri.conf.json` mis-map (N1) | `frontendDist ../dist` looks like an `app/` consumer | recorded non-consumer above; Tauri shell untouched by deletion |
| R7 | Port/docs drift (3010/3020/3001) | `env.rs` + `start.sh` + docs disagree | update the trio atomically; single address table in `configuration.md` |
| R8 | Helm unknown (N5) | chart may assume server-image layout | re-verify N5 during step 4; record outcome in `docs/deployment.md` |

*Research only — no product code touched. Sources read 2026-10-14; all line numbers verified.*
*© Opraiz Technology Pvt Ltd · Developer: Narein Rao*
