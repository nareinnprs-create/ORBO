# 12 — Phase 4 Admin Surface Inventory (PLAN.md §8 item 4)

Port OpenBot Admin surfaces into the unified Expo app. Research + this doc only —
no product code changed. All paths verified on disk 2026-10-14. Source of the
target tree: `docs/planning/03-route-tree.md` §5–§6 (`(app)/admin/*`).

Contribution: 20 route files (19 navigable + 1 layout gate), 1 sidebar component,
6 plugin UI components, 7 approval UI components, 5 server admin files.

---

## 1) Route inventory (current → target Expo route)

Layout gate: `app/src/routes/_authed/admin/route.tsx` → `(app)/admin/_layout.tsx`
(admin-only guard via `currentUserQueryOptions`, redirects non-admins to `/`).

| # | Current route file (`app/src/routes/_authed/admin/…`) | Target Expo route (`(app)/admin/…`) |
|---|---|---|
| 1 | `index.tsx` (6.0 KB, grouped overview) | `index.tsx` (Admin home) |
| 2 | `approvals.tsx` (0.6 KB, wraps `TeamApprovalSettings`) | `approvals.tsx` |
| 3 | `audit.tsx` (18.8 KB, audit-event reader) | `audit.tsx` |
| 4 | `boundaries.tsx` (14.5 KB, CEL policy editor + dry-run) | `boundaries.tsx` |
| 5 | `computers.tsx` (18.4 KB, fleet + host-folder grants) | `computers.tsx` |
| 6 | `credentials.tsx` (13.2 KB, write-only credential vault) | `credentials.tsx` |
| 7 | `enterprise.tsx` (37.2 KB, largest: capabilities + network + models) | `enterprise.tsx` |
| 8 | `identity-providers.tsx` (11.5 KB, SAML/OIDC registry) | `identity-providers.tsx` |
| 9 | `learning.tsx` (15.2 KB, automatic-learning settings) | `learning.tsx` |
| 10 | `people.tsx` (8.8 KB, list/promote/demote/remove + terminate computers) | `people.tsx` |
| 11 | `playground.tsx` (16.6 KB, sandboxed-component drafts + publish) | `playground.tsx` |
| 12 | `skills.tsx` (9.8 KB, deployment-skill CRUD + plugin grants) | `skills.tsx` |
| 13 | `components/index.tsx` (4.8 KB, compiled-component gallery) | `components/index.tsx` |
| 14 | `components/$name.tsx` (19.1 KB, per-component grants + functions) | `components/[name].tsx` |
| 15 | `plugins/index.tsx` (12.3 KB, connected catalogue + what-else) | `plugins/index.tsx` |
| 16 | `plugins/composio.tsx` (10.4 KB, Composio app search + enable) | `plugins/composio.tsx` |
| 17 | `plugins/$key.tsx` (64.9 KB, largest: connector detail + consent) | `plugins/[key]/index.tsx` |
| 18 | `plugins/$key_.bots.$agentId.tsx` (22.6 KB, per-bot plugin grants) | `plugins/[key]/bots/[agentId].tsx` |
| 19 | `plugins/$key_.tools.$tool.tsx` (9.6 KB, per-tool grant roster) | `plugins/[key]/tools/[tool].tsx` |

Notes: the dotted TanStack escape (`$key_.bots.$agentId`) becomes a real nested
`[key]/bots/[agentId]` folder (§5 tree). `$key.tsx` + `$key/` folder must merge
as `[key]/index.tsx` to avoid the Expo `[key]` file-vs-folder collision (§7).

---

## 2) Component inventory with data deps

