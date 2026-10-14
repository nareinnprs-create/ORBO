# 14 — Phase 4 Bots→Agents Rename Scope (research only)

Context: `docs/planning/03-route-tree.md` §4–§6 merges `bots` (+ `agents`
alias, Dots) into **Agents** at `(tabs)/agents`. This doc scopes that rename.
No code is renamed by this doc. Verified on disk 2026-10-14 with ripgrep.

Exclusions applied to every count below: `node_modules/`, `_sources/`,
`target/`, `dist/`, plus provenance `UPSTREAM.md`, `NOTICE.md`,
`CHANGELOG.md`, `PLAN.md`, `LICENSE`. Counts are `matches / matched lines /
files` from `rg --stats` (case-sensitive unless noted).

---

## 1) Hit inventory (real counts)

| # | Hit class | Kind | Count (matches / files) | Example paths |
|---|---|---|---|---|
| 1 | Lowercase word `bots` (`rg -w "bots"`) | route/API/UI/test/doc/config | 679 / 123 | `app/src/routeTree.gen.ts`, `server/src/agents/lifecycle-routes.ts`, `shared/model-providers.ts` |
| 2 | Web route files containing `bot` in filename | route | 13 files | `app/src/routes/_authed/_app/bots.index.tsx`, `bots.$agentId.{index,setup,sharing,access,approvals,memory,reach,responsibilities,routines}.tsx`, `team-bots.tsx`, `bot.tsx`, `admin/plugins/$key_.bots.$agentId.tsx` |
| 3 | Mobile route files (`bot.tsx`, `bots.tsx`) | route | 2 files | `mobile/app/bot.tsx`, `mobile/app/bots.tsx` (+ `mobile/app/_layout.tsx`, `mobile/app/index.tsx` link to `/bots`) |
| 4 | Files with `bots` anywhere in filename (`rg --files`) | route/lib/test/schema | 22 files | §1 rows 2–3 plus `app/src/components/bots/bot-roster.tsx`, `app/src/lib/team-bots.{ts,test.ts}`, `server/src/team-bots/{routes,team-bots,access}.ts`, `server/src/db/schema/team-bots.ts` |
| 5 | Path literals `/bots` / `bots/` (`--fixed-strings`) | route/deep-link | `/bots`: 330 / 55; `bots/`: 290 / 52 | `app/src/components/bot-profile/settings-rows.tsx` (`to: "/bots/$agentId/…"` ×8), `app/src/lib/agents/legacy-routes.ts`, `app/src/lib/agents/proposal.ts` (`/bots/<id>` regex) |
| 6 | API path `/api/bots` | API | 44 / 12 | `server/src/app.ts:1475` mount, `server/src/agents/lifecycle-routes.ts`, `app/src/lib/bot-lifecycle/{queries,mutations}.ts`, `mobile/app/bot.tsx`, `server/tests/bot-lifecycle-routes.test.ts` (12 hits) |
| 7 | API path `/api/team-bots` | API | 18 / 8 | `server/src/app.ts:1482` mount, `server/src/team-bots/routes.ts`, `app/src/lib/team-bots.ts`, `app/tests/bot-sharing.test.tsx` |
| 8 | Hyphenated `team-bots` (any use) | API/route/lib/schema | 94 / 32 | `server/src/db/schema/team-bots.ts`, `server/drizzle.config.ts`, `app/src/routes/_authed/_app/team-bots.tsx` (redirects to `/bots`), `app/src/routeTree.gen.ts` (13 hits) |
| 9 | DB identifiers `team_bot_*` | data | 251 / 9 | `server/src/db/schema/team-bots.ts` (`team_bot_publications`, `team_bot_audience`, `team_bot_assignments`, `team_bot_consents`, `team_bot_consent_defaults`), `server/drizzle/0049_*.sql` + `meta/00{49,50,51,52}_snapshot.json` |
| 10 | UI word `Bot` (`rg -w "Bot"`); subset `app/src`+`mobile/app` | UI | global 4990 / 740; app subset 860 / 185 | `app/src/components/bot-profile/*.tsx`, `app/src/components/approvals/settings.tsx` (`to="/bots"`), `app/src/routes/_authed/admin/plugins/index.tsx` (`no Bots` summary) |
| 11 | UI word `Bots` (`rg -w "Bots"`); subset as above | UI | global 570 / 229; app subset 167 / 75 | `mobile/app/_layout.tsx` (`title: "Bots"`), `app/src/routes/_authed/admin/components/$name.tsx` (`All N Bots`), `README.md` (`/bots` table) |
| 12 | Test files with `bot` in filename; fixture literal `bot-1` | test | 35 files (app 25 / server 9 / root 1); `bot-1`: 355 / 42 | `app/tests/bot-{roster,sharing,settings-rows,app-grants*,summaries,nav-badge,…}.test.*`, `server/tests/{bot-lifecycle-routes,team-bot-routes-shared,team-bots.integration}.test.ts`, `tests/agent-bot.test.ts`; fixtures `bot-1`, `BOT_ID="bot-1"`, `bots.example.com` |
| 13 | Docs `docs/*.md` (`bots` / `Bot` / `Bots` words) | doc | `bots` 146 / 13; `Bot` 266 / 17; `Bots` 46 / 13 (27 files) | `docs/coworkers.md`, `docs/configuration.md` (`bots` spec row, `BOT_*` table), `docs/planning/02-api-surface.md` (9× `/api/bots`), `README.md` (`/bots*` table) |
| 14 | Env/config `BOT_[A-Z_]+`; charts `bot` (`-i`); spec key `bots` | config | env 571 / 103; charts 215 / 16 | `shared/model-providers.json` (`"bots": {…}` + `_readme`), `shared/model-providers.{ts,py}`, `.env.example`, `docker-compose.yml`, `charts/orbo-diya/{values.yaml,templates/_helpers.tpl}` (`config.handoff.*`, `config.orboTag.botIconUrlTemplate`) |

