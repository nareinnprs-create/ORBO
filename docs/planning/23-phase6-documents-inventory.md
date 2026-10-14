# 23 — Phase 6 Documents Inventory (PLAN.md §8.6 kickoff: OpenMuse Documents/PDF)

Research + inventory only. No product code changed. Sources verified on disk 2026-10-14.
Design baselines: `01-schema-unification.md` §2/`§5`–`§6`, `02-api-surface.md` §5, `03-route-tree.md` §5, `08-subsystem-unification.md` §7, `16-phase5-spaces-inventory.md`.
Covers PLAN.md §6 row: *"Documents pipeline: email attachment → PDF → form values → filled copy → reviewed reply → receipt; PDF view/paging/zoom/share"*.

Counts: **~18 OpenMuse files in scope** (8 server + 2 packages + 7 mobile + 1 computer + tests); **4 endpoints**; **3 KV kinds + disk store**; **0 ORBO PDF equivalents** (gap confirmed).

---

## 1. OpenMuse pipeline file inventory (stage → files → purpose)

Base paths: `_sources/OpenMuse/apps/server/src/`, `_sources/OpenMuse/packages/`, `_sources/OpenMuse/apps/mobile/src/`.

| Stage | Files | Purpose |
| --- | --- | --- |
| 1. Trigger (idea) | `apps/server/src/engine/service.ts:580-596` | `document`-kind `Idea` minted from mail matching `/form\|permission\|complete\|fill\|sign/i` (max 5); prompt `Help complete the PDF from "…" and prepare a reply for review` |
| 1. Trigger (prompt router) | `apps/server/src/engine/conversation.ts:473-479` | `/permission\|pdf\|form/i` prompt hint routes the person toward Mail → document flow when no PDF is present |
| 2. Attachment import | `apps/server/src/workspace.ts:482-514` (`importAttachment`) | Parses `messageId:attachmentId:filename` ref, checks `mail.attachments` + `connectionId`, fetches bytes via Google, `files.import(..., key=["attachment", connectionId, ref])`; dedupes via `imports` kind (`artifactId`, `connectionId`) |
| 2. Attachment entry | `apps/server/src/app.ts:267-269` | `POST /api/mail/import-attachment` (`{reference}` → `Artifact`, 201) |
| 3. PDF inspect | `packages/integrations/src/pdf.ts:71-88` (`inspectPdf`, `loadPdf`) | Guards: nonempty, `%PDF-` magic, ≤10 MiB, `ignoreEncryption:false`, rejects encrypted + XFA, 1–500 pages; returns `{pageCount, fields[]}` with text/checkbox/unsupported typing |
| 3. PDF fill | `packages/integrations/src/pdf.ts:111-150` (`fillPdf`, `removeActions`) | Typed fill (text→string ≤10k chars, checkbox→boolean; unknown/unsupported → `PdfError`), `removeActions` strips `OpenAction/AA/A/JS/JavaScript`, re-renders appearances with Helvetica; never executes scripts |
| 3. Sample fixture | `packages/integrations/src/pdf.ts:152+` (`createSamplePdf`) | Synthetic 2-page permission form (blank text + checkbox fields); seeded at `workspace.ts:173-174` as `Field trip permission slip.pdf` |
| 4. File store | `apps/server/src/files.ts` (`Files` class) | `import` (random vs `deterministicFileId` v5-SHA256 idempotent write via tmp+`link`, `0o700` dir / `0o600` files, `sanitizeFileName` ≤180 code points), `get`/`bytes` (UUID-gated, traversal-checked `pathFor`), `fill` (fills then re-imports as `"… — filled.pdf"`, `source="Filled from …"`, `parentId=<orig>`, fill-key binds `["fill", opKey, id, sorted values]`), `signed` (15-min HMAC content URL), `list` |
| 4. File routes | `apps/server/src/app.ts:241-265` | `POST /api/files` (multipart `file`, source `"Uploaded by you"`, 201), `GET /api/files/:id/content` (`application/pdf`, `inline` disposition), `POST /api/files/:id/fill` (`{fields}` → `Artifact`, 201); `app.ts:75` 10 MB → 413, `app.ts:83-91` `PdfError` → 422 without stacks/tokens |
| 4. Signed URLs | `apps/server/src/auth.ts:42-62` (`sign`/`verify`) | `owner\npath\nexpires` HMAC-SHA256, 15-min expiry; `app.ts:135` allowlists `/api/files/…/content` alongside browser preview/console |
| 5. Task orchestration | `apps/server/src/engine/service.ts:969-1057` (`document()`) | 4-step plan: resolve mail → `importAttachment` (checkpoint `source`, event `Found the document`) → `waiting_input` with supported field names (`missingFields` in state; original kept intact) → `files.fill(owner, id, fields, "document:"+task.id)` (checkpoint `filledId`, `artifactIds`, event `Saved a filled copy`) → `prepare(...,"document-reply")` → `waiting_approval` |
| 6. Reviewed reply | `apps/server/src/engine/service.ts:754-820` (`prepare`), `:1034-1051` | Builds `email.send` proposal (`to=[mail.from]`, `Re:` subject, `attachmentIds:[filledId]`, `threadId`, `replyToMessageId`); `ActionProposal` `awaiting_review` gate, idempotent by task |
| 6. Receipt | `apps/server/src/workspace.ts:450-468` (execute `email.send`) + `packages/domain/src/index.ts:143-167` (`ActionProposal`, `ActivityEntry`) | Sends via Google with `attachmentIds` bytes resolved from the store; returns `Gmail sent message · <id>` receipt; status machine `awaiting_review → executing → succeeded\|failed\|denied\|expired\|outcome_unknown` with per-transition activity entry |
| 7. Viewer (web) | `apps/mobile/src/PdfReader.web.tsx` | Prev/Next paging (`page/pageCount`), zoom 50–200% step 25, `iframe src=url#page=&zoom=`, download/print via reader toolbar |
| 7. Viewer (native) | `apps/mobile/src/PdfReader.native.tsx` | `react-native-pdf` (`ref.setPage`), zoom scale 1–3 step 0.25, `onLoadComplete` page count, `ErrorNotice` surface |
| 7. Detail/share | `apps/mobile/src/details.tsx:744-846` (`FileDetail`) | Prefills `values` from `fields` (checkbox `"true"/"Yes"` coercion), `fill()` → `POST /api/files/:id/fill` → `open({type:"file"})`; `share()` web = `Linking.openURL`, native = authed `downloadAsync` → `Sharing.shareAsync` (`application/pdf`); `Attach to email` opens draft with `attachmentIds:[id]`; `parentId` renders `filled copy` badge |
| 7. Cards/nav | `apps/mobile/src/thread-artifacts.tsx` (`FileThreadCard`, `TaskThreadCard`), `apps/mobile/src/workspace.tsx:18`, `details.tsx:111,171-178` | File card (first 4 fields preview → `open({type:"file"})`); task card hydrates `files` by task id on replay (**signed URLs never stored in messages**); mail card `Import` action imports then opens |
| 8. Browser import | `apps/server/src/browser.ts:254-290` (`imports`/`importsOwned`) | Worker `/sessions/:id/downloads` → `files.import` per download, `browser-downloads` kind dedupes (`download.id → fileId`); surfaced in `details.tsx:887-899` (`N PDF downloads added to Files`) |
| 8. Computer transfer | `apps/computer/files.py:46-68` (`read_pdf`/`write_pdf`) | `read_pdf`/`write_pdf` ops, base64 payload, 10 MiB cap, `%PDF-` magic check both directions |
| 8. Mail refs | `apps/mobile/src/mail-tool-card.tsx:9-20`, `packages/integrations/src/google.ts` | Attachment refs are `messageId:attachmentId:filename` strings on `Mail.attachments`; fetched via Gmail `getAttachment` |

