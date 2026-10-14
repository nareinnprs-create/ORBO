# 03 — Unified Route Tree Design (PLAN.md §10.C item 24)

This document defines the final Expo Router route tree for a single Expo app
(web/iOS/Android) with a Tauri desktop shell wrapping the web export.
Phase 3 target (PLAN.md §3): **one** Expo Router app; Phase 2 rebrand is done.
Research and docs only — no first-party code is changed by this document.

Sources inventoried (verified on disk 2026-10-14):

- **ORBO current web app**: TanStack Router, file-based, under `app/src/routes/`
  (60 route files, verified with `Get-ChildItem -Recurse`).
- **ORBO current mobile shell**: Expo Router `Stack`, under `mobile/app/`
  (11 files: 10 screens + 1 stack layout).
- **OpenMuse**: Expo / React Native app, single `App.tsx` state machine + overlays,
  under `_sources/OpenMuse/apps/mobile/` (Section union + Detail overlay union).
- **OpenDots**: web app with `view` state machine + hash deep links for Pages,
  under `_sources/OpenDots/src/client/` (App.tsx + WorkspaceDialog.tsx).

Target surfaces (PLAN.md §3 + §6): **Home, Chat, Spaces/Pages, Work
(activity/routines/goals/ideas), Connections, Agents, Admin, Settings, Identity.**

> Notation: dynamic segments are written in Expo Router bracket form ([channelId]).
> The TanStack source files spell the same segments with a leading dollar
> (e.g. bots.$agentId.index.tsx). There is no backslash escaping anywhere
> in this document.

---

## 1) Current ORBO route inventory (TanStack Router, file-based)

Source: `app/src/routes/`. Underscore-prefixed segments (`_authed`, `_app`) are
**pathless layouts** and do not appear in the URL. `route.tsx` files are directory layouts.

