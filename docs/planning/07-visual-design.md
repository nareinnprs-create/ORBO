# 07 — Visual Design & Wireframe Approach (PLAN.md §10.C item 26)

Defines **how** ORBO's merged UI will be designed/wireframed and the **canonical screen
inventory** the unified information architecture (PLAN §3) must cover. Nothing here is built;
this is the planning deliverable for item 26.

**Sources inspected:** `PLAN.md` §3 (target architecture + rules), §6 (parity matrix), §10.C;
`app/src/routes/` (~60 files), `app/src/components/**`, `app/src/styles.css`,
`app/src/components/layout/{page-shell,sidebar-shell,stagger}.tsx`,
`app/src/components/ui/{item,empty,skeleton,button}.tsx`, `app/src/components/app-sidebar/app-sidebar.tsx`,
`docs/planning/03-route-tree.md`, `docs/planning/05-mobile-web-parity.md`,
`docs/planning/01-schema-unification.md`. Brand kit is locked (PLAN §1/§4).

**Constraint:** one new file only; no existing code modified.

---

## 1. Recommendation — design in code, with a thin wireframe pass

**Build screens as code against one reference screen; do not produce a full static mockup set.**
This is a *hybrid*: keep static wireframes only for the four genuinely novel layouts, and
"wireframe" everything else by composing the already-existing primitives.

| Option | Verdict | Why |
|---|---|---|
| Wireframes-first (Figma → build) | **Reject as the default** | A second artifact that goes stale the moment tokens/rows change; a solo owner must maintain it by hand; AI agents copy a picture far less faithfully than they copy working code. |
| Design-in-code (no wireframes at all) | **Too loose** | Chat, the Spaces/Pages editor, the computer live-screen and the review card have no precedent in the current primitives; free-coding four novel layouts invites four dialects. |
| **Hybrid (chosen)** | **Adopt** | The layout system already exists (`PageShell` → `PageSection` → `PageRows` → `Item`, `PageEmpty`). ~80% of screens are "list of rows / rows + dialog" and need no wireframe. Only 4 novel surfaces get a static sketch. |

**Rationale for a solo/small team driving AI agents**
1. **The design system is already the wireframe.** `orbo-screen-layout` fixes width, spacing,
   heading sizes, row anatomy and dialog rules; a new screen is a fill-in-the-blanks exercise, not
   a visual decision.
2. **Executable specs can be tested; pictures cannot.** Tokens, contrast, focus rings and empty
   states are verifiable by `axe`/tests on real code (see §5). A PNG proves nothing.
3. **AI agents reproduce code, not images.** Giving agents one canonical screen
   (`admin/plugins/index.tsx`) as the pattern is a stronger and cheaper instruction than any mockup.
4. **Ports converge under review.** Phases 4–6 port three source UIs; a coded reference screen is
   the merge target, and drift is caught by diffing against it rather than by eyeballing mockups.

**The one reference screen first.** Build a single end-to-end screen (recommend
**Agents list → Agent detail**) that exercises: shell+sidebar, `PageRows`/`Item` in all three row
kinds, empty/skeleton/error, a dialog, and an agent-coloured avatar. Every subsequent screen is
"make it look like this one." Static wireframes (greyscale boxes, no color) are kept only for:
Chat thread, Spaces/Pages editor, Computer live-screen + takeover, and the review-before-save card.

---

## 2. Canonical screen inventory (unified IA)

Routes are the **final Expo Router target** (`docs/planning/03-route-tree.md`), shown
group-relative; the full tree nests them under `(app)`/`(tabs)` per `03` §5 (e.g. `/chat/[channelId]`
below is `(tabs)/chat/[channelId]` in `03`). "today" is the current TanStack path. `≡` marks consolidation of two upstream screens into one ORBO screen.
Every screen renders in **light + dark**.

**State legend — the default each screen must handle:**
`E`=empty · `L`=loading · `X`=error · `S`=success.
Loading uses **`Skeleton` shaped like the final row**, never a spinner, on list screens.
Error is inline, names the failed action, offers **Retry**; governance surfaces **fail closed**
(`components/gallery/refused.tsx`). Empty uses `Empty` (dashed, with title+description) on primary
destinations and `PageEmpty` (one sentence) inside a config section.

### 2.1 Chat

