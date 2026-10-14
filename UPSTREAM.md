# Upstream Provenance

This file records the upstream open-source repositories that ORBO was merged from, and the
exact commit SHAs pinned at acquisition. It is the only first-party location (besides
`NOTICE.md` and `LICENSE`) where upstream project names appear.

ORBO is **detached permanently** from these upstreams. No upstream git history is preserved;
ORBO's own history begins fresh. Upstream source is cloned only into `_sources/`, which is
git-ignored and never committed.

| Project | Repository | Pinned commit SHA | Committed | Local (git-ignored) |
|---|---|---|---|---|
| OpenBot | https://github.com/CopilotKit/OpenBot.git | `a4dce8c47c7253ecd9bd6f4e2626f4205817a104` | 2026-10-09T16:01:55-07:00 | `_sources/OpenBot` |
| OpenMuse | https://github.com/CopilotKit/openmuse.git | `1ac68f3909f2478ab6280883f1ab5ea65eb5719d` | 2026-10-06T15:39:29-07:00 | `_sources/OpenMuse` |
| OpenDots | https://github.com/CopilotKit/OpenDots.git | `625452e06cde74cb25b0ce319e2c1be0488f5a5f` | 2026-10-06T15:46:40-07:00 | `_sources/OpenDots` |

## Merge roles

- **OpenBot** — base platform: server, app, worker, supervisor, agent computers, governance
  gateway, audit, admin, desktop, mobile.
- **OpenMuse** — feature source: Expo/React-Native UI, task engine, documents/PDF, finance,
  goals/tracking, ideas, Google (Gmail/Calendar) adapters, browser worker.
- **OpenDots** — feature source: Spaces/Pages editor, specialist Dots, review-before-save,
  connections/MCP approvals, realtime calls, Slack channels, automatic learning, Parallel research.

These upstream modules are unified into a single product in later phases. Any remaining
third-party references that cannot be renamed (published SDKs, hosted service hostnames) are
documented in `NOTICE.md`.

## Reproducing the sources

```
git clone --depth 1 https://github.com/CopilotKit/OpenBot.git _sources/OpenBot
git clone --depth 1 https://github.com/CopilotKit/openmuse.git _sources/OpenMuse
git clone --depth 1 https://github.com/CopilotKit/OpenDots.git _sources/OpenDots
git -C _sources/OpenBot  rev-parse HEAD   # expect a4dce8c47c7253ecd9bd6f4e2626f4205817a104
git -C _sources/OpenMuse rev-parse HEAD   # expect 1ac68f3909f2478ab6280883f1ab5ea65eb5719d
git -C _sources/OpenDots rev-parse HEAD   # expect 625452e06cde74cb25b0ce319e2c1be0488f5a5f
```
