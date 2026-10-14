# 17 — Phase 5 Calls Inventory (PLAN.md §8.5)

Scope: realtime-calls surface only — WebRTC call setup, in-call controls,
minimized view, delegated compute, call receipts. Research + inventory; no
product code changed. Repo-relative paths (`_sources/` = upstream OpenDots,
`server/` = Hono API, `app/` = web app). All paths verified on disk 2026-10-14.

Related: `05-mobile-web-parity.md` R1/R2 (native media unknowns), `08`
voice/threads sections (see §5 gap below), `11-phase4-channels-inventory.md`
voice rows (§3 voice/dictation, §4 voice/audio routes, §5 voice risk row).

## 1) OpenDots calls file/API inventory

### 1a. Client (`_sources/OpenDots/src/client/`)

| File | Role | Key behaviors (verified in source) |
|---|---|---|
| `CallView.tsx` (128 lines) | Call overlay UI | `idle` renders null; `minimized` toggle (ChevronDown/Maximize2); 1s duration timer while `active`; status label (Connecting… / Saving call… / muted / speaking / thinking / Listening); live captions (`userCaption` + `caption`, `aria-live=polite`); controls: Speaker mute, End, Mic mute (all `aria-pressed`, disabled unless `active`); persona via `Mascot`; footer "Text and voice share this conversation" |
| `useVoice.ts` (365 lines) | Whole call lifecycle hook | States `idle\|connecting\|active\|ending`; `getUserMedia({audio:true})` → `RTCPeerConnection` + `oai-events` data channel + `HTMLAudioElement` playback; offer POST, answer applied; `onconnectionstatechange` (5s grace on `disconnected`, end on `failed`); control poll `GET /voice/calls/:id` every 2s, `CONTROL_POLL_FAILURE_LIMIT=3` before declaring control lost; 15-min auto-end timer; `end()` keeps peer alive until server confirms, posts transcript ≤20000 chars + `anchorMessageId`; unmount end uses `keepalive: true` fetch; `ask_compute` delegation (`function_call_arguments.done` → `POST :id/compute` → `function_call_output` + `response.create`); `toggleMute` (track.enabled), `toggleSpeaker` (audio.muted) |
| `Mascot.tsx` | Persona avatar in `CallView` | Stable per-identity character (hash over `identity` → blue/mint/orange/purple) |
| `api.ts` (`api`, `authHeaders`) | Transport helper | Used by `useVoice` for all five call endpoints (bearer headers; exact helper body not re-read here) |

Mount point of `CallView` inside the conversation screen was **not** re-verified
in this pass (candidate: `Chat.tsx` / `PageConversation.tsx`); the port must
confirm it before deleting the OpenDots client.

### 1b. Server (`_sources/OpenDots/src/server/`)

| File | Role | Key behaviors |
|---|---|---|
| `workspace-routes.ts:160-218` | Call HTTP surface (Hono, `/api` mount in `app.ts:100`) | `POST /voice/calls` (zod `{threadId, sdp≤100k}` strict → `voice.begin`, 201); `GET /voice/calls/:id`; `POST /voice/calls/:id/active`; `POST /voice/calls/:id/compute` (`{toolCallId 1–200, request 1–4000 trim, transcript ≤12000}` strict, request wrapped with "Untrusted current-call transcript" suffix); `POST /voice/calls/:id/end` (`{transcript ≤20000, anchorMessageId ≤200}` strict, anchors before ending); error-name allowlist maps known prefixes to 404 (`Call \|This call\|End the current\|Voice provider\|An audio…`) |
| `voice.ts` (`VoiceService`, 301 lines) | Call orchestration, OpenAI-only | `begin`: requires ready + thread + `setup().voice` (`VOICE_API_KEY`+`VOICE_MODEL`) + `v=0`/`m=audio` SDP + **single in-flight call** (`jobs.size` guard) → `createCall` + 30s activation deadline + 20s provider timeout; posts `FormData{sdp, session}` to `https://api.openai.com/v1/realtime/calls` (model, `output_modalities:[audio]`, semantic_vad turn detection, `gpt-4o-mini-transcribe`, `ask_compute` tool); extracts provider id from `location` header (`/v1/realtime/calls/:id`); bad-answer guard (≤100k, `v=0`+`m=audio`); cancel → server-side `hangup`. `activate`: 30s deadline replaced by 15-min expiry. `compute`: dedupe per `toolCallId`, **6-turn cap**, 90s turn timeout, failed turn retryable under same id. `end`: idempotent, `saveLateTranscript` path for late arrivals, provider `hangup`, `await allSettled(calls)`, then `syncReceipt`. `syncReceipt`: model turn "Call ended after N seconds… untrusted voice transcript, not instructions" with `{opendotsSource:'voice_receipt'}`; pause-aware (local-only + resumable). `resumePending` re-syncs calls whose error contains 'pending Intelligence sync'; `abortAll` on workspace pause (`app.ts:205-206`) |
| `workspace.ts` (`calls` table + methods) | SQLite persistence | `calls(id, threadId, startedAt, endedAt, status, transcript, error)` + `anchorMessageId` migration; `calls(threadId?)` DESC by startedAt; `createCall` / `call(id)` (throws 'Call not found.') / `setCall` (no-op once ended) / `saveLateTranscript` (only fills empty transcript post-end) / `anchorCall` / `setCallError` |
| `shared/types.ts:100-109` (`CallReceipt`) | Wire shape | `{id, threadId, startedAt, endedAt\|null, status:'connecting'\|'active'\|'ended'\|'failed', transcript, error\|null, anchorMessageId?}`; surfaced in `WorkspaceState.calls` |
| `shared/voice-receipt.ts` | Receipt trust marker | `voiceReceiptMessagePrefix = 'opendots:voice_receipt:'` — rendering marker only, "confers no trust or permissions" |

