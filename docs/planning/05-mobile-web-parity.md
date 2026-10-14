# ORBO — Mobile vs Web Parity Design

> Planning item: **PLAN.md §10.C item 27** ("Mobile vs web parity — where native differs").
> Status: first pass. Unknowns are marked **[unknown]**; nothing is asserted that is not in a
> cited path.

## 0. Scope and sources

One Expo Router app (RN + `react-native-web`) targets **web + iOS + Android**; **Tauri**
wraps the web build for desktop (PLAN.md §1, §3). This document maps where that single UI
cannot behave identically because the OS/browser differs, and recommends the split seam.

| Source | What it tells us |
|---|---|
| `app/src/` (TanStack Router, Vite, DOM) | The current **web-first** UI — the reference behavior. |
| `mobile/` (`mobile/app.config.ts`, `mobile/src/*`) | The **existing Expo shell**, already rebranded to ORBO. Uses `expo-router`, `@better-auth/expo`, `expo-notifications`, `expo-secure-store`, `expo-linking`. |
| `_sources/OpenMuse/apps/mobile/` | The native app ORBO's mobile shell is derived from; contains the **only platform-split-file precedent** in the tree: `BrowserConsole.native.tsx` / `.web.tsx`, `PdfReader.native.tsx` / `.web.tsx`, `DateFields.native.tsx` / `.web.tsx`. |
| `desktop/src-tauri/` | Tauri v2 shell, `identifier ai.orbo.desktop`, `frontendDist ../dist` — see risk R7. |
| `PLAN.md §6` | The union feature matrix this parity pass must not drop. |

**Repo facts established:**
- `mobile/` **is** the Expo/OpenMuse-derived shell (`expo ~55`, `expo-router ~55`, `main: expo-router/entry`).
- `app/` is still **Vite + TanStack Router + Tailwind + `@base-ui/react` + shadcn** (DOM), not yet Expo.
- `grep` for `*.native.*` / `*.web.*` under `app/`, `mobile/`, `shared/`, `server/` returns **zero** files — ORBO has no platform split yet; the migration is Phase 3.
- The live-screen transport is **already implemented twice** (web and RN) — see F5.

---

## 1. Platform-specific feature inventory

Features whose **implementation** must differ per platform. Each cites the current web
implementation; native status is the `mobile/` shell unless noted.

