# W0 owner-decision packet — §2 UI surfaces

Scope: route tree, `packages/ui` runtime, brand/fonts, deep-link scheme, and
mobile surface scope. Research only; no code changed by this section.
Sources: `03-route-tree.md` §5–§6, `04-design-system.md` §7 (G1/G2/B1/B2),
`05-mobile-web-parity.md` (R6/R12 + §4 scope rows), `07-visual-design.md`
(V2/V3/V5), `15-phase4-portability-audit.md`. All statuses DECIDED per owner freehand directive (reversible).

Conventions: C24 = route-tree freeze item, C25 = `packages/ui` item
(PLAN §10.C). "Web" = Vite + TanStack app under `app/` (60 route files,
`03` §1). "Mobile shell" = Expo shell under `mobile/app/` (11 files: 10
screens + 1 layout, `03` §1b). "Unified app" = the one Expo Router app with
`(auth)` / `(app)` / `(tabs)` groups (`03` §5).

How to read this section: each decision states the question, two options with
a one-line tradeoff each, a recommendation with its reason, the work it
gates, and its status. Evidence bullets after each block ground every claim
in the cited docs; they are not separate decisions. Option letters are
stable — the closing "Answer format" note tells the owner how to reply.

Cross-cutting note: `05` R6 (`packages/ui` does not exist) and `07` V4 (same
gap) gate visual parity for every surface below, and `15` prices the port
(~88 files: 15 PORTABLE, 34 ADAPT, 25 WEB-ONLY rows, `15` §6). Nothing here
authorizes code; W0 answers only unblock Phase 3 scaffolding and Phase 4–6
port sequencing.

## D4. Route-tree freeze (C24)

**Question:** Freeze the `03` §5 Expo Router tree as the build target now?
**Options:** A. Freeze now with redirect map — one re-check cycle against `03` when C24 lands, then build starts. / B. Keep tree open — every port phase re-derives paths from TanStack sources, deferring deep-link and tab contracts.
**Recommendation:** A — because `07` V5/V12 already flags routes as targets-not-paths and `03` §7 ships the redirect-map mitigation (param churn, hash `#/spaces/…` migration), so freezing bounds Finance/work-viewer placement instead of rediscovering it per phase.
**Blocked work:** Phase 3 Expo `(app)`/`(tabs)` scaffold; `03` §6 mapping execution (bots→agents folds, `[key]/bots/[agentId]` split); push/deep-link route join (`05` F7); `07` §4 Wave 0 reference screen + Waves 1–7 screen builds.
**Status:** DECIDED — A per owner freehand directive (reversible)
Context: `03` §5 defines one Expo app (root `_layout`, `+not-found`, `(auth)`
sign-in/callback/onboarding, `(app)` shell with `(tabs)` Home/Chat/Spaces/
Work/Agents plus connections/computer/approvals/memory/settings/admin
stacks). `03` §6 maps all 60 TanStack files plus OpenMuse sections and
OpenDots views/dialogs onto it. `03` §7 then lists the migration mechanics
(TanStack `$param` + dotted escapes → folders + `[param]`; pathless `_authed`
→ `(auth)`/`(app)` groups; `route.tsx` → `_layout.tsx`) and the residual
risks (deep-link churn, `[key]` file/folder collision, auth-split
canonicalization on Better Auth, tabs-vs-stack regressions).
Evidence:
- `03` §5 tree is the only artifact that places new subtrees (Spaces/Pages
  from OpenDots, Activity/Goals/Ideas from OpenMuse, Finance cards into
  Work/Activity) — without a freeze each port phase re-litigates homes.
- `07` V5 states the screen routes in `07` §2 are targets pending C24, and
  V12 assigns the three known deltas (S5 pages path, T3 appearance, A11
  personal skills) to this doc until C24 lands.
- `07` §2.9 F1 (Finance: CSV import + summary + savings-goal) is explicitly
  unplaced and excluded from the 58-screen count pending C24.
Freeze includes: (a) bots→agents rename with `/bots…` → `(tabs)/agents…`
redirects (`03` §5–§6 agent stack, `07` A1/A2); the TanStack dotted escape
`$key_.bots.$agentId` becomes real `[key]/bots/[agentId]` folders (`03` §5,
`03` §7). (b) Finance home — owner picks Work section vs Spaces document vs
standalone at freeze (`07` §2.9, PLAN §6 ship requirement; `05`/`06` track it
but `03` §5 names no route). (c) Work viewer homes — `07` W2 run detail
`/work/activity/[runId]` and W4 responsibilities/goals rows have no `03` §5
counterpart, so confirm or cut before Wave 4; `08` likewise names no Finance
merge section (`07` V11).

