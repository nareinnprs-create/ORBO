# 27 — Phase 6 App Inventory: OpenMuse Screens → Unified IA (PLAN.md §8.6)

> **Status: RESEARCH ONLY — no product code modified.**
> Phase 6 kickoff per PLAN.md §8 item 6 (port OpenMuse screens) + §3 unified IA.
> Read-only sources: `_sources/OpenMuse/apps/mobile/` (App.tsx + `src/` 37 files),
> `_sources/OpenMuse/packages/domain/src/index.ts` (Section union),
> `mobile/app/` (11 files) + `mobile/src/` (7 files),
> `docs/planning/{03-route-tree.md §5, 07-visual-design.md §2, 15-phase4-portability-audit.md}`.
> Path convention: OpenMuse paths are `_sources/OpenMuse/apps/mobile/`-relative; ORBO paths repo-relative.
> Verified on disk 2026-10-14.

## 1) OpenMuse screen inventory (file → screen → purpose → data deps)

Section union (11): `today, chat, mail, calendar, browser, files, activity, connections, ideas, goals, apps`
(`packages/domain/src/index.ts:4-15`). Detail overlay union (11): `mail, email, event, file, browser,
review, task, delegate, notifications, computer, menu` (`src/workspace.tsx:14-25`).
No router — `App.tsx:WorkspaceApp` holds `section` + `detail` state; `navigate()` folds
`today→chat`, `connections→apps` (`App.tsx:171-174`). Bottom rail: Chat/Activity/Ideas/Goals/Apps
(`App.tsx:45-51`); Mail/Calendar/Browser/Files reached via utility paths + overlays.