| # | Screen | Route (final ← today) | Primary components | E / L / X / S |
|---|---|---|---|---|
| C1 | **Home / DIYA** — default conversation | `/` ← `_app/index` | `MessageScroller`,`Message`/`Bubble`, composer, `AppSidebar` | E: DIYA greeting starter; L: streaming cursor; X: failed turn + retry; S: transcript |
| C2 | **Conversation (1:1)** | `/chat/[channelId]` ← `channel/$channelId` | `ConversationView`,`Message`,`ToolLine`,`recipient-field` | E: "say hello"; L: AG-UI skeleton; X: stop/failed + retry; S: streamed events |
| C3 | **New conversation** | `/chat/new` ← `channel/new` | `Dialog`/page, `recipient-field` (To:) | E: prompt to pick recipient; L: agent list; X: send error; S: navigates to C2 |
| C4 | **Group thread** ≡ | `/chat/group/[channelId]` ← `group/$channelId` | `GroupChat`,`group-people`,`team-bot-consent` | E: no members; L: skeleton; X: member load error; S: group transcript |
| C5 | **New group** ≡ | `/chat/group/new` ← `group/new` | `recipient-field`, `group-people` | E: pick 2+; L: —; X: <2 recipients; S: creates thread |
| C6 | **Voice call** (state of C2, not a route) | — | `voice-call-widget`,`live-waveform` | E: ready to call; L: connecting; X: no media path; S: live + receipts |

### 2.2 Spaces / Pages (+ Documents/PDF, folded in)

| # | Screen | Route (final ← today) | Primary components | E / L / X / S |
|---|---|---|---|---|
| S1 | **Spaces list** | `/spaces` ← *(new; OpenDots)* | `PageShell`,`PageRows`,`Item`, grid/list toggle | E: create first Space; L: skeleton cards; X: retry; S: space grid |
| S2 | **Space workspace** | `/spaces/[spaceId]` ← *(new)* | `SpaceNav`≡sidebar, page list | E: no pages; L: skeleton; X: retry; S: nested pages |
| S3 | **Page document** | `/spaces/[spaceId]/pages/[pageId]` ← *(new)* | visual editor, slash menu, markdown mode, autosave | E: blank page; L: fetch; X: revision conflict; S: saved |
| S4 | **Page review card** (novel — wireframe) | state of S3 | `PageReviewCard`, inline card in C2 | E: nothing pending; L: parsing; X: review needed; S: page created |
| S5 | **PDF viewer / document pipeline** ≡ | `/spaces/[spaceId]/pages/[pageId]` ← *(new; per `03` §5 — the PDF pipeline rides the page/document surface, rendered by `pdf-reader.{web,native}`)* | `pdf-reader.{web,native}`, paging/zoom/share | E: no doc; L: render; X: bad PDF; S: filled copy |

### 2.3 Work

| # | Screen | Route (final ← today) | Primary components | E / L / X / S |
|---|---|---|---|---|
| W1 | **Work overview** (activity) | `/work` ← *(new aggregation)* | `PageSection`,`Activity` gallery rows | E: no runs; L: skeleton; X: retry; S: recent activity |
| W2 | **Run detail** | `/work/activity/[runId]` ← *(new)* | plan steps, receipts, pause/resume/cancel/retry | E: no steps; L: streaming; X: failed step; S: receipts |
| W3 | **Routines** ≡ | `/work/routines` ← `routines` | `RoutinesList`,`Item`, dialog | E: none; L: skeleton; X: retry; S: schedule rows |
| W4 | **Responsibilities & goals** | `/work/responsibilities` ← `responsibilities` | `Responsibilities`,`triggers` | E: none; L: skeleton; X: retry; S: rows + milestones |
| W5 | **Ideas** | `/work/ideas` ← *(new)* | ideas rows, accept/edit/dismiss | E: none yet; L: skeleton; X: retry; S: evidence-backed cards |

### 2.4 Connections

