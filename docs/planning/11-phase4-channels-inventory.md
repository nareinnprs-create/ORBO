# 11 — Phase 4 Channels Inventory (PLAN.md §8.4)

Scope: CHANNELS surface only — 1:1 chat, group chat, composer, transcript, drafts, history
notice. Research + inventory; no product code changed. Target routes per `03-route-tree.md` §5–§6.
All paths verified on disk 2026-10-14. Repo-relative paths throughout (`app/` = web app, `server/` = Hono API).

## 1) Route inventory (current → target Expo route)

| Current route file | URL / purpose | Target Expo route |
|---|---|---|
| `app/src/routes/_authed/_app/index.tsx` | `/` home: new-channel composer + routed send + explore-agents carousel | `(tabs)/index.tsx` |
| `app/src/routes/_authed/_app/channel/new.tsx` | `/channel/new` (`?agent=`): To: combobox, `ConversationView`, creates on first send; 2+ recipients → group | `(tabs)/chat/new.tsx` |
| `app/src/routes/_authed/_app/channel/$channelId.tsx` | `/channel/[id]` (`?settings`, `?watch`): header + `DetailPanel` (agent profile / live computer screen) + `ChannelChat`; multi-agent channels redirect to `/group/$channelId` | `(tabs)/chat/[channelId].tsx` |
| `app/src/routes/_authed/_app/group/$channelId.tsx` | `/group/[id]`: header + `GroupPeopleButton` + `GroupChat` (shared transcript, remounted per channel) | `(tabs)/chat/[channelId].tsx` (shared, per 03 §6) |
| `app/src/routes/_authed/_app/group/new.tsx` | Redirect only → `LEGACY_PAGES["/group/new"]` = `/channel/new` (groups start via To: field) | `(tabs)/chat/group/new.tsx` (keep as alias/redirect to `chat/new`) |
| Conversation list | No dedicated route today (sidebar roster owns it) | `(tabs)/chat/index.tsx` (new; fed by channel list query §3) |

Notes: `useMarkOpenChannelRead` runs on both thread routes. `channel/$channelId` auto-opens
`?watch` once per computer-activity epoch (dismissal is per-epoch). `channel/new` keeps the first
recipient in `?agent=` so reloads preserve the pending recipient without creating a channel.

## 2) Component inventory with data deps

