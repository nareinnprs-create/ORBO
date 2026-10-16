# Contributing

ORBO is proprietary software owned by Opraiz Technology Pvt Ltd. No part of it may be used,
copied, modified, or distributed without prior written permission, except as expressly permitted
under a separate written agreement (see `LICENSE`). That includes contributions: if you are
outside the owning organization, do not open a pull request expecting it can be merged — talk
to the owners first. [OWNER TODO: contribution agreement / licensing contact for external
contributors.]

That said, well-formed pull requests from people already working with the owners are welcome,
and this file says what one looks like. Review and merge belong to the owners named in
`.github/CODEOWNERS`, and branch protection requires an owner's approval; nobody can approve
their own pull request. Opening a pull request and commenting on one is open to everyone.

## Development setup

Prerequisites: Docker, [Bun](https://bun.sh) 1.3+, `lsof`, `openssl`, `curl`, and `npx`
(for Intelligence provisioning).

```sh
cp .env.example .env
bun install
npx --yes copilotkit@latest login
npx --yes copilotkit@latest project select
bun scripts/setup-learning.ts
```

Then add `OPENAI_API_KEY` to `.env` and start the stack:

```sh
bash scripts/start.sh
```

`bash scripts/stop.sh` takes it down (`--keep-computers` leaves Bot browsers signed in).
`bun run dev` runs only the app and API server without the Docker Bots and computers. Service
ports are listed in [development.md](docs/development.md#running-services). Full setup,
migrations, and the smoke-test session cookie are documented in
[development.md](docs/development.md).

## Quality gates

Run these before opening a pull request:

```sh
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run build
```

CI (`ci.yml`, gated on one `verify` check) additionally covers the deployable packages'
types, native mobile types, real-browser computer behavior, chart rendering across cloud
targets, Python harness regressions, startup on macOS/Windows, migrations drift, and image
boot. `bun run test:ci` verifies the expected test count.

## Test conventions

- **Databases.** Integration tests need PostgreSQL with pgvector. Point `TEST_DATABASE_URL`
  at a dedicated database (e.g. `postgres://orbo:orbo@localhost:5432/orbo_test`) and migrate
  it first. Tests refuse to use the application `orbo` database: running them against a
  deployment you use puts test Bots in its audit trail and activity reports.
- **Mocking.** Prefer `spyOn` on the module namespace over `mock.module`: Bun has no way to
  unregister a module mock, so a `mock.module` stub leaks across files while spies restore
  cleanly in `afterAll`/`afterEach`. Several test files document this at the top; follow the
  pattern there.
- **Suites that need more than `bun run test`.** `test:smoke` needs a running deployment and
  a signed-in session cookie (`ORBO_SMOKE_COOKIE`); `test:live-screen` needs
  `agent-orbo-computer` dependencies installed; `test:live-composio` needs a real
  `COMPOSIO_API_KEY`. Each skips with instructions when its prerequisites are absent.

## Pull requests

The pull request template asks for five things; answer all of them:

- **What this changes**, and why it is worth doing.
- **Where it runs.** ORBO serves a whole company from several processes behind a load
  balancer. Name any new state that outlives a request and where it lives, what happens on
  the second replica, what serialises concurrent work, how fan-out reaches sockets held by
  other processes, and how any new listener, port, or schedule behaves with a hundred copies.
  Postgres is the default answer.
- **Boundary and audit.** Acting calls go through the gateway (resolve, decide, audit, then
  act); new refusals and failures each write a row; nothing new is trusted from the client
  that the server can resolve itself.
- **Changelog.** A line in `CHANGELOG.md` under `Unreleased`, or one sentence on why a
  deployment behaves no differently. See [versioning.md](docs/versioning.md#changelog-policy).
- **Proof.** What you ran and saw; screenshots or a recording for anything with a surface.

Also: keep changes focused; keep credentials, service-account JSON, customer data, and
transcripts out of source control; put sensitive behavior on the server, not only in the
browser; update `docs/configuration.md`, `docs/architecture.md`, or the root `README.md`
when behavior changes.

Where to file issues, and where to ask questions before writing code, are [OWNER TODO].
