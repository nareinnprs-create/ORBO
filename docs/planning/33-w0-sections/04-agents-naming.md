# 04 — W0 Agents & Naming Decisions (D11 · D14 · U1)

Research + decision framing only — no product code changed. Verified on disk 2026-10-15.
This is one section of the W0 owner-decision packet: DIYA catalog/persona approval,
wire-identifier rename scope, and the Expo SDK migration go/no-go.

Read-first map: `docs/planning/10-phase4-agents-inventory.md` (Agents surface),
`14-phase4-bots-rename-scope.md` (aliases-first strategy), `19-phase5-dots-fold-mapping.md`
(conflicts C1–C7, instructions width), `20-phase5-diya-seeding.md` (persona, default-agent
rule, `ProtectedAgentError`), `examples/orbo/agents.yaml` (current seed rows),
`server/src/learning/runtime.ts` + `remote.ts` (skill tool wire names),
`server/src/delivery/orbo-tag.ts` + `server/tests/delivery-routes.test.ts`
(`__copilotkit_interrupt_value__`), PLAN.md §10.B.18 (neutral persona, admin-editable).

Ground truth on disk today: the `diya` seed row already exists
(`examples/orbo/agents.yaml:61-92`, `built-in` + literal `system_prompt` + `bot-creator`
only, `skill-creator` deliberately off), but `app/src/lib/agents/default-agent.ts`
is untouched — it still prefers `picked-harness`, then a passed fallback, then
`agents[0]`. So DIYA ships yet never becomes the Home default without an explicit rule.

---

## D11. DIYA catalog/persona approval + Home-default rule

**Question:** Does the owner approve the DIYA seed row (catalog placement, neutral persona prompt, `bot-creator`-only skills) as the boss agent, and approve adding an explicit `diya`-first rule to `default-agent.ts` so Home routes to DIYA?

**Options:** A. Approve seed + add `diya`-first rule (prefer `diya` id when present, else current fallback chain) — one small lib change + pinned test (`app/tests/default-agent.test.ts` pattern), makes PLAN §3 "Home is DIYA's surface" real. / B. Approve seed but defer the default rule (rely on roster order) — zero code change, but DIYA seeded second/third never becomes Home default and routing stays ambiguous (doc 20 §6 R1).

**Recommendation:** A — because the seed without the rule is dead weight: `default-agent.ts:5-14` resolves `picked-harness` → fallback → `[0]`, so Home keeps landing on General Assistant by roster order and the D3c delegation smoke (`POST /api/route` → `channel.routed` targeting `diya`) has no deterministic entry point; the rule is a ~5-line change pinned by the existing `default-agent.test.ts` pattern, while roster-order reliance is fragile to any future catalog reorder (doc 20 §4.3).

**Blocked work:** WS-02 first slice (single agent CRUD + DIYA seed that answers in Home and delegates one canned task) + P5-09 (seeded DIYA answers in Home, delegates, collects result) + D3c smoke — all three assume a deterministic DIYA default; without D11 they cannot be accepted.

**Status:** IN PROGRESS — executing on recommended slate per owner start directive (reversible per decision; overrides welcome)

