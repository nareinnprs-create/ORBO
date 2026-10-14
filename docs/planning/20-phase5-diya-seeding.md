# 20 — Phase 5 DIYA Seeding Prep (research only)

Context: PLAN.md §8 item 5 ("Port OpenDots surfaces … seed **DIYA**") + §3
DIYA boss-agent model + §10.B.18 (neutral default persona, admin-editable).
Read first: `10-phase4-agents-inventory.md` (Agents surface),
`19-phase5-dots-fold-mapping.md` (Dots→Agents fold),
`11-phase4-channels-inventory.md` (channels/groups),
`01-schema-unification.md` §1.8/§5 (responsibilities, agents columns).
No product code changed. Verified on disk 2026-10-14.

> Path note: PLAN §3 lays out `apps/server/` + `examples/orbo/` +
> `deploy/charts/orbo-diya/`. The repo on disk uses **`server/`** and
> **`charts/orbo-diya/`** at root (no `apps/`, no `deploy/`, no
> `supervisor/` dir). All paths below are the on-disk reality.

---

## 1) Current seed inventory — what ships today, where

There is **no `diya` agent id anywhere** in seed, code, or tests
(`rg diya` hits only chart/brand names `orbo-diya`, ORBO DIYA assets).
What ships today is a two-coworker tenant package:

| # | Ships | Location | Shape |
|---|---|---|---|
| S1 | **General Assistant** (built-in, always on) | `examples/orbo/agents.yaml:4-22` | `id: general-assistant`, `system_prompt: "You are a helpful general assistant. Give clear, concise, and accurate answers."`; holds `bot-creator` + `skill-creator` skills (the in-conversation coworker/skill authoring gate) |
| S2 | **Knowledge** (built-in, always on) | `examples/orbo/agents.yaml:23-60` | `id: knowledge`, evidence-grounded `system_prompt` (`agents.yaml:41-45`); holds `find-a-document/check-a-claim/whats-changed/who-owns-this` |
| S3 | **Risk Analyst** (conditional) | `examples/orbo/agents.yaml:64-70` | `type: remote-ag-ui`, `endpoint: ${MANAGED_AGENT_AG_UI_URL:-}` — loader **drops** rows whose endpoint interpolates to blank, so it self-removes until configured |
| S4 | **picked-harness** (conditional) | `examples/orbo/agents.yaml:84-92` | Same blank-endpoint drop; `type` itself interpolated (`${PICKED_HARNESS_KIND:-remote-ag-ui}`) for back-compat |
| S5 | **Catalog of 10, not loaded** | `examples/orbo/catalog/*.yaml` (10 files + README) | expense-review, meeting-follow-ups, release-notes, ticket-triage, onboarding-buddy, research-desk, interview-notes, oncall-handover, vendor-review, feedback-digest; copy-into-`agents/` opt-in (`examples/orbo/agents/README.md`) |
| S6 | **3 package channels** | `examples/orbo/channels.yaml` | `general-assistant` (all), `risk-and-compliance` (`knowledge`+`risk-analyst`; risk/compliance), `company-knowledge` (`knowledge`; all) |
| S7 | **Package skills** | `examples/orbo/skills.yaml` | Deployment skills seeded on boot (`owner_user_id` NULL); agent `skills:` refs validated against this file only |
| S8 | **Default-agent fallback (UI-side)** | `app/src/lib/agents/default-agent.ts` | `picked-harness` first, then passed fallback, then `agents[0]` — i.e. today "default" ≈ General Assistant by roster order, not a boss |
| S9 | **Sync engine** | `server/src/tenant-package.ts` (`synchronizeTenantPackage`, ~lines 780–1060) | Validates → upserts `agents`/`agent_profiles`/`channels`/`skills` under `deployment_packages` FK; see §4 |
| S10 | **Docs contract** | `docs/configuration.md:841-935`, `docs/coworkers.md`, `docs/architecture.md:324-335` | `TENANT_PACKAGE_DIR` default `../examples/orbo`; five required YAML + two optional dirs |

Net: DIYA does not exist yet in any form — no row, no prompt, no pin.
PLAN §3's "`examples/orbo/` shipping DIYA + ORBO agents" is the target,
not the present.

---

## 2) DIYA persona spec — neutral default + admin-editable surface

