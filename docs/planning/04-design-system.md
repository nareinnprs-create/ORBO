# 04 — Design System Spec (PLAN.md §10.C item 25)

Defines the ONE ORBO design system before `packages/ui` is built (PLAN.md §3, §8 Phase 3).
Brand kit is locked: **Montserrat** (wordmark/headlines) + **Inter** (UI/body), both SIL OFL 1.1;
**Royal Purple** for AI accents; **deep blue-grey** base. Product **ORBO**, boss agent **DIYA**.

Scope: component inventory (ORBO, OpenMuse, OpenDots), overlap/dedup decision, proposed
`packages/ui` structure, token tables, and a keep/replace/drop mapping. No source code modified.

References: PLAN.md §3 (repo layout), §4 (rebrand), §6 (parity), §10.C.25. Sibling docs 01–03, 05, 06.

Current ORBO UI is a **Vite + TanStack Router web app** (`app/`): Tailwind v4 CSS-first
(no `tailwind.config.*`; tokens live in `app/src/styles.css` via `@import "tailwindcss"` plus
`@theme inline`), shadcn-on-Base-UI, `@base-ui/react`, `@shadcn/react`
(`app/package.json:16-43`), not yet the Expo app PLAN.md targets. `shared/` holds only
server/domain logic (auth, prompts, providers, routines) — **zero UI primitives there**.

---

## 1) Current ORBO inventories

### 1.1 Primitives — `app/src/components/ui/` (26 files)

| File | Exports (component) | Purpose |
|---|---|---|
| `button.tsx` | Button, buttonVariants | Primary action; cva variants + sizes (Base UI) |
| `input.tsx` | Input | Text input |
| `textarea.tsx` | Textarea | Multiline input |
| `label.tsx` | Label | Field label |
| `field.tsx` | FieldSet, FieldLegend, FieldGroup, Field, FieldContent, FieldLabel, FieldTitle, FieldDescription, FieldSeparator, FieldError | Form field composition |
| `input-group.tsx` | InputGroup, InputGroupAddon/Button/Text/Input/Textarea | Input with affixes |
| `checkbox.tsx` | Checkbox | Boolean control |
| `switch.tsx` | Switch | Toggle |
| `select.tsx` | Select + Trigger/Content/Item/Group/Label/Separator/Scroll* | Single-select dropdown |
| `combobox.tsx` | Combobox + Value/Trigger/Input/Content/List/Item/Group/Label/Chips/Chip/Empty/Separator | Filterable select |
| `separator.tsx` | Separator | Divider |
| `skeleton.tsx` | Skeleton | Loading placeholder |
| `empty.tsx` | Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent | Empty state |
| `item.tsx` | ItemGroup, ItemSeparator, Item, ItemMedia, ItemContent, ItemTitle, ItemDescription, ItemActions, ItemHeader, ItemFooter | Canonical settings/row primitive |
| `dialog.tsx` | Dialog + Trigger/Close/Portal/Overlay/Content/Header/Body/Footer/Title/Description | Modal dialog |
| `sheet.tsx` | Sheet + Trigger/Close/Portal/Overlay/Content/Header/Footer/Title/Description | Side/edge sheet |
| `dropdown-menu.tsx` | DropdownMenu + Trigger/Content/Item/CheckboxItem/RadioItem/Sub*/… | Menu |
| `context-menu.tsx` | ContextMenu + Trigger/Content/Item/Sub*/… | Right-click menu |
| `tooltip.tsx` | Tooltip, TooltipTrigger, TooltipContent, TooltipProvider | Hint |
| `sidebar.tsx` | SidebarProvider, Sidebar, Trigger, Rail, Inset, Input, Header, Footer, Separator, Content, Group*, Menu, MenuItem/Button/Action/Badge/Skeleton/Sub* | App sidebar system |
| `carousel.tsx` | Carousel, Content, Item, Previous, Next, carouselKeyboardAction | Embla carousel |
| `questionnaire.tsx` | Questionnaire + Progress/Item/Title/Description/Choices/Choice/Input/Error/Actions/Previous/Skip/Next/Submit | Multi-step ask-form |

### 1.2 Chat primitives — `app/src/components/ui/` (4 files)