Notes for the owner (not separate decisions):
- Persona: the `agents.yaml:81-90` prompt matches the doc 20 §2 neutral-default draft (orchestration-first, attribution, explicit non-persona clause, no duplication of `shared/bot-prompt.ts` deployment guidance); approving D11 approves this wording. PLAN §10.B.18 + PLAN §1 ("Neutral default prompt, admin-customizable") are the authority.
- Admin-editable means YAML edits: `PATCH /api/agents/:agentId` refuses package rows via `requireManageable` → `ProtectedAgentError` (`server/src/agents/profile-store.ts:115-118,355-356,554-558`), so persona edits follow `docs/configuration.md:1011-1024` (edit file → restart → sync overwrites); no Setup-screen write path is being asked for here.
- Length safety: DIYA's `role_description` (`agents.yaml:78`) is a one-liner, well under the `roleDescription` ≤1000 bound — unlike the Dots-fold truncation conflict (doc 19 §3 `instructions` 2000→1000, §6 R3), which does NOT touch DIYA and needs no action under D11.
- Sequencing (doc 19 C1): the Bot→Agent UI-copy rename lands first; DIYA strings map straight to final `Agent(s)` copy, never to interim `Bot` — D11 approval should assume final-copy wording.
- `skill-creator` stays off DIYA (authoring lives on General Assistant per `agents.yaml:11-22`); granting it later is a new decision, not part of D11 (doc 20 §6 R2).
- Channels wiring is part of the approval: DIYA must be added to `permitted_agents` of every channel it orchestrates in `examples/orbo/channels.yaml` (doc 20 §4.2 — every entry must match an agent id or boot is refused); the 3 package channels in S6 (`general-assistant`, `risk-and-compliance`, `company-knowledge`) are the starting list the owner reviews.
- Handoff reach rides along: DIYA needs handoff grants toward every specialist it may address, under the existing ceilings `BOT_HANDOFF_MAX_DEPTH=1` / `BOT_HANDOFF_MAX_PER_RUN=3` (`server/src/config.ts:361-362`, `charts/orbo-diya/values.yaml:181-183`); depth 1 is the boss→specialist shape, and raising it is a separate owner call with cost (doc 20 §3 row 1, §6 R4).
- The default-rule change is small and pinned: either a `diya`-first clause in `defaultAgentProfile` (`default-agent.ts:5-14`) or roster-order reliance, which doc 20 §4.3 explicitly does not recommend as fragile; the existing `app/tests/default-agent.test.ts` pattern pins whichever rule the owner picks.
- Idempotency comes free with approval: `synchronizeTenantPackage` upserts under `deployment_packages` FK with checksum+`loadedAt` (`server/src/tenant-package.ts:819-834`), re-seeds overwrite package-owned rows and refuse on collision with user rows (`:892-896`, `:955-959`), and DIYA as `built-in` with a literal prompt is exempt from blank-endpoint tombstoning (`:840-866`) — reboot-safe, rerun-safe (doc 20 §4.4).
- No new env keys: DIYA is data columns, not config — no `DIYA_*` env, no code-level default-persona constant, per the "configuration, not code" rule from PLAN §3 (doc 20 §4.5-4.6, doc 19 C7 precedent).
- Acceptance the owner is signing up for (doc 20 §5, PLAN §9 D3c / 09 WS-02): `GET /api/agents` lists `diya` with `builtIn` + `canManage=false`; `POST /api/route` yields a `channel.routed` row targeting `diya`; one canned delegation to Knowledge records `agent.handoff_offered` + `agent.handoff_delivered`; full gates (`lint`, `typecheck`, `test`, `build`) stay green.
- What D11 does NOT decide: Dots-fold `instructions` truncation (doc 19 §6 R3), per-dot computer/token migration (R1), threads-vs-channels sign-off (R5) — all Phase 5 importer concerns owned by their own slices, unaffected by DIYA approval.

---

## D14. Wire-identifier rename (learning skill tools + interrupt value)

**Question:** Do the `copilotkit_*` wire identifiers — `copilotkit_load_skill` / `copilotkit_read_skill_file` (learning skill tools) and `__copilotkit_interrupt_value__` (OrboTag `confirm_write` card value) — get renamed to `orbo_*`, or stay frozen as protocol contracts?

**Options:** A. Keep all three as frozen protocol contracts (aliases-first strategy, doc 14 §3: UI copy moves, wire names stay) — zero runtime risk, renames nothing any harness, test, or transcript already pins. / B. Rename to `orbo_load_skill` / `orbo_read_skill_file` / `__orbo_interrupt_value__` — full rebrand at the cost of synchronized server+agent+test changes: renaming wire names means synchronized server+agent+test changes across `runtime.ts` + `remote.ts` (tool set, `RESERVED_TOOLS`, availability check) + `orbo-tag.ts` (card builder) + `delivery-routes.test.ts` (pinned card value) + every remote harness boundary, with replay/compat risk for in-flight turns.

**Recommendation:** A — because all three names are load-bearing protocol, not branding: the SDK owns archive verification/refresh/revocation behind these exact tool names (`runtime.ts:17-18` pin comment; `LEARNED_SKILL_TOOL_NAMES` at `:29-32`, tool definitions at `:35-48`); `remote.ts:17-20` `RESERVED_TOOLS` + `skillAvailabilityCheck` (`:316-347`) reject any agent-offered collision and hard-fail retained queries when the names vanish, so a rename breaks the remote-agent boundary by design; the interrupt value is OrboTag's `confirm_write` contract (`orbo-tag.ts:10-15`, built at `:350-373`, pinned byte-for-byte in `delivery-routes.test.ts:251-266`) shared with the Channels SDK reader — renaming one side silently drops every approval card resume (`resumeFromInput`, `:324-343`).