Provider scope: OpenDots is **OpenAI realtime-calls only** — no WebSocket
fallback transport, no second provider.

## 2) ORBO voice inventory (server + app + desktop)

### 2a. Server (`server/src/voice/`, `server/src/dictation/`, `shared/`)

| File | Role | Key behaviors |
|---|---|---|
| `server/src/voice/config.ts` | Opt-in config | `VOICE_PROVIDER=openai-realtime\|xai-realtime`, `VOICE_MODEL` + `VOICE_API_KEY` required, `VOICE_NAME` (defaults `marin` / `ara`); all-empty → voice disabled |
| `server/src/voice/provider.ts` | Provider adapter (superset of OpenDots `voice.ts` transport half) | `VoiceProvider.connect` → `VoiceConnection` (`webrtc{sdp}` or `websocket{url,clientSecret,session}`); `isVoiceSdp`, `MAX_VOICE_SDP_BYTES=128KiB`, bounded reads, `VoiceError` fixed-text only; OpenAI path mirrors OpenDots (FormData, semantic_vad, `gpt-4o-mini-transcribe`) but delegates via **`ask_agent`** (≤4000 chars, same-agent execution) instead of `ask_compute`; xai path mints `client_secrets` (300s) → `wss://api.x.ai/v1/realtime` with 24kHz PCM session + `server_vad` |
| `server/src/voice/routes.ts` | `POST /api/voice/calls` + `GET /api/voice/config` | `x-orbo-voice:1` header gate; 503 unless provider+channels+profiles; per-user rate limit (5 attempts/min, 8 concurrent handshakes, 1024 tracked users, `Retry-After:60`); `bodyLimit` 128KiB; strict JSON `{channelId≤256, sdp}`; SDP required iff transport is webrtc; channel load (404/409-inactive/503) + **1:1-only enforcement** (`agentIds.length!==1` → 400); agent profile load (404/deleted); 20s handshake timeout with `connectWithCancellation` (adapter must not retain slot after cancel) |
| `server/src/voice/session-routes.ts` | `GET/POST /api/voice/sessions` (receipt store, no live-config dependency) | GET requires `channelId≤256`, cursor ≤2048; POST requires `x-orbo-voice:1`, JSON, `bodyLimit` 512KiB; `parseVoiceSessionInput` validated save **before** any model call; single-flight `pending` map (8 max, per-user) → `finish`: summarize-if-failed → `recordActivity` receipt (`voice:{id}`, `Voice chat[: summary]`) |
| `server/src/voice/sessions.ts` | Drizzle store | `voiceSessions` table; `save/list/summarize` + `VoiceSessionError` (400/404/409); cursor paging (list head verified, lines 1–60) |
| `server/src/voice/summary.ts` | Summarizer | Model summary for saved sessions (consumed by `finish`) |
| `server/src/dictation/{routes,provider,config}.ts` | `POST /api/audio/transcriptions` | 10MiB cap, WebM/MP4/WAV (per 11 §4); transcription provider + config |
| `shared/voice-session.ts` | Cross-boundary contract | `SaveVoiceSessionInput` (`id`, `channelId`, `anchorMessageId\|null`, ISO started/ended, 1–300 transcript entries), record + page shapes |
| `shared/dictation.ts` | Dictation contract | `MAX_DICTATION_BYTES`, `DICTATION_TIMEOUT_MS`, media-type/extension mapping |