| # | File | Screen / component | Purpose | Data deps |
|---|---|---|---|---|
| M1 | `App.tsx` (`WorkspaceShell`, `WorkspaceApp`) | Shell: top agent-status bar, bottom tab rail, thread sheet, toast | `GET /api/workspace` (Workspace), `useAgentWorkspace` snapshot, `useMuseThread` selection |
| M2 | `src/screens.tsx` | `TodayScreen` | Day overview: agenda + inbox + pending reviews | Workspace (calendar events, mail, actions) |
| M3 | `src/screens.tsx` | `MailScreen` | Inbox list, unread/drafts, compose entry | `Mail[]`, `EmailDraft`; `POST /api` mail routes |
| M4 | `src/screens.tsx` | `CalendarScreen` | Week/day agenda, picker, new-event entry | `CalendarEvent[]`, `EventDraft`; calendar routes |
| M5 | `src/screens.tsx` | `BrowserScreen` | Persistent browser sessions list + open session | `BrowserSession[]`; browser-worker routes |
| M6 | `src/screens.tsx` | `FilesScreen` | Documents library, PDF import/view | `Artifact[]` (`url`, `pageCount`, `fields`); `POST` document routes, expo-document-picker |
| M7 | `src/screens.tsx` | `ActivityScreen` | Action proposals + workspace timeline/receipts | `ActionProposal[]`, `ActivityEntry[]`; `POST /api/actions[/:id/decide]` |
| M8 | `src/screens.tsx` | `ConnectionsScreen` | Google (Gmail/Calendar), agent computer, OpenBot connectors | Workspace connections; connector setup routes |
| M9 | `src/agent-ui.tsx` | `AgentActivityScreen` (+`TaskCard`, `ChatWork`) | Durable task plans/progress, reviews & receipts | `GET/POST /api/agent` tasks (`snapshot/detail/control/input`), `ActionProposal` |
| M10 | `src/agent-ui.tsx` | `IdeasScreen` (+`IdeaCard`) | Evidence-backed suggestions, accept/edit/dismiss | `POST /api/agent` `/ideas/refresh`, `/ideas/:id` |
| M11 | `src/agent-ui.tsx` | `GoalsScreen` (+`GoalCard`, `MonitorCard/Form`) | Goals, milestones, tracking/monitors | `POST /api/agent` `/goals`, `/monitors`, `/monitors/:id/control` |
| M12 | `src/agent-ui.tsx` | `AppsScreen` | Connections + capabilities + remembered preferences | Workspace connections, memory/preferences |
| M13 | `src/agent-ui.tsx` | `TaskDetail` (+`ArtifactCard`) | Task plan/timeline/input/lease/receipts; artifacts incl. finance CSV/spending/savings-goal | `GET /api/agent/tasks/:id`, artifact routes |
| M14 | `src/agent-ui.tsx` | `DelegateSheet`, `NotificationsSheet` (+`AgentStatus`) | Delegate task to agent; notification inbox; status pill | `POST /api/agent/tasks` (delegate), notifications list |
| M15 | `src/chat.tsx` | `ChatScreen` (+`WorkspaceTools`) | Streamed AG-UI chat, drafts, follow-up queue | CopilotKit RN headless (`useAgent`, `useCopilotKit`), `/api/copilotkit`, `ConversationQueue`, `conversation-run.ts` |
| M16a | `src/browser-tool-card.tsx` | `BrowserToolCard` (+`BrowserRunContext`) | Inline browser-run card: progress, capture, takeover entry | AG-UI browser tool-call payload; `BrowserSession` |
| M16b | `src/desktop-tool-card.tsx` (+`desktop-stream.tsx`) | `DesktopToolCard` (+`DesktopStream`, `useDesktopStream`) | Inline desktop/computer run card with live frames | Computer stream/screenshot routes; memo'd frame component |
| M16c | `src/mail-tool-card.tsx` | `MailToolCard` | Inline mail draft/send card in transcript | `Mail` / `EmailDraft` payloads |
| M16d | `src/search-tool-card.tsx` | `SearchToolCard` | Inline research/search result card | Search tool-call payload |
| M16e | `src/jev-tool-card.tsx` (+`jev-actions.ts`) | `JevToolCard` (+`JevInteractionContext`) | Inline form-fill/JEV panel card with selection confirm | JEV panel payload; `confirmedJevSelection`, `latestJevPanelId` |
| M17 | `src/threads.tsx` | `ThreadsSheet`, `ThreadsProvider`, `useMuseThread` | Rich threads: main + side chats, rename/archive/restore | Threads store (CopilotKit threads); `Selection`, visited/mainId |
| M18 | `src/computer.tsx` | `ComputerSheet`, `ComputerEntry`, `BrowserThreadCard` | Agent computer entry + browser workspace card | Computer session routes; `BrowserSession` |
| M19 | `src/computer-workspace.tsx` | `LinuxWorkspace` | Shell/terminal + `/workspace` files | Computer exec + file routes; `computer-drafts.tsx` |
| M20 | `src/details.tsx:60-79` | `Details` overlay router | Switches 11 Detail types to editors/sheets | Same deps as M3–M6/M7/M13/M18 per `detail.type` |
| M21a | `src/details.tsx` | `MailDetail`, `EmailEditor` | Inbox read + review-before-send compose | `Mail`, `emailDraftSchema`; mail send routes |
| M21b | `src/details.tsx` | `EventEditor` (+`DateTimeEditor.tsx`, `DateFields.{native,web}.tsx`) | Calendar create/edit with zoned date inputs | `eventDraftSchema`, `date-time.ts`; calendar routes |
| M21c | `src/details.tsx` | `ReviewDetail` | Approve/edit/deny action proposal before execute | `ActionProposal`, `ProposalInput`; `POST /api/actions/:id/decide` |
| M21d | `src/details.tsx` | `FileDetail` (+`PdfReader.{native,web}.tsx`) | Document view, filled-copy fields, share/download | `Artifact`; `expo-file-system/legacy`, `expo-sharing` |
| M21e | `src/details.tsx` | `BrowserDetail` (+`BrowserConsole.{native,web}.tsx`) | Session console, nav rules, capture | `BrowserSession`, `browser-address.ts`; worker routes |
| M21f | `src/details.tsx` | `computer` / `notifications` / `delegate` / `task` / `menu` details | Thin wrappers over M18/M14/M13 + menu sheet | Reuse ComputerSheet, TaskDetail, DelegateSheet, NotificationsSheet |
| M22 | `src/thread-artifacts.tsx` | `FileThreadCard`, `TaskThreadCard` | Inline file/task cards inside chat transcript | `Artifact`, `AgentTask` |
| M23 | `src/ui.tsx` (+`assistant-markdown.ts`, `assistant-response.tsx`) | `Sheet`, `Card`, `Field`, `SectionHeading`, markdown render | RN-only primitive layer; assistant text render | Local only (no server); `Platform.OS` split precedent |
| M24 | `src/agent-workspace.tsx` + `background-updates.tsx` | `AgentWorkspaceProvider`, `BackgroundUpdates` | Snapshot context + `mutate`/`delegate`; bg refresh pings | `GET /api/agent` snapshot; AppState listeners |