| # | Screen | Route (final ← today) | Primary components | E / L / X / S |
|---|---|---|---|---|
| N1 | **Connections overview** | `/connections` ← *(new aggregation)* | `SettingsSidebar`, `PageRows` | E: none connected; L: skeleton; X: retry; S: connection rows |
| N2 | **Plugin / tool detail** ≡ | `/connections/[key]` ← `admin/plugins/$key` | `plugin-logo`,`connection-fields`,`brokered-account-row` | E: not configured; L: skeleton; X: auth failed; S: connected |
| N3 | **Composio** | `/connections/composio` ← `admin/plugins/composio` | `account-mode-dialog` | E: none; L: catalog; X: retry; S: brokered apps |
| N4 | **Channels / reach** ≡ | `/connections/channels` ← `reachability` | `reaching-you`, allowlist rows | E: none; L: skeleton; X: retry; S: transports |
| N5 | **Browser / research** | `/connections/browser` ← *(new)* | `ComputerPanel`, capture/nav rules | E: idle; L: connecting; X: worker down; S: live view |

### 2.5 Agents

| # | Screen | Route (final ← today) | Primary components | E / L / X / S |
|---|---|---|---|---|
| A1 | **Agents list** (DIYA pinned) | `/agents` ← `agents`/`bots.index` | `PageShell`,`PageRows`,`Item`,`avatar` | E: catalog load; L: skeleton; X: retry; S: rows, DIYA first |
| A2 | **Agent detail** (profile) | `/agents/[agentId]` ← `bots.$agentId.index` | profile header, tabs, `Item` rows | E: —; L: skeleton; X: retry; S: profile |
| A3 | **Agent setup/edit** | `/agents/[agentId]/setup` ← `bots.$agentId.setup` | form, AG-UI endpoint + auth header | E: defaults; L: —; X: invalid; S: saved |
| A4 | **Agent access / sharing** ≡ | `/agents/[agentId]/access` ← `.access`/`.sharing` | `Item`,`Switch`, grants | E: private; L: —; X: fail-closed; S: grants |
| A5 | **Agent approvals** | `/agents/[agentId]/approvals` ← `bots.$agentId.approvals` | `approval` rows, team rules | E: inherit; L: —; X: fail-closed; S: rules |
| A6 | **Agent memory** | `/agents/[agentId]/memory` ← `bots.$agentId.memory` | `Memory`,`Sources` | E: none; L: skeleton; X: retry; S: entries |
| A7 | **Agent reach** | `/agents/[agentId]/reach` ← `bots.$agentId.reach` | `reaching-you` | E: none; L: —; X: retry; S: channels |
| A8 | **Agent routines** ≡ | `/agents/[agentId]/routines` ← `bots.$agentId.routines` | `RoutinesList` | E: none; L: skeleton; X: retry; S: rows |
| A9 | **Agent responsibilities** | `/agents/[agentId]/responsibilities` ← `bots.$agentId.responsibilities` | `Responsibilities` | E: none; L: skeleton; X: retry; S: rows |
| A10 | **Agent computer** (novel — wireframe) | `/agents/[agentId]/computer` ← *(new)* | `ComputerView`,`LiveScreen`,`TakeTheWheel`,`handoff` | E: off; L: connecting; X: worker down; S: live + takeover |
| A11 | **Skills** (personal) | `/skills` ← `skills` (**assumed** home; `03` names only `admin/skills` — pending C24) | `SkillTools`,`SkillFields`,`EditSkill` | E: none; L: skeleton; X: retry; S: skill rows |

### 2.6 Admin