### 2b. App (`app/src/lib/voice/`, `app/src/lib/dictation/`, components)

| File | Role | Key behaviors |
|---|---|---|
| `lib/voice/connection.ts` | Transport picker | `GET /api/voice/config` → `connectWebRtc` vs `connectWebSocket`; `voiceSupported()` = `getUserMedia` present |
| `lib/voice/webrtc.ts` (166 lines) | OpenAI audio path | `getUserMedia` (echo/noise/gain) → `RTCPeerConnection` + `oai-events` channel + `HTMLAudioElement`; `POST /api/voice/calls {channelId, sdp}` with `x-orbo-voice:1`; expects `{transport:'webrtc', sdp}`; `mute(track.enabled)`, abort-close, mic-`onended` failure |
| `lib/voice/websocket.ts` + `pcm.ts` + `pcm-worklet.js` | xai audio path (no OpenDots equivalent) | `AudioContext` + worklet PCM capture (24kHz), scheduled playback, interruption truncation |
| `lib/voice/session.ts` (`VoiceSession`) | Call state machine | `idle\|connecting\|connected\|error` + muted/listening/speaking/working + seconds + transcript/reply; provider events isolated from AG-UI; `askAgent` delegation; `onEnd → saveVoiceSession` |
| `lib/voice/use-voice-call.ts` (61 lines) | React binding | Capability-gated (`deploymentCapabilities.voice`), `pagehide` end, unmount end, `minimized` state, `open()` |
| `lib/voice/archive.ts` | History + injection | Session queries, `saveVoiceSession` (outbox-backed POST), `VOICE_CHAT_ACTIVITY` transcript card, 6k-char context caps (per 11 §5) |
| `lib/voice/agent-bridge.ts` | Agent glue | `askChannelAgent` / `voiceContext` history injection into runs |
| `lib/voice/outbox.ts` | `localStorage` pending-call outbox | `remember/forget/recover` keyed by owner id (`voiceCallOwner`) |
| `lib/voice/transcript.ts`, `cut.ts`, `types.ts` | Transcript slicing + types | `VoiceTranscript`, open/close slicing, `ConnectVoice`/`VoiceEvent` contracts |
| `lib/dictation/recording.ts` | Capture | `MediaRecorder` + `getUserMedia`, opus/mp4/webm pick, `MAX_DICTATION_BYTES` guard, `Recording{stream,finish,cancel}` |
| `lib/dictation/session.ts`, `components/channels/composer/use-dictation.ts`, `dictation-controls.tsx`, `dictation-draft.ts` | Dictation flow | Record → `POST /api/audio/transcriptions` → append-to-composer; capability-gated button |
| `components/channels/voice-call-widget.tsx` | Call overlay (ORBO's `CallView`) | connect/error/minimized states, captions, hangup focus management |
| `components/channels/voice-chat-card.tsx` | Saved-call card | Renders archived `VoiceChatEntry` inside transcript |

### 2c. Desktop + mobile

| Surface | Status (verified) |
|---|---|
| Desktop (`desktop/src/`, setup/onboarding shell — no voice UI found) | No dictation/call components; mic support is **packaging + wrapped web path only**: `src-tauri/Info.plist` (`NSMicrophoneUsageDescription`), `Entitlements.plist` (`com.apple.security.device.audio-input`), `desktop/MACOS_MICROPHONE.md` (ad-hoc build checks + live OpenAI/Grok call + dictation + denied-permission verification protocol) |
| Mobile (`mobile/package.json`) | **Zero audio deps**: no `react-native-webrtc`, `expo-av`/`expo-audio`, or equivalent — R1/R2 gap stands as written |

## 3) Overlap / gap analysis

| Aspect | OpenDots | ORBO | Merge reading |
|---|---|---|---|
| Transports | WebRTC only (`RTCPeerConnection`, OpenAI `realtime/calls`) | WebRTC (OpenAI) **+** WebSocket+PCM-worklet (xai); transport negotiated via `GET /api/voice/config` | ORBO server is the superset; OpenDots contributes nothing transport-side. Keep ORBO picker; do not regress to WebRTC-only |
| Audio capture | `getUserMedia` inline in `useVoice.start` | `getUserMedia` in `webrtc.ts` / worklet capture in `websocket.ts`; `MediaRecorder` in `dictation/recording.ts` | Same web primitives, better factored in ORBO. Native (`react-native-webrtc` / `expo-av`) still missing on both — R1/R2 |
| Delegated compute | `ask_compute` tool, 6-turn cap, per-`toolCallId` dedupe, ≤12k transcript | `ask_agent` tool, ≤4k request, same-agent execution | Tool-name + cap semantics differ; the port must pick **one** tool (`ask_agent` recommended — server-canonical) and decide whether the 6-turn cap survives |
| Call-gating | Single in-flight call per workspace (`jobs.size`); 30s activation deadline; 15-min session cap | Per-user handshake limits (5/min, 8 concurrent); 20s handshake timeout; **1:1-only channel enforcement** (OpenDots has no channel concept — binds to `threadId`) | Complementary, not conflicting: keep both. `threadId`→`channelId` rebind is the core contract change |
| Receipts | `CallReceipt` row in SQLite + `anchorMessageId` + late-transcript fill + pause-aware Intelligence `syncReceipt` with untrusted-transcript prompt + `voice_receipt` marker prefix | `voiceSessions` rows + `anchorMessageId` + single-flight summarize + `recordActivity` (`voice:{id}`) + transcript cards | Same shape, different emphasis: port OpenDots' **late-transcript fill**, **pause/resume sync**, and **untrusted-transcript prompt wording**; keep ORBO's channel-activity anchoring; retire the `opendots:` prefix in favor of the ORBO marker |
| Call UI | One hook + one view (`useVoice` + `CallView` + `Mascot`): timer, captions, 3-button controls, minimize | Split (`VoiceSession` + `useVoiceCall` + `VoiceCallWidget` + `VoiceChatCard`): capability gate, minimized view, archive card, hangup focus | ORBO structure is the survivor; OpenDots contributes caption/phase label copy ("Listening / Working on it… / {name} is speaking"), the 1s timer, and control-poll UX ("Call control connection was lost.") |
| Control supervision | 2s `GET :id` poll, 3-strike loss rule, `POST :id/active` activation | Not present as a route pair (ORBO handshake returns connection; session saved at end) | Decide: port `active` + control-poll (server needs the call row first) or deliberately drop it — currently an **unowned decision** (see §5) |
| Dictation | None in the calls surface | Full stack (recorder → transcription route → composer append) | No merge; dictation stays ORBO-owned, native recorder still R2 |

## 4) Merge plan

| # | Step | Source → target | Done when |
|---|---|---|---|
| 1 | **Shared server contract first.** Keep `server/src/voice/{routes,provider,config,sessions,session-routes,summary}.ts` canonical. Port the OpenDots-only server semantics as explicit decisions: (a) activation model (`active` route + 30s deadline vs handshake-returns-connection); (b) single-flight scope (per-workspace `jobs` vs per-user handshake caps — likely both); (c) 15-min cap + 6-turn compute cap (adopt or drop with reason); (d) `threadId`→`channelId` rebind + 1:1 rule stays; (e) receipt row gains `status/connecting/active/ended/failed` + late-transcript fill + pause/resume sync. No OpenDots route shape (`/voice/calls` without `/api`, zod bodies) is aliased — clients move to `/api/voice/*` | Server tests pin caps, 1:1 rejection, late-fill, resume-sync |
| 2 | **Web `CallView` port.** Fold `CallView.tsx` view semantics into `voice-call-widget.tsx` (timer, phase captions, 3-button a11y contract, minimized view, control-lost copy); fold `useVoice` supervision (control poll, keepalive end, `ask_compute`→`ask_agent` rewire, 20k/12k/4k caps) into `session.ts`/`connection.ts`; map `Mascot` identity-color to the agent avatar; map `CallReceipt` → `shared/voice-session.ts` record; delete the OpenDots client files with the Phase 5 surface | Widget + session tests + transcript-cap tests green; no `opendots:` marker remains |
| 3 | **Native spike (gated, R1/R2).** Spike `react-native-webrtc` (calls) + `expo-audio`/`expo-av` (dictation) against the **unchanged** `/api/voice/*` + `/api/audio/*` contracts behind the `recording.{web,native}` / `connection.{web,native}` splits proposed in 05 §3; `localStorage` outbox → SecureStore/AsyncStorage leaf; TURN/STUN + background-audio + permission flows recorded as findings, not shipped | Spike report: module choice, permission matrix, what the server contract lacked |
| 4 | **Desktop verification.** Run `MACOS_MICROPHONE.md` protocol against the ported call UI (OpenAI + Grok + denied-permission paths); Tauri wraps the web export — no desktop code change expected | Checklist results recorded per build |

## 5) Risks (incl. R1/R2 unknowns)

| # | Risk | Why it matters | Source |
|---|---|---|---|
| 1 | **R1 stands: no native WebRTC path.** `mobile/package.json` has no `react-native-webrtc`; TURN/STUN availability still **[unknown]**; xai WebSocket+PCM-worklet has no RN equivalent scoped | Realtime-calls parity (PLAN §6) blocked on native until the spike (§4.3) picks a module | 05 §5 R1; `mobile/package.json`; `app/src/lib/voice/websocket.ts` |
| 2 | **R2 stands: no native recorder.** No `expo-av`/`expo-audio` in `mobile/`; `/api/audio/transcriptions` format-dependence unverified for RN output | Dictation parity blocked alongside calls | 05 §5 R2; `app/src/lib/dictation/recording.ts` |
| 3 | **No voice merge section in 08.** 08 covers threads (§5: "call receipts anchor to a message") but has **no voice/calls subsystem section** and no voice home module — the activation model, compute-cap, and receipt-status decisions in §4.1 are unowned | Phase 7 unification has no voice target; Phase 5 could ship a contract Phase 7 re-litigates | 08 (grep: only "per-call approval" + one receipts line); 08 §10 sequence |
| 4 | **Threads blocker gates receipts.** Call receipts anchor to `thread_id`/`anchorMessageId`; 08 §5 + 01 §9 blocker #1 (channels vs threads vs Intelligence) unresolved | Receipt schema cannot be finalized until thread identity is | 08 §5; 01 §9 |
| 5 | **Delegation tool fork.** `ask_compute` (OpenDots, 6-cap, 12k ctx) vs `ask_agent` (ORBO, 4k req) — different names, caps, and prompt framing (untrusted-transcript suffix vs same-agent rules) | Two tools doing one job; model behavior + audit differ until collapsed | `_sources/OpenDots/src/server/voice.ts:176-205`; `server/src/voice/provider.ts:91-108` |
| 6 | **Single-call guard vs multi-user server.** OpenDots `jobs.size` is per-process/single-workspace; ORBO is multi-user with per-user caps | Naive port of the global guard would serialize calls across users | `voice.ts:42-43`; `server/src/voice/routes.ts:32-33` |
| 7 | **Receipt trust boundary.** OpenDots marks receipts untrusted explicitly (prompt suffix + `voice-receipt.ts` comment); ORBO injects transcripts into runs via `agent-bridge`/`archive` | Spoken transcript must never become instructions — the marker + prompt wording must survive the port | `voice-receipt.ts`; `voice.ts:236-241`; `app/src/lib/voice/agent-bridge.ts` |
| 8 | **Desktop shell mismatch (05 R7).** `desktop/` is currently a setup shell, not the PLAN §3 web-export wrapper; mic packaging verified but live capture only per `MACOS_MICROPHONE.md` on a Mac | No Mac in dev loop; packaged-app mic behavior unverified until CI/build | 05 §5 R7; `desktop/MACOS_MICROPHONE.md` |
| 9 | **Control-supervision cost.** OpenDots' 2s poll + `active` handshake adds server state (call rows, deadlines) ORBO deliberately avoids | Adopting it reintroduces per-call server lifecycle; dropping it loses "control lost" UX — needs the §4.1 decision, not a silent default | `useVoice.ts:114-139`; `workspace-routes.ts:175-180` |

## 6) Doc cross-reference (what 05 / 08 / 11 already say about voice)

| Doc | Row | Voice finding (no duplication — pointer + delta) |
|---|---|---|
| 05 §1 F3 | Dictation row | Web `MediaRecorder` (`recording.ts`, `session.ts`); native gap confirmed again here (§2c) — delta: dictation server route now pinned (`server/src/dictation/routes.ts`) |
| 05 §1 F4 | Realtime-call row | Web `RTCPeerConnection` + WS fallback (`webrtc.ts`, `websocket.ts`, `connection.ts`); native needs `react-native-webrtc` or server media path — delta: server side of that fallback now inventoried (§2a xai path) |
| 05 §2 F3/F4 | Approach | Both **platform-split**, server contract shared — this doc's §4 follows that split order (contract → web → native) |
| 05 §3 rules 5/7 | Conventions | Capability guards (`recordingSupported()`, `voiceSupported()`); `.web`/`.native` leaves beside the feature — §4.3 names the exact leaves |
| 05 §4 | Parity checklist | "Realtime calls: WebRTC speech, delegated compute, call controls, minimized view, receipts (F4): native WebRTC parity" — the five nouns map 1:1 onto §1a + §1b rows above |
| 05 §5 R1 | Native voice media path | No `react-native-webrtc`, TURN/STUN **[unknown]** — re-verified: still no audio dep in `mobile/package.json`; xai PCM-worklet path adds a second native unknown |
| 05 §5 R2 | Native dictation recorder | No audio-record dep; `/api/audio/transcriptions` format-dependent — re-verified unchanged |
| 05 §5 R7 | Desktop role | Tauri shell vs web-export wrapper undecided — affects §4.4 (which artifact the mic protocol runs against) |
| 08 §4 | Approvals (per-call) | OpenDots per-call approval bound to `{connectionId, tool, arguments}` folds into the approvals rule engine — voice `ask_compute`/`ask_agent` delegation calls pass through it; no conflict with §4 |
| 08 §5 | Threads | "call receipts anchor to a message"; `captures` as thread column; conversation-identity ambiguity is 01 §9 blocker #1 — inherited by voice receipts (§5.4) |
| 08 §10 | Merge sequence | Threads → credentials → approvals → … — voice has **no sequence slot** (§5.3); recommend slotting voice receipts with threads (1) and delegation approval with approvals (3) |
| 11 §3 | Voice/dictation lib rows | `use-voice-call`, `archive`, `agent-bridge`, `outbox`, transport + audio pipeline + `dictation/*` — reused as §2b; delta: this doc adds the OpenDots side of each row |
| 11 §4 | Voice/audio routes | `POST /api/voice/calls` (1:1-only, SDP, rate-limited), `GET /api/voice/config`, `GET/POST /api/voice/sessions`, `POST /api/audio/transcriptions` (10MiB) — the contract §4.1 keeps |
| 11 §5 | Voice risk row | WebRTC/worklet/MediaRecorder web-only; 1:1-only server guard; `localStorage` outbox → async-storage; 6k-char caps — all carried into §5; delta: native module choice still open |
| 11 §6 | Port order | Voice + dictation are step 8 (gated, after transport adapter); composer's dictation third — §4.2/§4.3 preserve that gating |

## 7) Counts + port checklist

Counts: OpenDots calls files inventoried **10** (4 client + 5 server/shared + 1 trust marker);
OpenDots call endpoints **5** (`POST /voice/calls`, `GET :id`, `POST :id/active`,
`POST :id/compute`, `POST :id/end`); ORBO voice server files **6** + dictation **3** +
shared contracts **2**; ORBO app voice modules **13** + dictation flow **5** + call
components **2**; overlap aspects **8** (§3); merge steps **4** (§4); risks **9** (§5).

- [ ] Server: resolve §4.1 (a)–(e) (activation, single-flight scope, 15-min/6-turn caps, channel rebind, receipt status + late-fill + resume-sync) and pin with tests.
- [ ] Server: collapse `ask_compute` vs `ask_agent` to one tool; keep the untrusted-transcript framing.
- [ ] Web: port `CallView` semantics (timer, captions, controls, minimize) into `voice-call-widget.tsx`.
- [ ] Web: port `useVoice` supervision (control poll, keepalive end, caps) into `session.ts`/`connection.ts`.
- [ ] Web: map `CallReceipt` → `shared/voice-session.ts`; retire the `opendots:` receipt prefix.
- [ ] Native: run the §4.3 spike; record module choice + permission matrix + TURN/STUN finding.
- [ ] Desktop: run the `MACOS_MICROPHONE.md` protocol against the ported UI.
- [ ] Docs: give voice a home in 08 (or an explicit "stays in channels" ruling) before Phase 7.

© Opraiz Technology Pvt Ltd · Developer: Narein Rao