Count: **11 sections + 11 overlay types; ~30 screens/overlays/cards** across 8 core files
(`App.tsx`, `screens.tsx`, `agent-ui.tsx`, `chat.tsx`, `threads.tsx`, `computer.tsx`,
`computer-workspace.tsx`, `details.tsx`) + 5 tool-cards + `workspace.tsx` types + providers.

## 2) Current `mobile/` shell inventory (11 files: 10 screens + 1 layout)

| # | File | Screen / purpose | Data deps |
|---|---|---|---|
| O1 | `mobile/app/_layout.tsx` | Stack + push-notification deep-link wiring | `expo-notifications`, `src/links.ts` (`notificationDestination`) |
| O2 | `mobile/app/index.tsx` | Home: session, sign-in (incl. enterprise), conversation list | Better Auth (`src/auth.ts`), `GET /api/capabilities`, conversations list |
| O3 | `mobile/app/conversation.tsx` | Conversation thread (`?channelId=&agentId=&draft=`) | `api` conversations/transcript; `POST` send |
| O4 | `mobile/app/approvals.tsx` | Approval inbox (`?requestId=`), allow-once/always/deny | `GET /api/approvals`, `POST /api/approvals/:id/decision` |
| O5 | `mobile/app/bots.tsx` | Bots list → profile | `GET /api/agents` |
| O6 | `mobile/app/bot.tsx` | Bot profile: pause, computer, routines, customization | Bot detail, lifecycle, routines, conversations |
| O7 | `mobile/app/computer.tsx` | Live computer screen (frame stream + screenshot poll) | `GET /api/computers/:botId` stream/screenshot, control state |
| O8 | `mobile/app/routine.tsx` | Routine detail: active/schedule/runs, Run now | `GET /api/routines`, run history |
| O9 | `mobile/app/memory.tsx` | User memory CRUD + on/off | `GET/POST /api/memory` |
| O10 | `mobile/app/rules.tsx` | Approval rules / behaviour labels | Approval rules/settings endpoints |
| O11 | `mobile/app/plugins.tsx` | Per-bot skills on/off + connected tools (`?botId=`) | `GET /api/plugins`, `GET /api/plugins/for/:botId` |

Shell notes: plain RN primitives (`src/ui.tsx`: `Screen/Section/card`), `src/api.ts` fetch wrapper,
`src/use-load.ts` loader. Deleted after port; screens fold into unified tree (`03` §5/§6).

## 3) Screen-by-screen mapping (OpenMuse → unified IA surface + target route)

Target routes from `03` §5; screen IDs from `07` §2. `≡` = consolidation.

