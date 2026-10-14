# Phase 8 — Desktop Stack Inventory

> Kickoff inventory per `PLAN.md` §8.8 (Desktop). Research only; no product code changed.
> Sources: `desktop/src/`, `desktop/src-tauri/`, `desktop/scripts/`, `desktop/signing/`,
> `.github/workflows/desktop*.yml`, `docs/windows-signing.md`, `docs/releasing.md`,
> `docs/deployment.md`, `docs/planning/05-mobile-web-parity.md` (R7).

## 1. Frontend inventory (`desktop/src/`)

Wizard shell: `desktop/src/main.tsx` (14 lines, mounts `#root`) → `desktop/src/App.tsx`
(1470 lines). Steps are `SetupStep = welcome | harness | install | model | connect | ask`
(`desktop/src/telemetry.ts:3-9`). IPC via `@tauri-apps/api` `invoke`/`listen`
(`setup:progress` events); failure display via `Problem` (`said` + `detail` registers).

| Screen (order) | Component / file | What it does |
|---|---|---|
| Welcome | `desktop/src/Welcome.tsx` (31 lines) | Product intro, single start button |
| Bot pick | `desktop/src/HarnessPicker.tsx` (179 lines) | Catalogue rows via `harnesses` command; default `langgraph`; BYO-URL row; 13 telemetry keys incl. `byo-url` (`telemetry.ts:11-27`) |
| Install | `App.tsx` install branch (~L781-865) | Root folder input; `prepare_installation`; engine line (`detect_engine`); progress list `SetupProgress` |
| Model | `desktop/src/ProviderPicker.tsx` (882 lines) | Providers: openai plan/api-key, anthropic plan/api-key, google oauth, xai oauth, openai-compatible endpoint; saved-credential resume via `already_configured` |
| Connect | `App.tsx` connect branch (~L977-1346) | Managed Intelligence sign-in (browser + project pick/create), self-hosted Intelligence (API/WS URL + key), org sign-in (`OrganizationSignIn.tsx`); `start_stack` |
| Ask (proof) | `desktop/src/Ask.tsx` (142 lines) | `SUGGESTED_QUESTION = "What is 17 times 23?"` (`App.tsx:77`, mirrors `ask.rs:35`); `ask_the_bot`; handover via `show_orbo` |
| Running | `App.tsx` running branch | "ORBO is running": Show/Stop ORBO; `stop_stack` |
| Resume | `App.tsx` boot effect (~L372-515) | `selected_root`/`default_root`, `already_configured`, `already_running` → `show_orbo`, auto-`start_stack` on saved launch |

Support modules:

| File | Purpose |
|---|---|
| `desktop/src/Problem.tsx` (76 lines) | `Problem`/`Failure`/`InlineFailure`: headline sentence + disclosure detail |
| `desktop/src/telemetry.ts` (86 lines) | `SetupStep`, `harnessChoiceEvent`, `modelChoiceEvent`, `recordSetupEvent` |
| `desktop/src/http-endpoint-url.ts` (13 lines) | `isHttpEndpointUrl` gate for compatible endpoints |
| `desktop/src/DatabaseReset.tsx` (52 lines) | Leftover-database reset offer (`reset_leftover_database`) |
| `desktop/src/OrganizationSignIn.tsx` (101 lines) | Org-authority sign-in screen |
| `desktop/src/ExternalLink.tsx`, `Mark.tsx`, `marks.ts`, `marks/` | Link helper, setup-progress marks |
| `desktop/src/styles.css` | Wizard styles |

Tests (measured with `rg -c "^\s*(it|test)\("`):

| File | Cases | Lines |
|---|---|---|
| `desktop/src/App.test.tsx` | 43 | 3255 |
| `desktop/src/ProviderPicker.test.tsx` | 21 | 1089 |
| `desktop/src/Problem.test.tsx` | 4 | 116 |
| `desktop/src/telemetry.test.ts` | 3 | 85 |
| `desktop/scripts/desktop-version.test.ts` | 4 | — |
| Total frontend | **75** (71 app + 4 script) | — |

