# 18 — Phase 5 Review-Before-Save Inventory (PLAN.md §8 item 5)

Port OpenDots review cards into ORBO. Research + this doc only — no product
code changed. All paths verified on disk 2026-10-14.

Contribution: OpenDots review flow (1 HITL tool + 1 card + 2 endpoints +
receipt table); ORBO run-gate approvals (9 server files + 4 routes +
7 components); confirmed gap: page-save gating has no ORBO equivalent.

---

## 1) OpenDots review file / API / state inventory

### 1a) Client + shared files

| File (`_sources/OpenDots/src/…`) | Role in review flow |
|---|---|
| `shared/page-review.ts` (15 lines) | `pageReviewSchema` (`title ≤160`, `content ≤20k`, `spaceId`), `pageReviewTool` (`review_space_page`, HITL tool def) |
| `client/PageReviewCard.tsx` (233 lines) | Card UI: draft preview (ReactMarkdown+GFM), Approve-&-save / Decline, receipt restore, conflict/deleted/saved states, `openPageLink` |
| `client/page-review-decision.ts` (61 lines) | `restorePageReview` (GET receipt), `decidePageReview` (pre-check + POST), `matchesReviewedDraft`, `DeletedReview` type |
| `client/Chat.tsx:177-187,240-242` | `useHumanInTheLoop({name: review_space_page … render: PageReviewCard})`; tool-call visibility filter |
| `client/page-navigation.ts` | `openPageLink(/#/spaces/:spaceId/pages/:pageId)` used by card footer |
| `client/api.ts` | `api()` fetch helper used by `page-review-decision.ts` |
| `client/PageConversation.tsx:113` | `onSaved={onRefresh}` refresh hook (conversation-save path, not review) |
| `client/ResultPane.tsx` (193 lines) | NOT review — research-brief/computer pane; no approve path |
| `client/TaskActions.tsx` (61 lines) | NOT review — routine run/pause/cancel/schedule buttons |

### 1b) Server files + endpoints

| File (`_sources/OpenDots/src/server/…`) | Role |
|---|---|
| `pages.ts` (314 lines) | `Pages` class: `page_reviews` receipt table, `createReviewed` (idempotent save), `reviewReceipt`, page CRUD + `expectedRevision`, delete keeps receipts |
| `page-routes.ts` (159 lines) | Review + page HTTP surface (see 1c) |
| `page-service.ts` (147 lines) | Page↔thread conversation binding (`reserveThread`/`finishThread`/`releaseThread`, `saveConversation`); not review itself |
| `page-tools.ts` (93 lines) | Direct server page tools (`list/read/create/edit_space_page`, `list_authorized_spaces`) — ungated writes, separate from review |
| `dot-agent.ts:2,278-284,373-375,320` | Registers `pageReviewTool` as client-only HITL tool (channel/headless runs get `[]`); system prompt: "when user requests review before saving, use `review_space_page`" |
| `workspace.ts:170-180` | `canAccessSpace(dotId, spaceId)` — Space authorization gate checked on both review endpoints |

### 1c) Review endpoints + state machine

| Method + path | Handler | Effect |
|---|---|---|
| `GET /conversations/:id/reviewed-page/:toolCallId` | `page-routes.ts:8-28` | Returns receipt (`ReviewedPage+reviewDraft`), `{deleted:true,…}` if page gone, `null` if never saved; 403 if Dot lost Space access |
| `POST /conversations/:id/reviewed-page` | `page-routes.ts:29-51` | Validates `{title,content,spaceId,toolCallId}`, checks `canAccessSpace`, `createReviewed` → 201; 400 bad draft, 403 revoked Space, 409 wrong-Space/different-draft |

State machine (card + receipt, not a status column):

| State | Where | Meaning |
|---|---|---|
| `!receiptReady` (checking) | `PageReviewCard.tsx:129,223` | `restorePageReview` in flight; "Nothing is saved until you approve" |
| unsaved + `!finished` (you decide) | `PageReviewCard.tsx:195-220` | Approve-&-save / Decline buttons live; decline → `respond({approved:false})`, no row written |
| saved (`ReviewedPage`) | `pages.ts:156-201` | `page_reviews(threadId,toolCallId)` PK row + `pages` row; retry with same draft returns same page (idempotent) |
| deleted (`{deleted:true}`) | `PageReviewCard.tsx:85-97`, `page-routes.ts:22-23` | Receipt outlives page; card shows "Saved, then deleted"; re-approve does not recreate |
| conflict (409) | `PageReviewCard.tsx:41,165-170`, `pages.ts:168-180` | Same `(threadId,toolCallId)` already saved with different title/content/space → new review required |