| Route file (relative under `routes/`) | URL path | Screen / purpose |
|---|---|---|
| `__root.tsx` | `/` | Root layout + providers bootstrap. |
| `sign.tsx` | `/sign` | Sign-in entry point. |
| `_authed.tsx` | — (pathless) | Authenticated layout / guard. |
| `_authed/onboarding.tsx` | `/onboarding` | First-run onboarding. |
| `_authed/sign-in/$requestId.tsx` | `/sign-in/[requestId]` | OAuth/SSO sign-in callback. |
| `_authed/_app.tsx` | — (pathless) | Main app shell layout. |
| `_authed/_app/index.tsx` | `/` | Home / new-channel composer. |
| `_authed/_app/agents/index.tsx` | `/agents` | Agents list. |
| `_authed/_app/bots.index.tsx` | `/bots` | Bots catalog. |
| `_authed/_app/bots.$agentId.index.tsx` | `/bots/[agentId]` | Agent/bot detail home. |
| `_authed/_app/bots.$agentId.access.tsx` | `/bots/[agentId]/access` | Agent access. |
| `_authed/_app/bots.$agentId.approvals.tsx` | `/bots/[agentId]/approvals` | Agent approval rules. |
| `_authed/_app/bots.$agentId.memory.tsx` | `/bots/[agentId]/memory` | Agent memory. |
| `_authed/_app/bots.$agentId.reach.tsx` | `/bots/[agentId]/reach` | Agent reachability. |
| `_authed/_app/bots.$agentId.responsibilities.tsx` | `/bots/[agentId]/responsibilities` | Agent responsibilities. |
| `_authed/_app/bots.$agentId.routines.tsx` | `/bots/[agentId]/routines` | Agent routines. |
| `_authed/_app/bots.$agentId.setup.tsx` | `/bots/[agentId]/setup` | Agent setup. |
| `_authed/_app/bots.$agentId.sharing.tsx` | `/bots/[agentId]/sharing` | Agent sharing. |
| `_authed/_app/bot.tsx` | `/bot` | Bot view (singular). |
| `_authed/_app/team-bots.tsx` | `/team-bots` | Team bots. |
| `_authed/_app/channel/$channelId.tsx` | `/channel/[channelId]` | Channel thread. |
| `_authed/_app/channel/new.tsx` | `/channel/new` | Create channel. |
| `_authed/_app/group/$channelId.tsx` | `/group/[channelId]` | Group thread. |
| `_authed/_app/group/new.tsx` | `/group/new` | Create group. |
| `_authed/_app/approvals.tsx` | `/approvals` | User approvals. |
| `_authed/_app/memory.tsx` | `/memory` | User memory. |
| `_authed/_app/reachability.tsx` | `/reachability` | User reachability. |
| `_authed/_app/responsibilities.tsx` | `/responsibilities` | User responsibilities. |
| `_authed/_app/routines.tsx` | `/routines` | User routines. |
| `_authed/_app/skills.tsx` | `/skills` | User skills. |
| `_authed/settings/route.tsx` | — (layout) | Settings layout. |
| `_authed/settings/index.tsx` | `/settings` | Settings home. |
| `_authed/settings/approvals.tsx` | `/settings/approvals` | Settings approvals. |
| `_authed/settings/memory.tsx` | `/settings/memory` | Settings memory. |
| `_authed/settings/notifications.tsx` | `/settings/notifications` | Settings notifications. |
| `_authed/settings/passwords.tsx` | `/settings/passwords` | Settings passwords. |
| `_authed/settings/connected-accounts/index.tsx` | `/settings/connected-accounts` | Connected accounts list. |
| `_authed/settings/connected-accounts/$key.tsx` | `/settings/connected-accounts/[key]` | Connected account detail. |
| `_authed/settings/components-gallery/index.tsx` | `/settings/components-gallery` | UI gallery. |
| `_authed/settings/components-gallery/$name.tsx` | `/settings/components-gallery/[name]` | Component detail. |
| `_authed/admin/route.tsx` | — (layout) | Admin layout. |
| `_authed/admin/index.tsx` | `/admin` | Admin home. |
| `_authed/admin/approvals.tsx` | `/admin/approvals` | Admin approvals. |
| `_authed/admin/audit.tsx` | `/admin/audit` | Admin audit trail. |
| `_authed/admin/boundaries.tsx` | `/admin/boundaries` | Policy boundaries. |
| `_authed/admin/computers.tsx` | `/admin/computers` | Computers. |
| `_authed/admin/credentials.tsx` | `/admin/credentials` | Credentials. |
| `_authed/admin/enterprise.tsx` | `/admin/enterprise` | Enterprise config. |
| `_authed/admin/identity-providers.tsx` | `/admin/identity-providers` | IdP registry. |
| `_authed/admin/learning.tsx` | `/admin/learning` | Automatic learning. |
| `_authed/admin/people.tsx` | `/admin/people` | People (list/promote/demote). |
| `_authed/admin/playground.tsx` | `/admin/playground` | Components playground. |
| `_authed/admin/skills.tsx` | `/admin/skills` | Deployment skills. |
| `_authed/admin/components/index.tsx` | `/admin/components` | Components index. |
| `_authed/admin/components/$name.tsx` | `/admin/components/[name]` | Component detail. |
| `_authed/admin/plugins/index.tsx` | `/admin/plugins` | Plugins index. |
| `_authed/admin/plugins/composio.tsx` | `/admin/plugins/composio` | Composio config. |
| `_authed/admin/plugins/$key.tsx` | `/admin/plugins/[key]` | Plugin detail. |
| `_authed/admin/plugins/$key_.bots.$agentId.tsx` | `/admin/plugins/[key]/bots/[agentId]` | Plugin per-bot. |
| `_authed/admin/plugins/$key_.tools.$tool.tsx` | `/admin/plugins/[key]/tools/[tool]` | Plugin tool detail. |

Count: **60 route files** (56 navigable + 4 pathless/layout: `_authed`,
`_authed/_app`, `settings/route.tsx`, `admin/route.tsx`; `__root.tsx`
counted as root layout). Verified by recursive file listing.

### 1b) Current ORBO mobile shell (Expo Router Stack, `mobile/app/`)

| Route file | Path | Screen / purpose |
|---|---|---|
| `app/_layout.tsx` | — (layout) | Stack + push-notification deep-link wiring. |
| `app/index.tsx` | `/` | Home: session, sign-in, conversation list. |
| `app/conversation.tsx` | `/conversation` (?channelId=) | Conversation thread. |
| `app/approvals.tsx` | `/approvals` (?requestId=) | Approval inbox. |
| `app/bots.tsx` | `/bots` | Bots / routines / computers. |
| `app/bot.tsx` | `/bot` | Bot detail. |
| `app/computer.tsx` | `/computer` | Computer. |
| `app/routine.tsx` | `/routine` | Routine. |
| `app/memory.tsx` | `/memory` | Memory. |
| `app/rules.tsx` | `/rules` | Custom rules. |
| `app/plugins.tsx` | `/plugins` | Plugins. |