**Blocked work:** WS-11 slice (learning containers + `learning-*/demonstrations-*` tests) and WS-10 OrboTag/delivery slice (`delivery-routes` + approval-card resume paths) — both pin these names today; a rename decision (B) would gate them on a synchronized server+agent+test migration plan, while keep (A) unblocks them immediately.

**Status:** IN PROGRESS — executing on recommended slate per owner start directive (reversible per decision; overrides welcome)

Notes for the owner (not separate decisions):
- Precedent is explicit: doc 14 §4 lists `list_bots`/`read_bot` tool names, `BOT_*` env/config keys, and the `bots` spec key as non-goals for the same reason — wire contracts outlive branding passes; D14 extends that rule to the CopilotKit-owned names.
- Doc 14 §3 ordering (UI → routes → API → data) never reaches SDK-owned wire names at any step; there is no step 5 for them, which is why the recommendation is keep-forever, not keep-for-now.
- If a future owner still wants the rebrand, it must ship as a dual-accept window (accept both names, emit `orbo_*`, retire `copilotkit_*` after harness rollout) — that migration is a separate work item with its own compat tests, not a flag day inside WS-11.
- Already-ORBO-branded identifiers nearby need no action: the catalog message id `orbo:learned-skills` and context description `ORBO learned skills` (`remote.ts:15-16`, filtered at `:46-52`) plus the `ORBO_LEARNED_SKILLS_ERROR` code (`:259`) are first-party strings already carrying the brand — D14's freeze covers only the three `copilotkit_*` wire names, and approving A changes nothing about the already-clean ones.
- Blast radius of B, file by file: `runtime.ts:29-48` (tool set + zod schemas + `execute` dispatch at `:130-139`), `remote.ts:17-20` + `:78-80` (reservation guard `"Automatic Learning tool names are reserved."`) + `:316-347` (retained-query availability check), `orbo-tag.ts:350-373` (card builder) + `:324-343` (resume parser expecting the 32-hex id shape), `delivery-routes.test.ts:251-266` (pinned card), plus every remote harness (`agent-bot`, `agent-langgraph`, picked-harness servers) that forwards these tool names over AG-UI.
- In-flight turns are the sharp edge: `MAX_SKILL_STEPS = 10` (`remote.ts:21`) means a turn can span many continuations; a flag-day rename orphans any turn started before the deploy (old name offered, new name answered, or vice versa), which is why B requires the dual-accept window rather than a synchronized cutover.
- Transcript risk mirrors doc 14 §2 rows 2–5: model-written sentences and stored tool-call histories already contain the `copilotkit_*` names the same way chat transcripts contain old `/bots/<id>` links (`proposal.ts` parses them) — renaming the wire without a reader that still accepts the old form breaks replay of retained native queries (`skillAvailabilityCheck` exists precisely for that case).
- Origin-sweep interaction: the Phase 9 sweep (PLAN §9) targets first-party origin traces; these three identifiers are declared irreducible third-party surface (PLAN §2, catalogued in `NOTICE.md`), so keeping them is compliant by construction and needs no sweep exemption.

---

## U1. Expo SDK 55 → 57 major migration go/no-go (report-only)

**Question:** Does W0 approve migrating the Expo app (`apps/app`, `mobile`) from SDK 55 to SDK 57 now, or stay on 55 and revisit on the normal upgrade cadence? Report-only context — no migration work is proposed or started by this packet.

**Options:** A. GO now (55 → 57 in W0) — buys ~1 year of support runway (SDK 54 support ends with the next release per Expo policy) and RN 0.83 → 0.86, but pays native-code + config-plugin migration cost inside W0's critical path. / B. NO-GO for W0 (stay on 55, schedule 57 after R1 surfaces land) — zero W0 cost and keeps the WS-01 route-shell + WS-14 installer work on a known-good tree, at the price of a shorter remaining support window.