## 2. `src-tauri` module inventory

Shell: `desktop/src-tauri/src/main.rs` (~5800 lines incl. 139 `#[test]`s: `Shell` state,
`prepare_installation` / `start_stack` / `stop_stack` / `show_orbo` / `already_running`
commands, `ChosenModel` → `ModelCredential` conversion, encryption-key guards).
`desktop/src-tauri/src/lib.rs` re-exports 27 testable modules. `Cargo.toml`: package
`orbo-desktop` 0.1.0, tauri v2 (`tray-icon` feature) + shell/opener/dialog/single-instance
plugins; **no `tauri-plugin-updater` or `tauri-plugin-deep-link` crate** (the
`plugins.updater`/`plugins.deep-link` entries in `tauri.conf.json` are config-only
placeholders). `build.rs`: `tauri-build` only.

| File | Purpose (from module docs / observed role) |
|---|---|
| `src/main.rs` | Tauri entry, `Shell` session state, all IPC commands, start/stop/supervise wiring |
| `src/lib.rs` | Testable library surface (27 `pub mod`) |
| `src/stack.rs` | Raises Compose services + 3 host processes; owns ports, readiness, shutdown sweep |
| `src/env.rs` | Writes deployment `.env`; mints secrets; `Ports` defaults; `ModelCredential` |
| `src/engine.rs` | Detects docker/podman engine, answers liveness |
| `src/acquire.rs` | Creates/starts podman machine (`create_machine`, `start_machine`, `health_gate`) |
| `src/install.rs` | Installs engine + Bun without sending user to a download page |
| `src/deployment.rs` | Fetches release tarball + `container-images.json` digests onto disk |
| `src/deployment_release.rs` | Picks new-deployment version; pins existing deployment's version |
| `src/preparation.rs` | Installation checkpoints (no credentials, no runtime ownership) |
| `src/harness.rs` | Harness catalogue as data (rows → AG-UI URL Bot registration) |
| `src/provider.rs` | Model-provider list as data (plan vs key vs oauth vs endpoint) |
| `src/provider_oauth.rs` + `provider_oauth_lock.rs` | Google/xAI OAuth (loopback + PKCE); token store `.orbo/model-oauth.json` |
| `src/plan.rs` | Claude/ChatGPT plan sign-in containers + token stores |
| `src/intelligence.rs` | Managed Intelligence sign-in (loopback callback, project key provisioning) |
| `src/self_hosted_intelligence.rs` | Self-hosted Intelligence sign-in browser helper |
| `src/organization_auth.rs` | Employee identity via customer ORBO authority (separate from Intelligence) |
| `src/ask.rs` | Post-start proof question (`SUGGESTED = "What is 17 times 23?"`) |
| `src/supervise.rs` | Restart policy for the 3 host processes |
| `src/tray.rs` | Native tray icon/menu (colored orb) |
| `src/windows.rs` | Windows setup state machine (WSL/admin/reboot); `Blocker` checks |
| `src/vault.rs` | Saved-secret reads (`already_given_no_ui`) |
| `src/saved_intent.rs` | Root-local saved-credential hints (never auth proof) |
| `src/problem.rs` | Two-register failure type (`said` + `detail`, `connection`, `database_reset`) |
| `src/telemetry.rs` + `src/desktop_telemetry.rs` | Opt-out setup-event emitter + Tauri integration |
| `src/pull_metrics.rs` | Image-pull progress metrics |
| `src/host_access.rs` + `src/desktop_host_access.rs` | Native host-access broker; owner approval via native dialogs |
| `src/desktop_connection.rs` | Per-run auth failures reported by owned server |
| `src/quiet.rs` | Console-free command execution on Windows |
| `src/stop_ipc_tests.rs`, `src/test_support.rs` | IPC/stop regression helpers, test fixtures |
| `src/macos-podman-ports.yml` | macOS podman port config |

