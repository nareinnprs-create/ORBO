# 33 — W0 Owner-Decision Packet (master)

> Research + planning only; no product code touched. This is the single file
> the owner answers. Evidence lives in the four part files under
> `docs/planning/33-w0-sections/` (01-data-identity, 02-ui-surfaces,
> 03-platform-release, 04-agents-naming) — read them for full context; vote here.
>
> Rule: silence on a decision keeps it OPEN and its slices stay gated. No
> default executes except documented source defaults once signed at the W0
> exit review (22 G8).

## How to answer

One line per decision (copy the slate, change letters as needed):

```
D1:A D2:A D3:A D4:A D5:A D6:A D7:A D7.1:A D7.3:B D7.4:A D8:B D9:A D10:A D11:A D12:A D13:A D14:A D16:A U1:B
```

Per-decision format: `D<n>: <A|B> — <conditions, if any>`. A `B` (or redirect)
must name the follow-up doc amendment it requires. `INPUTS-1..7` are supplied
values, not votes — reply `INPUTS-5: EAS org = <value>` style, or `DEFER`.

ID mapping note (canonical): the scheme decision appears as "D7" in part 02
and as D7.2 in part 03 — both mean the same call, canonicalized here as **D16**
(scheme unify on `orbo:`); part 03's D7.2 is folded into D16, and **D7** always
means the desktop-role call. U1 is report-only scope (go/no-go, no work asked).

## Master decision table

| ID | Question | Recommendation | Gates |
|---|---|---|---|
| D1 | Threads-vs-channels identity | **A** unified `threads`, channels as team surface | P5-01/04/07/08/10, P6-01/04/05 |
| D2 | Spaces survive + ownership | **A** survive w/ `owner_user_id` + `agent_spaces` | P5-01/02/07/08, P6-01/02/08 |
| D3 | `records` keep-or-retire | **A** normalize fully, shim only | P6-07/04/05 |
| D4 | Route-tree freeze C24 | **A** freeze + redirect map | Expo scaffold, Waves 1–7 |
| D5 | `packages/ui` runtime | **A** RN cross-platform | ui completion, port order |
| D6 | Brand assets + fonts (+Store/Square delete sub-item) | **A** lock tokens, monogram placeholder | tokens, brand/, contrast audit |
| D7 | Desktop role (setup shell vs pure wrapper) | **A** setup-shell first-run | P8 wrapper build, P4 swap |
| D7.1 | Interim export `app/dist` → final `apps/app` | **A** staged cutover | P8 A-step-1, P4 baton |
| D7.3 | File associations | **B** claim nothing in v1 | P8 G5, Documents parity |
| D7.4 | Updater placeholder | **A** placeholder until domain+signing | P8 G4, §10.E.38 |
| D8 | Mobile scope | **B** tiered subset first | parity checklist, Waves |
| D9 | Notifications home | **A** standalone `GET /api/notifications` | P6-04 M6, P6-05/06 |
| D10 | Instructions width 2000 vs 1000 | **A** extend to 2000 | P5-08 importer only |
| D11 | DIYA catalog/persona + Home-default rule | **A** approve seed + `diya`-first rule | WS-02 slice 1, P5-09, D3c smoke |
| D12 | Finance home | **A** confirm Work task-kind home | P6-03 slice 2, P6-08 |
| D13 | Voice caps + native media path | **A** server-mediated caps in v1 | native splits, push onboarding |
| D14 | Wire-identifier rename | **A** freeze as protocol contracts | WS-11/WS-10 unblocked |
| D16 | Deep-link scheme unify | **A** unify on `orbo:` (folds 03-D7.2) | auth/deep-link/EAS wiring |
| U1 | Expo SDK 55→57 now? | **B** NO-GO for W0, revisit post-R1 | adds scope if GO |
| INPUTS 1–7 | Brand assets, domain, git host, npm scope, EAS org, Intelligence owner, release accounts | Supply values (not votes) | signing/release/push |

## Critical path for the W0 session

1. **Settle D1 first** — it gates items in D2/D3/D9/D12 and four other subsections.
2. **Clear D4 + D5 together** — they unlock the Phase 3 scaffold even while D6 art and scheme-compat details finish in parallel.
3. **D11 is the only true agents gate** — WS-02 slice 1 and P5-09 cannot be accepted without a deterministic DIYA default.
4. **D14 and U1 unblock by saying no** — A/B keep-or-freeze and NO-GO add zero scope; only a B on D14 or an A on U1 creates new work.
5. **Desktop cluster (D7 + sub-items, D16)** can be answered as a block — A across the row keeps Phase 8 on the days-long path.

## Parts (evidence, read before voting)

- `33-w0-sections/01-data-identity.md` — D1, D2, D3, D9, D10, D12.
- `33-w0-sections/02-ui-surfaces.md` — D4, D5, D6, scheme (= D16 here), D8.
- `33-w0-sections/03-platform-release.md` — D7 (+D7.1/D7.3/D7.4), D13, INPUTS checklist.
- `33-w0-sections/04-agents-naming.md` — D11, D14, U1.

## After answers (close-out)

- Recorded letters go into each part file's `Status:` lines; partial answers unblock only the slices whose gates they clear.
- D11:A files the `diya`-first rule work item; D14:B files the dual-accept migration work item; U1:A files the SDK migration work item; U1:B logs the post-R1 revisit trigger (target ≥57.0.17).
- D12:B amends the C24 route freeze; D16 answers amend the scheme compat map.

*© Opraiz Technology Pvt Ltd · Developer: Narein Rao*