| Component (`app/src/components/…`) | Used by (admin routes) | Data deps |
|---|---|---|
| `admin/admin-sidebar.tsx` (4 grouped nav sections, mirrors index) | `route.tsx` layout | none (static `LinkOptions`) |
| `approvals/team-settings.tsx` (`TeamApprovalSettings`) | `approvals.tsx` | `app/src/lib/approvals.ts`, `/api/approvals/team*` |
| `approvals/bot-rules.tsx`, `rules.tsx`, `settings.tsx` | shared w/ agent + settings approvals | `/api/approvals/rules*` |
| `approvals/shared-use-requests.tsx`, `waiting.tsx`, `inline-approval.tsx` | shared-use request cards | `/api/approvals/shared-use` |
| `plugins/shared-approval-fields.tsx` (+ `sharedSectionSentence`) | `plugins/$key_.bots.$agentId.tsx` | plugin-grant mutations |
| `plugins/account-mode-dialog.tsx`, `brokered-account-row.tsx` | `plugins/$key.tsx` | `/api/plugins/*` brokered-account reads |
| `plugins/connection-fields.tsx`, `plugin-logo.tsx`, `shared-app-notice.tsx` | `plugins/index.tsx`, `$key.tsx` | catalogue query data (presentational) |
| `component-preview.tsx` (`AdminComponentPreview`) | `components/index.tsx`, `components/$name.tsx` | `/api/components` list item (props-in) |
| `settings/background.tsx` (`SettingsItemBackground`) | `components/*` tiles | none (presentational) |
| `layout/page-shell.tsx` (`PageShell/Section/Rows/Empty`) | all 19 screens | none (layout shell) |
| `layout/sidebar-shell.tsx`, `layout/stagger.tsx`, `layout/row-mark.tsx` | `route.tsx`, list screens | none (layout shell) |
| `ui/*` per route imports: `button, dialog, field, input, item` | all form/list screens | none |
| `ui/*` per route imports: `separator, switch, checkbox, textarea` | grants/toggle/policy screens | none |
| `ui/*` per route imports: `label, empty, sidebar` | IdP/people/empty/sidebar | none |

---

## 3) Data-layer inventory (`app/src/lib/…` + shared)

| Client module | Wraps (endpoint family) | Consumed by |
|---|---|---|
| `lib/auth/queries.ts` (`currentUserQueryOptions`) | `GET /api/me` (role gate) | `route.tsx` beforeLoad, `people.tsx` |
| `lib/audit/queries.ts` + `lib/audit/outcome.ts` + `lib/audit/silence.ts` | `GET /api/admin/audit-events` | `audit.tsx` |
| `lib/approvals.ts` | `/api/approvals/team*` (team rules CRUD) | `approvals.tsx` via `team-settings.tsx` |
| `lib/computers/queries.ts` + `lib/computers/mutations.ts` | `/api/computers/fleet`, `/policy`, `/policy-dry-run` | `boundaries.tsx`, `computers.tsx` |
| `lib/computers/host-access.ts` | host-folder grant request/revoke/stop | `computers.tsx` |
| `lib/credentials/queries.ts` + `mutations.ts` + `form.ts` | `GET/POST /api/admin/credentials` | `credentials.tsx` |
| `lib/enterprise/queries.ts` + `lib/enterprise/mutations.ts` | `/api/admin/enterprise*` ( §4) | `enterprise.tsx`, `people.tsx` |
| `lib/identity-providers/queries.ts` + `mutations.ts` | `GET /api/admin/identity-providers` + register/delete | `identity-providers.tsx` |
| `lib/people/queries.ts` + `lib/people/mutations.ts` | `GET /api/admin/people`, `POST …/role`, `POST …/access` | `people.tsx` |
| `lib/learning/queries.ts` | `/api/admin/learning/settings\|overview\|status/*` | `learning.tsx` |
| `lib/plugins/queries.ts` + `lib/plugins/mutations.ts` (+ `shared-use.ts`) | `/api/plugins`, `/connections`, `/composio/apps`, `/for/:agentId` | all 5 `plugins/*` routes |
| `lib/skills/form.ts` + `lib/skills/proposal.ts` (+ skill save/remove mutations) | `/api/plugins/skills`, plugin-grant writes | `skills.tsx` |
| `lib/components/queries.ts` (+ catalogue/for-agent/functions) | `/api/components*` | `components/*`, `playground.tsx` (via preview) |
| `lib/sandboxed/queries.ts` + `lib/sandboxed/mutations.ts` | `/api/sandboxed`, `/published`, `/:name/publish`, `DELETE /:name` | `playground.tsx` |
| `lib/agents/queries.ts` + `lib/agents/bot-names.ts` + `lib/agents/grant-roster.ts` | `/api/bots`, display names, grant matrix | `computers, skills, plugins/*, audit` |
| `shared/learning.ts` (repo-root shared types) | `LearningSettings`, `LearningTarget` types | `learning.tsx` |
| `lib/composing.ts` (`isComposing`), `query-client.ts` | IME guard, cache invalidation | `boundaries.tsx`, most mutation screens |