| File | Exports | Purpose |
|---|---|---|
| `message.tsx` | MessageGroup, Message, MessageAvatar, MessageContent, MessageHeader, MessageFooter | Transcript message shell |
| `bubble.tsx` | BubbleGroup, Bubble, BubbleContent, BubbleReactions | Chat bubble |
| `message-scroller.tsx` | MessageScrollerProvider, MessageScroller, Viewport, Content, Item, Button | Auto-scroll transcript |
| `live-waveform.tsx` | LiveWaveform | Voice/dictation waveform |

### 1.3 Layout — `app/src/components/layout/` (6 files)

| File | Exports | Purpose |
|---|---|---|
| `page-shell.tsx` | PageShell, PageSection, PageRows, PageEmpty | Every config screen frame (`prose`/`wide`) |
| `detail-panel.tsx` | DetailPanel | Right-hand detail pane |
| `sidebar-shell.tsx` | SidebarShell | App shell around sidebar |
| `sidebar-toggle.tsx` | SidebarToggle, SidebarToggleBar, useSidebarToggleVisible | Collapse control |
| `row-mark.tsx` | RowMark | Leading status/dot mark on rows |
| `stagger.tsx` | StaggerItem | Entrance animation |

### 1.4 Gallery — model-generated components, `app/src/components/gallery/` (11 files, A2UI)

| File | Exports (actual names) | Purpose |
|---|---|---|
| `frame.tsx` | GalleryFrame, Badge, type Tone (`neutral\|positive\|caution\|negative`) | Frame + semantic-tone badge |
| `cards.tsx` | RecordCard, MetricsCard, ChecklistCard, NoticeCard (+ `*Props`, `GALLERY`) | Data cards |
| `charts.tsx` | BarChartCard, PieChartCard, LineChartCard, AreaChartCard, ProgressChartCard (+ `*Props`, `GALLERY`) | Fixed-palette charts |
| `decisions.tsx` | ApprovalCard, ChoiceCard (+ `*Props`, `GALLERY`) | Approve/choose inline cards |
| `form.tsx` | FormCard (+ FormCardArgs, `GALLERY`) | Model-filled form |
| `table.tsx` | DataTable (+ DataTableProps, `GALLERY`) | Tabular output |
| `activity.tsx` | ActivityReportCard (+ ActivityReportProps, `GALLERY`) | Activity summary |
| `quote.tsx` | QuoteCard (+ QuoteCardProps, `GALLERY`) | Quote |
| `refused.tsx` | RefusedCard | Refusal state |
| `preview.tsx` | GalleryPreview | Dev preview harness |
| `palette.ts` | SERIES_COLOURS, STATE_COLOURS, seriesColour | Fixed series/state colours |

### 1.5 Chat surfaces — `app/src/components/channels/` (~19 tsx files)

| File(s) | Purpose |
|---|---|
| `channel-chat.tsx`, `chat-transcript.tsx`, `conversation-view.tsx`, `group-chat.tsx` | 1:1 and group conversation views |
| `composer/` (composer, attachment-strip, dictation-controls, rejected-files, collapse + `composer/*state`, `draft.ts`, `queue.ts`) | Message composer (+ state/draft/queue helpers, tested) |
| `tool-line.tsx`, `tool-boundary.tsx`, `browser-activity.tsx` | Tool-run rendering |
| `voice-call-widget.tsx`, `voice-chat-card.tsx` | WebRTC call controls + receipts |
| `recipient-field.tsx`, `group-people.tsx`, `team-bot-consent.tsx`, `avatar.tsx` | Addressing, people, consent, avatar |

### 1.6 App composition (root + feature dirs, spot list)

`app-sidebar/app-sidebar.tsx` (nav), `component-preview.tsx`, `theme-provider.tsx` (dark mode via
`applyDarkTheme`/`THEME_STORAGE_KEY` in `app/src/lib/theme.ts`), `agents/orb/agent-orb.tsx` +
`ai-core.tsx` (DIYA orb), `icons/waveform.tsx` (only icon file), plus feature areas `admin/`,
`agents/`, `approvals/`, `bot-profile/`, `bots/`, `computer/`, `delivery/`, `memory/`,
`passwords/`, `plugins/`, `responsibilities/`, `routines/`, `settings/`, `skills/`, `suggestions/`.
Icon deps: `@tabler/icons-react` (ORBO) — no lucide in `app/package.json`.

