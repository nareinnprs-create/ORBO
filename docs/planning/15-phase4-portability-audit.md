# 15 — Phase 4 Portability Audit: `app/src/components/` → React Native

Status: research only. No product code modified. Evidence via `rg` over `app/src/components`
(excluding `node_modules/_sources/target/dist`); DOM hits verified per file. 2026-10-14.

Verdicts: **PORTABLE** = pure React+props, moves as-is (mechanical `div`→`View` only) ·
**ADAPT** = logic portable, needs RN primitives (Pressable/TextInput/Modal/split leaf) ·
**WEB-ONLY** = must rewrite (DOM APIs, Base-UI/Radix positioning, canvas, contentEditable, A2UI policy).
Uncertain rows carry a `?` and are counted under their best-guess verdict, flagged in §6.

Cross-check: `04-design-system.md` §6 already routes primitives→`primitives/`, sidebar+layout→`layout/`,
chat→`chat/`, gallery→`gallery/` (**web-only**), Tiptap→`editor/` (**web-only**); runtime rule is
RN+`react-native-web` single source. `05-mobile-web-parity.md` splits (F1 picker, F3 dictation, F4
voice, F8 clipboard, F9 persistence, F17 chrome) are the seams ADAPT rows hang off. This audit agrees
with both, with two corrections: `packages/ui` now **exists** (scaffold: `button/item/tokens/utils`),
and gallery `frame`+`palette` are PORTABLE infrastructure, not model-rendered output.

## 1) `ui/` — 26 files

| File | Verdict | Blocker |
|---|---|---|
| `button.tsx` | ADAPT | `@base-ui/react/button` → Pressable; cva variants portable |
| `input.tsx` | ADAPT | `@base-ui/react/input` → TextInput |
| `textarea.tsx` | PORTABLE | React+cn only; multiline prop → TextInput `multiline` |
| `label.tsx` | PORTABLE | React+cn only |
| `field.tsx` | ADAPT | cva+Label/Separator only; needs RN Text/View |
| `input-group.tsx` | ADAPT | Button/Input/Textarea composition; inputs need RN |
| `checkbox.tsx` | ADAPT | Base-UI Checkbox → Pressable; IconCheck portable (RN icon set TBD, 04 G5) |
| `switch.tsx` | ADAPT | Base-UI Switch → RN Switch |
| `select.tsx` | WEB-ONLY | Base-UI Select popup positioning; no RN equivalent |
| `combobox.tsx` | WEB-ONLY | Base-UI Combobox popup/listbox + filter; full rewrite |
| `separator.tsx` | ADAPT | Base-UI Separator → trivial View |
| `skeleton.tsx` | PORTABLE | cn only → View shimmer |
| `empty.tsx` | PORTABLE | cva+cn only |
| `item.tsx` | ADAPT | Base-UI `useRender`/`mergeProps`; canonical row → Pressable+View |
| `dialog.tsx` | ADAPT | Base-UI Dialog+Portal → RN Modal (OpenMuse `ui.tsx` Sheet precedent) |
| `sheet.tsx` | ADAPT | Same as dialog; merge OpenMuse RN Sheet behavior (04 §6) |
| `dropdown-menu.tsx` | WEB-ONLY | Base-UI Menu popup + hover submenus; touch has no hover |
| `context-menu.tsx` | WEB-ONLY | Right-click semantics + Portal; needs long-press redesign |
| `tooltip.tsx` | WEB-ONLY | Base-UI Tooltip; hover-only, no touch equivalent |
| `sidebar.tsx` | WEB-ONLY | `useRender`/`mergeProps` + `useIsMobile` (matchMedia) + `window` keydown + offcanvas CSS; chrome differs (05 F17) |
| `carousel.tsx` | WEB-ONLY | `embla-carousel-react`; DOM scroll/measure |
| `questionnaire.tsx` | WEB-ONLY | `@shadcn/react/questionnaire` primitive; flow rewrite on RN inputs |
| `message.tsx` | PORTABLE | React+cn shell only |
| `bubble.tsx` | ADAPT | Base-UI `useRender`/`mergeProps` + cva; bubble layout portable |
| `message-scroller.tsx` | WEB-ONLY | `@shadcn/react/message-scroller`; DOM overflow/scroll-anchors → FlatList (§3) |
| `live-waveform.tsx` | WEB-ONLY | `<canvas>` 2D + `AudioContext`/`AnalyserNode` + ResizeObserver + `devicePixelRatio` + `motion/react` |