| File | Role | Data deps |
|---|---|---|
| `app/src/components/channels/channel-chat.tsx` (~1060 lines) | 1:1 conversation: `useAgent` (`channel:{id}`-scoped, `threadId`), socket join + history restore, `say`/`deliver` turn pipeline, seed send, relayed-turn refresh, voice wiring, run-error subscription | `lib/channels/queries`, `lib/channels/mutations` (activity/busy), `lib/copilot/*` (thread-messages, join-thread, active-bot, approval-context, conversation), `lib/voice/*`, `lib/plugins/skill-commands`, `lib/agents/queries` (roster for names) |
| `app/src/components/channels/group-chat.tsx` | Group shared transcript + send; attributed lines, running/queued/waiting/failed states, consent card branch | `lib/groups` (query + send mutation), `lib/auth/queries` (current user), `Composer`, `TeamBotConsentCard` |
| `app/src/components/channels/conversation-view.tsx` | Owns the queue: `ChatTranscript` + `Composer` wiring, drain-on-settle, failed-run restore, unmount release of staged rows | `composer/queue` (`reduceQueue`), `lib/channels/attachments` (`attachmentUrl` for DELETE release) |
| `app/src/components/channels/chat-transcript.tsx` | Render-only transcript: memoised rows, queued lines, `Thinking`/`Stopped`, attachment tiles + lightbox, routine/responsibility firing rows | `chat-messages` projection, `lib/channels/attachments`, `lib/channels/routine-firing`, `lib/channels/responsibility-turn`, `lib/plugins/tool-result`, `lib/markdown`, `VOICE_CHAT_ACTIVITY` entries |
| `app/src/components/channels/chat-messages.ts` | `toVisibleChatItems` projection: text / tool+result / activity / attachments; modality rule | `lib/channels/attachments` (`classifyAttachment`) |
| `app/src/components/channels/transcript-messages.ts` | `transcriptMessages` seed overlay; `seedMessage`; module-`Map` `stash/takeFirstMessage` (memory-only, not persisted) | None (pure) |
| `app/src/components/channels/compose-state.ts` | Pre-channel rules: `MAX_RECIPIENTS=20`, add/remove, `canSend`, `startsGroup`, `toFieldChange` (ignores Escape-clear) | None (pure) |
| `app/src/components/channels/chat-origin.ts` | `splitChatOrigin`: Slack/Teams participant line → `via` marker | Shared markers |
| `app/src/components/channels/avatar.tsx` | `ChannelAvatar` participant avatars | Agent profile/seed ids |
| `app/src/components/channels/group-people.tsx` | `GroupPeopleButton`: member count + dialog (creator removes, anyone adds by email, anyone leaves) | `lib/groups` (query + add/remove mutations), `lib/auth/queries` |
| `app/src/components/channels/recipient-field.tsx` | Recipient input piece for compose surfaces | Presentational (confirm wiring in port) |
| `app/src/components/channels/team-bot-consent.tsx` | `TeamBotConsentCard`: approve a team-Bot's use of a teammate's account | Team-bot consent API (same module group-chat uses) |
| `app/src/components/channels/tool-line.tsx` | One-line rendering of one Bot tool action | Tool-call shape from projection |
| `app/src/components/channels/tool-boundary.tsx` | `ToolRenderBoundary`: error isolation for tool/activity renderers | None (error boundary) |
| `app/src/components/channels/browser-activity.tsx` | `groupBrowserSteps`, `TranscriptItem`: computer-action feed inside transcript | `lib/copilot/computer-activity` |
| `app/src/components/channels/voice-call-widget.tsx` | Call overlay: connect/error/minimized states, captions, hangup focus | `lib/voice/use-voice-call` return, `lib/auth/queries` |
| `app/src/components/channels/voice-chat-card.tsx` | Saved voice-chat entry card inside transcript | `lib/voice/archive` (`VoiceChatEntry`) |
| `app/src/components/channels/composer/composer.tsx` (~1700 lines) | Editor: prompt-area segments, `@`/`/` chips, staged attachments strip, dictation button, send/stop, cap + rejection notices | `useAttachments` (CPK), `attachments` (upload fns below), `draft`, `picked-files`, `triggers`, `sources`, `use-dictation`, `lib/channels/attachments` (limits) |
| `app/src/components/channels/composer/draft.ts` | Pure draft model: `toDraft`, `canSendDraft` (attachment-only sends; uploading blocks), `enforceSingleAgent`, `applyCommandChips` | `prompt-area/helpers` segments |
| `app/src/components/channels/composer/queue.ts` | Parked-message queue: park-while-busy, drain as one follow-up turn, restore-on-failure; memory-only, dies with mount | `MAX_ATTACHMENTS_PER_MESSAGE`, `ComposerDraft` |
| `app/src/components/channels/composer/attachments.ts` | `uploadToChannel(channelId, uploadGroup)`: multipart POST, returns `url` source (bytes never stay in browser state) | `POST /api/channels/:id/attachments` (direct `fetch`, not `client()`) |
| `app/src/components/channels/composer/triggers.ts` | `buildTriggers`, `toAgentOptions`: `@` agent chips + `/` command menu | Agent roster options, `CommandOption[]` |
| `app/src/components/channels/composer/sources.ts` | `PLACEHOLDER_COMMANDS` for channelless compose | None |
| `app/src/components/channels/composer/use-dictation.ts` | `DictationSession` lifecycle (record → transcribe → append), capability-gated | `lib/dictation/*`, deployment capabilities |
| `app/src/components/channels/composer/dictation-controls.tsx` | Dictation button + recording surface | `use-dictation` state |
| `app/src/components/channels/composer/dictation-draft.ts` | `appendDictation`: transcript text → segments | None (pure) |
| `app/src/components/channels/composer/attachment-strip.tsx` | Staged thumbnails + upload progress + removal (DELETE staged row) | `attachmentUrl` |
| `app/src/components/channels/composer/rejected-files.tsx` | `RejectedFile` notices (type/size/cap refusals) | `screenPickedFiles` reasons |
| `app/src/components/channels/composer/picked-files.ts` | `screenPickedFiles`: client-side gate before staging | `shared/attachments` limits |
| `app/src/components/channels/composer/collapse.tsx` | Composer collapse chrome | None |
| `app/src/components/channels/composer/index.ts` | Barrel: `Composer`, draft/queue/trigger types | — |

Composer tests (`draft.test.ts`, `queue.test.ts`, `picked-files.test.ts`) port as-is; they pin the
wire/drain/cap contracts. `chat-origin.test.ts` likewise.

## 3) Data-layer inventory