Count: **11 files** (10 screens + 1 stack layout). This shell is deleted
after the port; its screens fold into the unified tree (§5, §6).

---

## 2) OpenMuse screen inventory (`_sources/OpenMuse/apps/mobile/`)

OpenMuse has **no router** — a single `App.tsx` holds a `Section` state machine
plus a `Detail` overlay union (`src/workspace.tsx`), backed by the domain type
in `packages/domain/src/index.ts`.

Verified `Section` union (11 values): `today, chat, mail, calendar, browser,
files, activity, connections, ideas, goals, apps`.

Verified `Detail` overlay union (11 types): `mail, email, event, file, browser,
review, task, delegate, notifications, computer, menu`.

| File | Screen / component | Purpose |
|---|---|---|
| `App.tsx` | `App`, `WorkspaceShell` | Shell: top bar (agent status, notifications), bottom tab rail (Chat, Activity, Ideas, Goals, Apps), thread sheet, detail overlay. |
| `App.tsx` (nav) | `Section` nav | Sections: chat, activity, ideas, goals, apps (+ utility mail, calendar, browser, files, connections; today overview). |
| `src/screens.tsx` | `TodayScreen` | Day overview: calendar + inbox + pending reviews. |
| `src/screens.tsx` | `MailScreen` | Inbox list / unread / drafts; compose entry. |
| `src/screens.tsx` | `CalendarScreen` | Week/day agenda, calendar picker, new event. |
| `src/screens.tsx` | `BrowserScreen` | Persistent browser sessions list + open session. |
| `src/screens.tsx` | `FilesScreen` | Documents library (PDF import/view). |
| `src/screens.tsx` | `ActivityScreen` | Action proposals + workspace timeline / receipts. |
| `src/screens.tsx` | `ConnectionsScreen` | Google (Gmail/Calendar), agent computer, OpenBot connectors. |
| `src/agent-ui.tsx` | `AgentActivityScreen` | Task plans/progress + reviews and receipts. |
| `src/agent-ui.tsx` | `IdeasScreen` | Evidence-backed suggestions (accept/dismiss/edit). |
| `src/agent-ui.tsx` | `GoalsScreen` | Goals + tracking/monitors + milestones. |
| `src/agent-ui.tsx` | `AppsScreen` | Connections, capabilities, remembered preferences. |
| `src/agent-ui.tsx` | `TaskDetail`, `TaskCard`, `ChatWork`, `ArtifactCard` | Task detail/plan/timeline, inline task cards, artifacts (incl. finance CSV/spending/savings-goal). |
| `src/agent-ui.tsx` | `DelegateSheet`, `NotificationsSheet` | Delegate a task; notifications. |
| `src/chat.tsx` | `ChatScreen`, `WorkspaceTools` | Streamed AG-UI chat, drafts, tool cards, follow-up queue. |
| `src/threads.tsx` | `ThreadsSheet`, `ThreadsProvider` | Rich threads: main chat + side chats, rename/archive/restore. |
| `src/computer.tsx` | `ComputerSheet`, `ComputerEntry`, `BrowserThreadCard` | Agent computer + browser workspace. |
| `src/computer-workspace.tsx` | `LinuxWorkspace` | Shell/terminal + files in /workspace. |
| `src/details.tsx` | `Details` overlay | Routes detail types: mail, email draft, calendar event, file (PDF), browser, review, task, delegate, notifications, computer, menu. |
| `src/details.tsx` | `MailDetail`, `EmailEditor`, `EventEditor`, `ReviewDetail`, `FileDetail`, `BrowserDetail` | Per-detail editors and review-before-send/create flows. |

Count: **11 sections + 11 overlay types; ~24 screens/overlays** across 8 source
files (`App.tsx`, `screens.tsx`, `agent-ui.tsx`, `chat.tsx`, `threads.tsx`,
`computer.tsx`, `computer-workspace.tsx`, `details.tsx` + `workspace.tsx` types).

---

