# W0 Owner-Decision Packet — §3 Platform & Release

> W0 section only (research; no product code changed). Companion sections live in
> `docs/planning/33-w0-sections/`. Nothing here selects an option — every item
> below ships with **Status: OPEN** until the owner answers.
>
> Sources (all verified on disk 2026-10-15): `docs/planning/05-mobile-web-parity.md`
> (R1/R2/R3/R7), `docs/planning/30-phase8-desktop-inventory.md`,
> `docs/planning/31-phase8-wrapper-plan.md` (§6 owner question + G3/G4),
> `.github/workflows/desktop.yml` + `desktop-signing.yml` (jobs, signing separation),
> `desktop/signing/azure-federation.json`, `PLAN.md` §10.A (inputs 1–7), §10.B
> (defaults 8–21), §10.E (release 38–42).
>
> Scope of this section: the desktop-role call (05 R7 → 31 §6), its four
> sub-confirms (wrapped export, deep-link scheme, file associations, updater
> placeholder), the native voice/media call (05 R1/R2 → D13), and the owner-inputs
> checklist (PLAN §10.A.1–7, marked NOT A DECISION). Signing/CI facts ground the
> release inputs; the two workflows are deliberately separated (unsigned build vs
> protected signing) and this section preserves that separation.

## D7. Desktop role — setup shell first-run vs pure wrapper (05 R7)
**Question:** For Phase 8, is the Tauri desktop the bundled setup/onboarding shell that supervises the local engine and hands off to the running stack (first-run shell), or a pure wrapper around the app web export with no separate UI (PLAN §3 `apps/desktop`, 05 R7)?
**Options:** A. Setup-shell-first-run wrapping `app/dist` at runtime via the existing `show_orbo` loopback navigation — days, zero Rust risk, first-run UX untouched (31 §4 Option A) / B. Pure wrapper: wizard dissolved into web-app first-run routes (`(auth)/onboarding` per 03:375), `frontendDist` repointed at the export — closes R7 fully, costs weeks plus Tauri-conditional code in the web bundle (31 §4 Option B)
**Recommendation:** A — because the `show_orbo` navigation seam already works (`main.rs:2405-2483`), no Rust logic changes, and 13's deletion checklist can run in parallel; PLAN §3 "no separate UI" stays open as tracked debt, not silent drift.
**Blocked work:** P8 wrapper build (G1 repoint, G2 setup relocation, G6 serving-shape call); P4 export-swap handoff (A-step-6/B-step-7); docs loop (`architecture.md`, `configuration.md`, `deployment.md`, 05 R7 row).
**Status:** OPEN
Context: 30 §5 finds the desktop tree is a setup/onboarding shell that installs an
engine, fetches a deployment, raises a local stack (Compose `postgres`,
`supervisor`, `agent-computer` + conditional bots; host processes server/app/worker),
and hands off via `show_orbo` to the stack's web UI on port 3010 — not a wrapper
around the web export (`tauri.conf.json:7` `frontendDist ../dist` serves the wizard).
31 §6 leaves the role question OPEN for the owner and forbids proceeding past
research until answered.
Evidence: `desktop/src-tauri/tauri.conf.json:6-11` (own Vite build, `devUrl
:3020`); `desktop/src/App.tsx` ~1470-line wizard
(welcome → harness → install → model → connect → ask → running);
`stack.rs` launches repo `app/` (`cwd:"app"`, `APP_SCRIPT="serve"`);
window single `900×640`; tray (`tray.rs`), Windows blockers (`windows.rs`),
engine install/supervision (`install.rs`, `stack.rs`, `supervise.rs`).
Effort signal (unestimated, owner to confirm): A ≈ S (1–3 days, build wiring +
gate text + smoke + docs); B ≈ M–L (1–3 weeks, routes + bindings + tests + docs).