Cargo tests (measured `rg --count-matches "#\[test\]" desktop/src-tauri/src`): **688**
total — `main.rs` 139, `stack.rs` 121, `env.rs` 63, `windows.rs` 39, `vault.rs` 36,
`intelligence.rs` 28, `acquire.rs` 27, `install.rs` 27, `harness.rs` 24, `plan.rs` 21,
`host_access.rs` 20, `engine.rs` 19, `provider_oauth.rs` 16, `ask.rs` 14,
`telemetry.rs` 14, `pull_metrics.rs` 11, `saved_intent.rs` 10, rest ≤ 7 each.
(Note: exceeds the ~492 figure quoted in the task brief; 688 is the measured count.)

## 3. Stack launcher

`prepare_installation` (engine → deployment fetch → deps → images → checkpoint) then
`start_stack` (`.env` → Compose up → migrate → 3 host processes → supervised).
`show_orbo` opens the app URL; `already_running` probes saved ports.

| Layer | Detail |
|---|---|
| Compose services (always) | `postgres`, `supervisor`, `agent-computer` (`stack.rs:25`) |
| Compose services (conditional) | `agent-bot` (openai/compatible key), `agent-langgraph` (openai/compatible/anthropic), `agent-harness` when a harness row is picked (`selected_services`, `BundledBots`) |
| Host process 1 | `server`, cwd `server`, `src/production-entry.ts` |
| Host process 2 | `app`, cwd `app`, package script `serve` (`APP_SCRIPT`, `stack.rs:2979`) |
| Host process 3 | `worker`, cwd `worker` |
| Deployment source | Release tarball `github.com/.../ORBO/archive/refs/tags/{version}.tar.gz` + digest-pinned `container-images.json` (`deployment.rs:40-46`); installer carries only the Tauri binary |
| Default ports (`env.rs:54-67`) | app **3010**, server **3001**, postgres **5432**, computer **4100**, bot **4200**, langgraph **4201**, supervisor **4500**, harness dynamic; persisted in deployment `.env`, bound on `127.0.0.1`/`[::1]` |
| Handover | `show_orbo` → app on port 3010; tray Stop/Quit retires host-access, downs containers |

## 4. Updater + signing + CI inventory

