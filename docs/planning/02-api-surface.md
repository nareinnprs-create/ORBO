# API Surface Unification (PLAN.md §10.C item 23)

Status: design (Phase 3 — feature merge). Phase 2 rebrand complete.
Goal: one Hono API (`server/src/app.ts`) as the single canonical surface. Method: inventory all
three HTTP surfaces, keep ORBO's shape, map every overlapping concept to one `/api/<resource>`
path, record aliases/deletions.

| Source | Server entry | Framework | Role |
| --- | --- | --- | --- |
| ORBO | `server/src/app.ts:432` (`createApp`) | Hono + Bun | Base. Canonical. |
| OpenMuse | `_sources/OpenMuse/apps/server/src/app.ts` | Hono (Node) | Feature upstream. |
| OpenDots | `_sources/OpenDots/src/server/app.ts` | Hono + Bun | Feature upstream. |

All three are HTTP Hono servers, so all reconcile onto one router. OpenMuse
`packages/{backends,domain,integrations}` are libraries with **no route registrations** (not HTTP
APIs); `apps/computer` and `apps/worker` are compute/proxy processes. Out of scope.

---

## 1. ORBO server route inventory

Mount sites in `server/src/app.ts`; paths are **full mounted paths**. `U`=`requireUser`,
`A`=`requireAdmin`, `S`=shared secret/service, `N`=none.

### Core, auth, settings, admin

| Method | Path | Handler (file:line) |
| --- | --- | --- |
| GET | `/health` | `app.ts:436` |
| GET | `/api/capabilities` | `app.ts:440` |
| GET | `/api/me` | `app.ts:621` |
| POST | `/api/me/onboarding` | `app.ts:636` |
| GET | `/api/desktop/connection-failure` | `desktop-connection-failure.ts:35` |
| POST | `/api/model-provider/v1/chat/completions` | `provider-oauth.ts:341` |
| GET,POST | `/api/auth/*` | `app.ts:502` |
| PUT,PATCH,DELETE | `/api/auth/scim/*` | `app.ts:591` |
| GET | `/api/admin/identity-providers` | `app.ts:987` |
| DELETE | `/api/admin/identity-providers/:providerId` | `app.ts:1009` |
| GET | `/api/admin/people` | `app.ts:799` |
| POST | `/api/admin/people/:userId/role`\|`/access` | `app.ts:845,918` |
| GET,POST | `/api/admin/credentials` | `app.ts:1046,1060` |
| POST | `/api/admin/credentials/:id/rotate`, `/:id/revoke` | `app.ts:1083,1119` |
| GET | `/api/admin/status`,`/audit-events`,`/package` | `app.ts:769,773,1150` |
| GET,PATCH | `/api/settings/preferences` | `user-preferences-routes.ts:23,33` |
| GET,PUT | `/api/settings/instructions` | `app.ts:682,696` |
| GET | `/api/admin/learning/{settings,overview,status/:id}` | `learning/routes.ts:64,67,111,142` |
| PUT | `/api/admin/learning/settings` | `learning/routes.ts` (settings only) |
| GET,PUT,DELETE,POST | `/api/admin/enterprise/{me,/capabilities,settings/:key,network,network/:scopeKind,models/usage,actions,people/:id/terminate-computers,computers/terminate-inactive}` | `admin/routes.ts:78-368` |

### Agents / bots

| Method | Path | Handler |
| --- | --- | --- |
| GET,POST | `/api/agents/` | `agents/routes.ts:372,481` |
| GET,PATCH,DELETE | `/api/agents/:agentId` | `agents/routes.ts:394,528,706` |
| GET | `/api/agents/capabilities` | `agents/routes.ts:390` |
| POST | `/api/agents/test-connection` | `agents/routes.ts:422` |
| POST | `/api/agents/:id/{duplicate,hide,unhide,pin,unpin}` | `agents/routes.ts:585,605,619,633,647` |
| POST,DELETE | `/api/agents/:id/callback-token` | `agents/routes.ts:669,689` |
| GET | `/api/agents/:id/handoff` | `agents/routes.ts:730` |
| POST | `/api/agents/:id/declined` | `agents/routes.ts:319` |
| GET,PUT,POST | `/api/bots/attention`,`/routing`,`/routing/:kind` | `agents/lifecycle-routes.ts:100,129,133` |
| GET | `/api/bots/:id/lifecycle`\|`/reset`\|`/activity` | `agents/lifecycle-routes.ts:158,205,227` |
| POST | `/api/bots/:id/{pause,resume,reset}` | `agents/lifecycle-routes.ts:166,177,213` |
| PUT | `/api/bots/:id/notifications` | `agents/lifecycle-routes.ts:187` |
| POST | `/api/bots/:id/activity/handoffs/stop`\|`/follow-ups/cancel` | `agents/lifecycle-routes.ts:235,262` |
| POST | `/api/route/` | `routing/routes.ts:24` |
| POST | `/api/agent-tools/call` (S) | `app.ts:1633` |