**Status today: no neutral-default persona exists.** Closest analogues:

- General Assistant prompt is one sentence (helpful/concise/accurate) —
  a peer coworker tone, not an orchestrator brief.
- Knowledge prompt is evidence-grounding, domain-scoped — wrong shape for a boss.
- The only deployment-wide voice rules are `shared/bot-prompt.ts`:
  `COMPUTER_GUIDANCE` (snapshot-first browser/workspace discipline) and
  `PROVENANCE_GUIDANCE` (cite sources; mark model-knowledge as unverified,
  do not go hunting). These apply to **every** bot and must stay out of
  DIYA's own prompt (no duplication).
- `built-in` agents get `configuration.systemPrompt` verbatim;
  `remote-ag-ui` agents get only `role_description` as a standing role
  message (`docs/configuration.md:881-889`, `docs/coworkers.md:18-36`).
  DIYA should be **`built-in`** so its full brief ships in-package.

### Neutral default prompt draft (proposed `system_prompt` for `diya`)

```yaml
system_prompt: >-
  You are DIYA, the primary assistant for this deployment. Route each
  request to the coworker best suited to it, do the straightforward parts
  yourself, and report back in the main thread with what was done and
  what each source said. When you hand work to another coworker, name
  what you asked for; when results return, attribute them. If no tool
  or coworker covers a question, say so plainly and answer from your own
  knowledge only when asked to, marked as unverified. Keep answers
  concise, neutral in tone, and free of any persona, backstory, or
  organizational claim beyond this brief.
```

Why this shape: orchestration-first (PLAN §3), attribution (matches
provenance culture without restating it), explicit non-persona clause
(§10.B.18 "neutral"), no tool/policy specifics (those live in gateway
+ `shared/bot-prompt.ts`, not per-agent YAML).

### Admin-editable surface (as-built, must reuse — no new screens)

| Surface | Path | DIYA fit |
|---|---|---|
| `PATCH /api/agents/:agentId` (full-profile update) | `server/src/agents/routes.ts` (~lines 319–756 per doc 10 §4) | **Blocked for package agents**: `requireManageable` throws `ProtectedAgentError` for `systemOwned`/package rows (`server/src/agents/profile-store.ts:115-118,355-356,554-558`). DIYA-as-package-row inherits this: UI Setup edits are refused; the admin edits the YAML, not the screen |
| Tenant YAML change workflow | `docs/configuration.md:1011-1024` | Edit file → check `permitted_agents` refs → restart server → `format:check/lint/typecheck/test`. DIYA persona edits follow this exactly |
| Per-user display only | `agent_preferences` hide/pin; `POST …/hide|unhide|pin|unpin` | Pin DIYA per user; never a persona edit path |
| In-conversation creation (`bot-creator`) | `app/src/lib/agents/proposal.ts`, `BOT_CREATOR_SLUG` contract | DIYA must NOT be creatable/duplicable this way; package id collision guard already refuses user rows that clash (`tenant-package.ts:892-896`) |
| Admin console | `server/src/admin/routes.ts`, `app` admin screens (doc 12) | Audit/approvals/people surfaces observe DIYA; none edits its prompt |

So "admin-editable" = **edit `system_prompt` in `examples/orbo/agents.yaml`
(or `agents/diya.yaml`), restart, sync overwrites** — mediated by file
review + restart, not by a Setup form. If an owner later wants UI editing,
that is a separate work item (package-override column exists on `agents`
per doc 19 §2 but has no write path today).

---

## 3) DIYA capability checklist (PLAN §3 boss-agent capabilities)