## 2) `layout/` — 6 files

| File | Verdict | Blocker |
|---|---|---|
| `page-shell.tsx` | ADAPT | TanStack `Link` → Expo Router; chrome portable |
| `detail-panel.tsx` | ADAPT | `motion` + ResizeObserver/`getBoundingClientRect` + Sheet → Modal + `onLayout` |
| `sidebar-shell.tsx` | ADAPT | `window.localStorage` → storage split (05 F9) |
| `sidebar-toggle.tsx` | ADAPT | `navigator.userAgent` at module scope needs `Platform` guard; Button portable |
| `row-mark.tsx` | PORTABLE | ItemMedia+cn only |
| `stagger.tsx` | ADAPT | `motion/react` entrance → Reanimated/Moti; keep reduced-motion contract |

## 3) `gallery/` — 11 files (A2UI model output; web-only policy per 04 G7)

| File | Verdict | Blocker |
|---|---|---|
| `frame.tsx` | PORTABLE | ReactNode+cn wrapper; not model-rendered |
| `palette.ts` | PORTABLE | Pure colour constants |
| `cards.tsx` | WEB-ONLY | Policy + DOM cards (zod schemas themselves portable) |
| `charts.tsx` | WEB-ONLY | Policy; `<svg>` portable via `react-native-svg` if policy ever lifts |
| `decisions.tsx` | WEB-ONLY | Policy; Button/select semantics need native actions |
| `form.tsx` | WEB-ONLY | Policy + DOM Input/Textarea |
| `table.tsx` | WEB-ONLY | Policy; table semantics → FlatList |
| `activity.tsx` | WEB-ONLY | Policy + copilot hooks/Button |
| `quote.tsx` | WEB-ONLY | Policy (trivial divs otherwise) |
| `refused.tsx` | WEB-ONLY | Policy (trivial divs otherwise) |
| `preview.tsx` | WEB-ONLY | Dev harness over `GALLERY_COMPONENTS` registry |

## 4) `channels/` — rows cover 19 root files + 17 `composer/` files

| File(s) | Verdict | Blocker |
|---|---|---|
| `chat-messages.ts`, `chat-origin.ts`, `compose-state.ts`, `transcript-messages.ts` | PORTABLE | Pure modality/split/recipient/message helpers; no DOM (verified) |
| `tool-boundary.tsx`, `tool-line.tsx` | PORTABLE | React-only boundary + line |
| `composer/draft.ts`, `dictation-draft.ts`, `queue.ts`, `sources.ts`, `triggers.ts` | PORTABLE | Pure segment/draft/queue logic + tests; `prompt-area/helpers` types only |
| `composer/rejected-files.tsx` | PORTABLE | IconX + Collapse only |
| `avatar.tsx` | ADAPT | `boring-avatars` SVG → `react-native-svg` (also 04 §6 REPLACE) |
| `browser-activity.tsx` | ADAPT? | Approval/ToolLine composition; native browser embed is a split leaf (05 F12)? |
| `channel-chat.tsx`, `conversation-view.tsx` | ADAPT | CopilotKit/AG-UI logic portable once composer/voice leaves split |
| `composer/collapse.tsx`, `attachment-strip.tsx` | ADAPT | `motion` + ResizeObserver → Animated + `onLayout`; tiles → RN list |
| `composer/dictation-controls.tsx`, `use-dictation.ts` | ADAPT | Needs RN recorder leaf; server transcription contract shared (05 F3) |
| `group-chat.tsx` | ADAPT | `scrollIntoView` → FlatList ref |
| `group-people.tsx`, `recipient-field.tsx`, `team-bot-consent.tsx` | ADAPT | Query/dialog/input composition; router portable |
| `voice-chat-card.tsx` | ADAPT | Receipt card; portable without live media |
| `chat-transcript.tsx` | WEB-ONLY | `motion` + scroller + Streamdown markdown + dialog-centering CSS → FlatList (§3) |
| `composer/composer.tsx` | WEB-ONLY | `prompt-area` contentEditable + `document` paste listener + `File` drag/paste + `useAttachments` (§3) |
| `composer/picked-files.ts`, `attachments.ts` | WEB-ONLY | DOM `File`/`FileList` screening; RN yields URIs+mime, size unknown pre-upload (05 R9) |
| `voice-call-widget.tsx` | WEB-ONLY | WebRTC `RTCPeerConnection` + MediaStream waveform + `motion`; needs `react-native-webrtc` (05 F4) |