### Channels, threads, groups, team-bots

| Method | Path | Handler |
| --- | --- | --- |
| POST,GET | `/api/channels/` | `channels/routes.ts:1093,1110` |
| GET | `/api/channels/events` (WS) | `channels/routes.ts:1074` |
| GET,DELETE | `/api/channels/:channelId` | `channels/routes.ts:1225,1213` |
| POST | `/api/channels/:channelId/activity`\|`/busy` | `channels/routes.ts:1139,1159` |
| PUT | `/api/channels/:channelId/pin`\|`/read` | `channels/routes.ts:1182,1204` |
| POST | `/api/channels/:channelId/attachments` | `channels/attachments.ts:735` |
| GET,DELETE | `/api/attachments/:id` | `channels/attachments.ts:1448,1635` |
| POST | `/api/threads/mint` | `channels/thread-routes.ts:56` |
| GET | `/api/threads/:threadId` | `channels/thread-routes.ts:69` |
| POST,GET | `/api/groups/` | `channels/group.ts:1283` |
| POST,DELETE | `/api/groups/:channelId/members`(`/:userId`) | `channels/group.ts:1294,1304` |
| GET,POST | `/api/groups/:channelId` | `channels/group.ts:1312,1317` |
| GET,PUT,DELETE,POST | `/api/team-bots/`,`/:id/publication`,`/:id/assignments`,`/:id/consents`,`/consents` | `team-bots/routes.ts:32-92` |

### Computers / host-access

Prefix `/api/computers` → `computer/routes.ts`.

| Method | Path | Handler |
| --- | --- | --- |
| GET | `/api/computers/fleet`\|`/policy` | `computer/routes.ts:393,709` |
| PUT | `/api/computers/policy` | `computer/routes.ts:714` |
| POST | `/api/computers/policy-dry-run` | `computer/routes.ts:759` |
| GET | `/api/computers/:botId/{status,screenshot,read,control,computers,page-frame/:toolCallId,files/download}` | `computer/routes.ts:96,101,109,351,404,579,622` |
| POST | `/api/computers/:botId/{navigate,snapshot,click,type,key,scroll,exec}` | `computer/routes.ts:234,278,292,300,320,338,651` |
| POST | `/api/computers/:botId/control/{request,take,release,cancel,secret}` | `computer/routes.ts:364,436,442,448,455` |
| POST | `/api/computers/:botId/human/:kind`, `/human/secret` | `computer/routes.ts:503,487` |
| POST | `/api/computers/:botId/computers/{stop,reset,update}` | `computer/routes.ts:419,424,432` |
| POST | `/api/computers/:botId/files/{list,read,write}` | `computer/routes.ts:595,605,686` |
| GET,POST | `/api/host-access/desktop/{next,result}` | `host-access/routes.ts:73,80` |
| GET,POST,DELETE | `/api/host-access/`,`/grants`,`/grants/:id`,`/stop` | `host-access/routes.ts:93,97,134,163` |

### Routines / delivery / memory / proactive / responsibilities