Idempotency key: `(threadId, toolCallId)` PK on `page_reviews`; draft snapshot (`title,content,spaceId`) stored as JSON `draft` column for `matchesReviewedDraft`.

---

## 2) ORBO approvals inventory (server + app)

### 2a) Server (`server/src/approvals/` — 9 files + schema + gateway hook)

| File | Role |
|---|---|
| `types.ts` (379 lines) | `ApprovalRecord` (`pending\|approved\|denied\|consumed\|completed`), `ApprovalDecision` (`allow_once\|allow_always\|deny\|handled`), `RuleBehaviour`, `ApprovalContinuation`, digest/equivalence helpers |
| `service.ts` (717 lines) | Gate (`gate`/`resume`/`abandon`/`decide`/`inbox`), decline-persistence, already-waiting suppression, consume-once execute, unknown-outcome path |
| `policy.ts` (427 lines) | Pure rule engine: strictest-wins (team > personal), safety hand-offs, auto-review model verdict |
| `store.ts` (532 lines) | Drizzle Postgres: `open/get/list/decide/consume/saveResult/finish`, `approval.resume` work items + `pg_notify` |
| `routes.ts` (197 lines) | `GET /`, `POST /computer/:botId`, `PATCH /preferences`, `POST/PATCH/DELETE /rules/:id`, `PATCH /team…`, `POST /questions/:id/respond`, `POST /:id/decision` |
| `questions.ts`, `question-resume.ts` | Mid-run question ask/answer + resume (surfaced in inbox beside requests) |
| `execute.ts`, `native-context.ts` | Approved-action execution + context plumbing |
| `db/schema/approvals.ts` (172 lines) | `approval_preferences`, `approval_team_settings`, `approval_requests` (unique `(owner,runId,toolCallId)`), `approval_rules`, `approval_team_rules` |
| `computer/gateway.ts` (hook) | Every computer/browser action passes `approvalService.gate` before act (08 §4) |

### 2b) App surfaces (4 routes + 7 components + lib)

