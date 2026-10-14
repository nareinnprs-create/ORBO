# 16 — Phase 5 Spaces/Pages Inventory (PLAN.md §8.5 kickoff)

Research + inventory only. No product code changed. Sources verified on disk 2026-10-14.
Design baselines: `01-schema-unification.md` §3/§5, `02-api-surface.md` §3/§5, `03-route-tree.md` §3/§5, `08-subsystem-unification.md` §7.

Counts: **22 client files + 9 server/shared files** in scope; **7 tables** (of 21 OpenDots total); **13 endpoints** in scope (of ~47 OpenDots total); **0 ORBO page/space equivalents** (gap confirmed).

---

## 1. OpenDots Spaces/Pages file inventory (file → purpose → data deps)

Base path: `_sources/OpenDots/src/`.

| File | Purpose | Data deps |
| --- | --- | --- |
| `client/App.tsx:65-110` | `view` state machine (`chat/tasks/memories/space`); hash router `#/spaces/:spaceId(/pages/:pageId)`; dirty-page guard | `GET /state`, `GET /workspace`, `GET /conversations/:id/capture` |
| `client/page-navigation.ts` | `openPageLink()` — writes `location.hash`, re-fires `hashchange` if unchanged | hash only, no API |
| `client/SpaceNav.tsx` | Sidebar per-space collapsible tree, recursive `parentId` branches, 3s poll | `GET /spaces/:spaceId/pages` |
| `client/SpaceWorkspace.tsx` | Space home: loads page snapshot (`mergePageSnapshot`), routes library vs document vs outline | `GET /spaces/:spaceId/pages` |
| `client/SpaceLibrary.tsx` | Grid/list library, search, sort (recent/name), `pageExcerpt()` sanitizer | `Page[]` prop from workspace |
| `client/PageOutline.tsx` | Recursive `parentId` outline nav + new-page button | `Page[]` prop |
| `client/PageDocument.tsx` | Document shell: autosave hook, markdown safety check, source/visual toggle, move/delete, subpage, chat drawer | `PATCH /spaces/:spaceId/pages/:id`, `GET /spaces/:spaceId/pages/:id/conversation`, `POST /conversations/:id/page` |
| `client/PageConversation.tsx` | Per-page Dot conversation drawer (space-filtered dots), lease-backed thread | `POST /spaces/:spaceId/pages/:id/conversation`, `Chat` + `page-chat-requests` |
| `client/PageReviewCard.tsx` | Renders `review_space_page` agent draft; approve-save / decline; deleted-page state | `GET/POST /conversations/:id/reviewed-page`, `page-review-decision.ts` |
| `client/editor/RichEditor.tsx` | Tiptap visual editor (`@tiptap/react` + `@tiptap/markdown`), slash commands, ctrl/cmd-click page links | `documentExtensions()` from `markdown.ts`; `openPageLink` |
| `client/editor/markdown.ts` | Tiptap schema: StarterKit (h1–h3), TableKit, TaskList; `MarkdownManager`; `inspectMarkdown()` allowlist | Tiptap extensions only |
| `client/editor/slash-commands.ts` | `/` block menu extension | RichEditor |
| `client/editor/autosave.ts` | `PageAutosave` controller: debounce, `expectedRevision`, 409-reload semantics | PATCH endpoint via callback |
| `client/editor/use-page-autosave.ts` | React binding (`useSyncExternalStore`) over `PageAutosave` | `PATCH /spaces/:spaceId/pages/:id` |
| `client/editor/DocumentMenu.tsx` | Overflow menu: outline toggle, subpage, move, save-conversation, delete | PageDocument callbacks |
| `client/editor.css` | `.document-prose` editor styles | — |
| `client/page-context.ts` | Prefixes chat text with `[title](/#/spaces/.../pages/...)` link | `Page{id,spaceId,title}` |
| `client/page-chat-requests.ts` | Builds page-scoped chat requests for the drawer | thread + page context |
| `client/page-review-decision.ts` | Decision helpers: match/restore/delete detection for review receipts | `ReviewedPage` from `server/pages.ts` |
| `client/page-snapshots.ts` | `mergePageSnapshot()` — reconciles 3s polls with local edits/deletes | `Page.revision` |
| `client/WorkspaceDialog.tsx` | `Dialog` union (`space/dot/settings/memory/schedule`); create-space + create/edit-dot forms | `POST /spaces`, `POST/PUT /dots` |
| `client/api.ts` | `api()` fetch + owner-token headers | all endpoints above |
| `server/workspace.ts` | `WorkspaceStore`: `spaces/dots/dot_spaces/thread_bindings/task_threads/calls/captures` DDL + seed (`Everyday` space + `Dot`) | SQLite `node:sqlite` |
| `server/pages.ts` | `Pages` class: CRUD, `parentId` cycle check, `expectedRevision` 409, `createReviewed` idempotency, thread lease, delete-reparents-children | `pages/page_reviews/page_threads` |
| `server/page-service.ts` | `conversation()` (reserve→Intelligence `getOrCreateThread`→finish/release, 30s bound) + `saveConversation()` (100k cap) | `pages.thread/reserveThread/finishThread`, Intelligence SDK |
| `server/page-routes.ts` | Page endpoints (see §2) + `PageError→400/404/409` mapping | `platform.workspace.pages`, `platform.pages` |
| `server/workspace-routes.ts` | `GET /workspace`, `POST /spaces`, dots/conversations/voice; mounts `pageRoutes` at `/` | `WorkspaceStore`, `VoiceService` |
| `server/page-tools.ts` | Agent tools: `list_authorized_spaces`, `list/read/create/edit_space_page`; hash `/#/spaces/...` URLs in results | `pageAccess()` + `canAccessSpace()` ACL |
| `shared/page-review.ts` | `pageReviewSchema` (title ≤160, content 1–20k, spaceId) + `review_space_page` tool def | zod |
| `shared/types.ts` | `Space/Dot/Conversation/WorkspaceState` shapes; `spaceIds[]` ACL view | — |
| `server/platform.ts` | Wires `WorkspaceStore` + `PageService` + Intelligence into routes/tools | all server files above |