## 3) OpenDots route inventory (`_sources/OpenDots/src/client/`)

No router library — a `view` state machine in `App.tsx` plus hash deep links
for Pages (`openPageLink(#/spaces/...)`), plus `WorkspaceDialog` union types.

Verified `view` union (4 values): `chat, tasks, memories, space`.
Verified `Dialog` union (5 types): `space, dot, settings, memory, schedule`.

| Route / view | Trigger | Purpose / components |
|---|---|---|
| Unlock | 401 / no token | Owner access-token gate (`needsAuth`). |
| Loading | pre-load | Loading state. |
| `chat` (default) | rail / dot select | Continuous conversation: `Chat`, `ChatTranscript`, `ThreadList`, `CallView`, `ResultPane`, `ComputerPanel`. |
| `tasks` | Scheduled and activity nav | `TaskRow`, `TaskActions`, `TaskPresentation`, task detail card. |
| `memories` | Memories nav | Memory grid; add/edit/delete via dialog. |
| `space` | hash `#/spaces/[spaceId]` | `SpaceWorkspace`: pages tree + document. |
| `space` + page | hash `#/spaces/[spaceId]/pages/[pageId]` | `PageDocument`, `PageOutline`, `PageConversation`, `PageReviewCard`, `RichEditor`, `DocumentMenu`. |
| Space library | rail Open Spaces | `SpaceLibrary`, `SpaceNav`. |
| Dialog `space` | rail + | Create Space. |
| Dialog `dot` | rail + / edit | Create/edit a Dot (maps to Agent). |
| Dialog `memory` | memory screen | Add/edit memory. |
| Dialog `schedule` | task / page | Schedule a server-side task. |
| Dialog `settings` | rail / topbar | Settings and setup. |

Count: **4 views (chat/tasks/memories/space) + hash-deep-linked Space/Page
subsystem + 5 dialogs**; ~25 supporting components: `SpaceNav`,
`SpaceWorkspace`, `SpaceLibrary`, `PageDocument`, `PageOutline`,
`PageConversation`, `PageReviewCard`, `Chat`, `ChatTranscript`, `ThreadList`,
`ResultPane`, `ComputerPanel`, `ConnectionsSection`, `ConnectionActionCard`,
`CallView`, `TaskRow`, `TaskActions`, `TaskPresentation`, `WorkspaceDialog`,
`RichEditor`, `DocumentMenu`, plus editor helpers (`autosave`,
`use-page-autosave`, `slash-commands`, `markdown`, `page-snapshots`,
`page-review-decision`, `page-chat-requests`, `page-context`, `page-navigation`).

Realtime calls (`CallView`, `useVoice`) and per-tool access
(`ConnectionsSection`, `ConnectionActionCard`) live inside the chat/space views
rather than as separate routes.

---

## 4) Overlap / gap analysis vs target surfaces

Target surfaces per PLAN.md §3: Home, Chat, Spaces, Agents, Work, Connections,
Settings, Admin — plus Identity (PLAN.md §6: sign-in/IdP/people).

| Target surface | ORBO today | OpenMuse | OpenDots | Merge decision |
|---|---|---|---|---|
| Chat | channel/group threads, AG-UI stream | streamed chat + rich threads, drafts, follow-up queue, inline cards | continuous chat + threads + realtime calls | One Chat: 1:1/group + rich threads + calls; `(tabs)/chat`. |
| Spaces / Pages | — (gap) | Documents/PDF pipeline (Files) | Spaces + Pages editor + review-before-save | One Spaces/Pages model: OpenDots editor + OpenMuse document pipeline; `(tabs)/spaces` + `computer`. |
| Work | routines, responsibilities | Activity, Goals, Ideas, finance | tasks/activity + background research | One Work: activity + routines + goals/tracking + ideas; `(tabs)/work`. |
| Connections | connected accounts, plugins, Composio | Google (Gmail/Calendar), browser, OpenBot connectors | per-tool access, Slack, research, MCP | One Connections hub; `(app)/connections`; admin plugin config stays under `(app)/admin/plugins`. |
| Agents | bots (+ agents alias) | single personal agent | Dots | Unify bots/Dots/agent into **Agents**; DIYA pinned boss; `(tabs)/agents`. |
| Admin | full admin console (credentials, approvals, computers, boundaries, components, playground, plugins, skills, learning, people, IdP, enterprise, audit) | — | setup/settings dialog only | Keep ORBO admin console; `(app)/admin`. |
| Settings | settings subtree (approvals, memory, notifications, passwords, connected-accounts, components-gallery) | Apps and settings, profile, personal context | settings dialog | One Settings; `(app)/settings`; dialogs become deep-linkable routes. |
| Identity | sign-in, onboarding, IdP admin, people | workspace access key | owner unlock token | Canonical auth = OpenBot Better Auth only; `(auth)` group + `(app)/admin/identity-providers`; others map to single-owner mode. |
| Home | `/` composer | Today + agent status | dot-persona landing | DIYA Home = default conversation; `(tabs)/index`. |