| Method | Path | Handler |
| --- | --- | --- |
| GET | `/api/routines/`\|`/:id/runs` | `routines/routes.ts:94,73` |
| POST | `/api/routines/:id/run` | `routines/routes.ts:50` |
| PUT,DELETE | `/api/routines/:id/enabled`, `/:id` | `routines/routes.ts:105,126` |
| POST | `/internal/routines/run` (S) | `app.ts:1167` |
| GET,DELETE | `/api/delivery/`, `/bindings/:id`, `/devices/:id` | `delivery/routes.ts:94,109,225` |
| POST | `/api/delivery/{orbo-tag,slack,teams,sms}/start`,`/sms/confirm`,`/devices`,`/conversations/:id/messages` | `delivery/routes.ts:139-246` |
| GET | `/api/delivery/conversations`(`/:id/history`) | `delivery/routes.ts:229,239` |
| POST | `/api/delivery/webhooks/{orbo-tag/agent,sms,sms/status}` (S) | `delivery/routes.ts:297,330,364` |
| GET,POST | `/api/memory/` | `memory/routes.ts:36,39` |
| PATCH,DELETE | `/api/memory/:id` | `memory/routes.ts:96,105` |
| GET,POST | `/api/memory/sources` | `memory/routes.ts:50,61` |
| GET | `/api/memory/sources/available/:botId` | `memory/routes.ts:53` |
| PATCH,DELETE,POST | `/api/memory/sources/:id`, `/:id/sync` | `memory/routes.ts:70,92,87` |
| GET,POST | `/api/proactive/settings`, `/suggestions` | `proactive/routes.ts:34,37,66` |
| PATCH,DELETE,POST | `/api/proactive/settings/:id`(`/run`), `/suggestions/:id/{start,dismiss}` | `proactive/routes.ts:48,62,57,71,79` |
| GET,POST | `/api/responsibilities/` | `responsibilities/routes.ts:45,222` |
| GET,PATCH | `/api/responsibilities/:id` | `responsibilities/routes.ts:239,247` |
| GET,POST | `/api/responsibilities/:id/runs`, `/:id/run`, `/:id/progress`, `/:id/{action}` | `responsibilities/routes.ts:262,282,299,272` |
| GET,POST | `/api/responsibilities/:id/triggers` | `responsibilities/routes.ts:97,107` |
| PATCH,DELETE,PUT | `/api/responsibilities/triggers/:triggerId`(`/secret`,`/enabled`) | `responsibilities/routes.ts:141,166,187,206,214` |
| GET,POST,DELETE | `/api/responsibilities/sources/github`(`/:bindingId`) | `responsibilities/routes.ts:49,52,75` |
| POST | `/api/events/triggers/:triggerId`, `/events/email/sns`, `/events/github/:bindingId` (S) | `trigger-routes.ts:167`, `email.ts:279`, `github.ts:38` |

### Approvals / passwords / demonstrations / plugins / components / voice

| Method | Path | Handler |
| --- | --- | --- |
| GET,POST | `/api/approvals/` | `approvals/routes.ts:59,102` |
| POST | `/api/approvals/computer/:botId` | `approvals/routes.ts:62` |
| PATCH | `/api/approvals/preferences`\|`/team` | `approvals/routes.ts:84,123` |
| PATCH,DELETE | `/api/approvals/rules/:id` | `approvals/routes.ts:113,192` |
| POST,PATCH,DELETE | `/api/approvals/team/rules`(`/:id`) | `approvals/routes.ts:137,150,161` |
| POST | `/api/approvals/questions/:id/respond`, `/:id/decision` | `approvals/routes.ts:167,179` |
| GET,POST | `/api/approvals/shared-use`(`/:id/:decision`,`/bot/:botId`) | `shared-use-routes.ts:29,36,70,113` |
| POST,GET | `/api/sign-in-requests`(`/:id`,`/:id/{submit,use-saved,take-over,finish,cancel}`) | `passwords/routes.ts:74,94,98,104,121,139,149,159` |
| GET,DELETE | `/api/passwords`, `/passwords/:id` | `passwords/routes.ts:186,189` |
| GET,POST | `/api/demonstrations/` | `demonstrations/routes.ts:33,41` |
| GET,DELETE,POST | `/api/demonstrations/:id`(`/stop`,`/draft`,`/published`,`/schedule`) | `demonstrations/routes.ts:58,105,66,74,79,92` |
| GET | `/api/plugins/` | `plugins/routes.ts:245` |
| POST,DELETE,PUT | `/api/plugins/servers`(`/custom`,`/:id`,`/:id/{oauth-client,refresh,account-mode,connect}`) | `plugins/routes.ts:299,385,538,456,676,598,1112` |
| POST | `/api/plugins/servers/:id/connection/{confirm,recheck}` | `plugins/routes.ts:1940,2031` |
| DELETE | `/api/plugins/servers/:id/connection` | `plugins/routes.ts:2107` |
| GET,POST | `/api/plugins/composio/apps` | `plugins/routes.ts:744,836` |
| GET | `/api/plugins/connections`, `/oauth/callback` | `plugins/routes.ts:1039,2166` |
| POST,DELETE | `/api/plugins/skills`(`/:slug`) | `plugins/routes.ts:2320,2424` |
| POST,DELETE | `/api/plugins/grants` | `plugins/routes.ts:2603,2682` |
| GET,POST | `/api/plugins/for/:agentId`, `/call` | `plugins/routes.ts:2720,2742` |
| GET,PUT | `/api/components/`, `/catalogue` | `components/routes.ts:82,98` |
| GET,POST,DELETE,PUT | `/api/components/{for-agent/:id,:name/{decision,call,functions,grants,publication,draft,functions/:fn,grants/:agentId}}` | `components/routes.ts:181,197,288,378,435,484,561,410,462` |
| GET,POST,DELETE | `/api/sandboxed/`, `/published`, `/:name/publish`, `/:name` | `sandboxed-routes.ts:33,47,51,150,168` |
| POST | `/api/audio/transcriptions` | `dictation/routes.ts:19` |
| GET,POST | `/api/voice/config`, `/voice/calls` | `voice/routes.ts:36,42` (GET `/config`, POST `/calls`) |
| GET,POST | `/api/voice/sessions` | `voice/session-routes.ts:29,44` (mounts under `/api/voice/sessions`) |