Notes: `routeTree.gen.ts` is generated — counted in rows 1/5/8, never
hand-edited. `botId`/`agentId` identifiers (`BOT_ID|botId|bot_id`: 2501 /
287) are tracked separately as a non-goal (see §4).

---

## 2) Risk analysis per class

- **Route files + path literals (rows 2–5).** Highest deep-link risk.
  Bookmarks, notification URLs, chat-transcript sentences (`proposal.ts`
  parses `/bots/<id>` and legacy `/agents?agent=<id>`), mobile push targets
  (`mobile/app/_layout.tsx`), and plugin admin paths
  (`/admin/plugins/$key/bots/$agentId`) all embed `/bots`. Hard rename 404s
  them. Param is already `$agentId`, so only the `bots` segment moves.
- **API (rows 6–7).** External-client risk. `/api/bots*` (lifecycle:
  attention/routing/pause/resume/reset/activity/notifications) and
  `/api/team-bots*` (publication/assignments/consents) are called by
  `app/src/lib/{bot-lifecycle,team-bots}.ts`, `mobile/app/bot.tsx`, and
  third-party harnesses. `/api/agents` already exists for profiles
  (`server/src/app.ts:1299`); `/api/bots` is a *different* router, not an
  alias — merging needs a compatibility mount, not a delete.
- **Data (row 9 + query keys).** Stored-value risk. Five `team_bot_*` tables
  plus drizzle snapshots/migrations, `TEAM_BOT_CONSENT_MARKER`
  (`[team-bot-consent]` mirrored in `app/src/lib/team-bots.ts`), and query
  key `["team-bots"]` persist in DBs and caches. Table renames need a
  migration with dual-read; marker/key renames invalidate stored consents and
  cached queries.
- **UI strings (rows 10–11).** Lowest risk, largest surface. ~860 `Bot` +
  167 `Bots` hits in `app/src`+`mobile` span roster, profile, sidebar,
  approvals, plugins, delivery, memory, suggestions. Safe to reword
  incrementally; snapshot tests (`bot-*.test.*`, `proposed-bot-card`) will
  churn and need batched updates.
- **Tests/fixtures (row 12).** Medium risk, high count. 35 bot-named test
  files plus `bot-1`/`bots.example.*`/`BOT_ID` fixtures across app/server.
  Renaming tests alongside source keeps `bun test` green; renaming fixtures
  early breaks assertions that pin `/bots/*` hrefs and `/api/bots*` URLs.
- **Docs (row 13).** Low runtime risk, high confusion risk. `02-api-surface`,
  `03-route-tree`, `coworkers.md`, `configuration.md`, `README.md` document
  `/bots` flows users follow. Update docs in the same PR as the surface they
  describe, not ahead of it.