| File | Exports / role | Server deps |
|---|---|---|
| `app/src/lib/channels/queries.ts` | `channelKeys`, `channelListQueryOptions` (infinite, flattened), `channelQueryOptions`, `AgentChannel`/`ChannelSummary` types | `GET /api/channels` (cursor/limit), `GET /api/channels/:id` |
| `app/src/lib/channels/mutations.ts` | `createChannel`, `recordChannelActivity` (fire-and-forget `tryClient`), `setChannelBusy` (plain fn, survives unmount), pin, `markChannelRead` (optimistic, clock-skew rule), `deleteChannel` | `POST /api/channels`, `POST :id/activity`, `POST :id/busy`, `PUT :id/pin`, `PUT :id/read`, `DELETE :id` |
| `app/src/lib/channels/start.ts` | `useStartChannel` (`start`/`startChosen`/`startGroup`); pure `startWithChosen`/`startGroupWith` (create→send→discard-on-fail→open) | Channel + group mutations, `routeMessage` audit record |
| `app/src/lib/channels/mark-read.ts` | `useMarkOpenChannelRead`: marks read off roster `lastMessageAt` (primitive-keyed, no self-loop) | Mark-read mutation |
| `app/src/lib/channels/route.ts` | `routeMessage` (opening ≤10k chars), `RoutingDecision`, `CoworkerRoutingRefusedError` (stops send) | `POST /api/route` |
| `app/src/lib/channels/attachments.ts` | Re-export of `shared/attachments`: limits, `classifyAttachment`, `attachmentUrl`, `mediaTypeOf` | Contract with `server/src/channels/attachments.ts` |
| `app/src/lib/channels/use-channel-events.ts` | WS roster sync: `parse/applyChannelEvent` (pure, tested), reconnect + refetch, group invalidation, navigate-home on delete | `GET /api/channels/events` (WS) |
| `app/src/lib/channels/label.ts` | Roster label helper | None |
| `app/src/lib/channels/routine-firing.ts`, `responsibility-turn.ts` | Firing parsers wrapping `shared/*` | None (pure) |
| `app/src/lib/groups.ts` | `groupKeys`, `groupQueryOptions` (poll 1.5s while running/queued or awaiting-first-reply ≤10min), send/create/addMember/removeMember | `GET/POST /api/groups/:id`, `POST /api/groups`, `POST/DELETE :id/members…` |
| `app/src/lib/copilot/provider.tsx` | `CopilotProvider`: `CopilotKitProvider` (`runtimeUrl /api/copilotkit`, `credentials:include`) + app-wide frontend tool registry (computer, sign-in, handoff, escalation, gallery, sandboxed, skill, bot tools) | `GET /api/copilotkit/*`, deployment capabilities (generativeUi gate) |
| `app/src/lib/copilot/conversation.tsx` | `ConversationProvider`/`useConversation`: transcript cards submit turns via `ask` | None |
| `app/src/lib/copilot/active-bot.tsx` | `ActiveBotProvider` (ref for handlers + state for UI), `useActiveBot` declare/restore on mount | None |
| `app/src/lib/copilot/thread-messages.ts` | `readThreadMessages` (1500ms deadline, Zod `MessageSchema` + store-dialect normalisation), `readableTurns`, `unreadable` count | `GET /api/copilotkit/threads/:id/messages?agentId=` |
| `app/src/lib/copilot/join-thread.ts` | `joinWithin` bounded connect + detach + 2s grace; `afterMs` | None (pure) |
| `app/src/lib/copilot/approval-context.ts` | `observeApprovalAgent` / `frontendApprovalSnapshot` (WeakMap run input for approval handlers) | None |
| `app/src/lib/copilot/computer-activity.ts` | Module epoch bus: `reportComputerActivity` / `onComputerActivity` (10s quiet gap) | None |
| `app/src/lib/copilot/bot-thread.ts` | Per-agent thread key in `localStorage` + mint (direct `/bot` chat; channels use server `threadId` — boundary) | `POST /api/threads/mint`, `GET /api/threads/:id` |
| `app/src/lib/copilot/stopped-turn.ts`, `repair-history.ts` | `stoppedReason` mapping; `repairUnansweredToolCalls` before each send | None (pure) |
| `app/src/lib/voice/use-voice-call.ts` | `useVoiceCall`: `VoiceSession` lifecycle, capability gate, `pagehide` end | `POST /api/voice/calls`, `GET /api/voice/config` |
| `app/src/lib/voice/archive.ts` | `voiceSessionQueryOptions`, `saveVoiceSession` (pending via outbox → POST), `voiceArchiveContext`/`withVoiceChats`, `VOICE_CHAT_ACTIVITY` | `GET/POST /api/voice/sessions` |
| `app/src/lib/voice/agent-bridge.ts` | `askChannelAgent`, `messageText`, `voiceContext`, `withVoiceContext` (voice history injection into runs) | None (pure glue) |
| `app/src/lib/voice/outbox.ts` | `localStorage` pending-call outbox (`remember/forget/recover`, owner id) | None |
| `app/src/lib/voice/connection.ts`, `session.ts`, `webrtc.ts`, `websocket.ts`, `pcm.ts`, `pcm-worklet.js`, `transcript.ts`, `cut.ts`, `types.ts` | Transport + audio pipeline + transcript slicing | Voice provider endpoint |
| `app/src/lib/dictation/recording.ts`, `session.ts` | `startRecording` (MediaRecorder), `transcribeRecording`, `DictationSession` intents | `POST /api/audio/transcriptions` |
| `shared/attachments.ts`, `shared/voice-session.ts`, `shared/dictation.ts`, `shared/routine-firing.ts`, `shared/responsibility-turn.ts` | Cross-boundary contracts (limits, session shape, firing frames) | Enforced by server twins |