| # | Screen | Route (final ← today) | Primary components | E / L / X / S |
|---|---|---|---|---|
| D1 | **Admin home** | `/admin` ← `admin/index` | `PageSection`,`PageRows` | E: —; L: skeleton; X: retry; S: sections |
| D2 | **People** | `/admin/people` ← `admin/people` | `PageRows`, role controls | E: single-owner; L: skeleton; X: retry; S: people |
| D3 | **Credentials** | `/admin/credentials` ← `admin/credentials` | write-only fields, redaction | E: none; L: skeleton; X: retry; S: names only |
| D4 | **Boundaries / policy** | `/admin/boundaries` ← `admin/boundaries` | `Item`,`Switch`, presets | E: defaults; L: —; X: fail-closed; S: rules |
| D5 | **Approvals (team)** ≡ | `/admin/approvals` ← `admin/approvals` | team rules, `Switch` | E: inherit; L: —; X: fail-closed; S: rules |
| D6 | **Audit** | `/admin/audit` ← `admin/audit` | `width="wide"` table (`gallery/table`) | E: none; L: skeleton; X: retry; S: log rows |
| D7 | **Computers** | `/admin/computers` ← `admin/computers` | computer rows, gVisor flag | E: none; L: skeleton; X: retry; S: rows |
| D8 | **Plugins** | `/admin/plugins` (+ `$key`, `composio`, `$key/tools/$tool`, `$key/bots/$agentId`) | `plugin-*`, `shared-approval-fields` | E: none; L: skeleton; X: retry; S: rows |
| D9 | **Skills (deployment)** ≡ | `/admin/skills` ← `admin/skills` | `ProposedSkill`,`NewSkill` | E: none; L: skeleton; X: retry; S: rows |
| D10 | **Learning** | `/admin/learning` ← `admin/learning` | evidence routing, published skills | E: none; L: skeleton; X: retry; S: rows |
| D11 | **Components** | `/admin/components` (+ `$name`) | `ComponentPreview`, grants | E: none; L: preview; X: sandbox err; S: list |
| D12 | **Playground** | `/admin/playground` ← `admin/playground` | sandboxed playground | E: blank; L: compile; X: compile err; S: render |
| D13 | **Identity providers** | `/admin/identity-providers` ← `admin/identity-providers` | OIDC/SAML runtime forms | E: none; L: —; X: invalid cfg; S: providers |
| D14 | **Enterprise** | `/admin/enterprise` ← `admin/enterprise` | domain routing, SAML | E: off; L: —; X: retry; S: configured |

### 2.7 Settings

| # | Screen | Route (final ← today) | Primary components | E / L / X / S |
|---|---|---|---|---|
| T1 | **Settings home / General** | `/settings` ← `settings/index` | `SettingsSidebar`,`PageSection` | E: —; L: skeleton; X: retry; S: sections |
| T2 | **Profile / personal context** | `/settings/profile` ← *(from bots/$agentId + memory)* | name, tone, avatar, `Item` rows | E: defaults; L: —; X: invalid; S: saved |
| T3 | **Appearance** | `/settings/appearance` ← *(new, proposed — absent from `03` §5; pending C24)* | theme, density, message list | E: defaults; L: —; X: —; S: applied |
| T4 | **Notifications** | `/settings/notifications` ← `settings/notifications` | `Item`,`Switch`, routing | E: none; L: —; X: retry; S: rules |
| T5 | **Approvals (personal)** ≡ | `/settings/approvals` ← `settings/approvals` | `Item`,`Switch` | E: inherit; L: —; X: fail-closed; S: rules |
| T6 | **Memory** | `/settings/memory` ← `settings/memory` | `Memory`,`Sources` | E: none; L: skeleton; X: retry; S: entries |
| T7 | **Connected accounts** | `/settings/connected-accounts` (+ `[key]`) ← same | `connection-fields` | E: none; L: skeleton; X: auth fail; S: accounts |
| T8 | **Passwords** | `/settings/passwords` ← `settings/passwords` | `sign-in-form`, `devices` | E: none; L: —; X: retry; S: saved (redacted) |
| T9 | **Components gallery** | `/settings/components-gallery` (+ `[name]`) ← same | `gallery/*` | E: none; L: preview; X: sandbox err; S: gallery |

### 2.8 Identity / auth

| # | Screen | Route (final ← today) | Primary components | E / L / X / S |
|---|---|---|---|---|
| I1 | **Sign in** | `/sign-in` ← `sign` | provider buttons, single-owner path | E: —; L: redirect; X: denied; S: session |
| I2 | **Sign-in callback** | `/sign-in/[requestId]` ← `_authed/sign-in/$requestId` | OAuth/SSO handoff | E: —; L: exchanging; X: bad state; S: → `/` |
| I3 | **Onboarding** | `/onboarding` ← `_authed/onboarding` | admin picks model (no default), setup | E: first run; L: probing; X: unreachable; S: → home |

### 2.9 Finance (PLAN §6 — home TBD, not counted below)

PLAN §6 requires CSV import, a categorized spending summary, and a savings-goal action; `05`
and `06` both track Finance, but neither the current routes nor `03` §5 names a Finance screen.
No route is proposed here — the home (Work section vs Spaces document vs standalone) is pending
the C24 route tree.