Out of scope but adjacent: `Chat.tsx`, `CallView.tsx`, `TaskPresentation.tsx` (chat/tasks views share the shell only).

### 1.1 Supporting modules (not ported as-is, but port steps read them)

| File | Why it matters to the port |
| --- | --- |
| `server/store.ts:293-312` | Task/memory settings shapes; `paused`/`memoryAllowed` flags gate page-chat wiring |
| `server/workspace-routes.ts:69-136` | `dotSchema` (name ≤40, instructions ≤2000) — Dots fold into Agents, space ACL travels with them |
| `server/dot-agent.ts`, `server/runner.ts` | How `memoryAllowed`/`researchAllowed` gate model context; page content must obey the same gates |
| `server/tanstack-tools.ts` | Tool-registration pattern to reuse when wiring `pageTools` + `review_space_page` into the governed gateway |
| `shared/learning.ts` | `learningContainerId` slug validation rides `dots`/`thread_bindings`; keep validation on import |
| `shared/types.ts:WorkspaceState` | Poll shape (`spaces/dots/conversations/setup/calls`) — ORBO replaces polling with QueryClient + WS events |
| `client/WorkspaceDialog.tsx` (`schedule` dialog) | Page→task scheduling entry point; defers to routines/tasks subsystem, not duplicated here |

---

## 2. Persistence / API inventory

### 2.1 Tables (7 in scope; SQLite epoch-ms INTEGER; no FKs)

Per `01-schema-unification.md` §3 (OpenDots 21 tables total):

| Table | DDL owner | Purpose / key columns |
| --- | --- | --- |
| `spaces` | `server/workspace.ts:22` | Container: `id, name, description, createdAt` |
| `dots` | `server/workspace.ts:23` | Agent: `spaceId, name, instructions, researchAllowed, memoryAllowed, learningContainerId*, skillDeliveryEnabled*` (`*` = later ALTER) |
| `dot_spaces` | `server/workspace.ts:50` | Agent↔space ACL `(dotId, spaceId)`; migrated once from `dots.spaceId` |
| `thread_bindings` | `server/workspace.ts:24` | Conversation: `id, dotId, ownerId, title, createdAt, learningContainerId*` |
| `pages` | `server/pages.ts:60` | Document: `id, spaceId, parentId, title, content, revision, createdAt, updatedAt, sourceThreadId`; limits title ≤160 / content ≤100k |
| `page_reviews` | `server/pages.ts:51` | Review receipt `(threadId, toolCallId)` PK → `pageId, spaceId, draft`; **outlives page delete** (retry must not recreate) |
| `page_threads` | `server/pages.ts:61` | Page↔Dot thread binding `(pageId, dotId)` PK → `threadId UNIQUE, ready, leaseUntil` (60s lease) |

### 2.2 Endpoints (13 in scope; all under `/api`; mounts per `02-api-surface.md` §3)