## D5. `packages/ui` runtime (C25)

**Question:** Author `packages/ui` as React Native cross-platform or web-only?
**Options:** A. RN cross-platform single source (`react-native` + `react-native-web`) — one primitive set for web/iOS/Android, gallery + Tiptap editor stay web-only. / B. Web-only kit — ship DOM/Base-UI primitives now, fork or rewrite a native kit later.
**Recommendation:** A — because `04` §4 sets the RN+web runtime rule, `04` B1/G2 names this the structure-freeze blocker, and `15` §§1–8 prices the alternative (16 `ui` files carry `@base-ui`/`@shadcn` imports with no RN runtime; ADAPT rows hang off `05` §3 split leaves), so web-only just schedules the `15` §7 rewrites twice.
**Blocked work:** `packages/ui` scaffold completion (tokens, primitives, layout, chat per `04` §§4–5); `15` §7 build order items 1–6 (composer, chat scroll, sidebar chrome, voice/media); `05` R6 visual-parity assertion; `07` V4 token/primitive convergence before Wave 0.
**Status:** DECIDED — A per owner freehand directive (reversible)
Context: `04` §4 proposes `packages/ui` (tokens, primitives, layout, chat,
gallery, editor, brand) with 34 canonical primitives and the runtime rule
that primitives are authored on RN + `react-native-web` while gallery and
Tiptap stay web-only. `04` §6 routes every existing source (ORBO keep,
OpenMuse/OpenDots replace, mascots drop) into those targets.
Evidence:
- `04` G2: current ORBO UI is web-only (Vite + Base UI + Tailwind) but the
  target is Expo/RN — primitives will not run on iOS/Android as-is.
- `04` B1: the runtime decision is an explicit blocker of the structure
  freeze; B2 (brand assets) is the sibling blocker.
- `15` §1: 10 of 26 `ui/` files are WEB-ONLY (select, combobox, menus,
  tooltip, sidebar, carousel, questionnaire, scroller, waveform) because
  Base-UI/Radix positioning, hover semantics, canvas, and DOM scroll have no
  RN equivalent; `15` R1 states every `@base-ui`/`@shadcn` import is a
  rewrite, not a shim.
- `15` §6 totals (~88 files: 15 PORTABLE / 34 ADAPT / 25 WEB-ONLY) and §8
  maps each verdict to a `packages/ui` target; ADAPT chat/layout rows hang
  off the `05` §3 split leaves (recorder, notifier, picker, clipboard,
  storage, screen transport, browser embed, PDF reader).
Note: A keeps the `04` §4 carve-outs — A2UI gallery (`04` G7, `15` §3: 9
WEB-ONLY files; `15` R7 policy-vs-portability tension enforced by lint) and
the OpenDots Tiptap port stay web-only with native fallbacks (read-only
render + Record→Item / Notice→state-row / charts→text-summary fallbacks per
`15` §7 items 3–4).

## D6. Brand assets + fonts

**Question:** Sign off the brand kit (logo, purple values, Montserrat vendoring) and close icon/splash gaps now?
**Options:** A. Lock tokens now (wordmark/headings Montserrat, Inter body, royal-purple + blue-grey ramps) behind a monogram placeholder, swap art when owner assets land. / B. Wait for final art — hold tokens, icons, splash, and purple-contrast verification until the full kit arrives.
**Recommendation:** A — because `04` G1/B2 + `07` V2/V3 already define the placeholder path (monogram behind one `brand` module, purple token fixed before any screen uses it for WCAG AA per `07` §5), so Wave 0 (`07` §4: tokens + A1 reference screen) can proceed while art is pending.
**Blocked work:** `packages/ui` tokens (`04` §§5.1–5.3, `07` §3.1–§3.2); `brand/` Logo/Wordmark/BrandMark (`04` §4, `04` §6 REPLACE avatar/mascot rows); dark-mode + contrast audit (`07` §5 step 2); empty-state/icon pass (`07` Wave 8 items 32–34).
**Status:** DECIDED — A per owner freehand directive (reversible)
Context: brand kit is PLAN §1/§4 locked (Montserrat wordmark/headlines +
Inter body, royal purple AI accents, deep blue-grey base) but owner art is
pending (`07` V2, PLAN §10.A.1). `04` §5 defines the full token ramps
(purple 50–900 with 600 `#6D28D9` primary AI accent; grey 50–950 base;
typography, spacing, radius, shadow, motion) while `07` §3.1 restricts
purple to agent identity (DIYA mark, agent rings, agent-owned controls) and
`07` §3.2 fixes the type scale (Montserrat 700 wordmark/headings, Inter
body/rows/meta).
Evidence:
- `04` G1: Montserrat absent from `app/package.json` (only Inter shipped);
  `--font-heading` aliases Inter today — add `@fontsource-variable/montserrat`.