| # | Screen | Route (final ← today) | Primary components | E / L / X / S |
|---|---|---|---|---|
| F1 | **Finance** (import + summary + goal) | TBD (pending C24) | TBD (same `PageShell`/`PageRows`/`Item` pattern when placed) | E: no imports; L: skeleton; X: bad CSV + retry; S: summary + goal action |

**Screen count: 58** (6 Chat, 5 Spaces, 5 Work, 5 Connections, 11 Agents, 14 Admin, 9 Settings,
3 Identity; C6 is a state not a route, so 57 routes + 1 state. Finance (F1, §2.9) is unplaced
and not counted).

---

## 3. Design-language checklist

### 3.1 Color usage — purple is the AI signal, base is everything else

| Token (intended) | Value role | Where it may appear | Where it may **not** |
|---|---|---|---|
| `--brand-purple` (royal purple) | **AI / agent identity** | DIYA mark, agent avatars/rings, "generated by agent" accent, agent-owned actionable controls, brand wordmark accent | Page chrome, generic primary buttons, borders, backgrounds of list surfaces |
| `--background` / `--card` | Base deep blue-grey surface | Every screen background, cards, dialogs | Must stay neutral; no purple tint at rest |
| `--foreground` / `--muted-foreground` | Base text | All body/label/description | — |
| `--primary` | Primary action | One primary verb per page (`PageShell action`) | Do **not** repaint as purple until contrast (§5) is verified |
| `--success` / `--destructive` | State | receipts, refused/failed cards | Decoration |

Rule of thumb: **if it is the agent talking or acting, purple; if it is the product, base.**
Purple must never be the only signal for a state (agents are also labelled + avatar; colorblind-safe).

### 3.2 Typography — Montserrat (wordmark/headlines) + Inter (UI/body)

`styles.css` today sets one variable font (Inter) and `--font-heading: var(--font-sans)`. Target:
add **Montserrat** for the wordmark and headings; keep **Inter** for all UI/body/controls. Both are
SIL OFL 1.1 → ship via `@fontsource`, self-hosted (no network font, telemetry off).

| Level | Font | Size (drawn) | Use |
|---|---|---|---|
| Wordmark | Montserrat 700 | 14–16px tracking-tight | Sidebar header product name |
| Page title | Montserrat 700 | `text-2xl` | `PageShell` h1 |
| Section title | Montserrat 700 | `text-lg` | `PageSection` h2 |
| Row title | Inter 500 | `text-sm` | `ItemTitle` |
| Body / description | Inter 400 | `text-sm` `leading-relaxed` | `ItemDescription`, prose |
| Meta | Inter 400 | `text-xs` | timestamps, badges |

**rem trap:** `html { font-size: 15px }`, so every rem token is 0.9375× its documented value
(`max-w-2xl` = 630px, not 672). Never hardcode a pixel value derived from a Tailwind rem token;
measure the drawn element.

### 3.3 Spacing & layout rhythm

- Base unit 4px (Tailwind). `PageShell`: `px-4 pb-12`, `pt-12` (or `pt-8` under a back/toggle bar);
  `PageSection`: `mt-12` between unrelated decisions; `PageRows`: `mt-4`.
- Width: `prose` (`max-w-2xl`) is the default; `wide` (`max-w-5xl`) only for the audit table.
- Shell: one viewport, panes scroll inside (`h-svh overflow-hidden`); sidebar 340px app / 300px
  admin+settings; collapses to a Sheet below 768px.
- Rows are one card with `<Separator />` between — never a stack of `gap-*` cards.

### 3.4 Iconography

- One set: **Tabler** (`@tabler/icons-react`), 1.5px stroke, currentColor.
- Sizes: `size-4` in rows/sidebar; `size-3`/`size-3.5` in `xs`/`sm` buttons; `ItemMedia variant="icon"`
  is mandatory so a card of rows is scannable.
- Icons never carry meaning alone — always paired with text or `aria-label`.

### 3.5 Empty / loading / error / success patterns

| State | Pattern | Component |
|---|---|---|
| Empty (destination) | dashed block, title + description, one CTA | `Empty`,`EmptyHeader`,`EmptyTitle`,`EmptyDescription` |
| Empty (config section) | one sentence, no illustration | `PageEmpty` |
| Loading (list) | skeletons shaped like the final row | `Skeleton` |
| Loading (chat) | streamed typing/`ToolLine` shimmer | `Message`/`tool-line-running` |
| Error | inline, names the action, **Retry** | `Item`/`Empty` + Button |
| Refused (governance) | fail-closed card naming the rule | `gallery/refused.tsx` |
| Success | rows / transcript / receipt | `PageRows`, `Message` |