## D7.1. Interim wrapped export — `app/dist` now, `apps/app` output final
**Question:** Is the interim wrapped export `app/dist` (Vite build, exists today and already served same-origin by `server/src/app.ts:1821-1843`), with the final export being the `apps/app` Expo web output once Phase 4 completes (31 §2)?
**Options:** A. Yes: `app/dist` interim → `apps/app` export at 13-checklist completion, same `frontendDist` + command seam, second swap is config-only — matches what exists on disk / B. Target `apps/app` output directly — blocked: no export script (`apps/app/package.json:7-13`), placeholder `_layout.tsx` (TODO phase-4), 13 §2–§3 gates the cutover (31 §2 table)
**Recommendation:** A — because `app/dist` exists and is served today while the Expo export does not exist yet; a direct target would gate Phase 8 on Phase 4's deletion checklist.
**Blocked work:** P8 A-step-1 build coupling (`beforeBuildCommand` freshness / `serve-or-build.ts` reuse, 13 C12); P4 baton swap (one repoint + smoke).
**Status:** OPEN
Context: 31 §2 stages the cutover explicitly — (a) make Tauri a true wrapper around
`app/dist` now, then (b) swap the wrapped root to the `apps/app` export when 13's
deletion checklist completes, re-using the same `frontendDist` + command seam so
step (b) is not a second migration design.
Evidence: `app/package.json:8` build emits `app/dist/index.html` + `assets/`
(verified on disk); `server/src/app.ts:1821-1843` serves it same-origin and Docker
images reuse it (13 C17–C20); `apps/app/app.json:4-16` already reserves scheme
`orbo` and bundle ids `ai.orbo.app`, but the export script and providers are missing.
G6 caveat: a file-protocol-bundled export (`tauri://localhost`) is NOT same-origin
with `http://127.0.0.1:3010` — default is keep `show_orbo`-style navigation (zero
new CORS surface) unless the owner picks bundle + explicit origin.

## D7.2. Desktop deep-link scheme — confirm `orbo:`
**Question:** Is `orbo:` (registered in `apps/app/app.json:6`, placeholder in `tauri.conf.json:55-58` `plugins.deep-link`) the confirmed desktop deep-link scheme (31 G3, 03:450-451 requires registration in BOTH `tauri.conf.json` and Expo `app.json`)?
**Options:** A. Confirm `orbo:` — aligns with the mobile `orbomobile:` precedent (05 F7) and the existing `single-instance` argv-forwarding seam (`Cargo.toml:33`); work becomes crate + route map only / B. Pick a different scheme — renames both configs plus the `chat/[channelId]` + approvals + spaces hash-link redirect map (03 migration notes)
**Recommendation:** A — because the config placeholder and the Expo `app.json` entry already agree on `orbo:`, and `single-instance` forwarding exists; remaining work is the missing `tauri-plugin-deep-link` crate + handlers, not a naming debate.
**Blocked work:** P8 G3 (deep-link crate registration, route map, `#/spaces/…` redirect map); P3 route-port order for linkable screens (08 merge order).
**Status:** OPEN
Context: 31 G3 is precise about the gap — the scheme is registered as config but
there is NO `tauri-plugin-deep-link` crate in `Cargo.toml`, so second-launch argv
forwarding exists (`single-instance` present) while scheme handling does not.
Mobile precedent (05 F7) maps `orbomobile:` to `/conversation` and `/approvals`
via `mobile/src/links.ts`; desktop needs the analogous route map against real
routes (Option A) or post-B route tree (Option B).
Evidence: `tauri.conf.json:55-58` (`desktop` schemes `["orbo"]`); `Cargo.toml:19-36`
plugin list (tray-icon, shell, opener, dialog, single-instance — no deep-link, no
updater, no autostart, no notification); `capabilities/default.json` grants only
`core:event:default` + `opener:allow-open-url`.
Note: under Option A, G3 lands on the runtime-navigated routes; under Option B it
lands on real wrapped routes from day one (31 §4).

## D7.3. Desktop file associations — which extensions ORBO claims (G5)
**Question:** Which file extensions (if any) may the desktop build claim — 31 G5 names PDF/documents as the desktop-only delta, and the Documents/PDF pipeline is a §6 ship item?
**Options:** A. Claim PDF/documents at install (bundle `fileAssociations`, opener wiring already present) — matches the §6 Documents pipeline, small config / B. Claim nothing in v1 (config-only placeholder, no handlers) — zero OS-claim review surface until the Documents pipeline and G6 serving shape settle
**Recommendation:** B — because G5 is handler-greenfield (one window, no associations in `tauri.conf.json:25-53`) and OS claims invite store/review friction; file the association list as config-only per 31 A-step-4 and activate with the pipeline.
**Blocked work:** P8 G5 (window policy + per-OS association claims + opener wiring); §6 Documents PDF view/paging/zoom/share parity (05 F13/F15).
**Status:** OPEN
Context: 31 G5 scopes this as small config with an owner call attached — window
policy (size/title per surface?) plus PDF/document associations per OS, with the
`opener` plugin already present so invocation plumbing exists but claims do not.
The §6 side that justifies any claim is the Documents pipeline (email attachment →
PDF → form values → filled copy → reviewed reply → receipt), which needs per-platform
picker (05 F1), PDF reader (05 F13), and save-to-device (05 F15) before a desktop
claim is more than a manifest entry.
Evidence: bundle targets `dmg`, `msi`, `nsis`, `appimage`, `deb`, `rpm`
(`tauri.conf.json:41`); Desktop CI builds `dmg`/`msi`/`appimage`+`deb` while
signing builds `nsis` only (workflows, 30 §4); 05 §2 F13 row (web `<iframe>` vs
native `react-native-pdf`) shows the reader itself is still a platform split.

