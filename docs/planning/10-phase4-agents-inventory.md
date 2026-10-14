# 10 — Phase 4 Agents-Surface Inventory (PLAN.md §8 item 4)

Research only — no product code changed. Verified on disk 2026-10-14.
Scope: the AGENTS surface = roster + Bot profile + direct Bot chat + lifecycle + team publishing.
Target tree: `docs/planning/03-route-tree.md` §5–§6 (`(tabs)/agents/**`).

Counts: **13** TanStack route files · **22** component files · **16** data-layer modules · **35** server endpoints (3 mounts).

---

## 1) Route inventory (current → target → purpose)

| # | Current TanStack route file | Target Expo route | Purpose |
|---|---|---|---|
| R1 | `app/src/routes/_authed/_app/agents/index.tsx` | — (redirect deleted) | Legacy `/agents` redirect → `/bots` or `/bots/$agentId` via `legacyAgentsTarget`. |
| R2 | `app/src/routes/_authed/_app/bots.index.tsx` | `(tabs)/agents/index.tsx` | Bots roster + `?new=` create dialog; entry point of the surface. |
| R3 | `app/src/routes/_authed/_app/bots.$agentId.index.tsx` | `(tabs)/agents/[agentId]/index.tsx` | Bot profile home; renders `BotProfile` + `ManageSection` + `BotSettingsRows`. |
| R4 | `app/src/routes/_authed/_app/bots.$agentId.access.tsx` | `(tabs)/agents/[agentId]/access.tsx` | Skills/apps/other-Bots this Bot may use (`AccessSections`). |
| R5 | `app/src/routes/_authed/_app/bots.$agentId.approvals.tsx` | `(tabs)/agents/[agentId]/approvals.tsx` | Per-Bot approval rules (`BotApprovalRules`). |
| R6 | `app/src/routes/_authed/_app/bots.$agentId.memory.tsx` | `(tabs)/agents/[agentId]/memory.tsx` | Memory sources + proactive-research settings; links to Settings → Memory. |
| R7 | `app/src/routes/_authed/_app/bots.$agentId.reach.tsx` | `(tabs)/agents/[agentId]/reach.tsx` | Reachability / channels (`ReachingYou`: Slack/Teams/SMS). |
| R8 | `app/src/routes/_authed/_app/bots.$agentId.responsibilities.tsx` | `(tabs)/agents/[agentId]/responsibilities.tsx` | Lasting goals, runs, findings (`BotResponsibilities`). |
| R9 | `app/src/routes/_authed/_app/bots.$agentId.routines.tsx` | `(tabs)/agents/[agentId]/routines.tsx` | Scheduled work list (`RoutinesList` scoped by `agentId`). |
| R10 | `app/src/routes/_authed/_app/bots.$agentId.setup.tsx` | `(tabs)/agents/[agentId]/setup.tsx` | Identity/visibility/endpoint (`SetupSections` + callback token). |
| R11 | `app/src/routes/_authed/_app/bots.$agentId.sharing.tsx` | `(tabs)/agents/[agentId]/sharing.tsx` | Who else may use this Bot (`SharingSections`; team publishing). |
| R12 | `app/src/routes/_authed/_app/bot.tsx` | `(tabs)/agents/[agentId]/index.tsx` (+ chat affordance) | Direct chat with one Bot (`?agent=`, `?watch=`); `CopilotChat` + computer panel. |
| R13 | `app/src/routes/_authed/_app/team-bots.tsx` | `(tabs)/agents/team.tsx` | Legacy `/team-bots` redirect → `/bots`; content moves to team view. |

---

## 2) Component inventory (file → purpose → data deps)