- `04` B3 (cleared 2026-10-14): Montserrat + Inter vendored first-party
  under `assets/fonts/` with OFL 1.1 text in `NOTICE.md` §4 — remaining work
  is wiring Montserrat into app packaging (see G1), self-hosted, no network
  fetch (`07` V9).
- `04` B2: final logo, purple/blue-grey values, and domain are not provided
  — tokens and `brand/` are unshippable without owner sign-off on `04` §5.
- `07` V3: royal-purple on light/deep-blue-grey base may fail 4.5:1 — fix
  the token pair (light/dark variants) before any screen uses it; never
  signal by color alone; verify per `07` §5 (axe + measured contrast pairs).
- `04` G4/G5: drop both upstream mascots (OpenMuse capybara, OpenDots mascot)
  for origin-trace/legal reasons; standardize one icon set with RN + web
  variants (Tabler per `07` §3.4, 1.5px stroke).
Sub-item — Store/Square placeholder PNGs: `desktop/src-tauri/icons/`
`StoreLogo.png` (131 bytes) and `Square*Logo.png` (104–853 bytes: 30/44/71/
89/107/142/150/284/310px) are Tauri-template stubs beside the real `icon.png`
(863 KB) + `icon.icns`/`icon.ico`. A. Delete them at the icon pass and
generate splash/icons from the locked mark — no runtime references them
today, tiny diff. / B. Keep them — carry dead stub assets into signing.
Recommended: A (delete), folded into the `07` V2 icon/splash close-out
(wordmark, favicons, app icons, PWA manifest, avatars, empty-state art), not
a separate decision.

## D7. Deep-link scheme unify (`orbo` vs `orbomobile`)

**Question:** Unify on one custom scheme for native auth, push routing, and desktop?
**Options:** A. Unify on `orbo:` — migrate mobile + server off `orbomobile:` with a compat window, one scheme in Expo `app.json`, Tauri config, and server trust lists. / B. Keep both — `orbo:` (unified `apps/app/app.json:6`, desktop `tauri.conf.json` `["orbo"]`) alongside legacy `orbomobile:` (`mobile/app.config.ts:8`, `mobile/src/auth.ts`, `server/src/auth/index.ts` trust).
**Recommendation:** A — because `03` §7 + `05` F7/F10 require one joined route map (chat `[channelId]`, approvals, spaces pages) and the current split already forks auth redirects (`orbomobile://` callbacks), push URLs (`server/src/delivery/push.ts`), and link parsing (`mobile/src/links.ts`, tested in `mobile-links.test.ts`), so two schemes double every deep-link test.
**Blocked work:** `(auth)` callback + `(app)` session-guard wiring (`03` §5); `05` F6/F7 notification-routing parity; desktop deep-link registration in both `tauri.conf.json` and Expo `app.json` (`03`:450–451); EAS/push credential pass (`05` R3).
**Status:** DECIDED — A per owner freehand directive (reversible)
Context: `05` F7 records the implemented native scheme as `orbomobile:`
(`mobile/src/links.ts` → `/conversation`, `/approvals`; `mobile/app/_layout.tsx`
handler) while the unified successor declares `orbo` (`apps/app/app.json:6`,
bundle `ai.orbo.app`) and desktop registers `["orbo"]` (`tauri.conf.json`).
`05` F10 records auth as Better-Auth-cookie on web vs `@better-auth/expo` +
SecureStore + scheme redirect on native against the same server.
Evidence:
- `mobile/app.config.ts:8` scheme `orbomobile` (+ `ai.orbo.mobile`
  identifiers) vs `apps/app/app.json:6` scheme `orbo` (+ `ai.orbo.app`) —
  two Expo identities ship two scheme handlers for one product.
- `server/src/auth/index.ts:36` trusts `orbomobile://` as the native origin;
  `docs/configuration.md` gates native sign-in on `orbomobile://` redirect +
  `EXPO_PROJECT_ID`; `server/src/delivery/push.ts:56` mints
  `orbomobile://…` push URLs — every entry must move together.