| # | OpenMuse screen | Unified IA surface (`07` ID) | Target route (`03` §5) |
|---|---|---|---|
| P1 | `ChatScreen` + `WorkspaceTools` + 5 tool-cards (M15–M16e) | Chat (C2) ≡ | `(tabs)/chat/[channelId].tsx` (streamed AG-UI, drafts, inline cards) |
| P1a | `BrowserToolCard` / `DesktopToolCard` (M16a–M16b) | Chat tool lines + Computer (A10/N5) | Thread route cards + `(app)/computer/index.tsx` live view; takeover → per-agent computer route |
| P1b | `MailToolCard` / `SearchToolCard` / `JevToolCard` (M16c–M16e) | Chat inline cards (C2) | Same thread route; JEV panels become native form cards (no hover) |
| P2 | `ThreadsSheet` main+side chats (M17) | Chat threads (C2 drawer) | `(tabs)/chat/[channelId].tsx` + threads drawer (not modal-only); list at `(tabs)/chat/index.tsx` |
| P3 | `FileThreadCard`, `TaskThreadCard` (M22) | Chat inline cards (C2) | Same thread route; cards become `packages/ui` chat rows |
| P4 | `TodayScreen` (M2) | Home / DIYA (C1) | `(tabs)/index.tsx` (default conversation + work cards; no separate Today route) |
| P5 | `MailScreen` + `MailDetail`/`EmailEditor` (M3/M21a) | Connections (N1/N2) | `(app)/connections/index.tsx` + `(app)/connections/[providerId].tsx` (Gmail); compose = sheet route |
| P6 | `CalendarScreen` + `EventEditor` (M4/M21b) | Connections (N1) + Work (W1) | `(app)/connections/[providerId].tsx` (Calendar provider); agenda surfaces in `(tabs)/work/index.tsx` |
| P7 | `BrowserScreen` + `BrowserDetail`/`BrowserThreadCard` (M5/M18/M21e) | Connections browser (N5) | `(app)/connections/browser.tsx` (sessions + capture/nav rules) |
| P8 | `FilesScreen` + `FileDetail` + `PdfReader` (M6/M21d) | Spaces/Pages (S5 ≡) | `(tabs)/spaces/[spaceId]/pages/[pageId].tsx` (PDF pipeline rides page surface; `pdf-reader.{web,native}` split) |
| P9 | `ActivityScreen` + `AgentActivityScreen`/`TaskCard`/`ChatWork` (M7/M9) | Work overview + run detail (W1/W2) | `(tabs)/work/index.tsx` (+ `activity/[runId]` per `07` W2; `03` gains the run-detail route) |
| P10 | `ReviewDetail` + action proposals (M7/M21c) | Approvals (user-level) | `(app)/approvals.tsx` (unified inbox; OpenMuse review-before-send folds in) |
| P11 | `GoalsScreen` (M11) | Work goals (W4) | `(tabs)/work/goals.tsx` (goals + monitors + milestones) |
| P12 | `IdeasScreen` (M10) | Work ideas (W5) | `(tabs)/work/ideas.tsx` (accept/edit/dismiss) |
| P13 | `TaskDetail` + `ArtifactCard` incl. finance (M13) | Work run detail (W2); finance → TBD (F1) | `(tabs)/work/activity/[runId]`-equivalent; finance CSV/summary/goal per 24/25 → owner-confirmed home (pending C24) |
| P14 | `DelegateSheet` (M14) | Chat/Agents (delegate flow) | `(tabs)/chat/new.tsx` + `(tabs)/chat/group/new.tsx` (DIYA delegation; sheet becomes route) |
| P15 | `NotificationsSheet` (M14) | Notifications | `(app)/notifications.tsx` (route; sheet presentation on native) |
| P16 | `ComputerSheet`/`ComputerEntry` + `LinuxWorkspace` (M18–M19) | Agent computer (A10) + Computer (stack) | `(tabs)/agents/[agentId]/computer.tsx` (per-agent live screen) + `(app)/computer/index.tsx` (shell/files/browser-takeover) |
| P17 | `ConnectionsScreen`/`AppsScreen` (M8/M12) | Connections hub (N1) + Settings profile (T2) | `(app)/connections/index.tsx` (providers/capabilities); remembered prefs → `(app)/settings/index.tsx` + `(app)/memory.tsx` |
| P18 | `menu` + `computer` Detail types (M20) | Shell chrome | `(tabs)/_layout.tsx` tabs/side-rail + `(app)/_layout.tsx` drawers (no menu route) |
| P19 | Access-key gate (`App.tsx:69-143`) | Identity (I1–I3) | `(auth)/sign-in.tsx` + `(auth)/callback/[requestId].tsx`; access key maps to single-owner mode only (canonical auth = Better Auth) |

Unmapped elsewhere: `03` Spaces editor (OpenDots), Admin console (ORBO-only), Settings subtree —
OpenMuse contributes no screens there beyond prefs (P17).

### 3b) Current-shell fold-in (O-shell → same target tree; deleted after parity)