**ORBO count:** ≈ 265 route registrations across ~27 route modules (~25 `app.route` mounts
in `app.ts`). Static SPA fallback `GET /*` (`app.ts:1835`) and `app.use("/*", serveStatic)`
(`app.ts:1823`) are not API routes. The Intelligence runtime (`app.route("/", copilotHandler)`,
`app.ts:1244`) is a passthrough mount, not inventoried above.

---

## 2. OpenMuse endpoint inventory

Mounts: `/api/agent` → `engine/routes.ts`; `/api/computer` → `computer-routes.ts`; rest direct
in `apps/server/src/app.ts`.

| Method | Path | File:line |
| --- | --- | --- |
| GET | `/api/health` | `_sources/OpenMuse/apps/server/src/app.ts:98` (upstream only; ORBO canonical is `GET /health`, `server/src/app.ts:436` — see §1) |
| POST | `/api/session` | `app.ts:108` |
| GET | `/api/google/callback` | `app.ts:122` |
| GET | `/api/workspace`, `/api/calendars`, `/api/calendar/events` | `app.ts:145,161,162` |
| GET | `/api/mail/threads/:id` | `app.ts:173` |
| POST | `/api/actions`, `/api/actions/:id/decide` | `app.ts:176,182` |
| GET,POST | `/api/drafts` | `app.ts:190,191` |
| GET | `/api/main-thread` | `app.ts:208` |
| GET,PUT | `/api/conversation` | `app.ts:231,234` |
| POST | `/api/files` | `app.ts:241` |
| GET | `/api/files/:id/content` | `app.ts:255` |
| POST | `/api/files/:id/fill`, `/api/mail/import-attachment` | `app.ts:261,267` |
| POST | `/api/google/connect`, `/api/google/disconnect` | `app.ts:271,283` |
| POST | `/api/browsers` | `app.ts:289` |
| GET | `/api/browsers/:id` | `app.ts:293` |
| GET,POST | `/api/browsers/:id/console` | `app.ts:320,328` |
| POST | `/api/browsers/:id/{navigate,close,reopen,import-downloads}` | `app.ts:297,301,307,312` |
| GET | `/api/browsers/:id/read`, `/preview` | `app.ts:304,315` |
| GET | `/api/agent/` | `engine/routes.ts:31` |
| POST | `/api/agent/tasks` | `engine/routes.ts:32` |
| GET | `/api/agent/tasks/:id` | `engine/routes.ts:38` |
| POST | `/api/agent/tasks/:id/control`, `/tasks/:id/input` | `engine/routes.ts:41,47` |
| POST | `/api/agent/goals`, `/goals/:id`, `/goals/:id/milestones/:milestoneId` | `engine/routes.ts:60,63,67` |
| POST | `/api/agent/monitors`, `/monitors/:id/control` | `engine/routes.ts:78,81` |
| POST | `/api/agent/ideas/refresh`, `/ideas/:id` | `engine/routes.ts:87,88` |
| POST | `/api/agent/memories`, `/memories/:id`, `/memories/:id/forget` | `engine/routes.ts:99,109,121` |
| POST | `/api/agent/identity` | `engine/routes.ts:126` |
| GET | `/api/agent/notifications` | `engine/routes.ts:147` |
| POST | `/api/agent/notifications/:id/read` | `engine/routes.ts:150` |
| POST | `/api/agent/sample-page` | `engine/routes.ts:161` |
| GET | `/api/computer/` | `computer-routes.ts:13` |
| POST | `/api/computer/start`, `/stop` | `computer-routes.ts:14,15` |
| GET | `/api/computer/desktop` | `computer-routes.ts:18` |
| POST | `/api/computer/desktop/actions` | `computer-routes.ts:20` |
| GET | `/api/computer/desktop/screenshot` | `computer-routes.ts:28` |
| POST | `/api/computer/commands` | `computer-routes.ts:37` |
| GET | `/api/computer/files` | `computer-routes.ts:44` |
| POST | `/api/computer/files/{read,write,mkdir,import,export}` | `computer-routes.ts:45,49,53,57,65` |
| ALL | `/api/copilotkit/*` (runtime passthrough) | `app.ts` (`app.all`) — Intelligence runtime fetch, not a CRUD route |