| # | Feature | Current web implementation | Current native status |
|---|---|---|---|
| F1 | File picker / attachments | DOM `<input type=file>` + drag/paste; `app/src/components/channels/composer/attachments.ts`, `picked-files.ts` (operates on `File`/`FileList`) | Not implemented in `mobile/`; OpenMuse uses `expo-document-picker` (`_sources/OpenMuse/apps/mobile/src/screens.tsx`) |
| F2 | Camera / photo capture | None found | None found — **[unknown]** whether in scope (§6 only implies image attachments) |
| F3 | Dictation (record → transcribe) | `MediaRecorder` + `navigator.mediaDevices.getUserMedia`; `app/src/lib/dictation/recording.ts`, `session.ts` | None in `mobile/`; RN has no `MediaRecorder` |
| F4 | Realtime voice call | WebRTC `RTCPeerConnection` + WS fallback; `app/src/lib/voice/webrtc.ts`, `websocket.ts`, `connection.ts` | None in `mobile/`; needs `react-native-webrtc` or a server media path |
| F5 | Live computer screen | WebSocket via `app/src/lib/computers/screen-connection.ts` (browser cookies) | **Implemented**: RN `WebSocket` with `Cookie` header + screenshot poll; `mobile/app/computer.tsx` `useLiveFrame` |
| F6 | Push / device notifications | `Notification` API; `app/src/components/bot-profile/profile.tsx`, `attention.tsx` | **Implemented**: `expo-notifications`; `mobile/src/notifications.ts` registers `POST /api/delivery/devices` |
| F7 | Deep links / notification routing | Browser URL; TanStack Router | **Implemented**: scheme `orbomobile:`; `mobile/src/links.ts` maps to `/conversation`, `/approvals`; `mobile/app/_layout.tsx` |
| F8 | Clipboard | `navigator.clipboard`; `bot-profile/sharing.tsx`, `responsibilities/triggers.tsx`, `delivery/reaching-you.tsx` | No `expo-clipboard`; not implemented |
| F9 | Local persistence | `localStorage` / `sessionStorage`; `theme-provider.tsx`, `sidebar-shell.tsx`, `copilot/bot-thread.ts`, `voice/outbox.ts`, `computers/handoff.ts` | `expo-secure-store` for auth/push only; no general KV store in `mobile/` |
| F10 | Auth session | Better Auth cookie flow | **Implemented**: `@better-auth/expo` + `expo-secure-store`, scheme redirect; `mobile/src/auth.ts` |
| F11 | Keyboard shortcuts | `@tanstack/react-hotkeys`; `app/src/lib/hotkeys/hotkeys.ts`, `use-hotkey.ts` | N/A — OS keyboard; no hotkey layer |
| F12 | Browser embedding | `<iframe>` (OpenMuse precedent) / plain nav | `react-native-webview` in OpenMuse `BrowserConsole.native.tsx`; not in `mobile/` |
| F13 | PDF view / paging / zoom | `<iframe>` + fragment; OpenMuse `PdfReader.web.tsx` | `react-native-pdf` + `expo-file-system` (OpenMuse `PdfReader.native.tsx`, `app.json` plugins) |
| F14 | Share sheet / open-in | `navigator.clipboard` / link copy only; no `navigator.share` found in `app/src` | `expo-linking` present; no share sheet implemented — **[unknown]** |
| F15 | Download / save-to-device | Blob + anchor (web) | `expo-file-system/legacy` in OpenMuse `screens.tsx` |
| F16 | Background / app-resume refresh | Tab lifetime | `AppState` polling; `mobile/src/use-load.ts`, OpenMuse `App.tsx` (`AppState` listener) |
| F17 | Layout chrome | Sidebar shell; `app/src/components/layout/sidebar-shell.tsx` | Stack + bottom tab bar; OpenMuse `App.tsx` `nav`, `useWindowDimensions` breakpoint at 900 px |
| F18 | Safe area / status bar | N/A | `react-native-safe-area-context`, `expo-status-bar` (OpenMuse) |
| F19 | Desktop window / tray / updater | N/A | Tauri: `desktop/src-tauri/src/tray.rs`, `windows.rs`, `install.rs` generate web-only-absent |
| F20 | Fullscreen / PWA / install prompt | Web-only | N/A |

**Count: 20 platform-specific features identified** (F2, F8, F14 contain unknowns).

---

## 2. Where native differs from web, per feature

`approach` vocabulary: **shared** (one implementation, both platforms) · **platform-split**
(same contract, different file) · **web-only** · **native-only**.

| Feature | Web | iOS | Android | Desktop (Tauri) | Approach |
|---|---|---|---|---|---|
| F1 File picker | `<input type=file>`, drag/paste | Photo/Document picker | Storage picker | File dialog (OS) | **platform-split** |
| F2 Camera | `getUserMedia`/`capture` [unknown] | Camera roll / capture [unknown] | Camera intent [unknown] | N/A | **platform-split / [unknown]** |
| F3 Dictation | `MediaRecorder` blob → `POST /api/audio/transcriptions` | AVAudioRecorder (RN module) | MediaRecorder (RN module) | Web path (wrapped) | **platform-split** (server contract shared) |
| F4 Voice call | `RTCPeerConnection` + WS; `POST /api/voice/calls` | `react-native-webrtc` | `react-native-webrtc` | Web path | **platform-split** |
| F5 Live screen | WS + cookies; `screen-connection.ts` | RN WS w/ Cookie header | RN WS w/ Cookie header | Web path | **platform-split** (already) |
| F6 Notifications | Browser `Notification` | APNs via Expo | FCM via Expo | Web path | **platform-split** (device registry shared) |
| F7 Deep links | URL routes | `orbomobile:` scheme | `orbomobile:` scheme (intent) | Web path | **platform-split** (route targets shared) |
| F8 Clipboard | `navigator.clipboard` | `expo-clipboard` | `expo-clipboard` | Web path | **platform-split** |
| F9 Persistence | `localStorage`/`sessionStorage` | SecureStore / AsyncStorage | same | Web path | **platform-split** |
| F10 Auth | Better Auth cookie | Expo client + SecureStore + scheme | same | Web path | **platform-split** (server shared) |
| F11 Hotkeys | Global keybindings | none (gestures) | none / Android shortcuts | Keyboard present; web path | **web-only** |
| F12 Browser embed | `<iframe>` | `react-native-webview` | same | Web path | **platform-split** |
| F13 PDF | `<iframe>` viewer | `react-native-pdf` | same | Web path | **platform-split** |
| F14 Share sheet | link copy only (no `navigator.share` in `app/src`) | `Share` API | `Share` intent | OS menu | **platform-split / [unknown]** |
| F15 Downloads | Blob anchor | Files app / share | Downloads | OS save | **platform-split** |
| F16 Background refresh | Tab / visibility | `AppState` | `AppState` (+ WorkManager?) | Window focus | **shared** (server owns jobs) |
| F17 Layout chrome | Sidebar + routes | Stack / tabs, 900 px breakpoint | same | Web path, window resize | **platform-split** |
| F18 Safe area | N/A | notch/home indicator | status/nav bar | window chrome | **native-only / web no-op** |
| F19 Window/tray/updater | N/A | N/A | N/A | Tauri native | **native-only** |
| F20 PWA/install | **[unknown]** — no manifest / service-worker found under `app/` | N/A | N/A | bundle installer | **web-only / native bundling** |