| File | Purpose | Data deps |
|---|---|---|
| `app/src/components/bots/bot-roster.tsx` | The one roster: Needs-you / Pinned / Yours / Shared + hidden foldaway | `agentListQueryOptions(x2)`, `botAttentionQueryOptions`, `groupRoster` |
| `app/src/components/agents/create-agent-dialog.tsx` | Wizard: identity → visibility → endpoint; tests connection before create | `agentFormSchema`, `createAgentMutationOptions`, `agentCapabilitiesQueryOptions`, `testAgentConnection` |
| `app/src/components/agents/agent-card.tsx` | Roster/chat card, compact + artwork variants | `AgentProfile` (props only) |
| `app/src/components/agents/abstract-avatar.tsx` | Seeded avatar primitive used by cards/roster/panels | props only (`boring-avatars`) |
| `app/src/components/agents/agent-profile.tsx` | Side-panel "who am I talking to" card beside chat | `agentQueryOptions` |
| `app/src/components/agents/callback-token-panel.tsx` | Issue/rotate/revoke callback credential (show-once) | `issue/revokeCallbackTokenMutationOptions` |
| `app/src/components/agents/handoff-panel.tsx` | Directional Bot→Bot grant switches | `agentHandoffQueryOptions`, `agentListQueryOptions`, `handoffRoster`, `setHandoffGrantMutationOptions` |
| `app/src/components/agents/proposed-bot.tsx` | In-conversation Bot-proposal card (approve/decline → create) | `proposal.ts` (`checkProposal`, `botCardAnswer`) |
| `app/src/components/agents/orb/agent-orb.tsx` | Animated agent-state orb (decorative status) | `orb/ai-core.tsx` (`AIState`) |
| `app/src/components/agents/orb/ai-core.tsx` | Shared `AIState` motion contract for orb/input/tool-card | none (motion only) |
| `app/src/components/bot-profile/bot-subpage.tsx` | Frame for every `/bots/$agentId/<area>` page (back-link + errors) | `agentQueryOptions` |
| `app/src/components/bot-profile/profile.tsx` | Profile home body: status, pause, activity, suggestions | `agent*` + `bot-lifecycle` queries/mutations |
| `app/src/components/bot-profile/settings-rows.tsx` | Settings summary rows linking to the 8 subpages | `bot-summaries`, approvals/auth/delivery/memory/proactive/responsibilities/plugins queries |
| `app/src/components/bot-profile/manage.tsx` | Danger zone: hide/unhide, pin, duplicate, reset, delete | `agents/mutations`, `resetBotMutationOptions`, `botResetPlan` |
| `app/src/components/bot-profile/access.tsx` | Skills/apps/handoff grants matrix for one Bot | `agentHandoffQueryOptions`, `plugins` queries/mutations |
| `app/src/components/bot-profile/setup.tsx` | Edit identity/visibility/endpoint + token panel | `updateAgentMutationOptions`, `CallbackTokenPanel` |
| `app/src/components/bot-profile/sharing.tsx` | Team publishing + assignments + consent state | `team-bots.ts` queries/mutations |
| `app/src/components/bot-profile/activity.tsx` | In-progress/scheduled/completed activity + stop/cancel | `botActivityQueryOptions`, `stopHandoff`/`cancelFollowUp` mutations |
| `app/src/components/bot-profile/attention.tsx` | Waiting-count helpers + sidebar badge derivation | `botAttentionQueryOptions` |
| `app/src/components/bot-profile/pause-banner.tsx` | Paused-state banner + resume control | `botLifecycleQueryOptions`, `setBotPausedMutationOptions` |
| `app/src/components/approvals/bot-rules.tsx` | Per-Bot approval-rule editor (used by R5) | approvals lib (`approvalInboxOptions`, `ruleCoversBot`) |
| `app/src/components/channels/team-bot-consent.tsx` + `app/src/components/skills/skill-agents.tsx` | Team-Bot consent card in chat; skill→agents grant row | `team-bots.ts`; `plugins` queries |

---

## 3) Data-layer inventory

| Module | Exposes |
|---|---|
| `app/src/lib/agents/queries.ts` | `AgentProfile`, `agentKeys`, list/detail/handoff/capabilities options, `testAgentConnection`, `agentApiPath` |
| `app/src/lib/agents/mutations.ts` | create/update/duplicate/hide/pin/delete, callback-token issue/revoke, `setHandoffGrantMutationOptions` |
| `app/src/lib/agents/form.ts` | `agentFormSchema`, `emptyAgentForm`, `agentInputFrom`, `profileUpdateInput` |
| `app/src/lib/agents/roster.ts` | `groupRoster` (needsYou/pinned/yours/shared split) |
| `app/src/lib/agents/legacy-routes.ts` | `legacyAgentsTarget`, `LEGACY_PAGES` redirect map |
| `app/src/lib/agents/default-agent.ts` | `defaultAgentProfile`/`defaultAgentId` (+ `PICKED_HARNESS_AGENT_ID`) |
| `app/src/lib/agents/proposal.ts` | `proposedBotSchema`, `checkProposal`, `botCardAnswer`, `describeBots/describeBot/describeGrantableSkills` |
| `app/src/lib/agents/answers.ts` | `answerListBots/answerReadBot/answerListBotSkills` (cold-cache-safe tool answers) |
| `app/src/lib/agents/grant-roster.ts` | `grantRoster` (hidden-but-granted rows for connector screens) |
| `app/src/lib/agents/handoff-roster.ts` | `handoffRoster` (candidates/granted/total for handoff panel) |
| `app/src/lib/agents/bot-names.ts` | `useBotNames` id→name map for admin read surfaces |
| `app/src/lib/agents/bot-summaries.ts` | `accessSummary/sharingSummary/setupSummary` row sentences |
| `app/src/lib/bot-lifecycle/queries.ts` | `botAttention/lifecycle/activity/resetPlan/routing` options (+ polling intervals) |
| `app/src/lib/bot-lifecycle/mutations.ts` | pause/resume, notify, reset, stop-handoff, cancel-follow-up, set-routing |
| `app/src/lib/team-bots.ts` | `TeamBot/TeamBotsData`, list/publish/unpublish/assign/consent options |
| `app/src/lib/copilot/active-bot.tsx` + `bot-thread.ts` + `bot-tools.tsx` | Active-Bot context; per-Bot thread persistence; `list_bots/read_bot/propose` chat tools |