**OpenMuse count:** ≈ 60 endpoints (method-split corrected; +1 copilotkit passthrough). `index.ts`/`worker-entry.ts` are process hosts, not surfaces.

---

## 3. OpenDots endpoint inventory

Mounts: `/api` → `computerRoutes`, `connectionRoutes`, `workspaceRoutes`; `workspaceRoutes` also
mounts `pageRoutes` at `/` (`src/server/app.ts:93-100`).

| Method | Path | File:line |
| --- | --- | --- |
| GET | `/api/state` | `app.ts:101` |
| POST | `/api/tasks` | `app.ts:110` |
| GET | `/api/tasks/:id` | `app.ts:157` |
| POST | `/api/tasks/:id/actions` | `app.ts:161` |
| PUT | `/api/tasks/:id/schedule` | `app.ts:173` |
| PATCH | `/api/settings` | `app.ts:186` |
| POST,PUT,DELETE | `/api/memories`, `/api/memories/:id` | `app.ts:209,221,235` |
| GET,PATCH | `/api/dots/:id/computer`, `/computer/permissions` | `computer-routes.ts:18,21` |
| POST | `/api/dots/:id/computer/{start,stop,take,release,actions}` | `computer-routes.ts:24,27,30,33,36` |
| GET,POST | `/api/dots/:id/connections` | `connection-routes.ts:35,38` |
| POST | `/api/connections/:id/refresh` | `connection-routes.ts:47` |
| PATCH | `/api/connections/:id/tools/:name` | `connection-routes.ts:50` |
| DELETE | `/api/connections/:id` | `connection-routes.ts:66` |
| GET | `/api/conversations/:id/connection-approvals/:approvalId` | `connection-routes.ts:89` |
| GET | `/api/conversations/:id/connection-actions/:toolCallId` | `connection-routes.ts:104` |
| POST | `/api/conversations/:id/connection-actions` | `connection-routes.ts:113` |
| POST | `/api/setup-telemetry` | `workspace-routes.ts:26` |
| GET | `/api/workspace` | `workspace-routes.ts:42` |
| POST | `/api/spaces` | `workspace-routes.ts:51` |
| POST,PUT | `/api/dots`, `/api/dots/:id` | `workspace-routes.ts:69,111` |
| POST | `/api/conversations` | `workspace-routes.ts:137` |
| GET | `/api/conversations/:id/capture` | `workspace-routes.ts:157` |
| POST | `/api/voice/calls` | `workspace-routes.ts:160` |
| GET | `/api/voice/calls/:id` | `workspace-routes.ts:175` |
| POST | `/api/voice/calls/:id/{active,compute,end}` | `workspace-routes.ts:178,181,203` |
| POST,GET | `/api/conversations/:id/reviewed-page`, `/:id/reviewed-page/:toolCallId` | `page-routes.ts:29,8` |
| GET | `/api/conversations/:id/page-context` | `page-routes.ts:52` |
| GET,POST | `/api/spaces/:spaceId/pages` | `page-routes.ts:62,70` |
| GET,PATCH,DELETE | `/api/spaces/:spaceId/pages/:id` | `page-routes.ts:65,85,100` |
| POST | `/api/spaces/:spaceId/pages/:id/conversation` | `page-routes.ts:109` |
| POST | `/api/conversations/:id/page` | `page-routes.ts:123` |
| GET | `/api/*` (404 fallback) | `index.ts:108` |

**OpenDots count:** ≈ 47 endpoints.

---

## 4. Overlap analysis