| # | ORBO shell screen | Target route | Notes |
|---|---|---|---|
| F1 | O2 `index.tsx` (home + sign-in + list) | `(tabs)/index.tsx` + `(auth)/sign-in.tsx` | Auth splits out; list becomes `(tabs)/chat/index.tsx` |
| F2 | O3 `conversation.tsx` | `(tabs)/chat/[channelId].tsx` | Merges with P1 thread model; `?draft=` survives as composer arg |
| F3 | O4 `approvals.tsx` | `(app)/approvals.tsx` | Merges with P10 review inbox; `?requestId=` deep link kept |
| F4 | O5/O6 `bots.tsx`/`bot.tsx` | `(tabs)/agents/index.tsx` + `[agentId]/index.tsx` | Bots rename → Agents (`14`); DIYA pinned boss |
| F5 | O7 `computer.tsx` | `(app)/computer/index.tsx` + per-agent computer | Merges with P16; keep frame-stream + screenshot-poll logic |
| F6 | O8 `routine.tsx` | `(tabs)/work/routines.tsx` (+ per-agent routines) | Merges with P9 run-detail; Run-now + history kept |
| F7 | O9 `memory.tsx` | `(app)/memory.tsx` + agent memory | Merges with P17 prefs; origin labels (person/import/bot) kept |
| F8 | O10 `rules.tsx` | `(app)/settings/approvals.tsx` + agent approvals | Behaviour labels fold into approval-rules rows |
| F9 | O11 `plugins.tsx` | `(app)/connections/[providerId].tsx` + admin plugins | Per-bot skills → connections; catalog stays admin |
| F10 | O1 `_layout.tsx` push wiring | `app/_layout.tsx` | `notificationDestination` (`src/links.ts`) rejoins route ids; keep badge/sound contract |

## 4) Natively-portable vs needs-redesign verdicts

Rule (from `15`): OpenMuse is already RN, so layout code ports; seams are navigation, auth,
overlays→routes, `.native/.web` splits, and CopilotKit-RN vs ORBO AG-UI parity.

| Verdict | Screens | Rationale + precedent |
|---|---|---|
| PORTABLE (move, mechanical `StyleSheet`→tokens only) | Ideas/Goals/Activity lists + cards (M9–M11), `TaskCard`, `ArtifactCard`, `ConnectionsScreen`/`AppsScreen` rows (M8/M12), `ThreadCards` (M22) | Pure RN + props; map `src/ui.tsx` (`Card/Chip/SectionHeading/Empty/ErrorNotice`) to `packages/ui` primitives; finance cards fold into Work rows (`07` W1; `15` §8 ADAPT-primitive path) |
| PORTABLE-DATA | `AgentWorkspaceProvider`, `BackgroundUpdates` (M24), `computer-drafts.tsx`, `conversation-queue.ts` | Pure context/queue/draft helpers; no DOM (mirrors `15` §4 PORTABLE chat helpers) — move first |
| PORTABLE-SHELL | `Sheet`, `Field`, `CheckRow`, `LinkRow` (`src/ui.tsx`) | Merge into `packages/ui` `dialog/sheet` + form primitives; OpenMuse Sheet is the `15` §1 ADAPT precedent for dialog/sheet |
| ADAPT (logic ports, leaf splits) | `ChatScreen`/tool-cards (M15–M16e), `ThreadsSheet` (M17) | Keep queue/draft/follow-up logic; re-wire CopilotKit RN headless → ORBO AG-UI + `FlatList` transcript (same rewrite as `15` §7 items 1–2: composer/scroller are WEB-ONLY on the ORBO side) |
| ADAPT | `ComputerSheet`/`LinuxWorkspace` (M18–M19) | Keep session/draft logic; native live-screen already exists at O7 — unify frame-stream + takeover behind one computer component (`05` F12 split) |
| ADAPT | `Mail/Calendar/Browser` screens (M3–M5) | Lists port; compose/event editors become deep-linkable sheet-routes; browser embed is the `15` §6 `browser-activity?` seam — confirm native embed contract |
| ADAPT | Date/zoned inputs (M21b), PDF/share (M21d) | `DateFields` split + `zonedInstant`/`localDateTime` portable; file-share moves behind pick/share leaf (`05` F1/F8, `15` R4 `File`-vs-URI) |
| REDESIGN (no direct port) | `Section` state-machine nav + bottom rail (M1) | Replace with `(tabs)` navigator (bottom tabs native / side rail web) per `03` §5; utility sections become stack routes, not tabs |
| REDESIGN | 11 `Detail` overlays → routes (M20–M21f) | Overlays become deep-linkable routes with native sheet presentation (`03` §6 mapping rule); `menu` disappears into shell chrome |
| REDESIGN | Access-key gate → Better Auth (M1/P19) | Canonical auth = OpenBot Better Auth (`03` §7); access-key path survives only as single-owner mode |
| REDESIGN | O-shell `Screen/Section/card` chrome (O1–O11) | Replace with `PageShell`/`PageSection`/`PageRows`/`Item` reference pattern (`07` §1/§4 Wave 0); keep loader/auth/push logic only |
| KEEP SPLIT | `PdfReader.{native,web}`, `BrowserConsole.{native,web}`, `DateFields.{native,web}` | `05` §3 rule: split smallest module, identical props; PDF rides the Spaces page surface (`07` S5) |