## D7.4. Desktop updater — placeholder until domain + signing exist
**Question:** Does the Tauri updater stay a placeholder (`plugins.updater` `active: false`, empty `pubkey`/`endpoints`, no `tauri-plugin-updater` crate — 30 §4) until domain + signing exist per PLAN §10.A.2/7 and §10.B.14?
**Options:** A. Yes, placeholder — no endpoint (domain unset), no key to distribute, per-OS signed artifacts not yet flowing (30 R1; PLAN B14 verbatim) / B. Wire the updater now — requires domain endpoint + pubkey + signed `dmg/msi/nsis/appimage/deb/rpm` pipeline first (31 G4)
**Recommendation:** A — because the updater has no crate, no config, and no endpoint today, and §10.B.14 explicitly defers it to "an ORBO endpoint (placeholder until domain set)"; wiring it now manufactures a key-distribution decision the owner has not made.
**Blocked work:** P8 G4 (updater crate + endpoint + signed-artifact flow); §10.E.38 signing wiring; release distribution channel choice.
**Status:** OPEN
Context: 30 R1 states the no-auto-update finding flatly — no updater plugin,
config, or endpoint — and 30 §4 records that the only updater-key mention in the
tree (`docs/windows-signing.md:75`) exists to say none is needed. 31 G4 adds the
ordering: blocked on domain + signing, placeholder config only until then.
Evidence: `tauri.conf.json:59-64` (`plugins.updater`, `active: false`, empty
`pubkey`/`endpoints`); PLAN §10.B.14 (Tauri updater to ORBO endpoint, placeholder
until domain set); PLAN §10.A.2 (domain) + §10.A.7 (Windows cert) as the gating
inputs; `docs/deployment.md` has no desktop section (server-platforms only).
Under Option A-step-4 the updater endpoint is filed with no endpoint until the
domain is set and `plugins.updater` stays `active: false` (31 §5).

## D13. Native voice caps, supervision, and media path (05 R1/R2)
**Question:** What ships on iOS/Android in v1 for realtime voice calls (05 R1: WebRTC `RTCPeerConnection` + `POST /api/voice/calls` on web, no `react-native-webrtc`, TURN/STUN unknown) and composer dictation (05 R2: `MediaRecorder` blob → `POST /api/audio/transcriptions` on web, no audio-record dependency in `mobile/`), given the server contract is shared and parity is client-side (05 §2)?
**Options:** A. Server-mediated caps in v1: WS fallback transport + transcription endpoint over the shared contract, supervision server-owned (05 F16 shared), native WebRTC/recorder modules deferred — ships §6 "realtime calls" functionally without native media crates / B. Full native media parity in v1: add `react-native-webrtc` + recorder modules, resolve TURN/STUN, ship per-platform splits (`recording.{web,native}`, screen-transport contract per 05 §3) — true parity, needs credentials + weeks
**Recommendation:** A — because R1/R2 mark the native modules as missing (not chosen), R3 gates store release on credentials not held (EAS/APNs/FCM, PLAN §10.A.5 + §10.E.38), and every divergent feature already calls the same Hono API so a server-mediated path is shippable while B's inputs are pending.
**Blocked work:** P3 native splits (recorder, voice transport, notifier per 05 §3 table); P-release push onboarding (05 R3 → INPUTS EAS + cert accounts); TURN/STUN provisioning answer; CopilotKit native parity check (05 R5).
**Status:** OPEN
Context: 05 §2 makes parity a client-side concern — the web client
(`app/src/lib/client.ts`) and the native client (`mobile/src/api.ts`) call the same
ORBO Hono `/api/...`, so a server-mediated voice/dictation path (WS fallback the
web stack already has in `connection.ts`/`websocket.ts`, transcription endpoint the
server owns) ships §6 "realtime calls: WebRTC speech, call controls, receipts"
functionally while native modules are deferred. Supervision stays server-owned
(05 F16 shared: jobs run server-side; clients poll on `AppState`/focus), so no
native supervision policy is being decided here.
Evidence: R1 (`app/src/lib/voice/webrtc.ts`, `websocket.ts`; `mobile/package.json`
has no webrtc dep; TURN/STUN unknown); R2 (`app/src/lib/dictation/recording.ts`;
no audio-record dep in `mobile/`; endpoint format-dependent); R3 (`registerPush`
throws without EAS project + APNs/FCM; PLAN §10.A.5 + §10.E.38 pending);
first-split table 05 §3 (recorder `recording.{web,native}` over the existing
`Recording` interface; capability guards `recordingSupported()`).
Related non-blockers: R4 (native points at a deployed ORBO over HTTPS — ops
prerequisite, not a decision); R5 (CopilotKit native headless parity unknown —
tracked in blocked work, not decided here).