| Concept | ORBO | OpenMuse | OpenDots | Verdict |
| --- | --- | --- | --- | --- |
| Agents/Bots | `/api/agents`,`/api/bots` | `/api/agent/*` | `dots` | ORBO superset; no route added. |
| Threads/conversations | `/api/channels`,`/api/threads` | `/api/conversation`,`/main-thread`,`/mail/threads` | `/api/conversations`,`/:id/capture` | ORBO canonical. |
| Messages | channel turns + runtime | PUT `/api/conversation` | `/conversations/:id/connection-actions` | Merge into channel message route. |
| Memory | `/api/memory` | `/api/agent/memories` | `/api/memories` | ORBO canonical; others alias. |
| Approvals | `/api/approvals`(+shared-use) | `/api/actions`,`/:id/decide` | `/conversations/:id/connection-approvals` | ORBO canonical. |
| Computers | `/api/computers`,`/api/host-access` | `/api/computer/*` | `/api/dots/:id/computer/*` | ORBO governed gateway canonical. |
| Routines/tasks | `/api/routines`,`/responsibilities`,`/proactive` | `/api/agent/{tasks,goals,monitors,ideas}` | `/api/tasks`,`/:id/schedule` | ORBO canonical; goals→responsibilities. |
| Documents/pages | none first-class | `/api/agent/sample-page`,`/api/files` | `/api/spaces/:id/pages`,`/conversations/:id/page` | **Gap.** OpenDots pages richest. |
| Connectors/plugins | `/api/plugins`,`/api/components` | `/api/google/*`,`/api/browsers` | `/dots/:id/connections`,`/connections/*` | ORBO canonical. |
| Auth/session | Better Auth `/api/auth/*` | `/api/session` | token middleware | ORBO canonical (PLAN §10.B item 16). |
| Workspaces/spaces | channels/groups | `/api/workspace` | `/api/workspace`,`/api/spaces` | **Partial.** spaces = container. |
| Voice | `/api/voice`,`/api/audio` | none | `/api/voice/calls` | ORBO canonical; OpenDots call-flow optional. |
| Files/attachments | `/api/attachments` | `/api/files` | computer files | ORBO canonical; OpenMuse `/api/files`→attachments. |
| Notifications | `/api/bots/:id/notifications`, proactive | `/api/agent/notifications` | settings only | ORBO canonical. |
| Settings/preferences | `/api/settings/*` | `/api/workspace` | `/api/settings` | ORBO canonical. |
| Browsers standalone | inside `/api/computers` | `/api/browsers/*` | inside computer | **Gap.** No ORBO standalone browser resource. |
| Calendar/mail/Google | connectors via `/api/plugins` | `/api/calendars`,`/api/mail/*`,`/api/google/*` | none | Map to ORBO Google connector. |

**Top 5 overlaps (all 3-way):** approvals, memory, computers, tasks/routines, threads/conversations.

---

## 5. Proposed UNIFIED Hono route map (canonical)

Convention: `/api/<resource>` plural; `:param` for ids; sub-actions `/<resource>/:id/<verb>`.
Served by `server/src/`. Auth: `U`=`requireUser`, `A`=admin, `S`=service/shared-secret.