**Recommendation:** B — because W0's scarce budget belongs to threads identity, vault, and agents/DIYA (09 waves W1–W2), not to a native toolchain migration: SDK 57 is a small focused release (RN 0.85 → 0.86, React 19.2 unchanged — `apps/app/package.json:21` already on `19.2.0`), so staying on 55 forfeits little functionally, while any native-code + config-plugin fallout (EAS builds, `expo-secure-store`, `expo-linking`, router) would land directly on the WS-01/WS-14 surfaces W0 is trying to stand up.

**Blocked work:** None gated — U1 is report-only; a GO would *add* unplanned migration scope onto WS-01 (Expo Router tree + `packages/ui` runtime) and WS-14 (per-OS installers via desktop CI + EAS), and is therefore a scope decision, not an unblock.

**Status:** IN PROGRESS — executing on recommended slate per owner start directive (reversible per decision; overrides welcome)

Notes for the owner (not separate decisions):
- On-disk baseline: `apps/app/package.json:15` and `mobile/package.json:19` both pin `expo ~55.0.0` (RN `0.83.10`, React `19.2.0`, router/linking/secure-store `~55.0.x`); any GO must move both trees together — they are two consumers of one SDK line.
- Latest-stable reference: Expo SDK 57 released 2026-06-30 (npm `expo@57.0.29` current); RN 0.86 intended no-breaking-changes from 0.85, React stays 19.2.x — the upgrade's own changelog calls it the easiest class of SDK upgrade, which is why revisiting post-R1 is cheap.
- Known-regression watch (only relevant if a later GO): Hermes V1 memory/startup regressions inherited via SDK 56, resolved at `expo@57.0.9`/`57.0.17` — any future migration must target ≥57.0.17, not 57.0.0.
- Full pinned surface at risk in a GO: `expo-router ~55.0.0`, `expo-constants ~55.0.7`, `expo-linking ~55.0.7`, `expo-secure-store ~55.0.8`, `react-native-safe-area-context ~5.6.2`, `react-native-screens ~4.23.0` (`apps/app/package.json:14-24`) — every `~55.0.x` line moves in lockstep on a major, plus `react-native 0.83.10` → `0.86` and any native code + config plugins the migrated modules pull in.
- Node floor moves too: SDK 55 needs Node ≥20.19.x, SDK 57 needs ≥22.13.x — CI images and EAS builder images must be checked as part of any future GO, not just `package.json`.
- Tauri desktop is unaffected either way (it wraps the web export, PLAN §3) — U1 scope is strictly the two Expo trees (`apps/app`, `mobile`) plus their EAS/cloud-build path (PLAN §10.A.5, §10.B.19).
- 09-execution-plan already records the placeholder shell at SDK 55 (`09:6` reconciliation note) and the `packages/ui` RN-runtime risk (R6); a W0 GO would stack a toolchain migration onto both open items at once.
- Revisit trigger proposal (no date set here): schedule the 57 migration once WS-01 parity sweep + WS-14 installer matrix are green, so native fallout has a known-good baseline to bisect against — the owner sets that trigger by answering B with a condition.

---

## Cross-decision sequencing (read before answering)

1. D11 is the only true gate: WS-02's first slice (09 §4 — single agent CRUD + DIYA seed that answers in Home and delegates one canned task to one specialist) cannot be accepted without a deterministic DIYA default, and P5-09 inherits that gate (22 §2 grounding notes: P5-09 → Agents/DIYA rows, 09 WS-02 first-slice canned delegation).
2. D14 is an unblock either way, but asymmetric: A unblocks WS-11/WS-10 slices immediately on the names they already pin; B converts D14 into a new migration work item (dual-accept window + compat tests) that must land before WS-11 slice 1, pushing learning delivery behind the rename.
3. U1 touches neither gate: answering B adds zero scope and is the recommended default; answering A injects native-toolchain risk into WS-01 (Expo Router tree per 03 §5, `packages/ui` RN runtime R6) and WS-14 (per-OS installers + EAS) without unblocking anything.
4. Naming-vocabulary order (docs 14 §3 + 19 C1/C6) constrains all three: Bot→Agent UI copy first, Dots copy straight to final `Agent(s)`, `/api/bots` dual-mounted while the `{ bots: […] }` envelope stays frozen, Dots ETL with no `/dots/*` compat mount — D11 and D14 approvals must be read as consistent with that order, not as permission to reorder it.
5. Config-key hygiene (docs 14 §4 + 19 C7) constrains D11's follow-ups: no `DIYA_*` env, no `DOT_*` env, no `BOT_*` renames — all Dot/DIYA flags are data columns, and any future proposal minting env keys for agents is out of scope for this packet.