---

## 4) Server admin API routes

`server/src/admin/` (5 files): `routes.ts` (enterprise Hono router, 13.1 KB),
`gate.ts` (capability gate mounted as `app.use("/api/*")`), `capabilities.ts`
(capability names/labels/defaults), `controls.ts` (enterprise controls + store,
30.3 KB), `settings-store.ts` (NOTIFY-backed settings persistence, 13.5 KB).

| Method + path | Defined in | Serves admin screen |
|---|---|---|
| `GET /api/admin/enterprise/me` (any signed-in user) | `admin/routes.ts` | capability-gated UI hiding |
| `GET /api/admin/enterprise/` (capabilities + settings + groups + network + servers) | `admin/routes.ts` | `enterprise.tsx` |
| `PUT /api/admin/enterprise/capabilities` | `admin/routes.ts` | `enterprise.tsx` |
| `PUT /api/admin/enterprise/settings/:key` (incl. SSO-guard + session revoke) | `admin/routes.ts` | `enterprise.tsx` |
| `PUT /api/admin/enterprise/network` / `DELETE …/network/:scopeKind` | `admin/routes.ts` | `enterprise.tsx` |
| `GET /api/admin/enterprise/models/usage` / `GET …/actions` | `admin/routes.ts` | `enterprise.tsx` |
| `POST …/people/:userId/terminate-computers`, `POST …/computers/terminate-inactive` | `admin/routes.ts` | `people.tsx`, `enterprise.tsx` |
| `GET /api/admin/status` (admin liveness) | `server/src/app.ts:769` | `route.tsx` gate fallback |
| `GET /api/admin/audit-events` (admin-only, `auditReader.list`) | `server/src/app.ts:773` | `audit.tsx` |
| `GET /api/admin/people` | `server/src/app.ts:799` | `people.tsx` |
| `POST /api/admin/people/:userId/role`, `POST …/access` | `server/src/app.ts:845,918` | `people.tsx` |
| `GET /api/admin/identity-providers`, `…/:providerId` (app.ts:1010) | `server/src/app.ts:987` | `identity-providers.tsx` |
| `GET/POST /api/admin/credentials`, `…/:credentialId/rotate`, `…/revoke` | `server/src/app.ts:1046–1120` | `credentials.tsx` |
| `GET /api/admin/package` | `server/src/app.ts:1150` | `enterprise.tsx` (deployment info) |
| `* /api/admin/learning/*` (`createLearningRoutes`) | `server/src/app.ts:756` | `learning.tsx` |
| Shared (admin-consuming, not admin-only): `/api/approvals*` (team rules) | `server/src/approvals/routes.ts` | `approvals.tsx` |
| Shared: `/api/computers/fleet|policy|policy-dry-run`, host-access | `server/src/computer/*` | `boundaries.tsx`, `computers.tsx` |
| Shared: `/api/plugins*`, `/api/components*`, `/api/sandboxed*` | `server/src/*` plugin/component stores | `plugins/*`, `components/*`, `playground.tsx` |

---

## 5) Per-item complexity + coupling risks

