# 31 — Phase 8 Tauri Web-Export-Wrapper Plan (PLAN.md §8.8)

> Status: RESEARCH ONLY — no product code created, modified, or deleted.
> Question left OPEN for the owner (§6); no option is selected by this document.
> Companion inventory: `docs/planning/30-phase8-desktop-inventory.md`.

Sources read 2026-10-14 (all line numbers verified on disk):
`desktop/src-tauri/tauri.conf.json`, `desktop/package.json`, `desktop/vite.config.ts`,
`desktop/src/App.tsx`, `desktop/src/main.tsx`, `desktop/src-tauri/Cargo.toml`,
`desktop/src-tauri/capabilities/default.json`, `desktop/src-tauri/src/main.rs:2400-2529`,
`desktop/src-tauri/src/` (35 files listed), `app/package.json`, `app/vite.config.ts`,
`app/dist/` (listing), `apps/app/package.json`, `apps/app/app.json`,
`apps/app/app/_layout.tsx`, `apps/app/app/(app)/` + `(auth)/` (listings),
`server/src/app.ts:1810-1843`, `server/src/config.ts:310,1297-1298` (via grep),
`PLAN.md` §1/§3/§7/§8.8/§10, `docs/planning/03-route-tree.md` §5 + Tauri notes,
`docs/planning/05-mobile-web-parity.md` R7, `docs/planning/13-phase4-vite-deletion-readiness.md`.

## 1. Current architecture (what Tauri serves today)

Tauri does NOT wrap a web export today. It bundles and serves its own
**setup/onboarding shell**, then navigates the same window to the running app:

- `desktop/src-tauri/tauri.conf.json:6-11` — `frontendDist` is `../dist`
  (the desktop's OWN Vite build, `desktop/vite.config.ts:10` `outDir dist`),
  `devUrl http://localhost:3020`, `beforeDevCommand bun run dev`,
  `beforeBuildCommand bun run build`. This is the setup UI, not the app.
  (13 §1 N1 records the same finding: not an `app/` consumer.)
- `desktop/src/App.tsx` — a ~1470-line wizard: `Welcome → HarnessPicker →
  install → ProviderPicker → connect` (Intelligence sign-in, self-hosted +
  managed + organization) `→ Ask` (proof question, `SUGGESTED_QUESTION`,
  `App.tsx:77`) `→ Show ORBO`. Every step invokes Rust commands
  (`detect_engine`, `prepare_installation`, `start_stack`, `ask_the_bot`, …).
- `desktop/src-tauri/src/main.rs:2405-2483` (`show_orbo`) — after the stack is
  up, the Rust side **navigates the `main` webview away from the bundled setup
  UI to the owned app URL** probed on the loopback app port
  (`stack::app_url` tries `127.0.0.1`/`[::1]:{app}`, default `APP_PORT 3010`
  per `desktop/src-tauri/src/env.rs:44-107`, `app/vite.config.ts:69-92`).
  This runtime navigation is the only "wrapper" behavior that exists.
- `desktop/src-tauri/src/stack.rs:103-119,2979` (per 13 C21–C22) — desktop
  launches repo `app/` on the host (`cwd:"app"`, `APP_SCRIPT="serve"`,
  requires `scripts.serve` in `app/package.json:9`).
- Window: single `900×640` (min `720×560`), `tauri.conf.json:13-24`.
  Tray (`src/tray.rs`), Windows blockers (`src/windows.rs`), engine
  install/supervision (`src/install.rs`, `src/stack.rs`, `src/supervise.rs`).
- `desktop/src-tauri/Cargo.toml:19-36` plugins: `tray-icon`, `shell`,
  `opener`, `dialog`, `single-instance`. There is NO updater, NO deep-link,
  NO autostart, NO notification plugin **crate**; `tauri.conf.json:54-65`
  does hold config-only placeholders (`plugins.deep-link` with the `orbo`
  scheme, inactive `plugins.updater` per PLAN §10.B.14).
- `desktop/src-tauri/capabilities/default.json` — grants only
  `core:event:default` + `opener:allow-open-url` (http/https).

## 2. Target architecture (Tauri wraps the web export)

Per `PLAN.md` §3 (`apps/desktop/ — Tauri shell wrapping the web export
(no separate UI)`) and `03` §5/Tauri-notes (`03:360-362,447-454`): Tauri
ships **no separate UI or route tree** — it bundles the web export, serves it
via the platform webview protocol, and keeps only native deltas (window
chrome, tray, file associations, auto-update). Routing is identical to web.

Which export, in what order:

| Stage | Export | Evidence it exists / does not yet |
|---|---|---|
| Interim (now) | `app/dist` — Vite build of `app/` (`app/package.json:8`, output `app/dist/index.html` + `assets/`, verified on disk) | EXISTS today; already served same-origin by the server (`server/src/app.ts:1821-1843`) and by Docker images (13 C17–C20) |
| Final (Phase 4 done) | `apps/app` Expo web export (`02`/`03` target tree, scheme `orbo`, bundle ids `ai.orbo.app` per `apps/app/app.json:4-16`) | DOES NOT EXIST yet: `apps/app/package.json:7-13` has NO export script (`start/android/ios/web/typecheck` only), and `apps/app/app/_layout.tsx:1-8` is a placeholder (`TODO(phase-4)`, no providers). 13 §2–§3 gates the cutover. |

So Phase 8 = (a) make Tauri a true wrapper around `app/dist` now, then
(b) swap the wrapped root to the `apps/app` export when 13's deletion
checklist completes. Step (b) re-uses the same `frontendDist` + command
seam; it must not be a second migration design.

## 3. Gap analysis (current → target)

| # | Gap | Current state (exact path) | Target state | Size note |
|---|---|---|---|---|
| G1 | `frontendDist` repoint | `desktop/src-tauri/tauri.conf.json:7` → `../dist` (setup UI) | → wrapped export (`../../app/dist` interim; `apps/app` export output final). `main.rs:2486-2529` (`configured_setup_url`) assumes the bundled root IS the setup page — it must be updated in lockstep or first navigation breaks. | 1-line config + Rust URL logic + tests in `main.rs`/`stop_ipc_tests.rs` |
| G2 | Setup-flow relocation | Wizard lives in `desktop/src/` + 35 Rust files (`install.rs`, `stack.rs`, `intelligence.rs`, `provider*.rs`, `organization_auth.rs`, `ask.rs`, …) | Rust engine-supervision commands STAY (that is the desktop's reason to exist); the React wizard either stays bundled (Option A) or moves into web routes — `03:375` already maps onboarding to `(auth)/onboarding.tsx` | The single biggest fork between options; see §4 |
| G3 | Deep links | Config placeholder registered, no Rust crate: `plugins.deep-link` (`desktop` schemes `["orbo"]`) in `tauri.conf.json:55-58`, but no `tauri-plugin-deep-link` in `Cargo.toml`. `single-instance` plugin IS present (`Cargo.toml:33`, `main.rs:3749`) so second-launch argv forwarding exists. Mobile precedent: `orbomobile:` scheme (`05` F7); `apps/app/app.json:6` scheme `orbo`. `03:450-451` requires registration in BOTH `tauri.conf.json` and Expo `app.json`. | Register the missing crate + route map (`chat/[channelId]`, approvals, spaces pages) + hash-link (`#/spaces/…`) redirect map per `03` migration notes | Greenfield handler-side; needs owner-confirmed scheme |
| G4 | Updater | Config placeholder only: `plugins.updater` (`active: false`, empty `pubkey`/`endpoints`) in `tauri.conf.json:59-64`, no `tauri-plugin-updater` crate. `PLAN.md` §10.B.14 defers to "an ORBO endpoint (placeholder until domain set)"; §10.A.2/7 (domain, certs) and §1 gate it. | Tauri updater crate + endpoint + signed artifacts per OS (`dmg/msi/nsis/appimage/deb/rpm` are the bundle targets, `tauri.conf.json:41`; Desktop CI builds `dmg` / `msi` / `appimage`+`deb`, signing builds `nsis`) | Blocked on domain + signing; placeholder config only until then |
| G5 | Window / file associations | One window, no associations, no MIME/protocol claims in `tauri.conf.json:25-53` (bundle section; `plugins` follow at `:54-65`). `03:453-454` names "file associations (PDF/documents)" as a desktop-only delta (Documents/PDF pipeline is a §6 ship item). | Window policy (size/title per surface?) + PDF/document associations per OS + opener wiring (`opener` plugin already present) | Small config; needs owner call on which extensions ORBO claims |
| G6 | Same-origin / WS parity | `app/vite.config.ts:69-92` (`/api` proxy :3001, WS-port announce `__ORBO_WS_PORT__`) and `app/serve.ts` + `server/src/app.ts:1821-1843` (mount-last, `/api`-excluded SPA fallback). A file-protocol-bundled export (`tauri://localhost`) is NOT same-origin with `http://127.0.0.1:3010` — API/WS calls need an explicit strategy (keep navigating to the local stack URL like `show_orbo` does today, vs bundle + explicit origin/allowlist). 13 R1/R3. | One documented serving shape before G1 lands | Decision shapes both options; default = keep `show_orbo`-style navigation (zero new CORS surface) |

## 4. Two options (effort rough, unestimated — owner to confirm)

### Option A — Repoint to `app/dist` now, keep setup shell as first-run

Mechanics: `frontendDist` → `../../app/dist` is NOT the move (that would
delete first-run). Instead: keep bundling `desktop/dist` (setup wizard
unchanged, G1 deferred for the setup window), and **declare `app/dist` the
wrapped export**: desktop already launches it (`stack.rs` `cwd:"app"`) and
navigates to it (`show_orbo`). Work = build coupling (`beforeBuildCommand`
ensures a fresh `app/dist`; `serve-or-build.ts` reuse contract per 13 C12),
`deployment_problem` gate text (13 C22/R2), smoke tests (setup → ask →
navigate → deep-link refresh 200), docs. No Rust logic changes.

| Pros | Cons |
|---|---|
| Days, not weeks; zero Rust risk; first-run UX untouched | Two bundled UIs persist (setup shell + export) — PLAN §3 "no separate UI" stays violated |
| Uses the seam that already works (`show_orbo` navigation) | G3/G4/G5 still greenfield afterward; second migration (→ `apps/app` export) still owed |
| Fully compatible with 13's deletion checklist running in parallel | `tauri.conf.json` still points at the setup UI, inviting the N1/R6 misread again |

Rough effort: **S (≈1–3 days)** — build wiring + gate text + smoke + docs.

### Option B — Full wrapper: setup moves inside the web app

Mechanics: `frontendDist` → wrapped export (`app/dist` interim, `apps/app`
output final); the wizard is reimplemented as web routes (`(auth)/onboarding`
per `03:375`, plus install-progress + `Ask` proof screens); `desktop/src/`
React UI deleted after parity; Rust commands (`stack.rs`, `install.rs`,
`ask.rs`, …) stay and are invoked from the web UI via `@tauri-apps/api`
(`@tauri-apps/api ^2` is already a `desktop/package.json` dependency).
`configured_setup_url` (`main.rs:2489+`) is repointed once. First-run becomes
a route, not a bundle.

| Pros | Cons |
|---|---|
| Ends at the PLAN §3 target: one UI, no separate shell; R7 closed | Weeks: new onboarding/install/Ask routes in `app/` (or `apps/app`), invoke bindings, capability grants (`default.json` is setup-window-scoped today), `main.rs` test updates |
| The `apps/app`-export swap later is config-only (same wrapper) | Web app gains Tauri-conditional code (capability checks per `05` §3 rules); must not leak into mobile/web bundles |
| Deep links (G3) land on real routes from day one | Changes first-run UX mid-Phase-4 — needs design + owner sign-off on the wizard-as-route flow |

Rough effort: **M–L (≈1–3 weeks)** — routes + bindings + tests + docs; gated
additionally on G6 serving-shape decision.

## 5. Ordered migration steps

### Option A steps

1. Pin `app/dist` freshness into the desktop build: extend
   `desktop/package.json:6-11` `beforeBuildCommand` (build `app/` first or
   assert reuse per `app/scripts/serve-or-build.ts:40-66`); verify
   `bun run build` in `desktop/` produces a window that reaches `Ask`.
2. Update `deployment_problem` gate text (`stack.rs:2965-2979`, 13 C22) to
   name the export serve script; add/adjust a `stack.rs` test (13 R2).
3. Smoke-test the seam end to end: install → connect → `Ask` → `show_orbo`
   navigation → deep-link refresh on a non-`/` route returns 200
   (`server/src/app.ts:1835-1842` fallback); record results.
4. The G3 protocol placeholder already exists as config (`plugins.deep-link`,
   `tauri.conf.json:55-58`); add the missing deep-link crate + handlers, the
   G5 file-association list as config-only additions to `tauri.conf.json`
   (no handlers yet); file the G4 updater endpoint per PLAN §10.B.14
   (no endpoint until domain set; `plugins.updater` stays `active: false`).
5. Update docs (`docs/architecture.md:16`, `docs/configuration.md`,
   `docs/deployment.md`, `05` R7 row) to name `app/dist` the wrapped export
   and `desktop/dist` the first-run shell; close the loop 13 §1-footer asks for.
6. Hand Phase 4 the baton: when 13's checklist finishes, swap the wrapped
   root to the `apps/app` export (one repoint + smoke, same seam).

### Option B steps

1. Decide G6 serving shape first (keep `show_orbo`-style loopback navigation
   vs bundle + explicit origin); record in `docs/configuration.md`. Nothing
   below is safe without this.
2. Build wizard-as-routes in the wrapped app: onboarding/install-progress/
   connect/`Ask` screens (reuse `desktop/src/` logic; `03:375` route slot);
   guard all `invoke()` calls behind a Tauri capability check so web/mobile
   bundles never evaluate them (`05` §3 rule 5).
3. Repoint `tauri.conf.json:7` at the export; update `configured_setup_url`
   (`main.rs:2489-2529`) + `capabilities/default.json` (webview needs
   `invoke` + opener grants the setup window had); update `main.rs` tests.
4. Port `desktop/src/*.test.tsx` + telemetry (`telemetry.ts`) assertions to
   the new routes; keep `SUGGESTED_QUESTION` pin (`App.tsx:77`, `ask.rs` test).
5. Register G3 deep links against the REAL routes + hash redirect map;
   claim G5 file associations; file the G4 updater placeholder.
6. Delete `desktop/src/` wizard (keep `main.tsx` bootstrap + styles);
   `desktop/vite.config.ts:9-10` `outDir` becomes build-internal only.
7. Same Phase-4 handoff as A-step-6, but config-only (wrapper already route-based).

## 6. Owner decision required (05 R7 — the open question)

> **R7 — Desktop Tauri is not a web-export wrapper today.** `desktop/` is the
> OpenBot-style setup/onboarding shell … whereas PLAN §3 says the desktop
> shell wraps the app web export. **Determine whether desktop = web app +
> local engine supervisor, or a separate shell.** (`05:183`)

**Exact question for the owner — do NOT proceed past research until answered:**

> **For Phase 8, do you choose (A) keep the bundled setup shell as first-run
> and wrap `app/dist` at runtime via the existing `show_orbo` navigation
> (≈ days, PLAN §3 "no separate UI" stays open), or (B) dissolve the setup
> shell into web-app first-run routes and make Tauri a pure web-export
> wrapper (≈ weeks, closes R7 fully)? In either case: (i) confirm the interim
> export is `app/dist` with the final export being the `apps/app` Expo web
> output; (ii) confirm the `orbo:` scheme (`apps/app/app.json:6`) for desktop
> deep links; (iii) confirm which file extensions (if any) ORBO desktop may
> claim (G5); (iv) confirm the updater stays a placeholder until domain +
> signing exist (PLAN §10.A.2/7, §10.B.14)?**

*© Opraiz Technology Pvt Ltd · Developer: Narein Rao*