---

## Evidence index (where every claim above was checked)

| # | Claim | Source |
|---|---|---|
| E1 | Agents surface = 13 routes · 22 components · 16 data modules · 35 endpoints | doc 10 header + §1–§4 |
| E2 | Rename strategy = aliases + redirects, UI → routes → API → data; hard rename rejected | doc 14 §3 |
| E3 | `list_bots`/`read_bot`, `BOT_*` env, `bots` spec key are explicit non-goals | doc 14 §4 |
| E4 | Dots→Agents field map; `instructions` 2000→`roleDescription` 1000 truncation conflict | doc 19 §3 + §6 R3 |
| E5 | Conflicts C1 (three-way naming) … C7 (no new env keys) | doc 19 §4 |
| E6 | DIYA persona draft; YAML-only admin edits; `diya`-first default proposal; R1 routing ambiguity | doc 20 §2 + §4.2–4.3 + §6 R1–R3 |
| E7 | `diya` seed row as landed (`built-in`, literal prompt, `bot-creator` only) | `examples/orbo/agents.yaml:61-92` |
| E8 | Default fallback today = `picked-harness` → fallback → `[0]`; DIYA never wins without a rule | `app/src/lib/agents/default-agent.ts:5-14` |
| E9 | Skill tool names + SDK-ownership pin comment + `execute` dispatch | `server/src/learning/runtime.ts:17-18,29-48,130-139` |
| E10 | `RESERVED_TOOLS` guard + availability check + 10-step continuation loop | `server/src/learning/remote.ts:17-21,78-80,316-347` |
| E11 | `confirm_write` contract + card builder + 32-hex resume shape | `server/src/delivery/orbo-tag.ts:10-15,324-373` |
| E12 | Pinned card value (`__orboTag_interrupt_id__` + `__copilotkit_interrupt_value__`) | `server/tests/delivery-routes.test.ts:251-266` |
| E13 | Neutral persona + admin-editable (B.18); DIYA boss + rebranded catalog (B.17) | PLAN.md §10.B.17–18 + §1 table |
| E14 | Expo SDK 55 pins (`expo ~55.0.0`, RN `0.83.10`, React `19.2.0`) in both trees | `apps/app/package.json:14-24`, `mobile/package.json:19` |
| E15 | SDK 57 latest stable (2026-06-30, RN 0.86, React 19.2.x, ≥57.0.17 for Hermes fixes) | npm `expo` + Expo SDK 57 changelog |
| E16 | WS-02 / P5-09 / D3c acceptance (DIYA delegates, group receipt, main-thread attribution) | 09 §2 D3c + §4 WS-02; 22 §2 P5-09; doc 20 §5 |

---

## Answer format

Owner answers each decision with one letter plus any conditions, one line per decision:

- `D11: <A|B> — <conditions, if any>`
- `D14: <A|B> — <conditions, if any>`
- `U1: <A|B> — <conditions, if any>`

Example: `D11: A — approve persona as drafted; file follow-up if Setup-screen hint row wanted.`
Silence on any item keeps it `OPEN` and its blocked work stays gated.

---

## After the owner answers (close-out, no new decisions)

- D11:A → file the `diya`-first rule work item against `default-agent.ts` + `default-agent.test.ts`,
  extend `tests/orbo-package.test.ts` to assert the `diya` row and its `permitted_agents` refs
  (doc 20 §6 R5), and open WS-02 slice 1; D11:B → record roster-order reliance as tech debt
  with the R1 revisit trigger, and WS-02 slice 1 stays gated on a deterministic default.
- D14:A → record the three wire names alongside the doc 14 §4 non-goals list so future
  branding passes stop re-asking; D14:B → file the dual-accept migration work item (server +
  agent + test + harness rollout plan with compat tests) and keep WS-11 slice 1 gated on it.
- U1:B → log the post-R1 revisit trigger (WS-01 parity + WS-14 installer matrix green,
  target ≥57.0.17); U1:A → file the migration work item against both Expo trees + EAS/CI
  images before any WS-01 route-shell work continues on the new SDK.
- This section stays `OPEN` until all three answers are recorded; partial answers unblock
  only the work items whose gates they clear (§Cross-decision sequencing).

© Opraiz Technology Pvt Ltd · Developer: Narein Rao