## INPUTS. Owner inputs checklist (NOT A DECISION — checklist only, no options)
**Question:** N/A — these are facts/materials only the owner can supply (PLAN §10.A.1–7). No recommendation; collect before the gated work starts.
**Options:** N/A (checklist, not a decision).
**Recommendation:** N/A — collect all seven before release-track work; D7.4/D13/G3/G4 cannot close without the starred items.
**Blocked work:** Items marked * gate signing/release/push below.
**Status:** COLLECTING (not a decision; do not vote — supply values)
- [ ] 1. Brand assets — logo, color tokens, fonts (PLAN §10.A.1; also §10 table
  "Assets | Provided by owner (logo, colors, fonts, domain)").
- [ ] 2. Domain * — for links, bundle IDs, defaults (PLAN §10.A.2). Feeds the
  updater endpoint (D7.4 / §10.B.14 "placeholder until domain set") and the
  default bundle IDs `ai.orbo.app` (mobile) + `ai.orbo.desktop` (§10.B.12,
  display name ORBO), plus installer defaults (§10.B.13: Windows MSI, macOS DMG,
  Linux AppImage + deb).
- [ ] 3. Git host + repo name/org, e.g. GitHub `opraiz/orbo` (PLAN §10.A.3).
- [ ] 4. npm scope confirm — `@orbo/*` assumed, or `@orbo-diya/*` (PLAN §10.A.4;
  availability check §10.D.30; workspace pkgs `orbo`, `@orbo/*` per the PLAN §3
  rename table; contrast `npm scope @copilotkit/* (our packages only)`).
- [ ] 5. Expo/EAS org account * for cloud builds (PLAN §10.A.5; PLAN §7 notes iOS
  + Android via EAS Build/Submit, no Mac needed). `registerPush` throws without
  an EAS project + APNs/FCM (05 R3; `mobile/src/notifications.ts`,
  `mobile/app.config.ts`) — gates D13 push parity and store release.
- [ ] 6. Intelligence project owner * — whose account holds ORBO's project/license
  (PLAN §10.A.6).
- [ ] 7. Release accounts (later) *: Apple Developer, Google Play, Windows cert
  (PLAN §10.A.7 → §10.E.38 signing/notarization wiring + CI secret storage,
  §10.E.39 store listings). Windows specifics on file: vault `cpk-signing-kv`,
  cert `code-signing` (30 §4); federation subject
  `repo:CopilotKit@131273140/ORBO@1336502227:environment:windows-signing`
  (`desktop/signing/azure-federation.json`); `desktop-signing.yml` `sign` job runs
  ONLY on the `windows-signing` label or a `keyvault` dispatch under the protected
  `windows-signing` environment (OIDC via `azure/login`, expiry-checked SHA pin).
  The unsigned build stays in `desktop.yml`: `core` (fmt + clippy) + per-OS `app`
  matrix (`dmg` / `msi` / `appimage`+`deb`), macOS ad-hoc identity `-` only, 7-day
  artifacts vs 14-day signed; signing verifies app + installer and pins publisher
  `Tawkit, Inc.` + timestamp via `verify-windows-signatures.ps1` — swap at
  provisioning if the cert subject changes. macOS builds are ad-hoc-signed only
  (first-open exception, no notarization — 30 R7) until Apple credentials exist
  (PLAN §7: signing/notarization wired but activated once Apple credentials exist).

> Dependency note: Tauri updater + deep-link crate re-add (G3/G4) follows R7 +
> domain — the crate/handler work in D7.2/D7.4 is greenfield by design (config
> placeholders only, no crates in `Cargo.toml`) and must wait for the D7 role call
> and the INPUTS domain value before landing. Concretely: no `tauri-plugin-updater`
> / `tauri-plugin-deep-link` crate, no endpoint, no pubkey until (i) D7 picks the
> wrapper shape that defines what routes/schemes the handlers attach to, and
> (ii) INPUTS-2 supplies the domain the updater endpoint and bundle IDs derive
> from. D13's push half waits on INPUTS-5/7 (EAS + store/cert accounts) for the
> same reason: code without credentials cannot reach a store.

## Answer format
Reply one line per item, e.g. `D7: A — keep setup shell; revisit B in Phase 9`,
`D7.3: B — no claims in v1`, `INPUTS-5: EAS org = <value>`.
Leave any item OPEN by writing `DEFER`.