**The server contract is shared everywhere** — every divergent feature calls the same ORBO
Hono API (`app/src/lib/client.ts` is the web client; `mobile/src/api.ts` is the native client
to the same `/api/...`). Parity is a **client-side** concern; the backend should not fork.

---

## 3. Recommended platform-file conventions (Expo Router)

Expo/Metro resolves files most-specific-first: `.ios.tsx` → `.android.tsx` → `.native.tsx` →
`.web.tsx` → default `.tsx` (and `.web` before default on web). Adopt the OpenMuse precedent
already in the tree (`_sources/OpenMuse/apps/mobile/src/BrowserConsole.{native,web}.tsx`,
`PdfReader.*`, `DateFields.*`).

**Rules**

1. **Split at the smallest seam, not the screen.** One module per capability (a recorder, a
   notifier, a picker, an embedder), so the screen imports a stable contract and the platform
   file is the only thing that differs. Prefer `foo.ts` (shared logic) + `foo.web.ts` /
   `foo.native.ts` (the divergent bit).
2. **Keep the prop/return contract identical** across variants; the types live in a shared
   `foo.types.ts`. Precedent: `PdfReader` exports the same `PdfReaderProps` from both variants.
3. **Use `.native.tsx` as the umbrella** when iOS and Android match and only web differs
   (BrowserConsole). Add `.ios.tsx` / `.android.tsx` only when the two native platforms truly
   diverge (e.g. notification channel setup).
4. **Never branch on `Platform.OS` inside shared JSX** except for trivial one-liners; a
   `Platform.select` is acceptable in a shared module (`ui.ts`-style) but not a substitute for
   a file split when the imports differ per platform (importing `react-native-pdf` on web
   breaks the web bundle).
5. **Guard DOM-only globals** (`window`, `navigator`, `localStorage`, `MediaRecorder`,
   `RTCPeerConnection`) behind a shared capability check so `react-native-web` never evaluates
   them at module scope. Existing pattern: `app/src/lib/dictation/recording.ts`
   `recordingSupported()`, `app/src/lib/voice/connection.ts`.
6. **Do not name a file with both `.native` and `.test`**; tests target the shared logic, not
   the platform leaf, wherever possible.
7. **Keep extensions `.web.ts(x)` for web and `.native.ts(x)` for RN.** Reserve
   `.ios/.android` only where required.