| Method | Path | Handler | Notes |
| --- | --- | --- | --- |
| GET | `/api/workspace` | `workspace-routes.ts:42` | spaces + dots + conversations + setup + calls |
| POST | `/api/spaces` | `workspace-routes.ts:51` | name ≤60, description ≤500 |
| GET/POST | `/api/spaces/:spaceId/pages` | `page-routes.ts:62,70` | list / create (201) |
| GET/PATCH/DELETE | `/api/spaces/:spaceId/pages/:id` | `page-routes.ts:65,85,100` | PATCH needs `expectedRevision`; 409 on stale |
| POST | `/api/spaces/:spaceId/pages/:id/conversation` | `page-routes.ts:109` | `{dotId}` → lease-bound Intelligence thread |
| POST | `/api/conversations/:id/page` | `page-routes.ts:123` | save thread transcript → page (201) |
| GET | `/api/conversations/:id/page-context` | `page-routes.ts:52` | `{id, spaceId, title}` or null |
| GET/POST | `/api/conversations/:id/reviewed-page` (`/:toolCallId` on GET) | `page-routes.ts:8,29` | idempotent create-reviewed; 403 if Dot lost space access |
| POST | `/api/conversations` | `workspace-routes.ts:137` | thread creation (page threads reuse this identity) |
| GET | `/api/*` fallback | `index.ts:108` | 404 JSON |

Validation: `pageInput`/`pagePatch` zod in `pages.ts:8-22`; review draft ≤20k chars (`shared/page-review.ts`), page content ≤100k.

### 2.3 Validation + error contract (must survive the port byte-for-byte)

| Rule | Source | Behavior |
| --- | --- | --- |
| Page title 1–160 chars, content ≤100k | `pages.ts:8-22` | 400 with guidance string on violation |
| `parentId` cycle rejection | `pages.ts:96-107` | 400 `cannot be moved into itself or a descendant` |
| `expectedRevision` required on PATCH | `pages.ts:202-238` | 409 `Reload the latest revision`; single-statement `UPDATE … WHERE revision=?` |
| Review draft 1–20k chars + spaceId | `shared/page-review.ts:2-8` | 400 `Enter a valid page draft` |
| Double-submit same `(threadId, toolCallId)` | `pages.ts:156-201` | Returns existing page; 409 if space or draft differs |
| Revoked space access | `page-routes.ts:15-19,36-40` | 403 `no longer has access`; agent tools throw `Space access has been revoked` |
| Page-thread lease race | `pages.ts:249-262` | 409 `being created. Retry shortly`; 60s `leaseUntil` |
| Delete reparents children, keeps receipts | `pages.ts:285-313` | Children adopt deleted page's `parentId`; `page_reviews` rows retained |
| Conversation save with no text / >100k | `page-service.ts:131-136` | 400 with cap message; draft never discarded (503 path keeps editor state) |

---

## 3. ORBO gap analysis — no page/space model (confirmed)

| Check | Result |
| --- | --- |
| `rg -l -i "spaces" server/src/db/schema/` | **no hits** — no `spaces`/`agent_spaces` table; `01` §5 proposes them as *new* |
| `rg -l "createSpace\|spaceId\|page_threads\|page_reviews" server/src` | **no hits** — no workspace/pages store |
| `rg -l "api/pages\|api/spaces" server/src app/src` | **no hits** — no pages REST resource (`02` §4 marks Documents/pages a **Gap**) |
| `rg -l "spaces\|SpaceWorkspace\|PageDocument" app/src/routes app/src/lib` | **no hits** — `03` §1 60 route files contain no spaces subtree; only `page-shell` layout + prose "page" comments (false positives) |
| Nearest ORBO analogues | `server/src/channels/attachments.ts` (bytes only); dropped `documents/chunks` (migration 0010, `01` §1); `computer_page_frame` = screenshot, not document |
| Planned homes (design only) | `spaces/pages/page_reviews/page_threads` tables (`01` §5); `server/src/pages/` module + `/api/pages` canonical (`08` §7, `02` §5); `(tabs)/spaces` routes (`03` §5) |