### 3.6 Motion

- Library `motion/react`; tokens `ENTRANCE_SECONDS`, `EASE_OUT` (`lib/motion`).
- List entrance: `StaggerItem` 40ms apart, capped at 12 items, **mount only**; reorders animate
  position, filtering never animates.
- **Every** animation checks `useReducedMotion` and drops to `transform: none` / no delay.
- No motion conveys state on its own (the running sweep is decoration; status is textual).

---

## 4. Component / wireframe backlog (ordered)

**Wave 0 — foundation** (do first; everything else depends on it)
1. `packages/ui` tokens: add `--brand-purple`, Montserrat, deep blue-grey base ramp; map existing
   shadcn variables. Confirm light+dark pairs.
2. **Reference screen:** Agents list (`A1`) built end-to-end — shell, sidebar, `PageRows`/`Item` in
   all 3 row kinds, E/L/X/S, one dialog, agent avatar with purple ring. Freeze it as the pattern.
3. Shell/navigation: top-level sidebar with Chat / Spaces / Work / Connections / Agents groups;
   Admin + Settings reachable from the account menu (per `app-sidebar.tsx`).

**Wave 1 — Chat (highest traffic)** 4. `C1` Home/DIYA · 5. `C2` Conversation · 6. `C3` New · 7. `C4`/`C5` Group ·
8. `C6` voice-call widget states.

**Wave 2 — Agents** 9. `A1` list (reference) · 10. `A2` detail · 11. `A3` setup · 12. `A4`–`A9` sub-pages ·
13. `A10` computer live-screen — **static wireframe first** · 14. `A11` skills.

**Wave 3 — Spaces/Pages** 15. `S1`/`S2` list+workspace · 16. `S3` editor — **wireframe the editor
chrome first** · 17. `S4` review card — **wireframe first** · 18. `S5` PDF viewer (split-file).

**Wave 4 — Work** 19. `W1`/`W2` activity + run detail · 20. `W3` routines · 21. `W4` goals ·
22. `W5` ideas.

**Wave 5 — Connections** 23. `N1` overview · 24. `N2`–`N4` plugin/channels · 25. `N5` browser.

**Wave 6 — Settings + Identity** 26. `T1`–`T9` · 27. `I1`–`I3` sign-in/onboarding.

**Wave 7 — Admin** 28. `D1`/`D6` home + audit (`wide`) · 29. `D2`–`D5` people/creds/boundaries/approvals ·
30. `D7`/`D8` computers/plugins · 31. `D9`–`D14` skills/learning/components/playground/IdP/enterprise.

**Wave 8 — polish** 32. Dark-mode audit of every screen · 33. Empty/error copy pass ·
34. icon/avatar set · 35. responsive sweep (mobile Sheet, Tauri desktop).

---

## 5. Accessibility target

**Target: WCAG 2.2 AA** (PLAN §10.D item 37). Applies to every screen in §2, light and dark.

| Area | Requirement |
|---|---|
| Contrast | Body text ≥ 4.5:1; large text (≥ 24px / 18.66px bold) and UI/graphic boundaries ≥ 3:1. **Purple on the base must be measured, not assumed** — royal purple on a light base is the highest-risk pair. |
| Focus | Every interactive element has a visible `focus-visible` ring (existing `ring-[3px] ring-ring/50`); outline is never removed; `:focus-visible` beats hover. |
| Keyboard | Full tab order; `Item` rows that navigate/render a real `<button>`/`<a>`; menus/dialogs are focus-trapped, `Esc` closes, focus returns to the trigger; visible skip-link to main. |
| Semantics / ARIA | `role="list"` on `ItemGroup`; icon-only buttons carry `aria-label`; dialogs use `role="dialog"` + labelled title; streaming transcript announces via a polite live region; form fields are `label`-bound (`Field`) and errors `aria-describedby` the message. |
| Motion | `prefers-reduced-motion` disables staggering, sweeps and layout animation (already honoured in `StaggerItem`, `tool-line-running`). |
| Touch | ≥ 44×44px (or 24px with adequate spacing per 2.5.8) targets on mobile. |
| Language | `lang="en"`; English only (PLAN §1). |