### 1.1 Tests covering the pipeline

| File | What it proves (must survive the port) |
| --- | --- |
| `_sources/OpenMuse/tests/pdf.test.ts` | Sample is 2-page with blank fields; fill round-trips text+checkbox, leaves source bytes untouched, unchecks correctly |
| `_sources/OpenMuse/tests/browser-imports-race.test.ts` | Concurrent browser-download imports dedupe to one file row |
| `_sources/OpenMuse/apps/worker/tests/fixtures/document.pdf` + `lifecycle.test.ts` | End-to-end worker download → import fixture |
| `_sources/OpenMuse/tests/workflows.test.ts`, `engine.test.ts` | `document()` task transitions (`waiting_input` → `waiting_approval`); approval-gated `email.send` |

### 1.2 Supporting modules (not ported as-is, but port steps read them)

| File | Why it matters to the port |
| --- | --- |
| `apps/server/src/engine/service.ts:270-360` (task state machine) | `waiting_input` / `waiting_approval` / checkpoint / `ctx.guard` / `ctx.event` primitives the `document()` flow rides; port reuses the Work run ledger, not this scheduler |
| `apps/server/src/db.ts` (`Store`: `get/put/list/insertIfAbsent/compareAndSwap`) | KV access behind every stage; `insertIfAbsent` is the idempotency primitive for `imports`, `browser-downloads`, and keyed `files.import` |
| `apps/server/src/config.ts` (`dataDir`, `mode`, `publicUrl`) | Disk root for `$dataDir/files`, `sample`-mode seed switch, public base for signed URLs |
| `apps/server/src/errors.ts` (`AppError`, `PdfError` mapping) | Status contract source: 404 unknown id, 409 disconnected/stale, 413 oversize, 422 malformed PDF |
| `packages/domain/src/agent.ts` (`AgentTask`, `AgentArtifact`, `Idea`) | `document`-task `input {messageId, fields?, reply?}`, `state {source, missingFields, filledId}`, `artifactIds` linkage the Work producer must carry |
| `packages/domain/src/index.ts:emailDraftSchema` | `attachmentIds` max 10, subject single-line ≤998, body ≤100k — reply-draft limits the ported composer keeps |
| `apps/mobile/src/workspace.tsx` (workspace provider, `api.request`, `api.url`, `open/close`) | Signed-URL mint-per-open, authed `Bearer` download, `{type:"file"}` sheet nav the Spaces viewer replaces |
| `apps/mobile/src/agent-workspace.tsx` (`useAgentWorkspace`, 3s poll) | Task polling behind `TaskThreadCard` re-hydration; ORBO replaces polling with QueryClient + WS events (same swap as `16` §1.1) |
| `apps/worker/src/downloads.ts`, `apps/worker/src/server.ts` | Worker-side `/sessions/:id/downloads` producer feeding `browser.ts:importsOwned`; download bytes flow worker → server → `files.import` |
| `apps/server/src/demo/entry.ts`, `demo/model.ts` | Sample-mode mail + permission-slip seeding path; keeps the demo deterministic without Google |