Gaps to close (no ORBO route today, new subtrees required): OpenMuse
**Documents/PDF, Finance, Goals, Ideas, Activity** and OpenDots **Spaces/Pages,
realtime calls** become Work, Spaces, and Connections subtrees. Finance cards
fold into Work/Activity artifacts; calls fold into Chat thread view.

---

## 5) Proposed FINAL Expo Router route tree

One Expo app rooted at `app/`. Groups: `(auth)` = unauthenticated stack;
`(app)` = authenticated shell with a `(tabs)` navigator + stacks. Web renders
the side rail, native renders bottom tabs — same tree.

```text
app/
├─ _layout.tsx                    Root stack: QueryClient, provider bootstrap,
│                                 SafeArea, theme, session bootstrap,
│                                 deep-link + push-notification wiring.
├─ +not-found.tsx                 Fallback route for unknown paths / bad deep links.
│
├─ (auth)/                        Unauthenticated group.
│  ├─ _layout.tsx                 Auth stack layout (no tabs; centering shell).
│  ├─ sign-in.tsx                 Provider sign-in (Google/Microsoft/Okta) + SSO email entry.
│  ├─ callback/
│  │  └─ [requestId].tsx          OAuth/SSO/sign-in callback; consumes request id.
│  └─ onboarding.tsx              First-run onboarding + workspace setup.
│
└─ (app)/                         Authenticated group (session-guarded).
   ├─ _layout.tsx                 Session guard + tab navigator + global drawers
   │                              (threads sheet, notifications sheet).
   │
   ├─ (tabs)/                     Primary navigation.
   │  ├─ _layout.tsx              Tabs: Home, Chat, Spaces, Work, Agents (web: side rail).
   │  ├─ index.tsx                Home — DIYA default conversation + composer (+ work cards).
   │  ├─ chat/
   │  │  ├─ _layout.tsx           Chat stack layout.
   │  │  ├─ index.tsx             Conversation list / recent threads.
   │  │  ├─ [channelId].tsx       Unified 1:1 or group thread (streamed AG-UI, tools, drafts).
   │  │  ├─ new.tsx               Start a chat (pick agents / recipients).
   │  │  └─ group/
   │  │     └─ new.tsx            Create a group conversation (multi-agent).
   │  ├─ spaces/
   │  │  ├─ _layout.tsx           Spaces stack layout.
   │  │  ├─ index.tsx             Spaces/Pages library (grid/list).
   │  │  └─ [spaceId]/
   │  │     ├─ index.tsx          Space home + page tree.
   │  │     └─ pages/
   │  │        └─ [pageId].tsx    Page document editor + conversation + review card.
   │  ├─ work/
   │  │  ├─ _layout.tsx           Work stack layout.
   │  │  ├─ index.tsx             Activity: durable plans, progress, receipts, requests.
   │  │  ├─ routines.tsx          Routines / scheduled tasks (pause/retry).
   │  │  ├─ goals.tsx             Goals + tracking/monitors + milestones.
   │  │  └─ ideas.tsx             Evidence-backed ideas (edit/accept/dismiss).
   │  └─ agents/
   │     ├─ _layout.tsx           Agents stack layout.
   │     ├─ index.tsx             Agents list (DIYA pinned boss + specialists).
   │     ├─ new.tsx               Create/configure an agent.
   │     ├─ team.tsx              Team agents / shared catalog.
   │     └─ [agentId]/
   │        ├─ _layout.tsx        Agent profile stack (section tabs).
   │        ├─ index.tsx          Agent home / profile + role + instructions.
   │        ├─ access.tsx         Access control.
   │        ├─ approvals.tsx      Per-agent approval rules.
   │        ├─ memory.tsx         Agent memory configuration.
   │        ├─ reach.tsx          Reachability / channels (Slack/Teams/SMS).
   │        ├─ responsibilities.tsx  Responsibilities.
   │        ├─ routines.tsx       Agent routines.
   │        ├─ sharing.tsx        Sharing / grants.
   │        └─ setup.tsx          Endpoint + auth header + tools setup.
   │
   ├─ connections/
   │  ├─ _layout.tsx              Connections stack layout.
   │  ├─ index.tsx                Hub: Google (Gmail/Calendar), MCP, Slack, browser/computer.
   │  ├─ [providerId].tsx         Per-connection setup / status / capabilities.
   │  ├─ tools.tsx                Per-tool access + approval + pause.
   │  └─ browser.tsx              Browser/research worker sessions + capture.
   │
   ├─ computer/
   │  └─ index.tsx                Agent computer workspace: shell, files, browser takeover.
   │
   ├─ approvals.tsx               Unified approval inbox (user-level).
   ├─ notifications.tsx           Notifications (also presented as a sheet on native).
   ├─ memory.tsx                  User memory (prefs usable by permitted agents).
   │
   ├─ settings/
   │  ├─ _layout.tsx              Settings stack layout.
   │  ├─ index.tsx                Settings home: profile, personal context, appearance.
   │  ├─ profile.tsx              Identity / name / tone / avatar.
   │  ├─ memory.tsx               Memory preferences.
   │  ├─ notifications.tsx        Notification preferences.
   │  ├─ approvals.tsx            Approval preferences.
   │  ├─ passwords.tsx            Saved passwords (write-only).
   │  ├─ connected-accounts/
   │  │  ├─ index.tsx             Connected accounts list.
   │  │  └─ [key].tsx             Connected account detail.
   │  └─ components-gallery/
   │     ├─ index.tsx             Component gallery.
   │     └─ [name].tsx            Component detail.
   │
   └─ admin/
      ├─ _layout.tsx              Admin-only gate + stack layout.
      ├─ index.tsx                Admin home.
      ├─ approvals.tsx            Admin approvals.
      ├─ audit.tsx                Audit trail (permitted/refused/failed + rule).
      ├─ boundaries.tsx           Policy boundaries / presets.
      ├─ computers.tsx            Computers.
      ├─ credentials.tsx          Credentials (write-only, encrypted).
      ├─ enterprise.tsx           Enterprise configuration.
      ├─ identity-providers.tsx   IdP registry (SAML/OIDC at runtime).
      ├─ learning.tsx             Automatic learning.
      ├─ people.tsx               People (list/promote/demote/remove).
      ├─ playground.tsx           Sandboxed components playground.
      ├─ skills.tsx               Deployment skills.
      ├─ components/
      │  ├─ index.tsx             Components index.
      │  └─ [name].tsx            Component detail.
      └─ plugins/
         ├─ index.tsx             Plugins index.
         ├─ composio.tsx          Composio brokering config.
         └─ [key]/
            ├─ index.tsx          Plugin detail.
            ├─ bots/
            │  └─ [agentId].tsx   Plugin enable/allowlist per agent.
            └─ tools/
               └─ [tool].tsx      Plugin tool detail / permissions.
```