## 5) Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | Two chat runtimes (CopilotKit RN headless vs ORBO AG-UI/CopilotKit web) diverge on threads/tool-cards | Highest; P1–P3 are the core port | Parity check first (`05` R5); keep `conversation-queue/run` logic shared, rewrite only composer/scroll leaves (`15` §7.1–2) |
| R2 | Overlay→route conversion orphans deep links (11 Detail types have no URLs today) | Notifications/threads/review links break | Ship route + redirect map; notification URLs join against route ids (`03` §7) |
| R3 | Finance cards have no route home (`07` F1/V11 pending C24) | P13 ships blind; `06` tests unmappable | Owner confirms Work-vs-Spaces-vs-standalone home before Phase 6 build; same gate as docs 24/25 |
| R4 | Browser/computer native embed contract unconfirmed (`15` §6 `?` row) | P7/P16 stall on worker stream/takeover | Spike `BrowserConsole` + O7 live-frame against target worker; lock `05` F12 split before port |
| R5 | Auth downgrade: access-key workspaces vs Better Auth single-owner/multi-user | Session/token flows mismatch (P19) | Canonical Better Auth; access key → single-owner mode only; migrate `createSession` → auth client |
| R6 | Dual `.native/.web` files drift (PDF, console, date fields) | Web/native parity breaks silently | Enforce `05` §3 split-leaf rule (identical props, smallest module); one `packages/ui` owner per leaf |
| R7 | Scope: ~30 OpenMuse surfaces + 10-shell fold-in vs 57-route tree | Port-phase overload, duplicate screens | Phase order per PLAN.md §8 (5→6→7); parity-matrix gating; delete `mobile/` shell only after parity (`03` §7) |
| R8 | Icon/animation drift (`lucide-react-native` vs Tabler; no `motion` in OpenMuse) | Visual dialect vs `07` §3.4/§3.6 | Standardize RN icon set per `15` R6 / `04` G5; add Reanimated entrance + reduced-motion contract on port |

---

## 6) Method and evidence notes

| Check | Evidence |
|---|---|
| Section union | `packages/domain/src/index.ts:4-15` — 11 literals verified |
| Detail union | `src/workspace.tsx:14-25` — 11 overlay types verified |
| Nav fold + rail | `App.tsx:45-51` (rail), `App.tsx:171-174` (`today→chat`, `connections→apps`), `App.tsx:275-291` (section→screen switch) |
| Shell chrome | `App.tsx:230-319` (`WorkspaceShell`: status pill, pending count, threads sheet, `useWindowDimensions` 900px breakpoint) |
| Auth gate | `App.tsx:69-143` (`createSession`, access-key field, `API_URL` from `src/api.ts`) |
| Shell screens | `mobile/app/` 11 files read (heads of `index/conversation/approvals/bots/bot/computer/routine/memory/rules/plugins/_layout`); `mobile/src/` 7 helpers |
| Target routes | `03` §5 tree + §6 mapping; screen IDs `07` §2 (C/W/N/A/S); portability rules `15` §§1/6–8; split-leaf rule `05` §3 |
| Out of scope | Backend engines (docs 23–26 cover documents/finance/goals/activity); `test/` + `packages/domain` validation beyond Section |

---

*Counts: OpenMuse ~30 screens/overlays/cards (11 sections + 11 Detail types); current shell 10 screens + 1 layout; mapping 21 rows (P1–P19 + P1a/P1b) + 10 fold-in rows (F1–F10).*
*Next: Phase 6 build ports P1–P17 in Work→Connections→Chat→Computer order once C24 route tree + Finance home are confirmed.*

© Opraiz Technology Pvt Ltd · Developer: Narein Rao