---

## 4) Server API routes

Mounted in `server/src/app.ts`: `/api/agents` → `server/src/agents/routes.ts`; `/api/bots` → `server/src/agents/lifecycle-routes.ts`; `/api/team-bots` → `server/src/team-bots/routes.ts`.

| Method + path | Handler file | Purpose |
|---|---|---|
| `GET /api/agents` (+`?hidden=true`) | `agents/routes.ts` | Permission-filtered roster (visible or hidden slice) |
| `GET /api/agents/capabilities` | `agents/routes.ts` | `builtInAvailable` for the create wizard |
| `GET /api/agents/:agentId` | `agents/routes.ts` | One profile DTO (`canManage/mine/builtIn/hasAuth/hasCallbackToken`) |
| `POST /api/agents` | `agents/routes.ts` | Create (validates endpoint/visibility/auth; writes `bot.created`) |
| `PATCH /api/agents/:agentId` | `agents/routes.ts` | Full-profile update (+ `sharedApps` exposure check on publish) |
| `POST /api/agents/test-connection` | `agents/routes.ts` | Pre-save endpoint probe (200 with verdict, never 4xx on unreachable) |
| `POST /api/agents/:agentId/duplicate` | `agents/routes.ts` | Copy (records `bot.duplicated` against the copy) |
| `POST /api/agents/:agentId/hide` / `…/unhide` | `agents/routes.ts` | Per-person hide (display pref, not a grant) |
| `POST /api/agents/:agentId/pin` / `…/unpin` | `agents/routes.ts` | Per-person pin |
| `POST /api/agents/:agentId/callback-token` | `agents/routes.ts` | Issue/rotate show-once credential |
| `DELETE /api/agents/:agentId/callback-token` | `agents/routes.ts` | Revoke callback credential |
| `DELETE /api/agents/:agentId` | `agents/routes.ts` | Soft-delete (`bot.deleted`) |
| `GET /api/agents/:agentId/handoff` | `agents/routes.ts` | `{enabled, canGrant, reachable, grantable}` |
| `POST /api/agents/:agentId/declined` | `agents/routes.ts` | Self-reported refusal → `bot.declined` audit row |
| `GET /api/bots/attention` | `agents/lifecycle-routes.ts` | Per-Bot waiting counts + paused + notify (sidebar/roster badges) |
| `GET /api/bots/routing` / `PUT /api/bots/routing/:kind` | `agents/lifecycle-routes.ts` | Update transports per kind (progress/decision/question) |
| `GET /api/bots/:agentId/lifecycle` | `agents/lifecycle-routes.ts` | Caller-relative paused/notify state |
| `POST /api/bots/:agentId/pause` / `…/resume` | `agents/lifecycle-routes.ts` | Pause own relationship (stops turns) / resume |
| `PUT /api/bots/:agentId/notifications` | `agents/lifecycle-routes.ts` | `all/needs_input/none` per Bot |
| `GET /api/bots/:agentId/reset` / `POST …/reset` | `agents/lifecycle-routes.ts` | Reset plan (per-kind counts) / confirmed execute |
| `GET /api/bots/:agentId/activity` | `agents/lifecycle-routes.ts` | In-progress/scheduled/completed for one Bot |
| `POST /api/bots/:agentId/activity/handoffs/stop` | `agents/lifecycle-routes.ts` | Stop a delegated task |
| `POST /api/bots/:agentId/follow-ups/cancel` | `agents/lifecycle-routes.ts` | Cancel a scheduled follow-up |
| `GET /api/team-bots` | `team-bots/routes.ts` | Published catalog + publishable mine |
| `PUT /api/team-bots/:botId/publication` | `team-bots/routes.ts` | Publish (team/people + emails/groups; returns `sharedApps`) |
| `DELETE /api/team-bots/:botId/publication` | `team-bots/routes.ts` | Unpublish |
| `POST /api/team-bots/:botId/assignments` | `team-bots/routes.ts` | Admin-assign Bot into a group sidebar |
| `DELETE /api/team-bots/:botId/assignments/:group` | `team-bots/routes.ts` | Remove assignment |
| `POST /api/team-bots/:botId/consents` | `team-bots/routes.ts` | Teammate consent decision for a Team Bot |
| `DELETE /api/team-bots/consents` | `team-bots/routes.ts` | Clear all consents |