## 5) `agents/` — 9 files (incl. `orb/`)

| File | Verdict | Blocker |
|---|---|---|
| `abstract-avatar.tsx` | ADAPT | `boring-avatars` → RN svg (04 §6 REPLACE with brand mark) |
| `agent-card.tsx`, `agent-profile.tsx`, `proposed-bot.tsx` | ADAPT | TanStack `Link` → Expo Router; query/Skeleton portable |
| `callback-token-panel.tsx` | ADAPT | Mutation + Button; copy affordance → clipboard split (05 F8) |
| `create-agent-dialog.tsx` | ADAPT | `motion` dialog → RN Modal |
| `handoff-panel.tsx` | ADAPT | Query/mutation + Switch/Separator; portable |
| `orb/agent-orb.tsx` | WEB-ONLY | Decorative motion/CSS-keyframe orb; Reanimated rewrite |
| `orb/ai-core.tsx` | WEB-ONLY | `AudioContext` + `getUserMedia` mic-reactive orb + `motion` |

## 6) Summary counts

| Dir | Files | PORTABLE | ADAPT | WEB-ONLY |
|---|---|---|---|---|
| `ui/` | 26 | 5 | 11 | 10 |
| `layout/` | 6 | 1 | 5 | 0 |
| `gallery/` | 11 | 2 | 0 | 9 |
| `channels/` | ~36 (22 rows) | 7 rows | 11 rows | 4 rows |
| `agents/` | 9 | 0 | 7 | 2 |
| **Total** | **~88 (~64 rows)** | **15** | **34** | **25** |

Roughly 23% moves as-is, 53% adapts behind existing 05 split seams, 39% of `ui/` and the whole
model-rendered gallery need rewrites. `?` rows: `browser-activity.tsx` only (native embed contract
unconfirmed); everything else is import-verified.

## 7) Must-rewrite list (Phase 4 build order)

1. **Composer** (`composer/composer.tsx` + `picked-files/attachments`): `prompt-area` contentEditable
   has no RN counterpart; `File`-based screening (05 R9) and `document` paste listener are DOM-only.
   Keep pure `draft/queue/triggers/sources` (tested); rewrite input as native multiline + RN picker
   leaf (`pick-files.{web,native}`, 05 §3) + CopilotKit RN parity check (05 R5).
2. **Chat scroll** (`message-scroller.tsx` + `chat-transcript.tsx` + `group-chat.tsx` scroll):
   `@shadcn/react` scroller + `scrollIntoView`/`scrollToEnd` → FlatList with inverted anchor,
   `onLayout` measurement, and a native "scroll to end" pill. AG-UI event logic stays shared.
3. **Gallery** (9 WEB-ONLY files): stays **web-only** per 04 G7; define the native fallback list
   (Record→Item, Notice→Empty/state row, charts→native svg or text summary) instead of porting.
4. **Editor** (not in `components/`; OpenDots `RichEditor.tsx` port): Tiptap/contentEditable is
   web-only per 04 §6 — do not attempt RN; native gets read-only render + system editor intent.
5. **Voice** (`voice-call-widget.tsx`, `live-waveform.tsx`, `dictation`): canvas + `AudioContext` +
   WebRTC → `react-native-webrtc` + native recorder + `react-native-svg` waveform (05 R1/R2).
6. **Sidebar chrome** (`ui/sidebar.tsx`, `sidebar-shell`, orb): offcanvas/hover/keyboard → Expo
   stack + tabs with the 900px breakpoint precedent (05 F17); theme/storage behind splits (F9).

## 8) Mapping to `packages/ui` targets (scaffold today: `button/item/tokens/utils`)