| Item | Complexity | Coupling risks |
|---|---|---|
| `route.tsx` gate + `admin-sidebar.tsx` + `index.tsx` | S (static nav, role redirect) | Sidebar group order must mirror index groups; web rail vs native tabs layout split |
| `approvals.tsx` + `team-settings.tsx` | S (thin wrapper, shared component) | Shared with agent-level + settings approvals — change `TeamApprovalSettings` once, affects 3 surfaces |
| `audit.tsx` (filter taxonomy: outcome/silence/event types) | M (read-only but bespoke filter logic) | `outcome.ts`/`silence.ts` taxonomy must stay in sync with server `eventType` strings; unmigrated deployments omit `initiatorKind` |
| `boundaries.tsx` (CEL presets + dry-run report) | M (CEL string authoring, no execution) | Preset CEL must match gateway evaluator dialect; dry-run shape (`DryRunReport`) is a cross-tier contract |
| `computers.tsx` (fleet + host-folder grants + dialogs) | M (4 query + 3 mutation families) | Touches live containers (stop/terminate); host-access grant flow is OS-gated (desktop vs server) |
| `credentials.tsx` (write-only, encrypted, redacted) | M (never-read-back invariant) | Plaintext exists only in-flight; any logging/caching of the POST body is a secret leak; keep `form.ts` allowlist narrow (no `mcp_oauth_client`/`mcp_user_token`) |
| `identity-providers.tsx` + `people.tsx` | M (SSO + role/access + revoke) | SSO-required toggle can lock everyone out (server 409 guard); `people.tsx` terminate-computers couples identity → fleet |
| `learning.tsx` (+ `shared/learning.ts` types) | M (per-agent targets, delivery status) | `LearningTarget` type is shared with server `createLearningRoutes`; container-ID coupling to computer subsystem |
| `skills.tsx` + `playground.tsx` | M (skill CRUD + sandboxed publish flow) | Publish path executes compiled components — sandbox renderer (`@copilotkit/react-core/v2`) must port to RN; grants fan out to plugin store |
| `components/*` (gallery + per-component/function grants) | M (3 grant levels: component/bot/function) | Every grant change writes an audit row; preview renderer is web-React — needs `.native` split |
| `plugins/$key.tsx` (64.9 KB, consent + brokered accounts) | L (largest file: OAuth consent, per-tool matrix) | OAuth callback carries no session (`personHasAccess` recheck); Composio brokering couples to third-party directory |
| `plugins/$key_.bots.$agentId.tsx` + `…tools.$tool.tsx` | M (grant matrices over unbounded bot lists) | Path-flattening risk: `$key_` de-nesting must become real folders or Expo collides `[key]` file vs folder |
| `enterprise.tsx` (37.2 KB: capabilities × scopes + network + usage) | L (widest API fan-out: 8 enterprise endpoints) | Capability gate (`gate.ts`) fails closed (503 = refuse); network-policy push is async fire-and-forget; model-allowlist couples to runtime config |
| Server `gate.ts` + `controls.ts` + `settings-store.ts` | L (request-path authz for all `/api/*`) | Gate regexes match decoded Hono paths — keep both spellings; controls refresh/sequential-statement constraint (no concurrent stmts on one conn) |

Top coupling risks: (1) write-only credential invariant vs logging/cache;
(2) Expo `[key]` file-vs-folder collision on plugin detail; (3) enterprise
capability gate fail-closed semantics must survive the port; (4) SSO-required
without a registered IdP locks out all non-break-glass users; (5) web-React
sandbox/preview renderer has no RN equivalent yet.

---

## 6) Port order

| Phase | Items | Why this order |
|---|---|---|
| P1 shell | `route.tsx` gate → `_layout.tsx`, `admin-sidebar.tsx`, `index.tsx` | Unlocks every other screen; validates admin gating + tab/stack nesting on web + native |
| P2 read-first | `audit.tsx`, `approvals.tsx` (+ shared `approvals/*`) | Read-only + thin-wrapper; establishes `PageShell`/`Item` patterns in `packages/ui` |
| P3 people + IdP | `people.tsx`, `identity-providers.tsx` | Small forms, high value; gate SSO-toggle behind IdP-exists check from day one |
| P4 policy + fleet | `boundaries.tsx`, `computers.tsx` | CEL/dry-run + fleet are self-contained; quarantine container-touching actions behind capability flags |
| P5 vault | `credentials.tsx` | Isolate review: enforce write-only + redaction + no-log rule in the new stack |
| P6 knowledge | `learning.tsx`, `skills.tsx` | Depends on P4 agent/computer concepts; shared-type contract first (`shared/learning.ts`) |
| P7 extensibility | `components/*`, `playground.tsx` | Needs `.native` renderer decision before gallery/preview work starts |
| P8 plugins | `plugins/index.tsx`, `composio.tsx`, `$key.tsx`, per-bot, per-tool | Largest + most coupled (OAuth, Composio, grants); split `[key]/index.tsx` + nested folders per §5 tree |
| P9 enterprise | `enterprise.tsx` + server `admin/*` gate verification | Last: widest fan-out; end-to-end gate/capability/audit verification closes Phase 4 |

---

© Opraiz Technology Pvt Ltd · Developer: Narein Rao