**How to verify (per screen, before merge):**
1. **Automated:** `axe-core` (Playwright) on each route, light + dark; zero serious/critical.
2. **Contrast:** compute the actual token pairs (not mockup colors) — purple/base, muted text,
   focus ring — and assert ≥ target; fail CI on regression.
3. **Keyboard-only walkthrough:** reach and operate every control; no trap; skip-link works.
4. **Reduced-motion:** toggle OS setting and confirm no animation runs.
5. **Screen reader spot-check:** one config screen, one chat, one dialog (NVDA/VoiceOver).
6. **Zoom/reflow:** 200% zoom and 320px width with no loss of content or function.

---

## 6. Risks & assumptions

| # | Risk / assumption | Impact | Mitigation |
|---|---|---|---|
| V1 | **No designer.** All layout decisions fall to the owner/small team. | Inconsistent screens, the exact failure `PageShell` was written to prevent. | Codify decisions in `orbo-screen-layout` + this doc; one reference screen is the source of truth; deviations must be justified in the compile/comment. |
| V2 | **Owner-provided logo/art pending** (PLAN §10.A.1). | Wordmark, favicons, app icons, PWA manifest, avatars, empty-state art cannot be final. | Ship a monogram placeholder behind a single `brand` module; do not bake art into screens; swap when assets land. |
| V3 | **Purple contrast is unproven.** Royal purple on a deep blue-grey/light base may fail 4.5:1. | Accessibility AA, legibility of agent affordances. | Fix the purple *token* (light/dark variants) before any screen uses it; never signal by color alone; verify in §5 step 2. |
| V4 | **`packages/ui` does not exist yet** (item C25; `05` R6). | Tokens/primitives can drift between `app/` and `mobile/`. | Wave 0 creates it first; mobile consumes the same tokens; design language is defined once. |
| V5 | **Route tree not final** (item C24; `03` ends with a stub). | Screen routes in §2 are targets, not shipped paths. | Treat routes as target; re-check against `03-route-tree.md` when it lands; names (bots→agents) may alias during migration. |
| V6 | **Three UI dialects** (OpenBot Vite, OpenDots web, OpenMuse RN) port in Phases 4–6. | Same screen built twice; visual drift. | Reference screen + `PageShell`/`PageRows`/`Item` are mandatory; delete hand-drawn containers on port; diff against the reference. |
| V7 | **Web vs native divergence** (`05`, F1–F20). | A screen may look right on web and break on mobile. | Design the seam per `05` §3 (split smallest module, identical props); Wave 8 responsive sweep; layout chrome differs (sidebar vs tabs). |
| V8 | **55 screens is a large surface for no designer.** | Scope creep, unfinished polish. | Ordered waves in §4; ship Chat/Agents/Settings first; admin screens reuse the config pattern; measure progress against §2 checklist. |
| V9 | **Montserrat/Inter availability offline.** | Fonts fail on self-host. | Both are SIL OFL 1.1 → self-host via `@fontsource`; no network fetch; telemetry stays off. |
| V10 | **The 15px rem root** silently scales every token. | Layout math wrong by 6.25%. | Documented in skill + §3.2; never hardcode rem-derived pixels; measure the drawn element. |
| V11 | **Finance has no screen home** (F1, §2.9; PLAN §6 ship requirement). | CSV import/summary/goal action has nowhere to land; `06` ports its tests blind. | Pending C24; `08` likewise names no Finance merge section — owner confirms the home before Phase 6. |
| V12 | **Route deltas vs `03` are owned here until C24 lands** (S5 pages path, T3 appearance, A11 personal skills). | Port phases build the wrong path. | §2 marks each delta explicitly; re-check all three against `03-route-tree.md` when it is finalized. |

---

*Derived from the paths cited in the header. Routes are Expo Router targets pending item C24;
unknowns (assets, purple value, `packages/ui`) are marked. No screen outside the eight PLAN §3
surfaces + auth (Identity) is proposed, except the unplaced Finance surface (F1, §2.9).*

© Opraiz Technology Pvt Ltd · Developer: Narein Rao
