# ORBO — Mobile app parity checklist

Gap list between the Expo shell (`mobile/app/`, 10 screens + layout) and the
web app (`app/src/routes/`, 60 route files), as of 2026-11-14, branch
`wave-1-2`. Complements — does not duplicate —
[05-mobile-web-parity.md](05-mobile-web-parity.md), whose F1–F20 table already
covers **platform-specific behavior** (attachments, dictation, voice, clipboard,
live-screen transport, push, deep links, auth). This file covers **feature
surfaces**: what the phone can reach that the browser can, and vice versa.

Every mobile screen talks to API paths that already exist server-side — parity
work here is UI-only, no server changes are expected.

## What mobile has today

| Screen | File | API surface |
|---|---|---|
| Inbox / channel list | `index.tsx` | `/api/capabilities`, `/api/delivery/conversations` (+ cursor paging) |
| Conversation | `conversation.tsx` | `/api/channels/:id`, `/api/delivery/conversations/:id/history`, `/…/messages` POST |
| Bots list | `bots.tsx` | `/api/agents` |
| Bot detail | `bot.tsx` | `/api/agents/:id`, lifecycle, pause/resume, `/api/routines` + per-routine enable, `/api/delivery/conversations` |
| Routine detail | `routine.tsx` | `/api/routines/:id` (runs, enable, run, delete) |
| Approvals inbox | `approvals.tsx` | `/api/approvals` (decision, question respond) |
| Approval rules | `rules.tsx` | `/api/approvals/preferences` PATCH, `/api/approvals/rules` CRUD |
| Plugins / skills grants | `plugins.tsx` | `/api/plugins/for/:botId`, grants CRUD |
| Memory | `memory.tsx` | `/api/memory` POST/GET/DELETE |
| Computer use | `computer.tsx` | `/api/computers/:botId` (control request/take/release) |
| Push registration | `src/notifications.ts` | `POST /api/delivery/devices` |

## Gaps — web surfaces with no mobile screen

- [ ] **Bot tabs.** Web `bots.$agentId.*` has 9 tabs (index, setup, sharing,
      responsibilities, reach, memory, approvals, routines, REA); mobile bot
      detail covers lifecycle + routines + plugin grants only. Missing:
      setup wizard, sharing, responsibilities, reach, bot memory tab, bot
      approvals tab, REA tool picker/evidence gallery (4143fb2).
- [ ] **Chat creation.** No mobile `channel/new` / `group/new`; no member
      picking, no channel settings.
- [ ] **Skills page.** `/skills` browse/manage has no mobile equivalent
      (mobile sees skills only inside the grants flow).
- [ ] **Standalone routines page.** `/routines` (cross-bot list) missing;
      mobile reaches routines only per-bot.
- [ ] **Responsibilities + reachability.** `/responsibilities`,
      `/reachability` — no mobile screen.
- [ ] **Team bots.** `/team-bots` (create/assign team agents) missing.
- [ ] **Onboarding.** `/onboarding` — mobile has no first-run flow (auth exists
      via `@better-auth/expo`, but no guided setup).
- [ ] **Sign-in request approval.** `/sign-in/$requestId` — verify the Expo
      flow handles the same device-approval path the web route does.
- [ ] **Settings.** All 6 web settings screens absent: index, approvals,
      notifications, memory, passwords, connected-accounts (mobile exposes
      approvals rules separately, but no personal settings surface).
- [ ] **Admin.** The whole `_authed/admin/*` group (~17 routes): people, audit,
      credentials, computers, boundaries, learning, identity-providers,
      enterprise, playground, plugins admin, skills admin, components. Decision
      needed: is admin a mobile target at all, or web-only by design?
- [ ] **Manager dashboard.** `_app/manager.tsx` (new, untracked WIP) — not on
      mobile.
- [ ] **Platform behavior gaps** — attachments, dictation, voice call,
      clipboard, webview browser console: tracked as F1–F4, F8, F12 in
      05-mobile-web-parity.md; not restated here.

## Where mobile is ahead

- [x] **Push notifications** (F6): `expo-notifications` + device registration —
      web has the Notification API only, no server push.
- [x] **Deep links** (F7): `orbomobile://` routing to conversation/approvals —
      web deep links depend on browser context.
- [x] **Live computer screen** (F5): implemented on RN with cookie-header WS +
      screenshot poll — parity in kind, not in chrome.

## Suggested order

1. Conversation-completeness block (channel/group creation) — smallest, most
   daily value.
2. Bot tabs: sharing, responsibilities, reach (read-mostly, cheap to render).
3. Settings: notifications + connected-accounts first (push + grants already
   have server paths).
4. Skills/routines standalone pages.
5. Admin: decide web-only vs subset; audit + computers first if included.