| Canonical path | Methods | Auth | Handler (ORBO) | Replaces (legacy) |
| --- | --- | --- | --- | --- |
| `/api/agents` | GET,POST | U | `agents/routes.ts:372,481` | OpenMuse `/api/agent`; OpenDots `dots` |
| `/api/agents/:id` | GET,PATCH,DELETE | U | `agents/routes.ts:394,528,706` | — |
| `/api/agents/:id/{duplicate,hide,pin,handoff,callback-token}` | POST/DELETE | U | `agents/routes.ts:585-730` | — |
| `/api/bots` | GET | U | `agents/lifecycle-routes.ts:100` | — |
| `/api/bots/:id/{pause,resume,reset,activity,notifications}` | GET/POST/PUT | U | `agents/lifecycle-routes.ts:158-262` | — |
| `/api/channels` | GET,POST | U | `channels/routes.ts:1093,1110` | OpenMuse/OpenDots `/api/workspace` |
| `/api/channels/:id` | GET,DELETE | U | `channels/routes.ts:1225,1213` | — |
| `/api/channels/:id/messages` | POST | U | runtime/channel turn | OpenMuse `PUT /conversation`; OpenDots `POST /conversations/:id/connection-actions` |
| `/api/threads` | GET,POST | U | `channels/thread-routes.ts:56,69` | OpenMuse `/api/main-thread`; OpenDots `/:id/capture` |
| `/api/attachments` | GET,POST,DELETE | U | `channels/attachments.ts:735,1448,1635` | OpenMuse `/api/files`,`/files/:id/content` |
| `/api/memory` | GET,POST | U | `memory/routes.ts:36,39` | OpenMuse `/api/agent/memories`; OpenDots `/api/memories` |
| `/api/memory/:id` | PATCH,DELETE | U | `memory/routes.ts:96,105` | OpenDots `PUT|DELETE /api/memories/:id` |
| `/api/memory/sources` | GET,POST | U | `memory/routes.ts:50,61` | — |
| `/api/approvals` | GET,POST | U | `approvals/routes.ts:59,102` | OpenMuse `/api/actions`; OpenDots connection-approvals |
| `/api/approvals/:id/decision` | POST | U | `approvals/routes.ts:179` | OpenMuse `POST /api/actions/:id/decide` |
| `/api/approvals/shared-use` | GET,POST | U | `shared-use-routes.ts:29,70` | — |
| `/api/computers` | GET | U | `computer/routes.ts:393` | OpenMuse `/api/computer/`; OpenDots `/dots/:id/computer` |
| `/api/computers/:botId/*` | GET,POST | U | `computer/routes.ts:96-686` | OpenMuse `/api/computer/*`; OpenDots `/dots/:id/computer/*` |
| `/api/computers/policy` | GET,PUT | U,A | `computer/routes.ts:709,714` | — |
| `/api/routines` | GET,POST | U | `routines/routes.ts:94` | OpenMuse `/api/agent/tasks`; OpenDots `/api/tasks` |
| `/api/routines/:id` | DELETE | U | `routines/routes.ts:126` | — |
| `/api/routines/:id/run` | POST | U | `routines/routes.ts:50` | OpenMuse `/api/agent/tasks/:id/control` |
| `/api/responsibilities` | GET,POST | U | `responsibilities/routes.ts:45,222` | OpenMuse `/api/agent/{goals,monitors,ideas}` |
| `/api/proactive` | GET,POST | U | `proactive/routes.ts:34,37` | — |
| `/api/pages` | GET,POST | U | **new** (from OpenDots) | OpenDots `/api/spaces/:spaceId/pages` |
| `/api/pages/:id` | GET,PATCH,DELETE | U | **new** | OpenDots `/api/spaces/:spaceId/pages/:id` |
| `/api/pages/:id/conversation` | POST | U | **new** | OpenDots `/api/spaces/:spaceId/pages/:id/conversation` |
| `/api/plugins` | GET | U | `plugins/routes.ts:245` | OpenDots `/dots/:id/connections`; OpenMuse `/api/google/*` |
| `/api/plugins/connections` | GET,POST,DELETE | U | `plugins/routes.ts:1039,1112,2107` | OpenDots `/api/connections/:id`,`/:id/refresh` |
| `/api/plugins/tools/:name` | PATCH | U | **new** (from OpenDots) | OpenDots `PATCH /api/connections/:id/tools/:name` |
| `/api/components` | GET,POST | U | `components/routes.ts:82` | — |
| `/api/sandboxed` | GET,POST | U | `sandboxed-routes.ts:33,51` | — |
| `/api/settings/preferences` | GET,PATCH | U | `user-preferences-routes.ts:23,33` | OpenMuse/OpenDots `/api/settings` |
| `/api/settings/instructions` | GET,PUT | U | `app.ts:682,696` | — |
| `/api/voice/calls` | POST | U | `voice/routes.ts:42` | OpenDots `/api/voice/calls` |
| `/api/voice/sessions` | GET,POST | U | `voice/session-routes.ts:29,44` | — |
| `/api/audio/transcriptions` | POST | U | `dictation/routes.ts:19` | — |
| `/api/notifications` | GET | U | `proactive/routes.ts:66` | OpenMuse `/api/agent/notifications` |
| `/api/browsers` | GET,POST | U | **new** (from OpenMuse) | OpenMuse `/api/browsers/*` |
| `/api/admin/*` | GET,POST,PUT,DELETE | U,A | `admin/routes.ts`, `app.ts:769-1150` | — |
| `/api/auth/*` | GET,POST,PUT,PATCH,DELETE | N,U | `app.ts:502,591` | OpenMuse `/api/session`; OpenDots token middleware |
| `/api/events/*` (triggers, email/sns, github) | POST | S | `trigger-routes.ts:167`,`email.ts:279`,`github.ts:38` | — |
| `/api/agent-tools/call` | POST | S | `app.ts:1633` | — |
| `/internal/routines/run` | POST | S | `app.ts:1167` | — |