| Capability | Mechanism (exists today — reuse, do not rebuild) | DIYA delta |
|---|---|---|
| **Delegation** | Handoff desk: `server/src/agents/handoff.ts` (depth/fan-out caps, `mayAddress` grants) + tool `handoff-tool.ts` + delivery `handoff-delivery.ts`/`handoff-runner.ts` + signing `handoff-signing.ts`; ceilings `BOT_HANDOFF_MAX_DEPTH=1` / `BOT_HANDOFF_MAX_PER_RUN=3` (`server/src/config.ts:361-362`, `charts/orbo-diya/values.yaml:181-183`); audit `agent.handoff_offered/delivered` | DIYA needs `bot-creator`-adjacent reach: handoff grants toward every specialist it may address; keep default caps (depth 1 is the boss→specialist shape; raising depth enables chains — owner decision) |
| **Group-channel creation** | `POST /api/groups` → `server/src/channels/group.ts` (`createGroupRoutes`): per-bot threads + headless AG-UI turns via `routines/run-turn.ts`, shared `group_messages` transcript, `@Name` peer-handoff reusing the same desk authority/caps/audit (`group.ts:1-20`) | DIYA is the caller that opens groups (2+ in To:) and collects results in the main thread; no new route — seed must list DIYA in the channels it orchestrates via `permitted_agents` |
| **Responsibility / goal ownership** | `server/src/responsibilities/{routes,engine,store,triggers}.ts`; `GET,POST /api/responsibilities/`, runs/progress/triggers subroutes (doc 02 §routines); per-agent page `bots.$agentId.responsibilities.tsx` (doc 10 R8) | DIYA owns deployment-level goals (e.g. "watch X, report findings"); assign `agent_id=diya` rows post-seed via the existing API, not via seed data (routines/skills deliberately not shippable in-package per `docs/routines.md:119`) |
| **Unified approvals** | `server/src/approvals/{policy,service,execute,routes}.ts`; per-agent + team rules + approve-and-run cards (PLAN §6 governance row) | DIYA turns obey the same rule engine (group turns already route through it per `group.ts:4-8`); no DIYA exemption — boss status confers routing, not policy bypass |
| **Unified audit trail** | `server/src/audit.ts` (+ `audit-retention.ts`); `channel.routed`, `bot.created/updated/deleted/hidden`, `approval.*`, `agent.handoff_*`, `computer_audit` | DIYA smoke (§5) must produce `channel.routed` + `agent.handoff_*` rows naming the rule/grant; audit is the proof artifact |
| **Routing into DIYA** | `POST /api/route` → `routing/routes.ts` (routing decision + `channel.routed`); Home composer `startChosen` (doc 11 §4) | Home (`/` → `(tabs)/index.tsx`, the "DIYA default conversation" slot per docs 03/07) routes to DIYA once seeded; `default-agent.ts` fallback order (`picked-harness` → `[0]`) should resolve to `diya` (see §4) |

---

## 4) Seeding mechanism proposal — config, not code

Follow the existing `synchronizeTenantPackage` pattern; add **data + one
migration only if a column is needed** (none is — DIYA fits current columns).

1. **Seed file**: add to `examples/orbo/agents.yaml` (or
   `examples/orbo/agents/diya.yaml` — loader reads both, `agents.yaml`
   first, files in filename order; `tenant-package.ts:462-500`):
   ```yaml
   - id: diya
     name: DIYA
     title: Primary Assistant
     role_description: Route work to the right coworker, do the straightforward parts directly, and report back with attributions.
     avatar_seed: diya
     type: built-in
     system_prompt: <§2 draft>
     skills: [bot-creator]
   ```
   `built-in` + `system_prompt` mirrors General Assistant/Knowledge;
   `bot-creator` gives DIYA the in-conversation `list_bots/read_bot` tools.
   Whether DIYA also holds `skill-creator` is an owner call (today only
   General Assistant holds both; `agents.yaml:11-22` warns against diluting
   the no-specialism bot — DIYA as boss is the natural second holder).
2. **Channels**: add `diya` to `permitted_agents` of the channels it must
   orchestrate in `examples/orbo/channels.yaml` (every entry must match an
   agent id or boot is refused).
3. **Default resolution**: with DIYA seeded, decide the Home default
   explicitly — either a `diya`-first rule in
   `app/src/lib/agents/default-agent.ts` (small, test-pinned like
   `app/tests/default-agent.test.ts`) or roster-order reliance (fragile;
   not recommended). Owner decision; default proposal: prefer `diya` id
   when present, else current fallback chain.