Drafts/storage summary: composer holds NO persisted drafts (only `initialValue`; send restores to the
box on failure). Queue + first-message seed are memory-only by design (`queue.ts` header: "a queue is
not an outbox"). `localStorage` touches are voice outbox, bot-thread keys (non-channel), theme/sidebar.

## 4) Server API routes

| Method + path | File (under `server/src/`) | Used by |
|---|---|---|
| `GET /api/channels` (cursor/limit page) | `channels/routes.ts` (`createChannelRoutes`, mounted in `app.ts`) | Roster, list query |
| `POST /api/channels` (201, own thread) | `channels/routes.ts` | `start` |
| `GET /api/channels/:channelId` | `channels/routes.ts` | Thread routes |
| `DELETE /api/channels/:channelId` (soft-delete; transcript kept) | `channels/routes.ts` | Failed group-start discard, channel delete |
| `POST /api/channels/:channelId/activity` | `channels/routes.ts` | `recordChannelActivity` roster preview |
| `POST /api/channels/:channelId/busy` (transient, socket-broadcast) | `channels/routes.ts` | `setChannelBusy` working dot |
| `PUT /api/channels/:channelId/pin`, `PUT …/read` | `channels/routes.ts` | Pin toggle, mark-read |
| `GET /api/channels/events` (WS upgrade) | `channels/routes.ts` + `channels/socket.ts` + `channels/events.ts` (pg NOTIFY hub) | `use-channel-events` |
| `POST /api/channels/:channelId/attachments`, `GET/HEAD/DELETE /api/attachments/:id` | `channels/attachments.ts` (mounted in `app.ts` behind body-limit) | Composer upload, tiles, HEAD existence probe, staged release |
| `POST /api/groups` (201, agents in order) | `channels/group.ts` (`createGroupRoutes`, per-bot threads + headless AG-UI turns) | `startGroup` |
| `GET /api/groups/:channelId` (shared transcript) | `channels/group.ts` | Group query (poll) |
| `POST /api/groups/:channelId` (202, `@Name` selects one Bot) | `channels/group.ts` | Group send |
| `POST /api/groups/:channelId/members`, `DELETE …/members/:userId` | `channels/group.ts` | `GroupPeopleButton` |
| `POST /api/threads/mint`, `GET /api/threads/:threadId` (known/unknown; 502 on check fail) | `channels/thread-routes.ts` | Bot-thread helper (boundary, §3) |
| `/api/copilotkit/*` incl `threads/:id/messages` (Intelligence runtime) | `copilot.ts` handler (mounted in `app.ts`) | `useAgent` runs, history read |
| `POST /api/route` (routing decision + `channel.routed` audit row) | `routing/routes.ts` (mounted in `app.ts`) | Home composer, `startChosen` |
| `POST /api/voice/calls` (1:1-only, SDP, rate-limited), `GET /api/voice/config` | `voice/routes.ts` (mounted in `app.ts`) | `useVoiceCall` |
| `GET/POST /api/voice/sessions` | `voice/session-routes.ts` | Voice archive |
| `POST /api/audio/transcriptions` (10 MiB cap, WebM/MP4/WAV) | `dictation/routes.ts` (mounted in `app.ts`) | Dictation |

Supporting (not ported here, must exist): `GET /api/agents` roster (To:, mentions, names),
deployment capabilities (voice/transcription/generativeUi gates), team-bot consent endpoints.

## 5) Complexity + coupling risks

| Item | Complexity | Coupling risks (CPK web bindings · DOM · voice · drafts) |
|---|---|---|
| `say`/`deliver` turn pipeline + join/ready gates + turn-vs-run counters | H | `@copilotkit/react-core/v2` `useAgent`/`useCopilotKit`/`CopilotChatConfigurationProvider` are web bindings with no RN equivalent — needs a transport adapter behind the same interface; timing gates are subtle, keep exact semantics |
| Composer editor (`prompt-area` chips, triggers, `useAttachments` staging) | H | `prompt-area` + CPK `useAttachments` are web-only — full rewrite is the critical path; DOM `Clipboard/DragEvent`, `File` handles; no persisted drafts to migrate (do not add any) |
| Transcript render (Streamdown, motion cascade, `MessageScroller`, Dialog lightbox, `<img>` + HEAD probes) | M | DOM-heavy: scroll anchoring, portals, image error events; Streamdown/motion need RN equivalents; preserve attachment modality-from-bytes rule and missing-file copy |
| Voice call + archive injection + outbox | H | WebRTC/audio-worklet/MediaRecorder are web-only (react-native-webrtc / expo-av rewrite); server enforces 1:1-only; `localStorage` outbox → async-storage equivalent; keep 6k-char context caps |
| Dictation (record → transcribe → append) | M | MediaRecorder → expo-audio; `/api/audio` contract reusable; capability gate stays |
| Group transcript + polling + people dialog | S–M | Portable; polling is battery-sensitive on mobile — prefer socket invalidation where available |
| Channel events WS + cache patching | M | `WebSocket` is RN-safe; reconnect/resync + Expo-Router delete-redirect need re-implementation; pg-NOTIFY ordering assumptions stay server-side |
| Queue + seed + history notice (`channelHistoryNotice` copy) | S | Pure/portable; queue non-persistence and seed destructiveness are load-bearing semantics — preserve exactly |
| Skill `/` chips → hidden system message | S–M | Portable; depends on per-agent skill grants existing before port |
| Computer `?watch` auto-open + `DetailPanel` | M | Epoch bus is portable; `ComputerViewPanel` belongs to the computer surface — keep the URL-flag contract, port panel separately |
| Approval / team-consent / sign-in inline cards | M | Frontend tool registry rides the CPK provider — must survive the transport swap; consent posts stay server-side |
| Mark-read / busy / activity fire-and-forget | S | Portable; keep clock-skew rule and no-rollback semantics |
| Attachment upload caps + 409/413 copy | S–M | `FormData` is RN-safe; keep per-`uploadGroup` counting and exact refusal strings |

Top risks: (1) CPK `react-core/v2` web bindings have no RN drop-in — the run/attachment/dictation
stack must be abstracted, not transliterated. (2) `prompt-area` composer is the largest rewrite.
(3) Voice is a second native stack (WebRTC + audio + calls UI). (4) DOM-coupled transcript behaviours
(scroller anchoring, probes, portals) need designed RN equivalents, not ports.

## 6) Port order

| # | Step | Why this position |
|---|---|---|
| 1 | Contracts: `shared/*` + query/mutation factories + pure parsers (`chat-messages`, `draft`, `compose-state`, `thread-messages`, `join-thread`, `transcript-messages`, history notice) + existing tests | RN-safe, no UI; pins wire formats first |
| 2 | Socket + polling: channel events, group poll, delete-redirect via Expo Router | Live-ness before screens |
| 3 | `ConversationView` + queue + seed + notices | Queue semantics are load-bearing; test without transport |
| 4 | `ChatTranscript` rows/tiles/firings with RN markdown/scroll/lightbox equivalents | Unblocks read-only parity |
| 5 | `GroupChat` + `GroupPeopleButton` (server-driven, no CPK binding) | First fully working surface; de-risks API + socket |
| 6 | Composer rewrite: text + `@`/`/` chips first, attachments second, dictation third | Critical path; ship incrementally |
| 7 | `ChannelChat` transport adapter + `say`/`deliver` gates + stop/queue + run-error copy | Hardest logic, isolated interface |
| 8 | Voice call + archive + dictation behind capability gates (1:1-only guard) | Separate native stack, gated |
| 9 | Routes: `(tabs)/chat/*`, home composer, To: picker; keep `?agent=` deep link + `/group/new`→`/channel/new` redirect equivalent | Shell last, surfaces first |
| 10 | Parity sweep: non-persistence of queue/seed, busy/mark-read, history-notice copy, modality-from-bytes, clock-skew mark-read, refusal strings | Locks the subtle contracts §5 names |

Done when: 1:1 + group threads send/receive/stream, queue-while-busy + stop behave identically,
history/attachment/voice states render the same copy, and no web-only import (`prompt-area`,
`@copilotkit/react-core`, DOM voice APIs) remains in the ported surface.

© Opraiz Technology Pvt Ltd · Developer: Narein Rao