---

## 2. Server / API / persistence inventory

### 2.1 Persistence (OpenMuse `records` KV + disk; per `01` §2)

| Kind / store | Writer | Purpose / key columns |
| --- | --- | --- |
| `files` kind | `files.ts:import` | `Artifact {id, name, mimeType:"application/pdf", size, pageCount, fields[{name,value,type}], url:"" (signed on read), createdAt, source, parentId?}` |
| `imports` kind | `workspace.ts:importAttachment` | Idempotency: `id=<attachment ref>` → `{artifactId, connectionId}` |
| `browser-downloads` kind | `browser.ts:importsOwned` | Idempotency: `id=<download id>` → `{fileId}` |
| Disk `$dataDir/files/<uuid>.pdf` | `files.ts:pathFor` | Content bytes (`0o600`, traversal-checked `resolve`+`startsWith`); DB holds metadata only |
| `actions` kind | `engine/service.ts:prepare` | Review receipt for the reply (`document-reply` proposal + status machine) |

No FKs, no SQL DDL; owner is a plain string. Proposed unified target per `01` §5–§6: shared `artifacts` table (`files` + `agent-artifacts` merged).

### 2.2 Endpoints (4; mounts per `app.ts:241-269`)

| Method | Path | Handler | Notes |
| --- | --- | --- | --- |
| POST | `/api/files` | `files.import(name, bytes, "Uploaded by you")` | Multipart PDF only; 201 `Artifact` |
| GET | `/api/files/:id/content` | `files.bytes` | Signed-URL authed; `application/pdf`, `inline` |
| POST | `/api/files/:id/fill` | `files.fill(owner, id, fields)` | `{fields: Record<string,string\|boolean>}`; 201 new `Artifact`; original untouched |
| POST | `/api/mail/import-attachment` | `workspace.importAttachment` | `{reference}` → 201 `Artifact`; 404 on stale ref, 409 when Google disconnected |

