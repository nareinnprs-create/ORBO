# Changelog

What changed, for somebody running ORBO and deciding whether to upgrade.
ORBO's release notes live in the root `CHANGELOG.md`: it is the release
source, and the Create release PR workflow promotes its `## Unreleased`
section into each tagged release. `v0.1.0` through `v0.1.6` are tagged. This
file keeps the development history behind those releases.

Newest first. `Unreleased` is what is on `main` and not yet tagged.

## Unreleased

Initial ORBO tree toward `0.1.0`, tagged `v0.1.0` (there was no earlier ORBO
release to upgrade from). Scope below is only what the 19 `ORBO*` commits on
`main` and the tree prove.

- Mechanical rebrand of the merged tree away from the upstream project names.
- Planning and inventory slices: surface inventories, execution slices, Dots fold
  mapping, DIYA preparation and seeding, desktop inventory and wrapper plan.
- Scaffolding: `packages/ui`, `apps/app` wiring, route guard, coverage gate,
  delivery-store quarantine, signing-doc neutralization.
- Desktop and release plumbing: installer config, CI bundles, Docker slimming,
  explicit release secrets, s6 service scripts, desktop test hygiene.
- UI batches: Carousel, Questionnaire, Avatar, BrandMark, Message, Bubble, and
  prior batches 2-4.
- Decision and execution waves: W0 decision packet, Wave 1 threads/notifications
  tables, Wave 2 approvals interop and delegation, W3 computers/connectors/work
  slices, notifications API and finance import work.
- Token-map renames: 15 agent runtime dirs `agent-*` → `agent-orbo-*` with all
  references updated (compose contexts, Dockerfiles, CI, charts, docs, s6,
  desktop harness catalogue); env contract `COMPUTER_*`/`AGENT_*`/
  `MANAGED_AGENT_*` → `ORBO_*` across config, s6, compose, charts, agents,
  docs, and tests.
- Compose and deploy layout: compose services/images renamed to short `orbo-*`
  keys (publish-release image-name derivation fixed); the Helm chart moved to
  `deploy/charts/orbo-diya` and compose files plus docker/s6 to
  `deploy/compose/`, with CI, scripts, desktop, and docs references updated.
- Mobile deep links: `orbo:` is the canonical app scheme; inbound `orbomobile:`
  links are still accepted (compat recorded as one-release).
- `roleDescription` bounded to 2000 characters end-to-end (agent form and
  server parser).
- Monitors: `monitors` table (migration `0054`) plus a pure check executor for
  `change`/`contains`/`price_below` conditions; alert fan-out stays quiet — no
  notification rows are written from a firing yet.
- Notifications API (read-only slice): `GET /api/notifications`, owner-scoped
  with cursor paging; lands as a tested module mounted in the app router
  (`server/src/app.ts`) with its store wired in `server/src/index.ts`.
- Accessibility: `--muted-foreground` switched to grey-600 `#4A5668` (6.87:1 on
  grey-50) after the contrast review; `packages/ui` token docs record
  recomputed contrast ratios and usage bounds.
- Example tenant channels: DIYA listed in `permitted_agents` on all three
  channels (orchestrator role per the DIYA seeding plan), pinned by loader
  tests.
- Spaces and pages schema: `spaces`, `agent_spaces`, and `pages` tables
  (migration `0055_quick_lady_vermin.sql`), additive and empty — owner-scoped,
  with `parent_id`/`source_thread_id` set to `set null` so deleting a parent
  never takes a subtree with it. No route reads them yet; they are the
  surfaces the Dots importers land on.
- Monitor fan-out writer: a firing writes at most one notification row under
  the `monitor:<id>:<seq>:<hash>` dedup key (a replay dedupes instead of
  double-alerting), fetch failures reschedule with doubling backoff capped at
  60 minutes, the fifth consecutive strike pauses the monitor, and a `change`
  firing whose timeless fingerprint matches the saved baseline stays quiet.
  Pure module over injected fetch/clock/writer with an in-memory test double;
  the `notifications`-table writer and the `consecutiveFailures` /
  `alertSequence` / `lastTimelessHash` columns are not wired yet, so
  production still writes no rows.
- Dots → Agents ETL: `server/src/agents/dots-import.ts` maps a legacy
  `GET /workspace` export onto `agents`, `agent_profiles`, and `agent_spaces`
  as a pure, fixture-tested function with no database reads or writes: ids
  remapped to `dot-<uuid>`, overlong `instructions` and bad learning slugs
  skipped rather than truncated or repaired, and any token-bearing record
  refused with `DotsImportRefusedError` before any other check — MCP tokens
  are never imported. No route calls it yet.
- Self-host install: `scripts/install.sh`, an idempotent compose installer
  (prerequisites, `.env` from `.env.example` only when absent, loopback Bot
  secrets, compose up, migrations, health, hand-off to `scripts/start.sh`;
  `--check-only` preflight and `--no-start` prep), documented in the new
  `docs/self-host.md` and linked from `README.md` and `docs/deployment.md`.
- Approvals Q-08 un-quarantined: `server/tests/approvals-policy.test.ts`
  "an unreachable reviewer times out closed" now spies on `AbortSignal.timeout`
  and aborts with a `TimeoutError` instead of waiting on the platform timer
  Bun-on-Windows never fires, so the fail-closed verdict runs again; the
  quarantine register drops to 31 rows and keeps Q-08 as a retired id.
- Micro-cleanup: the unused `AI_ACCENT_COLORS` export is gone from
  `app/src/components/agents/orb/ai-core.tsx`; nothing imported it.
- s6 exec bits are not persisted: `git ls-files -s deploy/compose/docker/`
  lists all 27 files at mode `100644`, and no file in the tree is tracked
  `100755`. The six `+x` bits (three service `run` files, three
  `scripts/*.sh`) that were set because s6 otherwise exits 126 were dropped
  when `docker/s6` moved under `deploy/compose/`, and the `Dockerfile` copies
  `/etc/s6-overlay` with no `chmod`. Restoring them needs a central
  `git update-index --chmod=+x`; not applied in this tree.

No operator upgrade action is documented in this range.

## 0.1.0

Tagged `v0.1.0`. The published notes are the section the release workflow
promoted into the root `CHANGELOG.md`; the development history behind them
is tracked under `Unreleased` above.