---

## 2) Upstream UI inventories

### 2.1 OpenMuse — `_sources/OpenMuse/apps/mobile/` (Expo / React Native, ~33 src files)

There is **no `components/ui` package**; the UI kit is a single module with inline tokens.
`apps/mobile/src/ui.tsx`: `colors` (12-key hex: canvas/card/text/muted/line/blue/blueDark/sky/
green/lavender/orange/danger), `s` (StyleSheet: row/between/text/muted/small/label/title/heading/
card/divider/input), Button, IconButton, Card, Chip, Field, Empty, ErrorNotice, Sheet (RN Modal),
CheckRow, SectionHeading, LinkRow, Mascot (capybara), dateLabel, timeLabel, relativeDate
(re-export `./relative-date`), resultSummary.

Feature components (`apps/mobile/src/`):

| File | Exports / purpose |
|---|---|
| `screens.tsx` | TodayScreen, MailScreen, CalendarScreen, BrowserScreen, FilesScreen, ActivityScreen, ConnectionsScreen, AgendaRow |
| `agent-ui.tsx` | statusLabel, AgentStatus, TaskCard, ChatWork, AgentActivityScreen, EvidenceList, TaskDetail, ArtifactCard, DelegateSheet, IdeasScreen, GoalsScreen, NotificationsSheet, AppsScreen |
| `chat.tsx` | ChatScreen, WorkspaceTools |
| `computer.tsx`, `computer-workspace.tsx` (+ `computer-status.ts`, `computer-drafts.tsx`) | ComputerEntry, BrowserThreadCard, ComputerSheet, LinuxWorkspace |
| `threads.tsx`, `details.tsx`, `workspace.tsx`, `agent-workspace.tsx` | ThreadsSheet/Provider, Details, workspace context |
| `mail/search/browser/desktop/jev-tool-card.tsx` (+ `jev-actions.ts`) | Tool-result cards |
| `thread-artifacts.tsx`, `assistant-response.tsx` (+ `assistant-markdown.ts`), `background-updates.tsx`, `desktop-stream.tsx` | Artifacts, markdown response, live updates, stream |

`App.tsx` holds nav + shell (icons: lucide-react-native). Theme: light-only hex palette.

### 2.2 OpenDots — `_sources/OpenDots/src/client/` (web, React + Tiptap, ~35 files)

| File | Exports / purpose |
|---|---|
| `App.tsx` | App shell, hash routes, nav |
| `Chat.tsx`, `ChatTranscript.tsx` (`isInternalVoiceReceipt`, ChatTranscript) | Chat + transcript |
| `CallView.tsx` (CallView), `useVoice.ts` (useVoice) | WebRTC call view/controls |
| `ThreadList.tsx` (ThreadList), `ResultPane.tsx` (ResultPane) | Thread list, task result pane |
| `TaskPresentation.tsx` (relative, statusLabel, Status, TaskRow, Empty), `TaskActions.tsx` (TaskActions) | Status, rows, empty; task actions |
| `ComputerPanel.tsx`, `ComputerToolCard.tsx` (ComputerToolCard, computerToolResult) | Computer/browser panel + tool card |
| `ConnectionActionCard.tsx`, `ConnectionsSection.tsx` (ConnectionsSection) | Connections UI |
| `SpaceNav.tsx`, `SpaceLibrary.tsx`, `SpaceWorkspace.tsx` | Spaces navigation/library/workspace |
| `PageDocument.tsx`, `PageConversation.tsx`, `PageOutline.tsx`, `PageReviewCard.tsx` | Pages model |
| `editor/RichEditor.tsx` (default RichEditor), `editor/DocumentMenu.tsx` | Tiptap rich-text editor + menu |
| `Mascot.tsx` (Mascot) | Brand mascot |
| `WorkspaceDialog.tsx` (type Dialog, WorkspaceDialog) | Dialog enumeration |

Theme/tokens (`src/client/`): `theme.ts` (light/dark/system preference via `data-theme` +
`watchSystemTheme`), `style.css` (4266 lines; base vars `:root:1-15`: `--ink #333641`,
`--muted #8c8d97`, `--line #e9e8e6`, `--blue #7285d5`, `--blue-dark #5269bb`,
`--lavender #eeeffa`; a second `:root` block ~3072 re-scopes the same six vars for the
`.template-app` workspace chrome — **not** a dark theme; true dark colors are build-derived
per `style.css:4019-4022`, which only sets `::root[data-theme='dark'] { color-scheme: dark }`),
`editor.css` (`--document-ink #282b2a`, `--document-muted`, `--document-line`).