Expo Router specifics:

- **Auth grouping**: `(auth)` is unauthenticated; `(app)` is the authenticated
  shell (mirrors the ORBO `_authed` split). `onboarding` is gated inside
  `(auth)` before the shell unlocks.
- **Dynamic params**: [channelId], [spaceId], [pageId], [agentId], [key],
  [name], [tool], [requestId], [providerId]. Deep links and push targets map
  to these; hash links (`#/spaces/...`) migrate to real paths.
- **Tabs/drawer/stack**: `(tabs)/_layout.tsx` renders bottom tabs on native
  and a side rail on web; each tab owns a nested stack for details.
  Admin/settings are stack subtrees (full screen on mobile, panel on web).
- **Tauri desktop**: wraps the web export unchanged (same routes and deep
  links); only window chrome, file associations, and the updater differ.
  No tree changes.
- **Naming**: merge bots into **Agents**; the TanStack dotted escape
  (`$key_.bots.$agentId`) becomes a real `[key]/bots/[agentId]` folder.

---

## 6) Mapping: current route to new Expo Router route

| Current route (ORBO / other) | New Expo Router route | Merged source |
|---|---|---|
| `__root.tsx` | `app/_layout.tsx` | ORBO shell. |
| `sign.tsx` | `(auth)/sign-in.tsx` | ORBO auth. |
| `sign-in/$requestId.tsx` | `(auth)/callback/[requestId].tsx` | ORBO auth. |
| `onboarding.tsx` | `(auth)/onboarding.tsx` | OpenBot + OpenMuse setup. |
| `_app/index.tsx` | `(tabs)/index.tsx` | ORBO + DIYA Home. |
| `channel/$channelId.tsx` | `(tabs)/chat/[channelId].tsx` | OpenBot + OpenMuse + OpenDots. |
| `channel/new.tsx`, `group/new.tsx` | `(tabs)/chat/new.tsx`, `(tabs)/chat/group/new.tsx` | OpenBot. |
| `group/$channelId.tsx` | `(tabs)/chat/[channelId].tsx` (shared) | OpenBot + OpenDots. |
| OpenDots `view=space` `#/spaces/[spaceId]` | `(tabs)/spaces/[spaceId]/index.tsx` | OpenDots Spaces. |
| OpenDots `#/spaces/[spaceId]/pages/[pageId]` | `(tabs)/spaces/[spaceId]/pages/[pageId].tsx` | OpenDots Pages. |
| OpenMuse FilesScreen (Documents/PDF) | `(tabs)/spaces/index.tsx` + `computer/index.tsx` | OpenMuse Documents. |
| ORBO `agents/index.tsx` | `(tabs)/agents/index.tsx` | ORBO. |
| `bots.index.tsx` | `(tabs)/agents/index.tsx` | ORBO (bots fold into agents). |
| `bot.tsx` | `(tabs)/agents/[agentId]/index.tsx` | ORBO. |
| `bots.$agentId.index.tsx` | `(tabs)/agents/[agentId]/index.tsx` | ORBO. |
| `bots.$agentId.access.tsx` | `(tabs)/agents/[agentId]/access.tsx` | ORBO. |
| `bots.$agentId.approvals.tsx` | `(tabs)/agents/[agentId]/approvals.tsx` | ORBO. |
| `bots.$agentId.memory.tsx` | `(tabs)/agents/[agentId]/memory.tsx` | ORBO + OpenMuse memory. |
| `bots.$agentId.reach.tsx` | `(tabs)/agents/[agentId]/reach.tsx` | ORBO. |
| `bots.$agentId.responsibilities.tsx` | `(tabs)/agents/[agentId]/responsibilities.tsx` | ORBO + OpenMuse. |
| `bots.$agentId.routines.tsx` | `(tabs)/agents/[agentId]/routines.tsx` | ORBO + OpenDots. |
| `bots.$agentId.setup.tsx` | `(tabs)/agents/[agentId]/setup.tsx` | ORBO. |
| `bots.$agentId.sharing.tsx` | `(tabs)/agents/[agentId]/sharing.tsx` | ORBO. |
| `team-bots.tsx` | `(tabs)/agents/team.tsx` | ORBO. |
| OpenDots `dialog=dot` (create/edit) | `(tabs)/agents/new.tsx` + `[agentId]/setup.tsx` | OpenDots Dots fold into Agents. |
| ORBO `routines.tsx` | `(tabs)/work/routines.tsx` | ORBO + OpenDots. |
| `responsibilities.tsx` | `(tabs)/work/goals.tsx` | ORBO + OpenMuse Goals. |
| OpenMuse `AgentActivityScreen` / `ActivityScreen` | `(tabs)/work/index.tsx` | OpenMuse Activity. |
| OpenMuse `GoalsScreen` | `(tabs)/work/goals.tsx` | OpenMuse Goals. |
| OpenMuse `IdeasScreen` | `(tabs)/work/ideas.tsx` | OpenMuse Ideas. |
| ORBO `approvals.tsx` | `(app)/approvals.tsx` | ORBO + OpenMuse + OpenDots. |
| OpenMuse `ConnectionsScreen` | `(app)/connections/index.tsx` | OpenMuse + OpenBot + OpenDots. |
| `settings/connected-accounts/*` | `(app)/connections/[providerId].tsx` + `settings/connected-accounts/*` | ORBO + OpenMuse. |
| OpenDots `dialog=settings` | `(app)/settings/index.tsx` | OpenDots Settings. |
| ORBO `memory.tsx` | `(app)/memory.tsx` | All three. |
| ORBO `reachability.tsx` | `(tabs)/agents/[agentId]/reach.tsx` + connections | ORBO. |
| ORBO `skills.tsx` | `(app)/admin/skills.tsx` (+ personal skills in settings) | ORBO. |
| `settings/route.tsx` + children | `(app)/settings/_layout.tsx` + children | ORBO. |
| `admin/route.tsx` + children | `(app)/admin/_layout.tsx` + children | ORBO. |
| `admin/plugins/$key_.bots.$agentId.tsx` | `(app)/admin/plugins/[key]/bots/[agentId].tsx` | ORBO. |
| `admin/plugins/$key_.tools.$tool.tsx` | `(app)/admin/plugins/[key]/tools/[tool].tsx` | ORBO. |
| `admin/plugins/$key.tsx` | `(app)/admin/plugins/[key]/index.tsx` | ORBO. |
| Mobile `index/conversation/approvals/...` | folds into `(tabs)/chat/[channelId]`, `(app)/approvals`, `(tabs)/work`, `(tabs)/agents` | ORBO mobile shell deleted. |