| Source | Target | Action |
|---|---|---|
| PORTABLE (`label/textarea/message/skeleton/empty`, `row-mark`, `frame/palette`, pure `channels/*` helpers) | `src/primitives/*`, `src/layout/*`, `src/chat/*`, `src/gallery/*` | Move first; no behavior change |
| ADAPT primitives (`button/input/field/input-group/checkbox/switch/separator/item/bubble/dialog/sheet`) | `src/primitives/*` | Re-author on RN+`react-native-web`; keep cva APIs; merge OpenMuse RN Sheet |
| ADAPT layout (`page-shell/detail-panel/sidebar-shell/sidebar-toggle/stagger`) | `src/layout/*` | Port with Expo Router + storage/`Platform` splits |
| ADAPT chat (`avatar`, transcript shells, composer leaves, group/recipient/consent, voice-card) | `src/chat/*` | Port behind F1/F3/F8/F9 split leaves (05 §3) |
| ADAPT agents (cards/profile/dialogs/handoff) | `src/brand/*` + feature screens | Port; replace `boring-avatars` with ORBO mark (04 §6) |
| WEB-ONLY overlays/menus (`select/combobox/dropdown/context/tooltip/questionnaire/carousel`) | `src/primitives/*` | RN-native redesign (ActionSheet/picker/switch-flow), not a port |
| WEB-ONLY gallery (9 files) + editor (Tiptap) | `src/gallery/*`, `src/editor/*` (web-only) | Keep web-only; ship native fallbacks |
| WEB-ONLY media (composer input, scroller, waveform, voice-widget, orb) | `src/chat/*` native-first | Full rewrite per §7 |

## 9) Risks

| # | Risk | Note |
|---|---|---|
| R1 | Base-UI has no RN runtime | Every `@base-ui/react` + `@shadcn/react` import (≈16 `ui` files) is a rewrite, not a shim |
| R2 | `prompt-area` lock-in | Composer helpers are pure, but the input + triggers + `useAttachments` assume web SDK (05 R5) |
| R3 | Native media modules undecided | No `react-native-webrtc`/recorder deps; TURN/STUN unknown (05 R1/R2) |
| R4 | `File` vs URI seam | Screening/upload/CSV rules assume `File[]`; RN descriptors differ (05 R9) |
| R5 | Persistence scatter | Theme/sidebar/drafts/threads in `localStorage`; native has SecureStore only (05 R8) |
| R6 | Icon split | `@tabler/icons-react` web-only; standardize RN variant (04 G5) |
| R7 | Policy vs portability tension | `charts`/`refused` *could* adapt technically but must stay web-only (04 G7) — enforce by lint |
| R8 | Scope creep | 60 web routes vs 11 native screens (05 R12); parity scope decision gates §7 items 1–6 |

## 10) Method and evidence notes

Scans run (all under `app/src/components`, tests excluded where noted): `base-ui|radix|embla|
contentEditable|tiptap` for primitives; `document\.|window\.|navigator\.|localStorage|
MediaRecorder|RTCPeer|IntersectionObserver|ResizeObserver|matchMedia|scrollIntoView` for DOM;
`canvas|contentEditable|navigator.share|clipboard|getUserMedia|createPortal|motion/` for media/
portals; `^import` per directory for dependency shapes. No `*.css`, radix, Tiptap, or
`navigator.share` hits inside `components/`; `motion/react` is the pervasive animation dep
(~15 files); `@tabler/icons-react` is the only icon dep; `react-dom` appears once
(`computer-view.tsx` portal — out of audit scope, noted for Phase 4).

Key DOM witnesses: `sidebar.tsx:127-128` (`window` keydown), `sidebar-toggle.tsx:16`
(`navigator.userAgent` module scope), `theme-provider`/`sidebar-shell` (`window.localStorage`),
`composer.tsx:819-820` (`document` paste), `live-waveform.tsx:53-87` (AudioContext+canvas+
ResizeObserver), `live-screen`/`computer-view` (canvas+`createPortal`, out of scope),
`group-chat.tsx:49` (`scrollIntoView`), `picked-files.ts:19-31` (`File[]`).

Out of scope but flagged: `computer/` (canvas live-screen, portals, `window` key/paste
listeners) is WEB-ONLY by inspection; `component-preview.tsx` (ResizeObserver +
`window.__args` sandbox) is dev-only web; `hooks/use-mobile.ts` (matchMedia) needs a
`useWindowDimensions` replacement. No editor exists under `components/` — §7 item 4 refers
to the planned OpenDots Tiptap port (04 §6 `editor/`, web-only).