---

## 3) Overlap / dedup analysis

| Capability | ORBO | OpenMuse | OpenDots | Winner / rationale |
|---|---|---|---|---|
| Button | `ui/button.tsx` (cva variants+sizes) | `ui.tsx` Button | native `<button>` (`style.css:24-27`) | **ORBO** — variant/size system widest |
| Text input / field | `ui/input.tsx`, `field.tsx`, `input-group.tsx` | `ui.tsx` Field | `style.css` input | **ORBO**; add RN `TextInput` variant |
| Select / combobox | `ui/select.tsx`, `combobox.tsx` | — | native select | **ORBO** |
| Card | `gallery/cards.tsx` + `frame.tsx` | `ui.tsx` Card | — | **ORBO** (Record/Metrics/Checklist/Notice) |
| Row / list link | `ui/item.tsx`, `layout/page-shell.tsx` PageRows | `ui.tsx` LinkRow | `TaskPresentation.tsx` TaskRow | **ORBO Item/PageRows** |
| Empty state | `ui/empty.tsx` | `ui.tsx` Empty | `TaskPresentation.tsx` Empty | **ORBO Empty** |
| Chip / badge / pill | `gallery/frame.tsx` Badge+Tone | `ui.tsx` Chip | status pills | **ORBO Badge** (semantic Tone) |
| Modal / sheet | `ui/dialog.tsx`, `ui/sheet.tsx` | `ui.tsx` Sheet (RN Modal) | `WorkspaceDialog.tsx` | **ORBO Sheet/Dialog**; merge OpenMuse RN modal behavior |
| Menu | `ui/dropdown-menu.tsx`, `context-menu.tsx` | — | — | **ORBO** |
| Toggle / checkbox | `ui/switch.tsx`, `checkbox.tsx` | `ui.tsx` CheckRow | — | **ORBO** |
| Sidebar / nav | `ui/sidebar.tsx`, `app-sidebar/` | `App.tsx` nav | icon-rail CSS | **ORBO sidebar** |
| Thread list | `app-sidebar/channel.tsx` | `threads.tsx` ThreadsSheet | `ThreadList.tsx` | **ORBO app-sidebar**; port pane behavior |
| Chat bubble / message | `ui/message.tsx`, `bubble.tsx`, `message-scroller.tsx` | `chat.tsx` ChatScreen | `ChatTranscript.tsx` | **ORBO Message/Bubble/Scroller** |
| Composer | `channels/composer/` | `chat.tsx` inline | `chat-composer.ts` | **ORBO composer** |
| Tool-result card | `gallery/*`, `channels/tool-line.tsx` | mail/search/browser/desktop/jev cards | `ComputerToolCard.tsx` | **ORBO gallery + tool-line** |
| Voice / call | `channels/voice-*`, `ui/live-waveform.tsx` | — | `CallView.tsx`, `useVoice.ts` | **merge** → ORBO waveform + call controls |
| Avatar / mascot | `agents/abstract-avatar.tsx`, boring-avatars | `ui.tsx` Mascot (capybara) | `Mascot.tsx` | **REPLACE ALL** with ORBO brand mark |
| Rich-text editor | — | — | `editor/RichEditor.tsx` (Tiptap) | **OpenDots wins** — unique to Spaces |
| Charts | `gallery/charts.tsx` + `palette.ts` | — | — | **ORBO** (unique) |
| Question flow | `ui/questionnaire.tsx` | — | — | **ORBO** (unique) |
| Carousel | `ui/carousel.tsx` | — | — | **ORBO** (unique) |

Net: ORBO already carries the superset primitive set; OpenMuse contributes the RN-capable kit
(shapes to port), OpenDots contributes the Tiptap editor and the second chat/task read of the model.

---

## 4) Proposed `packages/ui` structure