---

## 7) Migration notes and risks

**TanStack Router to Expo Router**

- File-based conventions differ: TanStack uses `$param` and dotted flat routes
  (`bots.$agentId.index.tsx`); Expo Router uses folders + `[param]` segments
  and `_layout.tsx`. The dotted `$key_.bots.$agentId` escape splits into a
  real `[key]/bots/[agentId]` folder path.
- Pathless layouts (underscore prefix) become **route groups** (parentheses).
  `_authed` maps to `(auth)` + `(app)`; `_app` disappears into the `(tabs)`
  navigator.
- `route.tsx` directory layouts become `_layout.tsx`.
- `__root.tsx` providers move into `app/_layout.tsx`; the bootstrap in
  `app/src/main.tsx` (`RouterProvider` + `queryClient`) is replaced by Expo
  Router plus the shared QueryClient provider.

**Navigation model**

- Replace the OpenBot/OpenMuse side rail + OpenMuse bottom rail + OpenDots
  icon rail with one `(tabs)` navigator (bottom tabs on native, side rail
  on web).
- Overlays/sheets in OpenMuse (`Detail` union) and OpenDots dialogs (`space`,
  `dot`, `memory`, `schedule`, `settings`) become **routes** (deep-linkable)
  with a native sheet presentation where appropriate.