**Verdict: full port, not a merge.** Every behavior (CRUD, revisions, review flow, thread binding, editor) must be built; ORBO contributes only bytes (`attachments`) + thread identity (still an open decision, `01` §9 #1) + auth/vault.

---

## 4. Port checklist (dependency order: tables → API → routes → editor → review flow)

| # | Step | Depends on | Done when |
| --- | --- | --- | --- |
| 1 | Tables: `spaces` (+`owner_user_id`), `pages`, `page_reviews`, `page_threads`, `agent_spaces` (from `dot_spaces`); nullable agent superset cols | — (needs **Spaces-ownership decision**, `01` §9 #3) | Drizzle migration + `drizzle.config.ts` entry; epoch-ms→timestamptz |
| 2 | API core: `POST/GET /api/pages`, `GET/PATCH/DELETE /api/pages/:id` with `pageInput/pagePatch`, `expectedRevision` 409, 404 scope checks | 1 | Ported `pages.test` + `page-routes` conflict cases green |
| 3 | Routes: `(tabs)/spaces/index`, `[spaceId]/index`, `[spaceId]/pages/[pageId]` + hash→path redirect map | 2 | `#/spaces/:s/pages/:p` deep links redirect; `+not-found` covers bad ids |
| 4 | Library/nav: `SpaceLibrary` (grid/list/search) + `SpaceNav`/`PageOutline` trees | 2, 3 | Read-only library browses real API data |
| 5 | Editor: visual editor + `markdown.ts` extensions + `slash-commands` + `DocumentMenu`; markdown fallback | 2, 3 | Create/edit round-trips; 100k/title caps enforced client + server |
| 6 | Autosave: `PageAutosave` + `use-page-autosave` + `page-snapshots` merge + dirty guard | 5 | 409 shows reload-notice; navigation guard blocks data loss |
| 7 | Page↔thread: `page_threads` lease flow + `POST :id/conversation` + `POST /conversations/:id/page` + `page-context` | 1, 2 (+ threads decision `01` §9 #1) | Drawer opens bound thread; save-conversation caps at 100k |
| 8 | Review flow: `review_space_page` tool + `createReviewed` idempotency + `PageReviewCard` + receipts-outlive-delete | 1, 2, 7 | Double-submit creates one page; deleted-page receipt renders `deleted:true` |
| 9 | Agent tools + ACL: `list/read/create/edit_space_page` via governed gateway; `canAccessSpace` on every call | 2, 8 | Revoked-space Dot gets 403, no leak of titles |
| 10 | Delete + regression: reparent-children delete, `page_threads` cleanup, `page_reviews` retention; port `page-review/page-context/autosave/markdown/library` suites | 1–9 | Full OpenDots pages suite green under Bun (`vi.mock`→`spyOn`, `08` §merge-seq #6) |

---

## 5. Coupling risks

| # | Risk | Detail | Mitigation |
| --- | --- | --- | --- |
| 1 | **Tiptap is web-only** | `RichEditor` uses `@tiptap/react` + `@tiptap/markdown` + TableKit/TaskList (10 refs in `package.json`); no React Native entry | Gate decision: RN-web adapter vs native editor (`.native.tsx` split per `03` §7); markdown source mode ships first, visual editor web-only |
| 2 | **Hash-link migration** | Page links are hash-shaped (`/#/spaces/:s/pages/:p` in `page-tools.ts:22`, `page-context.ts:12`, `RichEditor` ctrl-click) but target tree uses real paths (`03` §5) | Ship redirect map hash→`(tabs)/spaces/[spaceId]/pages/[pageId]`; agent tool URLs must emit new shape from day one |
| 3 | **Spaces-ownership decision OPEN** | `01` §9 blocker #3: OpenDots spaces have no ORBO analogue; `ownerId` is a bare string (`workspace.ts:18`) | Do not create `spaces` table until owner confirms survival + `owner_user_id` semantics (single-owner vs multi-user ACL) |
| 4 | Threads decision gates page binding | `page_threads` keys on thread identity; `threads` vs `channels` vs Intelligence unresolved (`01` §9 #1, `08` §merge-seq blocker 1) | Build page CRUD first (steps 1–6); defer step 7 until threads decision lands |
| 5 | Revision concurrency across Postgres | `BEGIN IMMEDIATE` + `revision=?` guard is SQLite-serial; needs row-level `UPDATE … WHERE revision=?` + retry under Postgres | Prove with concurrent-PATCH test before editor ships |
| 6 | Intelligence coupling in `PageService` | `conversation()`/`saveConversation()` call `getOrCreateThread`/`getThreadMessages` with 30s bound; failures surface as 503 draft-safe errors | Keep 503-no-draft-loss contract; never auto-retry thread creation (lease 409 path) |
| 7 | Import conversions | SQLite epoch-ms INTEGER → timestamptz; bool-int → boolean; `dot_spaces` → `agent_spaces` | One importer with UTC/DST verification (`01` §7); no plaintext-secret adjacent columns exist here, but keep review `draft` out of logs |

---

*Provenance: OpenDots `_sources/OpenDots/src/{client,server,shared}` + `02-api-surface.md`, `01-schema-unification.md` §3/§5, `03-route-tree.md` §3/§5, `08-subsystem-unification.md` §7. ORBO checks: `server/src/db/schema/`, `server/src`, `app/src/routes`, `app/src/lib` (searches above).*