```
packages/ui/
├─ package.json                 # name @orbo/ui
├─ src/
│  ├─ tokens/
│  │  ├─ colors.ts              # purple + blue-grey scales + semantic map (single source)
│  │  ├─ typography.ts          # Montserrat/Inter scale
│  │  ├─ spacing.ts  radius.ts  shadow.ts  motion.ts
│  │  └─ tokens.css             # Tailwind v4 @theme + shadcn CSS vars (web build)
│  ├─ primitives/               # Button Input Textarea Label Field Checkbox Switch Select
│  │                            # Combobox Separator Skeleton Empty Item Badge Tooltip
│  │                            # Dialog Sheet DropdownMenu ContextMenu Carousel Questionnaire
│  ├─ layout/                   # PageShell/PageSection/PageRows/PageEmpty, DetailPanel,
│  │                            # SidebarShell, Sidebar, RowMark, Stagger
│  ├─ chat/                     # Message, Bubble, MessageScroller, Composer, ToolLine,
│  │                            # Transcript, VoiceCall, LiveWaveform
│  ├─ gallery/                  # model-generated cards/charts/table/form (A2UI sandbox)
│  ├─ editor/                   # Tiptap RichEditor port (from OpenDots; web-only)
│  ├─ brand/                    # Wordmark, Logo, BrandMark (Montserrat), orbs
│  └─ index.ts
```

**Canonical primitive list (34, one each):** Button, IconButton, Input, Textarea, Label, Field,
InputGroup, Checkbox, Switch, Select, Combobox, Separator, Skeleton, Empty, Item (+Item*),
Badge, Tooltip, Dialog, Sheet, DropdownMenu, ContextMenu, Carousel, Questionnaire, Avatar/BrandMark,
Message, Bubble, MessageScroller, Composer, ToolLine, LiveWaveform, PageShell, PageSection,
PageRows, PageEmpty, DetailPanel, Sidebar. (RadioGroup semantics folded into Questionnaire/Field;
no standalone radio exists in any source — do not invent one.)

Runtime rule: primitives are authored with `react-native` + `react-native-web` so web/iOS/Android
share one source; the A2UI **gallery stays web-only** (model-generated DOM sandbox), as does the
Tiptap editor port.

---

## 5) Design tokens

### 5.1 Color — Royal Purple (AI accents)

Anchored to the existing near-purple already in ORBO dark sidebar (`styles.css:86`,
`oklch(0.488 0.243 264.376)` ≈ hue 264) so accents stay continuous with shipped UI.

| Token | Hex | Use |
|---|---|---|
| `--orbo-purple-50` | `#F5F3FF` | AI surface tint |
| `--orbo-purple-100` | `#EDE9FE` | AI chip bg |
| `--orbo-purple-200` | `#DDD6FE` | AI border |
| `--orbo-purple-300` | `#C4B5FD` | Disabled accent |
| `--orbo-purple-400` | `#A78BFA` | Hover accent |
| `--orbo-purple-500` | `#8B5CF6` | AI ring |
| `--orbo-purple-600` | `#6D28D9` | **Primary AI accent** (DIYA, active agent) |
| `--orbo-purple-700` | `#5B21B6` | Pressed |
| `--orbo-purple-800` | `#4C1D95` | Deep accent text |
| `--orbo-purple-900` | `#2E1065` | Dark AI surface |

### 5.2 Color — deep blue-grey base (neutral)

| Token | Hex | Semantic (`styles.css` var) |
|---|---|---|
| `--orbo-grey-50` | `#F4F6F8` | `--background` (light) |
| `--orbo-grey-100` | `#E8ECF1` | `--muted`, `--secondary` |
| `--orbo-grey-200` | `#D3DAE3` | `--border`, `--input` |
| `--orbo-grey-300` | `#B4BFCD` | disabled |
| `--orbo-grey-400` | `#8A98AB` | `--muted-foreground` |
| `--orbo-grey-500` | `#64748B` | `--ring` |
| `--orbo-grey-600` | `#4A5668` | secondary text |
| `--orbo-grey-700` | `#363F4D` | `--card` dark |
| `--orbo-grey-800` | `#232B36` | dark surface |
| `--orbo-grey-900` | `#161C24` | **base** / `--foreground` light |
| `--orbo-grey-950` | `#0E1319` | `--background` (dark) |

