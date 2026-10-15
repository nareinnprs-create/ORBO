# W0 Owner-Decision Packet — §1: Data & Identity

> One section of the W0 owner-decision packet (research + planning only; no product
> code touched). This file covers the six data/identity decisions: D1, D2, D3, D9,
> D10, D12. All six are OPEN until the owner signs; nothing gated below starts until
> its gate is recorded at the W0 exit review (22 §6 G8).
>
> Sources (read-only snapshots): `01-schema-unification.md` (esp §9 blockers),
> `02-api-surface.md` (risks incl. notifications), `08-subsystem-unification.md`,
> `22-phase5-execution.md` (G1–G8), `29-phase6-execution.md`,
> `16-phase5-spaces-inventory.md`. Inline refs to 19 (Dots fold) and 24 (finance)
> ground D10/D12. Every option below is quoted or paraphrased from these docs —
> no new design is introduced here.
>
> How to read: each decision states the question, the real options with their
> one-line tradeoff, a single decisive recommendation, and the exact P-slices it
> gates. Option letters match the source docs where the docs letter them (22 G1/G2).
>
> W0 gate map for this section: D1 = 22 G2 threads identity; D2 = 22 G1 spaces
> ownership; D3 = 29 §6 A.5 records/table scope; D9 = 02 risk #11 notifications;
> D10 = 22 G6 instructions width; D12 = 29 C24 finance home. All six must be
> recorded before their P5/P6 slices cut work orders.