Validation: 10 MiB → 413; `PdfError` → 422; UUID-shaped ids else 404; fill rejects unknown fields, type mismatches, >10k-char values, unsupported widgets.

### 2.3 Error + idempotency contract (must survive the port byte-for-byte)

| Rule | Source | Behavior |
| --- | --- | --- |
| Non-PDF / empty / oversize bytes | `pdf.ts:loadPdf`, `files.ts:import`, `app.ts:75` | 422 (`PdfError`) or 413 with size guidance; worker and computer `read_pdf` enforce the same 10 MiB |
| Encrypted or XFA form | `pdf.ts:loadPdf` | 422 `Encrypted PDFs are not supported` / `Unsupported XFA PDF form` |
| Over 500 pages | `pdf.ts:loadPdf`, `files.ts:import` | 422; page count persisted on `Artifact` for the viewer pager |
| Unknown / mistyped / unsupported field | `pdf.ts:fillPdf` | 422 naming the field (`Unknown PDF field:`, `requires a string/boolean`, `Unsupported PDF field:`) |
| Malformed value / font render failure | `pdf.ts:inspectField`, `fillPdf` | 422 with fallback text (`malformed value`, `use characters supported by this form's font`) |
| Retried import or fill (same operation key) | `files.ts:import` (tmp + `link`, `EEXIST` re-read), `deterministicFileId` | Returns the existing row; the browser-import race collapses to one file |
| Fill key binds sorted values | `files.ts:fill` (`fill` + opKey + id + sorted pairs) | Same values retry idempotently; changed values produce a distinct copy |
| Stale attachment ref / disconnected Google | `workspace.ts:importAttachment` | 404 `Attachment not found. Refresh…`, 409 `Google is disconnected` |
| Non-UUID file id / traversal attempt | `files.ts:assertFileId`, `pathFor` | 404 `File not found` (never 500, never a path leak) |

---

## 3. ORBO gap analysis — no PDF pipeline (confirmed)

| Check | Result |
| --- | --- |
| `rg -l -i "document\|pdf\|form-fill\|attachment" server/src app/src` hits | Only **false positives**: `server/src/channels/{attachments,attachment-mime,attachment-parts}.ts` (chat bytes), `app/src/lib/markdown.tsx` (`/document/` Drive-chip regex), `__root.tsx` (DOM-document comments), `proposed-bot.tsx` ("not a document" prose) |
| `pdf-lib` / `react-native-pdf` / `expo-sharing` in ORBO deps | **Absent** — root `package.json` has no PDF dependency; nothing to render, inspect, or fill with |
| Byte store analogue | `server/src/db/schema/core.ts:518` `attachments` (`bytes bytea`, `mime_type`, `upload_group`, channel-scoped, model-context oriented) — **no pageCount/fields/source/parentId, no fill lineage** |
| File/document REST resource | **None** — `server/src/app.ts:1439` mounts only `/api/attachments` (+ `/api/channels/:id/attachments`); no `/api/files`, `/fill`, or `/mail/import-attachment` |
| Form-fill / reviewed-reply flow | **None** — no `waiting_input` field collection, no fill-as-new-copy, no `document-reply` proposal kind; approvals engine (`server/src/approvals/`) has no email-send-with-attachment path |
| Viewer / paging / zoom / share | **None** — `app/src/routes/` has no files/spaces viewer subtree; no paging/zoom component, no `FileSystem`/`Sharing` share flow |
| Planned homes (design only) | `artifacts` table (`01` §5–§6); `server/src/pages/` reusing attachment bytes + `/api/pages`, `/api/attachments` (`08` §7, `02` §5); `(tabs)/spaces` routes (`03` §5); Phase 5 `16` ports Spaces/Pages first, PDF lands Phase 6 |

**Verdict: full port, not a merge.** ORBO contributes bytes (`attachments`), auth/vault, the approvals gate, and (pending) Spaces + threads identity. Every PDF behavior — inspect, fill, lineage, viewer, share — must be built.

Additional checks run:

| Check | Result |
| --- | --- |
| `rg -n "api/(pages\|spaces\|files)" server/src/app.ts` | Only `/api/attachments` mounts (§3 row above) — no file/page/space resource |
| `rg -n -i "pdf\|artifact" server/src app/src shared/` | **No hits** outside prose comments — no artifact type, no `pageCount`/`fields` model anywhere |
| `Get-ChildItem app/src/routes -Recurse` (60 route files) | No `spaces`, `files`, or viewer subtree; IA homes (`(tabs)/spaces`) exist only in `03` §5 design |
| Gmail/Calendar connector in ORBO | **Absent** — `08` §8 plans Google as a governed plugin; no `mail.attachments` ref shape, no `getAttachment` path |

---

## 4. Merge plan (dependency order: tables → API → viewer → tool → task → mail)

### 4.1 Pipeline-stage homes (one subsystem per stage — no second scheduler, no second blob store)

| Pipeline stage | ORBO home | Why this home |
| --- | --- | --- |
| Attachment import + file bytes | `server/src/pages/` reusing `channels/attachments.ts` bytes (`08` §7) | Bytes already have an owner-scoped, swept, indexed store; PDF adds metadata + lineage, not a new blob column |
| `artifacts` metadata + fill lineage | New `artifacts` table (`01` §5) | `parentId`/`source`/`fields` have no `attachments` columns; one metadata row per file, many fills per original |
| PDF viewer + fill form UI | `(tabs)/spaces` file viewer (Phase 5 tree, `16` §4) | PLAN.md §3 IA: Spaces is the document library; viewer is a document surface, not a Work screen |
| Document task run (`waiting_input` → fill → `waiting_approval`) | **Work** subsystem (`server/src/work/` + `routines/`, `08` §6) | Task runs, leases, checkpoints, and input-requests are Work's job; Documents owns the *output* (artifacts in Spaces) |
| Form-fill execution | Governed tool via `server/src/plugins/` + approvals gate (`08` §4) | Same shape as `computer_*` tools: allowlisted, per-agent granted, audited; never a raw route |
| Reviewed reply + receipt | `server/src/approvals/` (`approval_requests` + `approval_receipts`) | `document-reply` is an `approval_kind='action'` proposal; receipt keyed `(thread_id, tool_call_id)` like OpenDots `mcp_actions` |
| Mail fetch for import | Governed Google connector plugin (`08` §8) | Raw Gmail routes are never mounted (`02` risk #5); refs resolve server-side through the vault-held credential |

### 4.2 Port steps

| # | Step | Depends on | Done when |
| --- | --- | --- | --- |
| 1 | Table: `artifacts` (`owner_user_id`, `name`, `mime_type`, `size`, `page_count`, `fields jsonb`, `source`, `parent_id`, bytes via `attachments` **or** inline — decide once, `01` §9) | Spaces-ownership + threads decisions (`01` §9 #1/#3) | Drizzle migration; OpenMuse `files` rows import (`fields[]` preserved, owner string → `users.id`) |
| 2 | File API: `POST /api/files`, `GET /api/files/:id/content` (short-lived signed URL, mirroring `auth.ts:sign`), `POST /api/files/:id/fill` with `PdfError`→422 / 10 MiB→413 contract | 1 | Ported `pdf.test.ts` cases green (untouched-source, round-trip, checkbox); `deterministicFileId` idempotency kept for retried fills |
| 3 | PDF viewer port (`PdfReader.web` first) | 2 | Paging + zoom + download round-trips against real API; native `react-native-pdf` gated per `05-mobile-web-parity` (visual-editor precedent: markdown/web first, native behind `.native.tsx` split) |
| 4 | Form-fill as **governed tool** (not raw route) | 2, 3 | `fill_pdf {artifact_id, values}` registered in the governed gateway (`server/src/plugins/` + approvals §4 pattern): allowlist-checked, per-agent grant, audit row per fill; unsupported-field/type errors surface verbatim |
| 5 | Document task producer under **Work** | 4 (+ routines/tasks decision, `08` §6) | `waiting_input` (field-name prompt, original-intact promise) → fill checkpoint (`filledId`, lineage) → `waiting_approval`; enqueues unified `tasks`, never a second scheduler |
| 6 | Reviewed reply → receipt via approvals | 5 | `document-reply` proposal kind maps onto `approval_requests` (`approval_kind='action'`) + `approval_receipts (thread_id, tool_call_id)`; send returns `message · <id>` receipt; decline/expire paths preserved |
| 7 | Mail attachment import (Google connector) | 1, 2 | `messageId:attachmentId:filename` refs resolve through the governed Google plugin (no raw mail routes, `08` §8 risk); `imports` idempotency table ported; stale-ref 404 / disconnected 409 kept |
| 8 | Spaces library surfacing | 1, 3 | Filled copies + originals browsable in `(tabs)/spaces` (Phase 5 tree from `16` §4); `parentId` renders `filled copy` badge; share = signed-URL download (web) / cache+`Sharing` (native) |
| 9 | Regression suite | 1–8 | Port `pdf.test.ts` + `browser-imports-race.test.ts` + `document()` engine cases (Bun: `vi.mock`→`spyOn` per `08` merge-seq #6); concurrent-fill test proves single filled copy |

---

## 5. Risks

| # | Risk | Detail | Mitigation |
| --- | --- | --- | --- |
| 1 | **Byte-store fork** | ORBO `attachments` is channel-scoped with upload-group caps; OpenMuse files are owner-scoped disk bytes with fill lineage (`parentId`, `source`) | Decide once: `artifacts` metadata + bytes-in-`attachments` vs standalone store; never two blob stores (`08` §7 already warns against this) |
| 2 | **Ungoverned fill route** | OpenMuse `POST /:id/fill` is bearer-authed only; ORBO requires resolve→policy→audit→act | Ship fill **only** as a governed tool (step 4); the raw route is never mounted (`08` §1 precedent: ungoverned upstream routes are deleted, not aliased) |
| 3 | **pdf-lib supply chain** | Third-party native dep (`NOTICE.md`); font/appearance rendering is where fill failures surface (`Could not render …`) | Pin + license-scan (Phase 9); keep the verbatim font-fallback error so agents retry with compatible values instead of failing silently |
| 4 | **XFA/encrypted/dropdown-radio PDFs** | Pipeline rejects XFA + encrypted and fills only text/checkbox; dropdown/radio inspect as `unsupported` | Preserve the exact 422 messages; viewer must render (not fill) these — no silent field drops |
| 5 | **Signed-URL lifetime vs native share** | 15-min HMAC URLs expire mid-share; `TaskThreadCard` relies on re-hydration, never stored URLs | Keep never-store-URLs invariant; `downloadAsync` uses fresh `api.url()` per open; refresh on 401 with `Document link expired` message |
| 6 | **Threads decision gates lineage** | `page_threads`-style bindings and `document-reply` receipts key on thread identity (`01` §9 #1) | Build steps 1–4 first; defer reply/thread binding until the `threads` vs `channels` decision lands (same deferral as `16` §5 #4) |
| 7 | **Epoch/ISO → timestamptz + owner-string mapping** | `createdAt` ISO strings, owner plain string; single-owner assumption (`01` §8) | One importer with UTC verification; map to bootstrap ORBO user; multi-user ACL undefined until decided |
| 8 | **Secrets adjacent to fill values** | Form values are PII-rich; OpenMuse `fields` ride the task `input`/`state` which may be logged | Keep `values` out of audit payloads (secret-withholding invariant, `08` §9); audit the fill *action*, not its contents |

---

*Provenance: OpenMuse `_sources/OpenMuse/{apps/server/src/{files,workspace,browser,auth,app,engine/service,engine/conversation},packages/{domain/src/index,domain/src/agent,integrations/src/pdf},apps/mobile/src/{details,PdfReader.web,PdfReader.native,thread-artifacts,mail-tool-card,workspace},apps/computer/files.py,tests/pdf.test.ts}` + `01-schema-unification.md` §2/§5/§6, `02-api-surface.md` §5, `08-subsystem-unification.md` §7, `16-phase5-spaces-inventory.md`. ORBO checks: `server/src/{db/schema/core.ts:518,channels/attachments.ts,app.ts:1439}`, `app/src/{routes,lib/markdown.tsx,lib/channels/attachments.ts}`, root `package.json` (no PDF deps).*