- Rich threads (main + side chats) map to `chat/[channelId]` with a threads
  drawer rather than a modal-only sheet.
- Hash deep links (`#/spaces/[spaceId]/pages/[pageId]`) migrate to real
  paths; ship a redirect map during transition.

**Tauri desktop notes**

- Tauri wraps the exported web build; routing is identical. Configure per-OS
  installers and the updater; deep links must be registered in both
  `tauri.conf.json` and Expo `app.json`.
- No separate desktop UI or route tree (PLAN.md §3).
- Window chrome, file associations (PDF/documents), and auto-update are the
  only desktop deltas.

**Risks**

| Risk | Mitigation |
|---|---|
| Param-name churn (`$agentId` vs [agentId]) breaks deep links/bookmarks | Ship redirect map during transition; keep notification URLs joined against route ids. |
| Path collision `[key]` file + `[key]/` folder | Model plugin as `[key]/index.tsx` (already reflected in §5 tree). |
| Auth split differs (OpenBot Better Auth vs OpenMuse access key vs OpenDots owner token) | Canonical auth = OpenBot Better Auth; others map to single-owner mode. |
| Tabs vs stack UX regressions on wide web vs native | One tree, platform-conditional navigator in `(tabs)/_layout.tsx`. |
| Orphaned screens when Vite/web + mobile shells are deleted | Port in PLAN.md §8 phase order with parity-matrix tracking; delete only after parity. |
| Native-only capabilities (PDF render, calls, notifications) leaking into web tree | Platform-split components (`.native.tsx` / `.web.tsx`) as OpenMuse already does. |

---

© Opraiz Technology Pvt Ltd · Developer: Narein Rao