Semantic state (keep from gallery `palette.ts` / `frame.tsx`): positive `#10B981`, caution `#F59E0B`,
negative/refusal `#EF4444`; charts use `SERIES_COLOURS` (indigo `#6366F1` lead). Deep blue-grey
replaces ORBO's current achromatic oklch neutrals (`styles.css:21-92`) — a deliberate re-tint.

### 5.3 Typography

| Token | Family | Size / line-height | Weight | Use |
|---|---|---|---|---|
| `--font-wordmark` | Montserrat | 23px / 1.1 | 700, -1px | ORBO wordmark |
| `--font-display` | Montserrat | 32px / 1.15 | 600, -0.7px | Page hero |
| `--font-heading` | Montserrat | 23px / 1.25 | 600, -0.5px | Section titles |
| `--font-title` | Montserrat | 18px / 1.3 | 600 | Card/dialog titles |
| `--font-body` | Inter | 15px / 1.5 | 400 | Body (matches root 15px) |
| `--font-body-sm` | Inter | 14px / 1.45 | 400 | Secondary |
| `--font-small` | Inter | 12px / 1.4 | 400 | Captions |
| `--font-label` | Inter | 10px / 1.3 | 700, 1.4px, uppercase | Overline labels |
| `--font-code` | ui-monospace | 13px / 1.5 | 400 | Code |

### 5.4 Spacing (4px base)

| Token | px | Notes |
|---|---|---|
| `--space-1` … `--space-6` | 4/8/12/16/20/24 | core steps |
| `--space-8` / `--space-10` | 32 / 40 | sections |
| `--space-12` / `--space-16` | 48 / 64 | page gaps |

### 5.5 Radius — preserve ORBO scheme (`styles.css:47,157-163`)

| Token | Value | = `--radius` × |
|---|---|---|
| `--radius-sm` | 0.33rem | 0.6 |
| `--radius-md` | 0.44rem | 0.8 |
| `--radius-lg` | 0.55rem | 1.0 (base) |
| `--radius-xl` | 0.77rem | 1.4 |
| `--radius-2xl` | 0.99rem | 1.8 |
| `--radius-3xl` | 1.21rem | 2.2 |
| `--radius-full` | 9999px | pills/avatars |

### 5.6 Shadow

| Token | Value | Use |
|---|---|---|
| `--shadow-xs` | `0 1px 2px rgb(22 28 36 / 0.05)` | rows |
| `--shadow-sm` | `0 1px 3px rgb(22 28 36 / 0.08)` | cards |
| `--shadow-md` | `0 4px 12px rgb(22 28 36 / 0.10)` | popovers |
| `--shadow-lg` | `0 12px 32px rgb(22 28 36 / 0.16)` | dialogs/sheets |
| `--shadow-accent` | `0 0 0 3px rgb(109 40 217 / 0.35)` | AI focus ring |