8. **`packages/ui` is platform-neutral** (design tokens + primitives); platform leaves live
   beside their feature, not in the design system — consistent with PLAN §3 ("business logic
   in `apps/server`; UI presentation only") and pending design-system item C25. (Layout note: `apps/server` is the PLAN §3 target layout name; the current tree uses top-level `server/`.)

**Proposed first splits for ORBO** (names only; not yet created):

| Module | Files | Contract |
|---|---|---|
| Recorder (F3) | `lib/dictation/recording.{web,native}.ts` | `Recording` interface already exists (`recording.ts`) |
| Notifier (F6) | `lib/delivery/notify.{web,native}.ts` | request/token → `POST /api/delivery/devices` (native already in `mobile/src/notifications.ts`) |
| Picker (F1) | `components/channels/composer/pick-files.{web,native}.ts` | `File[]` seam in `picked-files.ts`; native supplies RN file descriptors |
| Clipboard (F8) | `lib/clipboard.{web,native}.ts` | `writeText()` |
| Persistence (F9) | `lib/storage.{web,native}.ts` | `get/set/remove` over localStorage vs SecureStore/AsyncStorage |
| Screen transport (F5) | `lib/computers/screen-connection.{web,native}.ts` | `ScreenSocket` contract already exists |
| Browser embed (F12) | `components/computer/browser-embed.{web,native}.tsx` | `{ url, title? }` |
| PDF (F13) | `components/documents/pdf-reader.{web,native}.tsx` | `{ url, token, pageCount }` |

---

## 4. First-pass parity checklist (derived from PLAN.md §6)

Rows below are the §6 items that **touch a platform-specific capability** (§6 otherwise
mostly server/admin surfaces that render the same everywhere). Every row is a ship
requirement.

- [ ] **Agents/computer** — Browser control + human takeover + recorded handover (F5, F12): live screen and browser embed on web, iOS, Android.
- [ ] **Agents/computer** — Shell/terminal in workspace + process files (F3 dictation is chat, not shell; terminal is server-driven): confirm native command-output rendering.
- [ ] **Agents/computer** — Files: folders, text edit, **PDF transfer to/from Documents** (F1, F13, F15): picker + PDF reader per platform.
- [ ] **Chat** — Streamed AG-UI events, send/stop pill, retained drafts: durable drafts need F9 when the app backgrounds (native).
- [ ] **Chat** — Follow-up queue, inline cards (email/browser/**PDF**/plan/finance) (F12, F13).
- [ ] **Chat** — Rich Threads: durable persistence, main + side chats, rename/archive/restore/replay; thread id currently in web `localStorage` (F9).
- [ ] **Chat** — **Realtime calls: WebRTC speech**, delegated compute, call controls, minimized view, receipts (F4): native WebRTC parity.
- [ ] **Documents** — Email attachment → PDF → form values → filled copy → reviewed reply → receipt; **PDF view/paging/zoom/share** (F1, F13, F14, F15).
- [ ] **Work** — Activity: durable task plans, pause/resume/cancel/retry, receipts (F16 background refresh).
- [ ] **Work** — Routines/scheduled tasks, interrupted-run handling (F16; jobs run server-side).
- [ ] **Work** — Responsibilities/Goals, recurring page watches, alerts (**notifications** → F6, F7).
- [ ] **Identity/users** — Sign-in: Google/Microsoft/Okta + SAML/OIDC (F10 native Expo client).
- [ ] **Personal context** — name, tone, **avatar**, memories, **notifications**, connected accounts (F6, F9).
- [ ] **Finance** — **CSV import**, categorized summary, savings-goal action (F1 picker on native).
- [ ] **Surfaces/deployment** — One UI → web + iOS + Android; **Tauri desktop** (F17, F18, F19).
- [ ] **Chat/inline** — Dictation in composer (F3) — web implemented; native gap.

Non-platform-sensitive §6 surfaces (admin console, audit, boundaries, credentials, plugins,
learning, components/playground, people, identity providers, deployment) render identically
once `packages/ui` converges and are **out of scope for this parity pass**.

---

## 5. Risks and unknowns

| # | Risk / unknown | Why it matters | Source / evidence |
|---|---|---|---|
| R1 | **Native voice (F4) needs a media path.** Web uses `RTCPeerConnection` + `POST /api/voice/calls`; no `react-native-webrtc` dependency exists, and TURN/STUN availability is **[unknown]**. | "Realtime calls" is a §6 ship requirement across platforms. | `app/src/lib/voice/webrtc.ts`, `websocket.ts`; `mobile/package.json` |
| R2 | **Native dictation (F3) has no recorder.** No audio-record dependency in `mobile/`; server endpoint `/api/audio/transcriptions` is format-dependent. | Composer dictation parity. | `app/src/lib/dictation/recording.ts`; `mobile/package.json` |
| R3 | **Push requires accounts/credentials not held.** `registerPush` throws unless EAS project + APNs/FCM exist; PLAN §10.A.5 (EAS account) and §10.E.38 (signing) are pending. | Blocks R2 store release and push-based notification parity. | `mobile/src/notifications.ts`, `mobile/app.config.ts`; PLAN §7, §10 |
| R4 | **Backend assumed reachable over HTTPS.** `mobile/src/auth.ts` throws unless `EXPO_PUBLIC_SERVER_URL` is HTTPS (or dev http). Native points at a **deployed ORBO**, not a local engine. | Self-host users need a reachable deployment for mobile; desktop is the local path. | `mobile/src/auth.ts:6-20` |
| R5 | **CopilotKit provider parity.** Web uses `@copilotkit/react-core`; OpenMuse native uses `@copilotkit/react-native/headless`; `mobile/` currently imports **neither**. Version/feature parity **[unknown]**. | The AG-UI chat stream is the core surface. | `app/package.json`; `_sources/OpenMuse/apps/mobile/App.tsx`; `mobile/package.json` |
| R6 | **`packages/ui` does not exist.** Web relies on Tailwind + `@base-ui/react` + shadcn (DOM); native uses RN styles. Convergence is pending item C25. | A single design system is a §1/§3 locked decision; until it lands, parity cannot be asserted visually. | `app/package.json`; PLAN §10.C.25 |
| R7 | **Desktop Tauri is not a web-export wrapper today.** `desktop/` is the OpenBot-style **setup/onboarding shell** (`src-tauri/src/stack.rs`, `install.rs`, `tray.rs`; `frontendDist ../dist`) that installs the container engine and runs its own React UI — whereas PLAN §3 says the desktop shell wraps the app web export. | Determine whether desktop = web app + local engine supervisor, or a separate shell. Also F19 behaviors (tray/updater/`MACOS_MICROPHONE.md`). | `desktop/src-tauri/tauri.conf.json:6-8`; `desktop/PROVIDER_OAUTH.md`, `MACOS_MICROPHONE.md` |
| R8 | **No shared persistence abstraction (F9).** Thread ids, drafts, theme, sidebar state, voice outbox, handoff state all live in `localStorage`/`sessionStorage`; `mobile/` has only SecureStore. | Draft retention and thread replay on native. | `app/src/lib/copilot/bot-thread.ts`, `voice/outbox.ts`, `theme-provider.tsx`; `mobile/src/auth.ts` |
| R9 | **Attachment screening is `File`-based.** `screenPickedFiles()` takes DOM `File[]`; RN yields URIs + mime, and size may be unknown pre-upload. | F1/Finance CSV parity and the reject-before-slot rules. | `app/src/components/channels/composer/picked-files.ts` |
| R10 | **Screen transport asymmetry (already real).** Web relies on cookie-authenticated browser WebSocket; native uses RN WebSocket `headers`. Two implementations must stay in lockstep. | F5 regressions diverge silently per platform. | `app/src/lib/computers/screen-connection.ts`; `mobile/app/computer.tsx` |
| R11 | **Notification handling split.** Web `Notification` API vs `expo-notifications` (`_layout.tsx` handler) with no shared abstraction. | F6/F7 parity, incl. routing payloads. | `app/src/components/bot-profile/profile.tsx`; `mobile/app/_layout.tsx`, `mobile/src/links.ts` |
| R12 | **Mobile UI coverage is a thin subset.** `mobile/app/` has 11 screens (approvals, bot, bots, computer, conversation, index, memory, plugins, routine, rules + layout); the web app has **60 route files** under `app/src/routes` (per `03` §1 — verified by file count). **[unknown]** which web surfaces the unified Expo app must port in Phase 3 vs leave web-only. | Determines true parity scope. | `mobile/app/`; `app/src/routes/` |
| R13 | **Camera/photo (F2) and share sheet (F14) appear in neither `app/` nor `mobile/`.** | **[unknown]** whether these are in scope beyond attachments/PDF. | grep of `app/src`, `mobile/` |

**Cross-doc alignment (Phase 3 audit, 2026-10-14):** route counts and screen names follow `03-route-tree.md` (`60` route files; final Expo Router groups `(app)`/`(tabs)`); test quarantine follows `06` §6 (env-gated tests stay gated per platform); screen inventory follows `07` §2 (F-flags map to screens there); merge order follows `08` (threads → credentials → approvals → connectors → memory → computers → routines → browser → documents → learning). Where this doc says **[unknown]**, the question is owned by the blocker list above, not by a sibling doc.

**Blockers (need a decision or owner input before implementation):** R3 (EAS/credentials),
R7 (desktop role), R12 (mobile surface scope), R1/R2 (native media modules), R5 (CopilotKit
native parity). R4 is an ops prerequisite, not a blocker.

---

*Derived from `PLAN.md` §6 and the paths cited above. Unknowns are marked; no feature is
asserted that is not present in source.*