- `31-phase8-wrapper-plan.md` G3 already flags desktop deep links as
  placeholder (scheme registered, no `tauri-plugin-deep-link` crate) and
  cites the mobile `orbomobile:` precedent against the `orbo` target.
- `03` §7 requires hash `#/spaces/…` links to migrate to real paths with a
  transition redirect map; the same release vehicle carries the scheme
  compat map.
Compat note: A ships `orbo:` as canonical with `orbomobile:` accepted-then-
deprecated over one release — old push/notification URLs and stored device
registrations (`05` F6, `mobile/src/notifications.ts` → `POST
/api/delivery/devices`) keep working during migration; new builds, docs, and
server trust lists reference `orbo:` only.

## D8. Mobile surface scope (R12)

**Question:** Port the full route inventory to native, or ship a tiered mobile subset first?
**Options:** A. Full parity — all `07` §2 screens (58: Chat 6, Spaces 5, Work 5, Connections 5, Agents 11, Admin 14, Settings 9, Identity 3) on iOS/Android from Phase 3. / B. Tiered scope — native ships Chat/Agents/Work-core + approvable surfaces first; admin console, playground, components gallery, and editors stay web/desktop until parity-matrix sign-off.
**Recommendation:** B — because `05` R12 marks the 11-screen mobile shell vs 60 web route files as the undecided scope question, `15` R8 prices full parity as scope creep over the §7 rewrite list, and `07` V8 + §4 waves already order Chat/Agents/Settings first with admin reusing the config pattern later.
**Blocked work:** `05` §4 parity-checklist execution (F1/F3–F9 native leaves: picker, recorder, WebRTC, clipboard, storage, PDF); `15` §7 items 1–6 gating native builds; `07` Waves 1–7 sequencing; Phase 3 delete-gate for the Vite + mobile shells (`03` §7: delete only after parity).
**Status:** DECIDED — B per owner freehand directive (reversible)
Context: `05` R12 states the coverage fact (mobile 10 screens + layout vs web
60 route files per `03` §1) with scope unknown: which web surfaces the unified
Expo app must port in Phase 3 vs leave web-only. `07` §2 answers with a
58-screen canonical inventory (57 routes + C6 call-state; Finance F1 unplaced
and uncounted) where every screen renders light + dark with E/L/X/S states,
skeleton-not-spinner loading, and fail-closed governance rows.
Evidence:
- `05` §4 lists the ship-requirement parity rows (computer live screen,
  threads/drafts persistence via F9, realtime calls via F4, PDF pipeline via
  F1/F13–F15, dictation via F3, notifications via F6/F7, finance CSV via F1)
  and explicitly scopes non-platform-sensitive admin surfaces out of the
  parity pass once `packages/ui` converges.
- `15` R8 + `15` §7: the WEB-ONLY rewrites (composer input, chat scroll,
  gallery, Tiptap, voice, sidebar chrome) are the cost center — full-native
  admin/gallery/editors multiply that cost before product surfaces land.
- `07` V8 prices 55+ screens as a large surface for a designer-less team and
  V6 warns of three-UI-dialect drift; the mitigation is the ordered Waves
  (`07` §4: foundation → Chat → Agents → Spaces → Work → Connections →
  Settings/Identity → Admin → polish) with the A1 Agents-list reference
  screen frozen first.
- `03` §7 orphan rule: Vite/web + mobile shells are deleted only after
  parity-matrix sign-off in PLAN §8 phase order — B makes that gate per-wave
  instead of one big-bang delete.
Out-of-scope guardrail: B defers native polish for admin/audit/boundaries/
credentials/plugins/learning/components/playground/people/IdP/enterprise —
not their existence; the parity matrix tracks per-screen web/iOS/Android
status, and Tauri desktop keeps wrapping the web export unchanged (`03` §5).

## Answer format

Reply per decision ID (D4, D5, D6 + placeholder sub-item, D7 scheme, D8) with
exactly one of: APPROVED (recommendation as written) / APPROVED WITH CHANGE
(state the changed letter or edit) / REJECTED (state what replaces it) /
DEFERRED (name the unblocking date or event). Example: `D4: APPROVED`. A W0
section is buildable only when none of its decisions is DEFERRED.
Owner tip: D4 (tree) and D5 (runtime) are the critical path — clearing those
two unlocks the Phase 3 scaffold even while D6 art (placeholder path) and D7
scheme compat details finish in parallel. D8 tiering should name the Wave 1
ship list explicitly so Phase 4 port order (`08` merge order) can lock.