- **Config/charts/env (row 14).** Deployment risk. `BOT_*` env,
  `config.handoff.*`, `botIconUrlTemplate`, and the `bots` key in
  `shared/model-providers.json` are read by every harness, compose, desktop
  vault, and Helm. Renaming any key breaks running deployments and the
  `check-new-values-keys.ts` contract. Treat as non-goal until the very end,
  if ever.

---

## 3) Recommended strategy: aliases + redirects, UI → routes → API → data

Hard rename is rejected: deep links, model-written `/bots/<id>` sentences,
API clients, and stored `team_bot_*` rows all survive a flag day.

1. **UI copy first.** Reword visible `Bot(s)` → `Agent(s)` behind the existing
   routes (`app/src/components/**`, `mobile/app/*`). No URL or API change;
   update snapshot expectations in the same PRs.
2. **Routes second, with redirects.** Add canonical `/agents…` (+
   `/agents/team`, `/admin/plugins/[key]/agents/[agentId]`) mirroring the
   `03` §5 tree; keep `/bots…`, `/bot`, `/team-bots` as permanent redirects
   reusing the `legacy-routes.ts` pattern (`LEGACY_PAGES`, `legacyAgentsTarget`).
   Regenerate `routeTree.gen.ts`; extend `legacy-agent-routes.test.ts`.
3. **API third, dual-mounted.** Mount the lifecycle router at both
   `/api/bots` and `/api/agents/*` (or `/api/agents/lifecycle/*`) and
   `team-bots` at both `/api/team-bots` and `/api/team-agents`; migrate
   `bot-lifecycle/*` and `team-bots.ts` clients to the new base while the old
   base returns identical payloads (including the `{ bots: […] }` envelope —
   renaming the envelope key is a breaking change, defer it). Mobile
   `bot.tsx` moves last.
4. **Data last, with migration.** Rename `team_bot_*` tables/columns and the
   `team-bots` query key only after dual-read proves safe; keep
   `TEAM_BOT_CONSENT_MARKER` readable in both forms for stored consents.
   Config/env/spec keys stay (see §4).

Order inside each step follows the inventory: `settings-rows`/`bot-roster`
links → route files → `routeTree.gen.ts` → API mounts → tests/docs.

---

## 4) Explicit non-goals (do NOT rename)

- `agent-bot/` sample + its image/ports: `BOT_IMAGE`, `BOT_PORT`,
  `AGENT_BOT_MODEL`, `docker-compose.yml` service, `scripts/start.sh`
  `agent-bot` wait/probe, `tests/agent-bot.test.ts`, `docs/architecture.md`
  anthropic-skip note.
- Framework runtime contract read by every harness: `BOT_PROVIDER`,
  `BOT_MODEL`, `BOT_RESPONSES_API`, `BOT_REASONING_EFFORT`, `BOT_SPEC_PATH`,
  `BOT_HANDOFF_MAX_DEPTH` / `BOT_HANDOFF_MAX_PER_RUN`
  (`config.handoff.*`, `check-new-values-keys.ts`, `_helpers.tpl`),
  `ORBO_TAG_BOT_ICON_URL_TEMPLATE` (`config.orboTag.botIconUrlTemplate`),
  `COMPUTER_BOT_ID`, `EGRESS_PROXY_<BOT_ID>` / `EGRESS_PROXY_DEFAULT`,
  `SLACK_BOT_TOKEN`, `BOT_LABEL` (`orbo.bot-id`), `BOT_CREATOR_SLUG`
  (`bot-creator` skill), `BOT_PAUSED_REASON`, `PLACEHOLDER_BOT_NAMES`,
  `TEAM_BOT_CONSENT_MARKER` stored form, `BOT_PREFIXES` (telemetry),
  `BotHolder`/`active-bot` copilot plumbing.
- Identifiers and code words: `botId`/`BOT_ID`/`bot_id` (2501 / 287),
  `$agentId` route param (already correct), `botsReachableFrom`,
  `agentCanHandOn`, `list_bots`/`read_bot` tool names.
- Spec-file key `bots` in `shared/model-providers.json` and its
  `bots.<id>.*` error strings (loaders in TS + Python + every harness pin
  it); renaming means a synchronized release of all harnesses.
- Provenance and catalog prose: `UPSTREAM.md`, `NOTICE.md`, `CHANGELOG.md`,
  `PLAN.md`, `LICENSE` (excluded from counts), and historical `agent-bot`
  sample references in `examples/` and `prompt.txt`.

---

© Opraiz Technology Pvt Ltd · Developer: Narein Rao