Notes: `spaces` (OpenDots) has no ORBO equivalent — recommend flattening pages to `/api/pages`
and dropping `spaces` for v1 unless the UI needs a container. `browsers` (OpenMuse) exists in
ORBO only inside a computer; promote to `/api/browsers` only if the browser-console UX is merged,
routed through the governed gateway. ORBO's existing `/api/approvals` and `/api/computers` keep
their names.

---

## 6. Deletions / aliases plan and versioning

Phase 3 does **not** modify code; this is the end-state for the implementation phase. ORBO is the
surviving server, so its existing paths are not renamed (preserves Phase 2 app and tests). OpenMuse
and OpenDots routes that do not appear in §5 are deleted with their servers.

Aliases (serve both for one release, then delete):

| Legacy path | Canonical path | Mechanism |
| --- | --- | --- |
| `POST /api/conversation` | `POST /api/channels/:id/messages` | adapter before canonical route |
| `GET /api/main-thread` | `GET /api/channels` (filter) | adapter |
| `POST /api/actions/:id/decide` | `POST /api/approvals/:id/decision` | adapter |
| `GET /api/agent/memories` | `GET /api/memory` | adapter |
| `POST /api/tasks` (OpenDots) | `POST /api/routines` | adapter |
| `/api/computer/*` (OpenMuse) | `/api/computers/:botId/*` | adapter (owner→actor shim) |
| `/api/dots/:id/computer/*` | `/api/computers/:botId/*` | adapter |
| `GET /api/connections/:id` | `/api/plugins/connections/:id` | adapter |

Versioning: no `/api/v1` prefix for v1 (no third-party consumers; same-origin browser). If a public
API is later exposed, add `/api/v1` as an alias layer, not by moving canonical paths. `/health`
stays unversioned.

Auth: all `/api/*` passes through `createEnterpriseGate(requireUser)` (`app.ts:589`). Service routes
(`/internal/routines/run`, `/api/agent-tools/call`, `/api/events/*`) stay outside the session gate
and keep shared-secret checks. No route adds CORS — ORBO deliberately has none (`app.ts:1809`).

---

## 7. Risks / unknowns

| # | Risk / unknown | Mitigation |
| --- | --- | --- |
| 1 | OpenMuse is single-owner (`c.get("owner")`); ORBO is session/multi-tenant. | Adapter maps owner→Better Auth actor; do not expose owner semantics. |
| 2 | OpenDots `spaces` has no ORBO equivalent; pages nested under it. | Flatten to `/api/pages` (or add container if UI needs it). |
| 3 | "connections" means OpenDots tool connections vs ORBO plugin connections. | Canonicalize `/api/plugins/connections`; OpenDots concept becomes a view. |
| 4 | OpenMuse `/api/browsers`,`/api/computer` are ungoverned vs ORBO's policy gateway. | Route all browser/desktop actions through `computerGateway`+policy; never mount raw control. |
| 5 | OpenMuse mail/calendar/Google are first-class; ORBO treats Google as a plugin. | Represent via plugin/connector grants; no new mail/calendar resources in v1. |
| 6 | OpenDots tasks vs ORBO routines/responsibilities overlap. | One `routines` resource; responsibilities stay distinct (goal-shaped). |
| 7 | Unknown whether OpenMuse/OpenDots clients must keep working. | Their apps are replaced by ORBO's app; assume no compat, aliases optional. |
| 8 | OpenMuse `apps/mobile` consumes `/api/agent`,`/api/computer` directly. | Out of scope; feeds PLAN item 24 (route tree). |
| 9 | ORBO mixes router-relative and absolute paths; no automated prefix check. | Implementation adds a route-introspection test asserting against this doc. |
| 10 | No WS/SSE routes found in upstreams besides ORBO `/api/channels/events` + runtime. | Confirm at implementation (`upgradeWebSocket`/`streamSSE`). |
| 11 | Proposed `GET /api/notifications` has no ORBO route today (nearest is `GET /api/proactive/suggestions`). | **Unknown:** confirm whether notifications becomes its own resource or stays a proactive view. |
| 12 | Runtime passthroughs (`ALL /api/copilotkit/*` on OpenMuse; `app.route("/", copilotHandler)` on ORBO) are not CRUD routes. | Keep out of the canonical map; reconcile at implementation (PLAN item 24). |

Provenance: ORBO from `server/src/app.ts` mounts + sub-router registrations. OpenMuse from
`apps/server/src/{app,computer-routes,engine/routes}.ts`. OpenDots from
`src/server/{app,computer-routes,connection-routes,workspace-routes,page-routes,index}.ts`.
