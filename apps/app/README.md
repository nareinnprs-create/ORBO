# @orbo/app — unified Expo app (scaffold / placeholder)

Status: **scaffold only**. No screens ported, no logic moved. Every route
file is a TODO stub pointing at its section in
`docs/planning/03-route-tree.md` §5.

Conventions mirrored from `mobile/` (verified 2026-10-14):

- Expo SDK major **55** (`expo ~55.0.0`, `expo-router ~55.0.0`,
  `react 19.2.0`, `react-native 0.83.10`).
- Expo Router file-based routing with route groups (`(auth)`, `(app)`,
  `(tabs)`) and `_layout.tsx` stack/tab layouts.
- `app.json` identity: name `ORBO`, slug `orbo`, bundle IDs `ai.orbo.app`
  (iOS + Android) per PLAN.md §10.B.12.

## Route map (per 03 §5; one placeholder per top-level route)

| File | Route | 03 §5 source |
| --- | --- | --- |
| `app/_layout.tsx` | root stack | Root stack |
| `app/+not-found.tsx` | fallback | `+not-found.tsx` |
| `app/(auth)/sign-in.tsx` | sign-in | `(auth)/sign-in.tsx` |
| `app/(auth)/onboarding.tsx` | onboarding | `(auth)/onboarding.tsx` |
| `app/(auth)/callback/[requestId].tsx` | OAuth/SSO callback | `(auth)/callback/[requestId].tsx` |
| `app/(app)/(tabs)/index.tsx` | Home | `(tabs)/index.tsx` |
| `app/(app)/(tabs)/chat/index.tsx` | Chat | `(tabs)/chat/` |
| `app/(app)/(tabs)/spaces/index.tsx` | Spaces | `(tabs)/spaces/` |
| `app/(app)/(tabs)/work/index.tsx` | Work | `(tabs)/work/` |
| `app/(app)/(tabs)/agents/index.tsx` | Agents | `(tabs)/agents/` |
| `app/(app)/connections/index.tsx` | Connections | `(app)/connections/` |
| `app/(app)/computer/index.tsx` | Computer | `(app)/computer/` |
| `app/(app)/approvals.tsx` | Approvals | `(app)/approvals.tsx` |
| `app/(app)/notifications.tsx` | Notifications | `(app)/notifications.tsx` |
| `app/(app)/memory.tsx` | Memory | `(app)/memory.tsx` |
| `app/(app)/settings/index.tsx` | Settings | `(app)/settings/` |
| `app/(app)/admin/index.tsx` | Admin | `(app)/admin/` |

Stack/group layouts (`_layout.tsx` under `(auth)`, `(app)`, `(tabs)`,
`chat`, `spaces`, `work`, `agents`, `connections`, `settings`, `admin`)
are stubs. The remaining §5 leaf routes (thread views, space/page detail,
agent profile subsections, settings/admin subtrees) do not exist yet.

## Follow-ups

- **Install**: run `bun install` from the repo root once `apps/app` is
  added to root `workspaces` (deliberately NOT done in this scaffold).
- **Wiring**: root providers (QueryClient, theme, session bootstrap),
  deep-link + push-notification wiring, EAS project config, `react-native-web`
  + Tauri web-export setup.
- **First real screen**: implement `(tabs)/index.tsx` (Home — DIYA default
  conversation + composer) per 03 §5, then port in PLAN.md §8 phase order
  with parity-matrix tracking.