| Area | Finding (exact path) |
|---|---|
| Updater config | **Placeholder only**: `tauri.conf.json` has `plugins.updater` (`active: false`, empty `pubkey`/`endpoints`, TODO PLAN 10.B.14) plus `plugins.deep-link` (`desktop` schemes `["orbo"]`); no `tauri-plugin-updater` or `tauri-plugin-deep-link` crate in `Cargo.toml`. Only `docs/windows-signing.md:75` mentions an updater key (to say none is needed). PLAN B14 placeholder (Tauri updater to ORBO endpoint) is unimplemented |
| App identity | `desktop/src-tauri/tauri.conf.json`: `identifier ai.orbo.desktop`, `productName ORBO`, `version ../../package.json`, `frontendDist ../dist`, `devUrl http://localhost:3020`, window 900×640 (min 720×560), `security.csp null`, `plugins.deep-link` (`orbo`) + inactive `plugins.updater` placeholder |
| Bundle targets | `dmg`, `msi`, `nsis`, `appimage`, `deb`, `rpm` (`tauri.conf.json:41`); Desktop CI builds per-OS (`dmg` / `msi` / `appimage`+`deb`), Windows signing builds `nsis` only; Linux deb/rpm deps (`pkexec`, `procps`/`ps`, `lsof`, `ca-certificates`); icons `32x32/128x128(+2x)/icns/ico`; category `DeveloperTool` |
| Signing overlay | `desktop/src-tauri/tauri.windows-signing.conf.json`: `nsis`-only + `signCommand pwsh ../scripts/sign-windows.ps1 %1`; never auto-merged (name avoids `tauri.windows.conf.json`) |
| Signing identity | DigiCert cert `code-signing` in Key Vault `cpk-signing-kv`; federated credential `desktop/signing/azure-federation.json` (subject `...:environment:windows-signing`); AzureSignTool 7.0.1 pinned by SHA-256 |
| Signing CI | `.github/workflows/desktop-signing.yml`: `checks` (credential-free `test-windows-signing.ps1`) + protected `sign` job (label `windows-signing` or dispatch `keyvault`); verifies app + installer via `verify-windows-signatures.ps1` (`Tawkit, Inc.`, timestamp); artifacts 14 days; no release created |
| Build CI | `.github/workflows/desktop.yml`: `core` (fmt + clippy) + `app` matrix (macos/windows/linux) — bun install/typecheck, `desktop-version.ts internal`, `tauri build`, `cargo test --locked --lib --bins`, Windows standard-user test, mac version/signature check; artifacts 7 days |
| Versioning | Root `package.json` owns release version (`docs/releasing.md#desktop-build-versions`); `desktop/scripts/desktop-version.ts` (`sync`/`check`/`internal`/`release`) emits overlay + `build-version.json` (`X.Y.Z-internal.g<commit>`); `ci.yml:38-39` rejects Cargo drift; `publish-release.yml` bumps Cargo manifest/lockfile |
| Scripts | `desktop/scripts/sign-windows.ps1`, `verify-windows-signatures.ps1`, `test-windows-signing.ps1`, `test-windows-standard-user.ps1`, `desktop-version.ts`, `validate-telemetry.ts` |
| Capabilities | `desktop/src-tauri/capabilities/default.json`: default event + `opener:allow-open-url` (http/https) only |
| Docs | `docs/windows-signing.md` (100 lines, full flow); `docs/releasing.md` desktop-build-versions section; `docs/deployment.md` has **no desktop section** (single-container/server-platforms only) |

## 5. Desktop-role finding (no decision)

**Finding:** the desktop tree is a **setup/onboarding shell that installs an engine,
fetches a deployment, raises a local stack, and then hands off to the stack's own web
UI on port 3010** — not a wrapper that embeds the ORBO web export as its app surface
(`desktop/src-tauri/tauri.conf.json:7` `frontendDist ../dist` serves the wizard;
`show_orbo` opens the running stack; `docs/planning/05-mobile-web-parity.md` R7).
This matches 05 R7 verbatim: *"Desktop Tauri is not a web-export wrapper today ...
whereas PLAN §3 says the desktop shell wraps the app web export"* — cited, **not
decided here**. Phase 8 must resolve: setup-shell-plus-handoff vs web-export wrapper
(PLAN §3 layout `apps/desktop`, §8.8 installers + CI).

## 6. Risks

| # | Risk | Evidence |
|---|---|---|
| R1 | No auto-update path: no updater plugin, config, or endpoint | §4 above; PLAN B14 still placeholder |
| R2 | Desktop-role decision (05 R7) gates installer/CI scope | §5 above |
| R3 | `security.csp null` + opener allowlist http/https | `tauri.conf.json:23`; `capabilities/default.json` |
| R4 | Windows-first complexity (WSL state machine, admin/reboot, standard-user reads) | `src/windows.rs` (~39 tests), `test-windows-standard-user.ps1` |
| R5 | Deployment fetch is network-at-first-run (tarball + digests + images) | `src/deployment.rs`, `src/deployment_release.rs` |
| R6 | Symmetric-secret handling: minted `.env` secrets + encryption-key-missing guard refuses auto-replace | `src/env.rs`, `main.rs` `require_existing_encryption_key*` |
| R7 | macOS builds are ad-hoc-signed only (first-open exception, no notarization) | `docs/releasing.md:45-47` |
| R8 | Frontend/backend question constant duplicated (`App.tsx:77` ↔ `ask.rs:35`); drift breaks proof screen | Pinned only by an `ask.rs` content test |
| R9 | Test-count baseline in brief is stale (quoted ~492 cargo / ~100 App file; measured 688 / 43 cases) | §1–§2 counts above |