| File (`app/src/…`) | Role |
|---|---|
| `routes/_authed/_app/approvals.tsx` | Redirect stub → canonical page (approvals left the sidebar) |
| `routes/_authed/_app/bots.$agentId.approvals.tsx` | Per-Bot rule page (`BotApprovalRules`) |
| `routes/_authed/settings/approvals.tsx` | Personal settings page (`ApprovalSettings`: enabled/autoReview/hostCommands + all-Bot rules) |
| `routes/_authed/admin/approvals.tsx` | Admin team-rules page (`TeamApprovalSettings`; thin wrapper per 12 §2) |
| `components/approvals/inline-approval.tsx` | In-transcript pending card keyed by `toolCallId` (Allow once / Always / Deny; Handled/Don't for hand-offs) |
| `components/approvals/{settings,rules,bot-rules,team-settings,waiting,shared-use-requests}.tsx` | Settings/rules/team/waiting/shared-use cards (6 files; 12 §2) |
| `lib/approvals.ts` (239 lines) | `approvalInboxOptions` (10s poll of `GET /api/approvals`), decide/rule/preference/team mutations |
| `lib/copilot/approval-tools.tsx` | Frontend-tool gate: `computer_*` writes → `POST /api/approvals/computer/:botId`; 202 → `stopAgent` + draw `InlineApproval` |
| `lib/copilot/approval-context.ts` | Continuation snapshot builder for the computer-approval POST |

---

## 3) Gap analysis — review-before-save has no ORBO equivalent: CONFIRMED

| Dimension | OpenDots review-before-save | ORBO approvals | Verdict |
|---|---|---|---|
| Gated object | A **page draft** (`title,content,spaceId`, ≤20k chars) rendered for reading | A **tool action** (`botId,toolRef,effect,scope,args`) about to execute | Different objects; no mapping |
| Gate position | **After** generation, **before** a create that otherwise needs no permission | **Before** execution of an already-planned side effect (run gating) | ORBO never gates "save this draft" |
| Decline effect | Nothing is written; agent told "owner declined, do not save" | Action not executed; `DECLINED_BY_PERSON` + equivalence blocks retries until user speaks | Similar UX shape, different store |
| Idempotency | `(threadId,toolCallId)` receipt row; same draft → same page | `(owner,runId,toolCallId)` request row + `actionDigest` + `consume-once` | Same key shape, different tables |
| Authorization | Per-Dot **Space access** (`canAccessSpace`) at decision time | Per-Bot **rules/policy/safety/auto-review** at gate time | Orthogonal checks; both must survive |
| Persistence | `page_reviews` receipt outlives page (delete-safe) | `approval_requests` → `completed` + audit rows (`approval.person_decided/evaluated`) | ORBO audit has no page-save event |
| UI | `PageReviewCard` (markdown preview + Approve-&-save + Open-page link) | `InlineApproval` (tool/scope + Allow/Deny, no content preview) | No preview-and-save card exists in ORBO |

`ResultPane`/`TaskActions` are false friends (brief viewer / routine controls). 08 §4 covers connection/action approvals only — page review is specified in 08 §7 (Documents) as `createReviewed` idempotent by `(threadId,toolCallId)` + `page_reviews` table, with **no ORBO home** (ORBO has no `pages/` module).

---

## 4) Merge plan

Recommendation: **new `review_requests`/`page_reviews` table + port `PageReviewCard`; do NOT extend `approval_requests`.**

| Decision | Choice | Why |
|---|---|---|
| Store | New table (`page_reviews(thread_id,tool_call_id,pages_id,space_id,draft)`, per 01 §5) | `approval_requests.action` is a tool-execution shape (`toolRef/effect/continuation`); a draft (`title/content/spaceId`) does not fit and policy/consume/resume paths must not run on saves |
| Server | Port `pages.ts#createReviewed/reviewReceipt` + 2 review endpoints into new `server/src/pages/` (08 §7 home) | Keeps 409 conflict, delete-keeps-receipt, and `canAccessSpace`-at-decision semantics intact |
| Tool | Register `review_space_page` as chat-only HITL tool (as `dot-agent.ts:278-284` does: excluded from channel/headless) | Headless/routine runs must never self-approve page saves |
| UI card | Port `PageReviewCard.tsx` → `packages/ui` review card (markdown preview, Approve-&-save/Decline, conflict/deleted/saved states, Open-page link) | `InlineApproval` cannot preview content; card is the whole feature |
| Spaces dependency | **Blocks**: Spaces/Pages port (Phase 5 docs work, 08 §7/§9 blocker #3) lands first or with this | `spaceId` validation, `canAccessSpace`, and the Open-page URL need the Spaces model |
| Audit | Emit page-save rows on approve (new event, e.g. `page.review_saved`) | ORBO audit currently records only approval verdicts; saves would otherwise be invisible |

Port order: (1) Spaces + `pages/page_reviews` tables; (2) review endpoints + HITL registration; (3) card in `packages/ui` wired to transcript; (4) audit event + tests (port `page-review*`, `page-review-card` suites per 08 §7).

---

## 5) Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | Stuffing drafts into `approval_requests` overloads run gating (consume/resume/auto-review fire on a save) | New table; review path never calls `approvalService.gate` |
| 2 | Porting `create/edit_space_page` direct-write tools alongside review lets the agent bypass review | Ship review-gated save as the only chat save path; direct tools stay server/internal |
| 3 | `spaceId` without Spaces: saves land nowhere or bypass `canAccessSpace` | Gate Phase 5 review on Spaces port; re-check access at decision time (both endpoints) |
| 4 | SQLite→Postgres: epoch-ms vs timestamptz, `(threadId,toolCallId)` PK collision handling | Follow 01 §7/§8 conversions; keep PK + draft-compare-then-409 |
| 5 | Stale receipt: Space access revoked between render and approve | Keep decision-time `canAccessSpace` 403 (both `page-routes.ts` checks) |
| 6 | Secrets in drafts persisting into `page_reviews.draft` JSON / audit | Never store credential-shaped values; reuse `approvalPreview` redaction thinking for receipts |

---

© Opraiz Technology Pvt Ltd · Developer: Narein Rao