---

## 5) Port complexity + coupling risks

S = lift-and-shift · M = needs Expo/nav rework · L = architectural (native state, realtime, cross-subsystem).

| Item | Cx | Coupling risks |
|---|---|---|
| R2 roster + `BotRoster` + `groupRoster`/`attention` | M | Polling (15s) → RN background/battery; badge source shared with sidebar — keep one `attention` query. |
| `CreateAgentDialog` wizard + `form.ts` + capabilities | M | `motion/react` + `react-use-measure` have no RN equivalent; rebuild as stacked Expo routes (`agents/new.tsx`); keep zod schema shared. |
| R3 profile home + `BotSubpage` frame | S | Back-nav semantics differ (TanStack `Link params` → Expo `useLocalSearchParams`); keep frame component. |
| R4 access + `HandoffPanel` + plugin grants | L | Joins agents + plugins + `plugin_grants(kind=bot)`; hidden-vs-granted roster rule (`handoffRoster`) must be preserved or revocation UI loses rows. |
| R5 approval rules (`approvals/bot-rules`) | M | Shared with Approvals subsystem (Phase 7 unify); port read-only first, rule editing second. |
| R6 memory (`MemorySources` + proactive panel) | M | Crosses into Memory subsystem; per-agent scoping (`agentId`) must survive the merge. |
| R7 reach (`ReachingYou`) | M | Depends on Delivery subsystem (Slack/Teams/SMS); port after Connections. |
| R8/R9 responsibilities + routines lists | M | Shared Work-subsystem components reused with `agentId` filter; polling on activity (10s). |
| R10 setup + `CallbackTokenPanel` | S | Show-once token must never enter query cache (currently `useState` — keep that invariant on native). |
| R11 sharing + team-bots API | M | `afterExposureChange` shared-app side effects; publish flow touches plugins shared-use. |
| R12 direct chat (`bot.tsx`: `CopilotChat`, `useBotThread`, `useStoppedTurn`, computer panel) | L | Hardest: CopilotKit chat + `localStorage` thread ids + computer takeover have no Expo counterparts yet; needs AG-UI chat primitive (Phase 7) first. |
| R1/R13 legacy redirects | S | Preserve `legacyAgentsTarget` + `LEGACY_PAGES` map; chat transcripts contain old `/agents?agent=` links. |
| `proposed-bot` + `bot-tools` + `answers`/`proposal` | L | In-chat creation writes as the person (`POST /api/agents` + `bot.created` audit); `BOT_CREATOR_SLUG` contract with tenant package; sentence-parsed `createdBotIdIn` is brittle — port with its test. |
| Lifecycle (pause/reset/notify/routing/activity) | M | Caller-relative semantics ("pause stops work *for me*"); reset deletes conversations → must invalidate chat cache too. |
| `orb/*` + `agent-card` artwork | S | Pure UI; defer to design-system pass (`04-design-system.md`). |

Top coupling risks: **(1)** hidden-vs-granted roster rule — any naive `GET /api/agents` join silently drops revokable grants; **(2)** direct-chat stack (CopilotKit/`localStorage`/computer) blocks R12 until the unified AG-UI chat exists; **(3)** access/sharing/memory/reach each join a *different* subsystem (plugins, team-bots, memory, delivery) — port the read seams first, writes second.

---

## 6) Suggested port order

1. Roster + frame + profile home (R2, R3, `BotSubpage`, `groupRoster`, `bot-summaries`) — skeleton of `(tabs)/agents/**`.
2. Create wizard as `agents/new.tsx` (keep `form.ts` schema verbatim).
3. Setup + tokens + manage (R10, danger zone) — needs only agents API.
4. Lifecycle: attention/pause/notify/activity/reset (badges + `BotNeedsYou` ordering).
5. Sharing + team view (R11, R13, team-bots API).
6. Access + handoff (R4) with plugins seam; approvals/memory/reach/responsibilities/routines (R5–R9) with their subsystems.
7. In-chat proposal tools (`proposed-bot`, `bot-tools`) after chat primitive lands.
8. Direct Bot chat (R12) last — depends on unified AG-UI chat + computer workspace.
9. Delete legacy redirects only after parity matrix signs off (PLAN.md §9).

© Opraiz Technology Pvt Ltd · Developer: Narein Rao