4. **Idempotency** (free from the existing engine — cite, don't reimplement):
   `deployment_packages` upsert on `tenant_id` with checksum+`loadedAt`
   (`tenant-package.ts:819-834`); agent/profile/channel upserts are
   `INSERT … ON CONFLICT DO UPDATE` scoped by `setWhere packageId = this
   package` (`:868-972`), so re-seeds overwrite package-owned rows and
   **refuse on collision** with user-created rows instead of clobbering
   (`:892-896`, `:955-959`). Blank-endpoint tombstoning (`:840-866`) does
   not apply to DIYA (built-in has no endpoint). Skill grants are
   wholesale-reconciled under the `PACKAGE_GRANT` marker (`:995-1015`).
   Net: reboot-safe, rerun-safe, restart-to-apply per change workflow.
5. **No new env keys** (doc 19 C7 precedent): DIYA is data columns, not
   config. Handoff caps stay env/chart-owned (`BOT_HANDOFF_*`).
6. **What NOT to do**: no `/dots/*`-style compat mount, no new tables, no
   `DIYA_*` env, no code-level default-persona constant (that would fork
   the "configuration, not code" rule from PLAN §3).

---

## 5) Acceptance — DIYA delegation smoke (PLAN §9 `D3c`)

Per `09-execution-plan.md` D3c / WS-02: "DIYA seeded boss routes work to a
specialist, opens group channel, collects result in main thread."

1. Fresh boot with DIYA seed: `GET /api/agents` lists `diya` alongside
   `general-assistant` + `knowledge`; `GET /api/agents/diya` profile DTO
   carries `builtIn` + `canManage=false` (package-protected).
2. Home composer `POST /api/route` returns a `channel.routed` audit row
   targeting `diya` for a general request.
3. DIYA delegates one canned task to one specialist (Knowledge): handoff
   tool call offered (caps `maxDepth≥1`), `agent.handoff_offered` +
   `agent.handoff_delivered` rows recorded, `POST /api/groups` (201)
   opens the group, shared transcript shows the specialist reply.
4. Result collected in main thread with attribution; per-agent approval
   card path exercised once (approve-and-run → receipt).
5. Full gates still green: `bun run lint && bun run typecheck && bun run
   test && bun run build`; origin sweep zero first-party hits;
   `tests/smoke/journey.test.ts` (`ORBO_API_URL`, default
   `http://localhost:3001`) extended with the DIYA leg; port reality
   unchanged per §10.B.11 (server `3001`, app `3010`, computer `4100`,
   `agent-bot 4200` / `agent-langgraph 4201`).

---

## 6) Risks

| # | Risk | Detail | Mitigation |
|---|---|---|---|
| R1 | **Default-routing ambiguity** | `default-agent.ts` prefers `picked-harness`, else roster `[0]`; DIYA seeded second/third never becomes Home default without a rule change | Explicit `diya`-first rule + pinned test; keep fallback chain intact |
| R2 | **bot-creator/skill-creator dilution** | `agents.yaml:11-22` comment: authoring tools live on General Assistant because it is open and unspecialised; adding holders weakens the "who creates" mental model | Owner decides DIYA's skill set (proposal: `bot-creator` yes, `skill-creator` deferred); document in YAML comment |
| R3 | **Package-protected ≠ unchangeable expectation** | Admins will try Setup-form persona edits; `ProtectedAgentError` refuses with no guidance | Keep YAML-only editing; consider a UI hint row ("managed by tenant package") as later work, not in seed |
| R4 | **Handoff caps too tight/loose** | Depth 1 / fan-out 3 fits boss→specialist; deeper chains need cap raises with cost (each hop = full run; sandbox pod resumes — `values.yaml:175-180`) | Keep defaults; raise only with owner sign-off + cost note |
| R5 | **Channel `permitted_agents` drift** | Every channel entry must match an agent id or boot refuses; adding `diya` to channels but renaming the id later bricks startup | `tests/orbo-package.test.ts` + `clean-checkout.test.ts` patterns already guard package load — extend to assert `diya` refs |
| R6 | **Persona duplication with deployment guidance** | Repeating `COMPUTER_GUIDANCE`/`PROVENANCE_GUIDANCE` in DIYA's prompt forks two sources of truth | §2 draft deliberately omits both; lint by review |
| R7 | **Catalog/Blank-endpoint confusion** | `risk-analyst`/`picked-harness` self-remove when unconfigured; DIYA must never be conditional | DIYA is `built-in` with literal `system_prompt` — no `${…}` interpolation on its row |

---

© Opraiz Technology Pvt Ltd · Developer: Narein Rao