### 5.7 Motion

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | 120ms | micro (hover) |
| `--motion-base` | 150ms | default (`button.tsx:7` `duration-150`) |
| `--motion-slow` | 240ms | sheets/dialogs |
| `--ease-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | entrances |
| `--ease-in-out` | `ease-in-out` | toggles (`button.tsx:7`) |
| `--motion-shimmer` | 1.6s linear infinite | running tool line (`styles.css:222`) |

All motion must honor `prefers-reduced-motion` (existing pattern `styles.css:232-238`).

---

## 6) Mapping: existing → `packages/ui`

| Existing (source) | `packages/ui` target | Action |
|---|---|---|
| `ui/button.tsx`, `input.tsx`, `textarea.tsx`, `label.tsx`, `checkbox.tsx`, `switch.tsx`, `separator.tsx`, `skeleton.tsx` | `primitives/*` | **Keep** |
| `ui/field.tsx`, `input-group.tsx`, `select.tsx`, `combobox.tsx`, `dropdown-menu.tsx`, `context-menu.tsx`, `tooltip.tsx`, `carousel.tsx`, `questionnaire.tsx` | `primitives/*` | **Keep** |
| `ui/dialog.tsx`, `sheet.tsx` | `primitives/*` | **Keep** + merge OpenMuse RN `Sheet` behavior |
| `ui/empty.tsx`, `item.tsx` | `primitives/*` | **Keep** |
| `ui/sidebar.tsx`, `layout/*`, `app-sidebar/*` | `layout/*` | **Keep** (rename SidebarShell) |
| `ui/message.tsx`, `bubble.tsx`, `message-scroller.tsx`, `live-waveform.tsx`, `channels/*` | `chat/*` | **Keep**; fold in OpenDots `CallView`/`useVoice` |
| `gallery/*` | `gallery/*` | **Keep** (web-only) |
| `agents/abstract-avatar.tsx`, boring-avatars | `brand/Avatar` | **Replace** with ORBO brand mark |
| OpenMuse `ui.tsx` Button/Card/Chip/Field/Empty | maps to ORBO primitives | **Replace** (RN behavior ported) |
| OpenMuse `Mascot` (capybara) | — | **Drop** |
| OpenMuse `chat.tsx`, `screens.tsx`, `agent-ui.tsx`, tool-cards | `chat/*`, feature ports | **Replace** — re-implement on ORBO primitives |
| OpenDots `ChatTranscript.tsx`, `Chat.tsx`, `ThreadList.tsx`, `ResultPane.tsx` | `chat/*` | **Replace** — behavior ported |
| OpenDots `Mascot.tsx` | — | **Drop** |
| OpenDots `editor/RichEditor.tsx`, `DocumentMenu.tsx` | `editor/*` (web-only) | **Keep** (Tiptap; only port) |
| OpenDots `style.css` / `theme.ts` / `editor.css` tokens | `tokens/*` | **Replace** with ORBO tokens |
| OpenDots `App.tsx` shell/nav | `layout/*` | **Replace** |
| OpenDots `TaskPresentation.tsx`, `TaskActions.tsx`, `ConnectionsSection.tsx` | feature ports | **Replace** on ORBO primitives |

---

## 7) Gaps and risks

| # | Gap / risk | Impact | Mitigation |
|---|---|---|---|
| G1 | **Montserrat is absent** — `app/package.json:22` ships only `@fontsource-variable/inter`; no Montserrat in `_sources` either | Wordmark/headline brand cannot ship | Add `@fontsource-variable/montserrat`; wire `--font-heading` (currently aliases Inter, `styles.css:123`) |
| G2 | ORBO UI is **web-only** (Vite + Base UI + Tailwind, `app/package.json`) but target is Expo/RN (PLAN.md §3) | Primitives won't run on iOS/Android as-is | Re-author primitives on `react-native`+`react-native-web`; keep gallery + Tiptap editor web-only |
| G3 | **Three token systems**: ORBO oklch achromatic, OpenMuse hex, OpenDots CSS vars | Inconsistent theming | One `packages/ui/tokens` source compiled to CSS vars + RN theme |
| G4 | **Mascot conflict**: OpenMuse capybara + OpenDots mascot are upstream brands | Origin-trace / legal | Drop both; only ORBO brand mark |
| G5 | **Icon sets differ**: `@tabler/icons-react` (ORBO), `lucide-react-native` (OpenMuse); OpenDots uses inline/lucide-react | Visual drift, bundle bloat | Standardize on one set with RN + web variants |
| G6 | **Chat/thread/composer duplicated** across all three | Divergent behavior, 3× maintenance | One `packages/ui/chat` + one server subsystem (PLAN.md §3) |
| G7 | Gallery is **model-generated (A2UI)** DOM | Not portable to native | Keep gallery web-only; define native fallback list |
| G8 | Motion: ORBO has `motion` + `tw-animate-css`; upstreams have neither | Inconsistent animation | Central `motion.ts`; reduced-motion contract |
| G9 | Accessibility target undefined (PLAN.md §10.D.37) | Compliance risk | Fix WCAG target in tokens (contrast ≥ 4.5:1) |
| B1 | **Blocker:** `packages/ui` runtime decision (RN cross-platform vs web-only) is unstated | Blocks structure freeze | Resolve before Phase 3 UI build |
| B2 | **Blocker:** brand assets (logo, final purple/blue-grey values, domain) not provided (PLAN.md §10.A.1) | Tokens/brand unshippable | Owner sign-off on §5 scales |
| B3 | **Cleared 2026-10-14:** Montserrat + Inter are vendored first-party under `assets/fonts/` (4 weights each + `LICENSE-*.txt`, SIL OFL 1.1) and `NOTICE.md` §4 carries the OFL 1.1 text. Remaining: wire Montserrat into app packaging (see G1). | — | — |