## D1. Threads-vs-channels identity
**Question:** Is the Intelligence channel thread the unified conversation identity, or does
ORBO own a parallel `threads` table while `channels` stays the team surface — the single
biggest schema blocker (01 §9 #1; 01 §8 conversation ambiguity; 08 §5; 22 G2)?
**Options:** A. Unified `threads` table + `channels` as team surface (one FK target for `messages`, `page_threads`, `group_bot_threads`; absorbs `thread_bindings` + `conversations` w/ new DDL per 01 §5) / B. Channels-only, Intelligence thread canonical (zero new tables, but every binding keys on history living outside the DB, 01 §8).
**Recommendation:** A — because every conversation-bound feature (approvals continuation,
documents `page_threads`, routine channel/thread, memory retrieval) keys on `thread_id`
(08 merge-seq item 1: threads first for exactly this reason), and channels-only leaves
rename/archive/replay with no FK target so bindings orphan on every history move
(08 §5 risk). It is also the 22 G2 default, so picking B would re-litigate 08 §5.
`intelligence_channel_mappings` remains the (user, channel, agent)→thread bridge for liveness
checks (`POST /api/threads/mint`, 08 §5) — the unified row owns identity, Intelligence owns transport.
**Blocked work:** P5-01 (`page_threads` DDL/API), P5-04 (call receipts anchor),
P5-07 (review receipts), P5-08 (`thread_bindings` import), P5-10 (backend absorbs);
P6-01 (reply/thread binding), P6-04 (alert keys), P6-05 (review linkage).
Phase 5 builds page CRUD first and defers step 7 bindings until this lands (16 §5.4).
The QueryClient + WS-events replacement for the OpenDots 3s workspace poll (16 §1.1)
also keys contact/thread lists on this identity — polling shape cannot freeze first.
**Status:** IN PROGRESS — executing on recommended slate per owner start directive (reversible per decision; overrides welcome)

## D2. Spaces ownership and multi-user semantics
**Question:** Do Spaces survive into the unified IA, and with what ownership — `owner_user_id`
plus the `agent_spaces` join, or flattened to owner scope (01 §9 #3; 22 G1; 16 §5.3;
08 §7 risk: no ORBO page/space model exists)?
**Options:** A. Spaces survive with `owner_user_id` + `agent_spaces` join carried from `dot_spaces` (container ACL preserved; additive DDL per 01 §5; 22 G1 default) / B. Flatten pages to owner scope, drop the container (no `spaces` table; pages keyed directly to user — simpler DDL, but no container to attach ACL to).
**Recommendation:** A — because OpenDots page auth (`canAccessSpace` on every call,
`pageAccess`, 403 revoked-space with no title leak per 16 §2.3) and the per-Dot space
ACL (`dot_spaces` → `agent_spaces`, 01 §6) have no owner-scope equivalent, and the
P5-02 library/nav model plus the P6-02/P6-08 viewer homes all assume the container
(16 §4; 03 §5 `(tabs)/spaces` tree). Flattening re-invents scoping per page.
Multi-user semantics stay ORBO-native: `owner_user_id` on the container, membership via
`agent_spaces`, enforcement at the gateway — OpenDots `ownerId` strings map to `users.id` (01 §5).
**Blocked work:** P5-01 (tables + pages API), P5-02 (editor/library/nav), P5-07 (review
flow checks `canAccessSpace` at decision), P5-08 (space ACL travels with the fold);
P6-01 (`artifacts` bytes decision N1), P6-02/P6-08 (viewer homes). Do not create the
`spaces` table until this is signed (16 §5.3).
Seed content (`Everyday` space + first Dot, 16 §1) is a tenant-package concern (P5-09),
not part of this gate — D2 settles shape/ownership only.
**Status:** IN PROGRESS — executing on recommended slate per owner start directive (reversible per decision; overrides welcome)

## D3. `records` keep-or-retire
**Question:** Is OpenMuse's single-table `records` KV (`owner,kind,id` + jsonb, 01 §2)
normalized fully on import, or kept as a compatibility layer for unported screens
(01 §9 #2; 01 §7 step 4 shim; 01 §8 JSONB query cost; 29 D5/D6 + §6 A.5)?
**Options:** A. Normalize fully; `records` lives only as a one-shot import shim, never as the runtime store (single Postgres authority; no GIN-index/JSONB-scan tax) / B. Keep `records` as compat layer for unported screens (less importer work now; but two stores, two auth models, and the origin sweep fails).
**Recommendation:** A — because 29 DoD D5/D6 explicitly forbids shipping `records` as the
canonical store (origin sweep zero first-party hits; Better Auth actor on every route,
never raw owner strings), and the shim keeps single-owner strings plus `data->>'status'`
scans (01 §8) alive while doubling every P6-07 absorb test. The 01 §7 shim is an
importer, not a runtime. Unmapped ephemeral kinds (sample pages, browser/computer
state) drop per 01 §8 rather than riding along.
The `conversations`/`drafts`/`memories`/`actions` kinds have named targets (01 §6 mapping);
only truly ephemeral kinds drop — nothing user-authored is lost in the normalize path.
**Blocked work:** P6-07 (importer + backend absorbs — auth shim and `records` importer
go first per 26 §6 step 1); P6-04 (`monitors`/`goals`/`ideas` table scope, 29 §6 A.5);
P6-05 (unified `tasks`/`task_runs`/`task_events` as the single ledger).
OpenMuse `files`→`artifacts` vs `agent-artifacts` share one table (01 §6); the P6-01
byte-store fork decision (N1) composes with, but does not reopen, this gate.
**Status:** IN PROGRESS — executing on recommended slate per owner start directive (reversible per decision; overrides welcome)

## D9. Notifications home
**Question:** Where do watch alerts and task-done fan-out land — a standalone notifications
resource, or a view over proactive suggestions (02 risk #11: proposed `GET
/api/notifications` has no ORBO route today, nearest is `GET /api/proactive/suggestions`;
25 R6; 29 N9)?
**Options:** A. Standalone `GET /api/notifications` backed by the new `notifications` table (01 §5), absorbing OpenMuse `GET /api/agent/notifications` (02 §5 canonical map); suggestions stay producers / B. Notifications stay a `proactive/suggestions` view (no new table/route; alerts ride the suggestion lifecycle open/dismissed/started).
**Recommendation:** A — because the suggestion lifecycle answers "what should I consider,"
not "what happened" (watch firings, task-done, 30-min action expiry in 08 §4): B overloads
one status vocabulary with two notification kinds — the same stuffing mistake 22 D4
forbids for drafts in `approval_requests` — and leaves the P6-04 M6 fan-out with its
dedup keys homeless. Until signed, watches run quiet with backoff tests green (29 N9).
`proactive_suggestions` keeps its open/dismissed/started vocabulary for ideas (25 M7);
notifications carry firings and receipts — accepting an idea and firing an alert stay distinct rows.
**Blocked work:** P6-04 M6 (alert fan-out with `timelessHash`/dedup keys; 25 M6 gated on
this); P6-05 (task-done fan-out onto the same resource); P6-06 accept-mints-goal+task
receipt visibility. Server watch/monitor logic itself proceeds quiet (29 §3 W3).
**Status:** IN PROGRESS — executing on recommended slate per owner start directive (reversible per decision; overrides welcome)

## D10. Dots instructions width (2000) vs `roleDescription` (1000)
**Question:** Dots `instructions` (zod 3–2000 chars, `workspace-routes.ts:14` via 19 §1/16 §1.1)
must fold into `agent_profiles.roleDescription` (≤1000, validated in
`app/src/lib/agents/form.ts` per 19 §2) — extend the column or truncate with a review
file (19 §6 R3; 22 D9/G6: owner picks, no silent cut)?
**Options:** A. Extend `roleDescription` (column + form validation) to 2000 chars (one additive migration; zero persona loss) / B. Truncate to 1000 + write a review file for the owner to restore cut text (no schema change; manual toil per Dot, and a skipped file = silent cut).
**Recommendation:** A — because a width-only change is the cheapest migration shape in the
whole packet, it preserves persona fidelity for every folded Dot (22 D9 warns the cut is
silent), and B's review file scales with Dot count while still needing the same sign-off.
Note `built_in` personas also mirror into `configuration.systemPrompt` (19 §3), so the
importer sets both from the full 2000-char source.
**Blocked work:** P5-08 importer only (field map `instructions` → `roleDescription`,
epoch→timestamptz, int→bool, learning-slug validator all land in the same ETL slice).
No UI slice is gated: roster order and `dot-<uuid>` id remap proceed either way.
The same slice also converts SQLite bool-int→boolean and validates `learningContainerId`
slugs (16 §1.1; 19 §3) — width, type, and slug rules land as one importer contract.
**Status:** IN PROGRESS — executing on recommended slate per owner start directive (reversible per decision; overrides welcome)

## D12. Finance home confirm (doc 24 recommends Work task kind)
**Question:** Confirm doc 24's recommendation — finance rides the Work task kind with the
summary card as a Work Activity artifact under `(tabs)/work` — or redirect to a
standalone finance route/table (24 Q1/F-07; 24 §4 port mapping; 29 P6-03/C24; 03 §5)?
**Options:** A. Confirm: `analyzeSpending` ports as a `finance` task kind, `FinanceArtifact` renders as the Work Activity artifact (income/spending/remaining, bars, first-100), savings goal = responsibilities row category `Finances` (no standalone table/route) / B. Redirect: grant standalone `work/finance` route (and/or table) via the C24 route freeze.
**Recommendation:** A — because 24 (F-07 card mapping, "folds into Work/Activity artifacts"),
29 P6-03/§7A, and the 08 merge-seq rule (capabilities enqueue unified `tasks` via
producers only, never a second scheduler — 29 D6) all converge on Work, while B forks a
second ledger for one card and breaks the 25 A11 rule (activity reads `task_events`,
never a second store). Server finance logic proceeds regardless of C24 (29 §6 C).
Per-platform CSV picker scope (24 R1) and the native `.native.tsx` split (05 parity rule)
are P6-08 implementation details inside the confirmed home — they do not reopen D12.
**Blocked work:** P6-03 slice 2 (summary card + savings-goal action with its 2 fixed
milestones); P6-08 (Finance card placement + delegate-sheet CSV field per 24 F-08).
Gating UI only: CSV→summary logic, `finance.test.ts` + `finance-headers.test.ts` ports,
and the milestone-link workflows are unblocked.
**Status:** IN PROGRESS — executing on recommended slate per owner start directive (reversible per decision; overrides welcome)

## Cross-decision notes (not gates; reading aid)

- D1 threads identity is the load-bearing decision: it gates items in four other
  subsections here (D2 page binding, D3 review linkage scope, D9 alert keys, D12
  reply threading). Settle D1 first in the W0 session (08 merge-seq item 1).
- D2 and D10 both land in the same P5-08 ETL slice but are independent choices:
  spaces-ACL shape and instructions width share an importer, not a tradeoff.
- D3-retire and D9-standalone together enforce the Phase 6 exit invariant: no second
  store, no second scheduler, no second ledger (29 D5/D6). D12-confirm is the same
  invariant applied to finance.
- D10-extend is the only decision here that changes an existing ORBO column (all others
  add new tables); its migration ships with the P5-08 agents superset columns (01 §5 row 1).

## Answer format

Owner replies with one letter per decision, in order, e.g. `D1:A D2:A D3:A D9:A
D10:A D12:B + <redirect note>`. Any B (or redirect) must name the follow-up doc
amendment it requires (e.g. D12:B amends the C24 route freeze before P6-08 UI work).
Silence on a decision keeps it OPEN and its slices stay gated — no default executes
except the documented source defaults once signed at the W0 exit review (22 G8).
Reply may be split across owners (e.g. data-architect signs D1–D3, product signs D9–D12)
but every decision needs exactly one recorded letter before its slices start.

*Provenance: 01 §§1–9; 02 §§1/3–6 + risks #3–5/#11; 08 §§4–7 + merge-seq; 16 §§1–5;
19 §§1–3/§6 R3; 22 §§2/5/6 (slices, deltas D9, gates G1–G8); 24 F-07/F-08/Q1/§4;
25 M6/R6/A11; 29 §§1–7 (P6-01–P6-10, N1/N9, D5/D6, C24).*
*© Opraiz Technology Pvt Ltd · Developer: Narein Rao*
