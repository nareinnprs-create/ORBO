# Phase 6 — Gmail/Calendar Adapter Inventory (OpenMuse → ORBO)

Source: OpenMuse Gmail + Google Calendar adapters (PLAN.md §6) vs ORBO's Google
surface. Research only — no product code modified. Companions:
`08-subsystem-unification.md §8` (Connectors/Plugins: wrap Google as governed
connector, no new mail/calendar resources in v1), `02-api-surface.md`
(calendar/mail/Google rows map to the ORBO Google connector; risk #5),
`26-phase6-openmuse-backend.md` (rows 13/20/26: workspace, google-auth, client).

## 1. OpenMuse adapter file/API inventory

### 1a. Files

| # | File | Lines | Role |
| --- | --- | --- | --- |
| 1 | `_sources/OpenMuse/apps/server/src/google-auth.ts` | 252 | `GoogleAuth`: PKCE OAuth, generation rotation, vault, singleflight refresh |
| 2 | `_sources/OpenMuse/packages/integrations/src/google.ts` | 860 | `GoogleClient`: Gmail + Calendar REST over `getAccessToken()` |
| 3 | `_sources/OpenMuse/apps/server/src/workspace.ts` | 513 | `WorkspaceService`: snapshot, thread/search, prepare/execute, import |
| 4 | `_sources/OpenMuse/apps/server/src/actions.ts` | 218 | `ActionService`: propose (hash-bind) → decide (claim→execute→receipt) |
| 5 | `_sources/OpenMuse/packages/domain/src/index.ts` | 208 | `Mail`, `CalendarEvent`, draft schemas, `proposalSchema`, workspace types |
| 6 | `_sources/OpenMuse/packages/integrations/src/vault.ts` | 56 | AES-256-GCM envelope `v1.nonce.tag.ciphertext` |
| 7 | `_sources/OpenMuse/apps/server/src/app.ts` | 354 | Route wiring: google/callback, calendars, mail, drafts, actions, connect |
| 8 | `_sources/OpenMuse/apps/server/src/config.ts` | ~190 | `GOOGLE_CLIENT_ID/SECRET`, redirect `{publicUrl}/api/google/callback` |
| 9 | `_sources/OpenMuse/apps/mobile/src/mail-tool-card.tsx` | — | Mail tool card UI (review surface for sends) |
| 10 | `_sources/OpenMuse/apps/mobile/src/workspace.tsx` | — | Workspace shell; `mail` / `calendar` sections |
| 11 | `_sources/OpenMuse/apps/mobile/src/agent-workspace.tsx` | — | Agent workspace incl. calendar view |
| 12 | `_sources/OpenMuse/apps/mobile/App.tsx:65,278-291` | — | Section registry: `mail`, `calendar` are utility sections |

### 1b. OAuth flow (`google-auth.ts`)

| Step | API | Detail |
| --- | --- | --- |
| 1 | `configured()` (`google-auth.ts:42-46`) | Requires `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `TOKEN_ENCRYPTION_KEY` |
| 2 | `connect(owner, write)` (`google-auth.ts:100-146`) | PKCE S256 (32 B state, 48 B verifier); base scopes `gmail.readonly`, `calendar.events.readonly`, `calendar.calendarlist.readonly`; adds `gmail.send` + `calendar.events` iff `write`; `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`; state row in `system/oauth` with 10-min TTL + `generation` rotation |
| 3 | `callback(stateId, code)` (`google-auth.ts:147-191`) | Single-use `take` of state; generation match else 409; code exchange at `oauth2.googleapis.com/token`; identity proof via `GET gmail/v1/users/me/profile` (403 unless Gmail read granted); refresh-token reuse iff same account; fresh `connectionId=randomUUID()` |
| 4 | `accessToken(owner, expectedConnectionId)` (`google-auth.ts:192-204`) | 409 when disconnected or `connectionId` drifted; 60 s expiry skew; singleflight `Map` dedupes concurrent refreshes per `owner:connectionId` |
| 5 | `refresh()` (`google-auth.ts:205-234`) | `refresh_token` grant; re-encrypts into vault; `updateCredential` CAS on `connectionId` so a disconnect mid-refresh fails closed (409) |
| 6 | `disconnect()` (`google-auth.ts:235-251`) | `rotateGeneration(owner, disconnect=true)` nulls secret; `POST oauth2.googleapis.com/revoke`; non-400 revoke failure surfaces as 502 with local-disconnect note |
| 7 | `save()` CAS (`google-auth.ts:56-72`) | `compareAndSwap` on `generation`; concurrent sign-in/disconnect wins, loser gets 409 "Connect again" |

### 1c. Threads, drafts, events

| Area | API | Detail |
| --- | --- | --- |
| Threads | `getThread(threadId)` (`google.ts:492`) | Full message fetch + MIME parse: nested multipart plain-text walk, header decode (`From/To/Subject`), `internalDate`, `labelIds`; attachment refs as `messageId:attachmentId:filename` |
| Threads | `listMail(query="in:inbox")` (`google.ts:644`) | `messages.list` then per-message `get`; workspace `thread()`/`searchMail` (`workspace.ts:125-160`) cache results into `mail` KV rows via `cacheMail`, remapping import refs to artifact ids |
| Threads | `GET /api/mail/threads/:id` (`app.ts:173-175`) | Serves cached-or-live thread sorted by date; 404 when empty; 409 when disconnected |
| Drafts | `GET/POST /api/drafts` (`app.ts:190-207`) | `emailDraftSchema` + optional uuid `id`; unknown id → 404; `createdAt` preserved on update; storage is `drafts` KV kind (email-shaped only, no calendar drafts) |
| Drafts | `emailDraftSchema` (`domain/index.ts:71-85`) | to 1–50, cc/bcc ≤ 50, subject ≤ 998 single-line, body ≤ 100 k, `attachmentIds` ≤ 10, optional `threadId`/`replyToMessageId` |
| Events | `listCalendars()` (`google.ts:501-541`) | Paginated `calendarList` (`summaryOverride`, `timeZone`, `accessRole`); hard cap throws past pagination limit |
| Events | `listEvents/listEventsPage()` (`google.ts:661-698`) | `calendarId` default `primary`; offset-datetime enforced; `calendarRangeSchema` ≤ 366 d; ≤ 100 mapped events per page |
| Events | `reviewEvent()` (`google.ts:560`) + `readSingleEvent` (`google.ts:543`) | Re-reads live event, returns `{event, version=etag}`; `workspace.prepare()` (`workspace.ts:392-410`) binds authoritative target into the proposal; calendar.update/delete without `targetVersion` later rejected (409) |
| Events | `createEvent/updateEvent/deleteEvent` (`google.ts:817-859`) | `?sendUpdates=all`; update/delete re-validate etag; `RecurringEventError` 422 (edit in Google Calendar); network-ambiguous failure → `OutcomeUnknownError` (no retry) |
| Events | `GET /api/calendars` + `GET /api/calendar/events` (`app.ts:161-172`) | Query-validated (`calendarId` ≤ 1024, ISO offset datetimes); range pair checked against `calendarRangeSchema` |
| Sends | `sendEmail(draft, attachments)` (`google.ts:716`) | MIME build with caps (`MAX_ATTACHMENT_BYTES` 10 MiB, total 20 MiB); `workspace.execute()` email path resolves attachment ids via `files` store first |
| Review gate | `propose/decide` (`actions.ts:39-218`) | Idempotency-key→SHA-256 id; hash binds `{input, connection, target, targetVersion}`; 30-min expiry; approve re-checks Google identity; `awaiting_review→executing→succeeded\|failed\|denied\|expired\|outcome_unknown` + activity receipt |
| Attachments | `getAttachment` (`google.ts:700`) + `importAttachment` (`workspace.ts:482-512`) | `files.import` with `Gmail · <subject>` provenance; `imports` table dedupes per `(reference, connectionId)`; `POST /api/mail/import-attachment` (`app.ts:267-270`) |
| Sample mode | `ensureSample/seed` (`workspace.ts:161-286`) | 4 mails + 3 events + 1 seeded `calendar.create` proposal; `connect`/`disconnect` flip `settings/google.enabled` without OAuth |

### 1d. OpenMuse tests covering Gmail/Calendar

| File | Coverage |
| --- | --- |
| `tests/google.test.ts` (~1020 lines) | Authed paths, nested MIME, attachment caps, calendarList paging, range validation, etag versioning, recurrence 422, outcome-unknown |
| `tests/oauth.test.ts` | PKCE connect/callback, state expiry, generation conflicts, refresh, revoke |
| `tests/actions.test.ts:165-201` | Review stores authoritative calendar details; execution bound to version |
| `tests/api.test.ts:264` | Calendar ranges + sample mail threads survive navigation |
| `tests/conversation-calendar.test.ts` | Chat-driven calendar flows |
| `tests/vault.test.ts` | Envelope round-trip + tamper rejection |
| `ROADMAP.md:16` (unchecked) | Live Google OAuth/mail/attachment/calendar acceptance on real test accounts |
| `CONTRIBUTING.md:43` | Sends + calendar mutations stay behind persisted versioned action reviews |
| `README.md:58,138-148` | Feature blurb (OAuth adapters, threads, drafts/attachments, reviewed events); setup: `WORKSPACE_MODE=live`, `TOKEN_ENCRYPTION_KEY` (32 B base64), connect read first, grant write when needed; changing/disconnecting invalidates pending connection-bound work |
| `.env.example` | `GOOGLE_CLIENT_ID/SECRET`, `TOKEN_ENCRYPTION_KEY` placeholders |

### 1e. Validation / error taxonomy (port as-is)

| Rule | Location | Behaviour |
| --- | --- | --- |
| `idPath` allowlist | `google.ts:114-117` | `^[A-Za-z0-9_-]+$` else "Invalid Google resource ID" |
| `calendarPath` reject | `google.ts:118-127` | Empty / > 1024 chars / control chars / `.` / `..` → "Invalid Google calendar ID" |
| Range bound | `domain/index.ts:41-49` | Pair must satisfy end > start and span ≤ 366 days |
| Timed vs all-day | `domain/index.ts:98-127` | All-day needs date-only; timed needs offset datetime + valid calendar date + IANA tz |
| Subject shape | `domain/index.ts:75-80` | ≤ 998 chars, single line (no CR/LF — header injection) |
| `GoogleApiError(status, detail)` | `google.ts:30-38` | Non-2xx Google responses surface with status; callers map to AppError codes |
| `OutcomeUnknownError` | `google.ts:20-28` | Ambiguous write outcome: never auto-retry; surface "check Google first" |
| `RecurringEventError` (422) | `google.ts:40-48` | Recurring instances/series refused with open-in-Calendar message |
| Pagination cap | `google.ts:536` | Calendar list past page limit throws rather than silently truncating |
| Attachment caps | `google.ts:16-18` | 10 MiB per file / 20 MiB total; `MAX_JSON_BYTES` guards base64 blowup |

## 2. ORBO Google surface inventory

| # | File | What exists today |
| --- | --- | --- |
| 1 | `server/src/plugins/catalogue.ts:188-248` | Sole Workspace entry: `google-drive` (`https://www.googleapis.com` + `/drive/v3`, `transport: google-drive-rest`); `auth.kind=user-oauth` (Google authorize/token/revoke URLs, scopes = `drive.readonly` only, `authorizationParams {access_type: offline, prompt: consent}`); `writeTools: [create_file, copy_file]` named-but-scope-refused; comment: Gmail/Docs/Sheets/Slides/Calendar/Chat/People are each "a further entry, not a flag" — none exists yet |
| 2 | `server/src/plugins/google-drive-rest.ts` (522 lines) | Read-only REST adapter implementing the `mcp.ts` `listTools`/`callTool` contract (search/get/export, `PAGE_SIZE` 25, `FILE_FIELDS`, shared-drive params) — the template for Gmail/Calendar adapters |
| 3 | `server/src/plugins/oauth.ts` (515 lines) | Canonical connect flow: sealed state (`CONNECT_LABEL=mcp-oauth-connect`) + PKCE, `STATE_TTL_MS` 10 min, single `CALLBACK_PATH=/api/plugins/oauth/callback`, `ConnectOrigin=settings\|admin` (name, never URL — no open redirect), refresh token mandatory, dynamic client registration |
| 4 | `server/src/plugins/routes.ts:245-2742` | `GET /api/plugins/`, server CRUD + `{oauth-client,refresh,account-mode,connect}`, `GET /api/plugins/connections` + `/oauth/callback`, confirm/recheck/delete, `POST/DELETE /api/plugins/grants`, `GET /api/plugins/for/:agentId`, `POST /api/plugins/call`. No Gmail/Calendar routes |
| 5 | `server/src/db/schema/core.ts:408-429` | `credentials(id, kind, provider, encrypted_value, key_id, metadata, revoked_at)` + partial-unique `credentials_active_key_idx` (one live row per kind/provider/key) |
| 6 | `server/src/db/schema/plugins.ts:46-628` | `mcp_servers.credential_id→credentials.id`; `mcp_user_credentials(userId, credential_id→credentials.id, granted scopes)`; `plugin_grants(agentId, ref=<serverId>/<tool>, granted_by/at)` — absence = refusal |
| 7 | `server/src/plugins/{store,access,transport}.ts` | Grant-gated dispatch: cached tool lists, per-agent allowlists, `user-oauth→person-oauth/person` mapping; Drive adapter reached via `transport`, never dialled as MCP (`transport.ts:156`) |
| 8 | `server/src/plugins/{broker,composio,composio-adapter,shared-accounts,shared-use*}.ts` | Composio brokering + shared/brokered accounts + shared-use approval inbox. `gmail` occurs only as doc/example slug (`composio://gmail`, `mcp/gmail/*` in `approvals/types.ts:108`, `app/.../approvals/rules.tsx:183`) — no Gmail connector |
| 9 | `app/src/routes/_authed/settings/connected-accounts/{index,$key}.tsx` | User connect UI (`pluginsPageQueryOptions`, `connectionsQueryOptions`, `google-drive` brand icon, brokered/shared rows). Gmail/Calendar entries render here with zero new screens |
| 10 | `app/src/routes/_authed/admin/plugins/` | Admin catalogue/grant screens (`$key`, `composio`, `$key_.bots.$agentId`, `$key_.tools.$tool`) — per-agent Gmail/Calendar grants land here |
| 11 | NOT Workspace mail/calendar | `server/src/google-oauth-transport.ts` + `server/src/provider-oauth.ts` + `server/src/config.ts:1247` (`GOOGLE` web-SSO client) + `desktop/PROVIDER_OAUTH.md` are **model-quota/SSO auth** (Gemini native transport, Desktop OAuth client, quota project — "do not reuse web SSO credentials"). No thread/draft/event code; no Gmail/Calendar scopes in `server/` |
| 12 | `server/src/plugins/account-mode.ts` | Shared-vs-personal mode transitions with revoke accounting — Gmail/Calendar entries inherit this (personal mode; shared only by explicit admin decision) |
| 13 | `server/src/plugins/content-governance.ts:55-56` | `refresh_token` / `refreshtoken` secret-scrub patterns — OAuth tokens never reach transcripts, receipts, or logs |
| 14 | `server/src/plugins/shared-use-routes.ts` + `approvals/shared-use*.ts` | Shared-use request/decision inbox (`GET/POST /api/approvals/shared-use`) — the human surface that approves a bot's Gmail/Calendar use of another person's account |
| 15 | `server/src/components/routes.ts` + `db/schema/components.ts` | Component grant surface (absence = refusal) — same pattern `plugin_grants` follows; no Gmail/Calendar component exists |

Counts: OpenMuse Gmail/Calendar surface = 12 files + 7 routes groups + 7 test files; ORBO Google surface = 11 inventoried items (1 Workspace connector, 0 Gmail/Calendar connectors).

## 3. Overlap / gap analysis

| Dimension | OpenMuse | ORBO | Gap / action |
| --- | --- | --- | --- |
| Credential storage | AES-GCM envelope in `credentials/google.secret` per owner, `connectionId` beside secret | Write-only vault `credentials.encrypted_value` + `key_id` rotation, revoke, redaction; per-user rows in `mcp_user_credentials` | Re-encrypt on import; never copy the OpenMuse envelope as the live row — mint ORBO rows via the OAuth flow |
| Token rotation | `generation` UUID CAS on every connect/disconnect; `updateCredential` CAS on refresh; singleflight refresh `Map` | `credentials_active_key_idx` partial-unique + `/:id/rotate` + `/:id/revoke` routes; sealed-state replay protection | Port singleflight refresh + generation-invalidation semantics into `plugins/oauth.ts`; keep ORBO `key_id` scheme |
| Per-agent grants | None — single owner, connection-wide scopes; approval is per-proposal | `plugin_grants` per `(agent, server/tool)` + `mcp_user_credentials` per person + approval rules (`approvals/`, `shared-use`) | Gmail send / calendar mutate tools must be grant-gated per agent AND approval-gated per call; read tools grant-gated only |
| OAuth flow | Per-owner PKCE + `generation`, 10-min state, consent-prompt refresh tokens | Sealed-state + PKCE, 10-min state, `offline`+`consent` on Drive entry, mandatory refresh token | Reuse ORBO flow verbatim; add `gmail`/`calendar` catalogue entries with their scopes (§5) — no second callback |
| Threads | `GET /api/mail/threads/:id`, cached `mail` rows, retained `drafts` | Channels/threads + retained drafts in `channels/` (08 §5) | Gmail threads stay read-only connector results, never canonical `messages`; drafts stay connector-scoped |
| Drafts | `GET/POST /api/drafts` (email-shaped, uuid) | No mail drafts; channel draft pill is chat-scoped | Do not merge — Gmail drafts live behind the connector until an explicit compose surface is approved |
| Event CRUD | Reviewed create/update/delete with etag `targetVersion`, `sendUpdates=all`, recurrence refused (422) | No event writes; Drive adapter is read-only by scope | Calendar writes arrive as approval-gated connector tools, never as first-class `/api/calendar/*` routes in v1 |
| Audit/receipts | Activity entry per proposal transition; `outcome_unknown` preserved | `audit_events` + `approval_receipts (thread_id, tool_call_id)` single-execution | Every Gmail/Calendar tool call writes an approval receipt; `outcome_unknown` maps to the ORBO unknown-outcome path (08 §4) |

## 4. Merge plan (governed connectors under plugins)

| Step | Action | Home |
| --- | --- | --- |
| 1 | Add catalogue entries `gmail` (scopes `gmail.readonly` [+ `gmail.send` only when send is approved]) and `calendar` (`calendar.events.readonly` + `calendar.calendarlist.readonly` [+ `calendar.events` only when mutate is approved]); same `user-oauth` shape + `offline`/`consent` params as `google-drive` | `server/src/plugins/catalogue.ts` |
| 2 | Port the `GoogleClient` read subset (`getThread`, `listMail`, `listCalendars`, `listEventsPage`, `getAttachment`) as REST adapters implementing the `mcp.ts` contract; keep Google-MCP tool names so grants survive a later vendor-MCP swap | new `server/src/plugins/google-{gmail,calendar}-rest.ts` (siblings of `google-drive-rest.ts`) |
| 3 | Gate writes: `sendEmail`/`createEvent`/`updateEvent`/`deleteEvent` become per-tool grants + per-call approval rules (hash-bound proposal, connection-identity re-check, etag `targetVersion`, recurrence 422, `outcome_unknown` preserved). **No new `/api/mail/*`, `/api/calendar/*`, `/api/google/*` routes** — access via `POST /api/plugins/call` + existing approval routes | `server/src/plugins/`, `server/src/approvals/` |
| 4 | Import hygiene: secrets re-encrypted into `credentials`/`mcp_user_credentials`; `connectionId` → credential pointer; OpenMuse `mail`/`events`/`drafts` KV rows are cache, not canonical — import nothing as system of record | `01-schema-unification.md §5` mapping |
| 5 | Port tests: `google.test.ts` client subset → adapter unit tests; `oauth.test.ts` + singleflight/rotation → `plugin-*.test.ts`; `actions.test.ts` version-binding → `approvals-*.test.ts` (bun:test, restorable `spyOn` per `06` gap #4) | `server/tests/` |

## 5. Risks

| # | Risk | Mitigation |
| --- | --- | --- |
| 1 | OAuth client ownership: OpenMuse env client vs ORBO web-SSO client vs Desktop model client serve different purposes/callbacks | Dedicated Workspace OAuth client for connector consent; never reuse SSO or model clients (`PROVIDER_OAUTH.md:37-40`) |
| 2 | Scope creep: `gmail.send` / `calendar.events` are powerful, Google-verification-sensitive scopes | Ship reads first; write scopes land only with the §4-step-3 approval-gated tools, each a reviewed catalogue decision |
| 3 | Test accounts: `ROADMAP.md:16` live acceptance unchecked; sample mode masks auth failures | Require real-account acceptance (connect, refresh, revoke, send, create/update/delete) before enabling write scopes |
| 4 | Single-owner → multi-tenant: OpenMuse `owner` is ambient; ORBO is per-user + per-agent grants | Every token read resolves `(user, agent, grant)`; cross-user `connectionId` use is a hard 409 |
| 5 | Mail-sending without approval: porting `sendEmail` as a plain tool bypasses the reviewed-write rule | Approval rule mandatory for `email.send` and all calendar mutations; read tools never imply write grants |
