# @orbo/ui

Canonical ORBO design-system package (Phase 3, WS-01 first + second + third
+ fourth + fifth slice).
Proposed structure: `docs/planning/04-design-system.md` §4.
Token values: `04-design-system.md` §5. Nothing here is consumed by the
`app/` workspace yet — the port happens in a later WS-01 slice.

## Contents

- `src/tokens.ts` — single-source tokens: royal-purple scale + deep
  blue-grey base + semantic state colors, Montserrat/Inter type scale,
  4px spacing, radius (preserves the app `--radius: 0.55rem` scheme),
  shadows, motion, plus `tokensCss` (`:root` custom properties with a
  `prefers-reduced-motion` rule).
- `src/button.tsx` — canonical Button (+ `buttonVariants`).
- `src/input.tsx` — canonical Input.
- `src/textarea.tsx` — canonical Textarea.
- `src/label.tsx` — canonical Label.
- `src/field.tsx` — canonical Field family (+ `fieldVariants`).
- `src/select.tsx` — canonical Select family.
- `src/dialog.tsx` — canonical Dialog family.
- `src/input-group.tsx` — canonical InputGroup family.
- `src/carousel.tsx` — canonical Carousel family.
- `src/questionnaire.tsx` — canonical Questionnaire family.
- `src/avatar.tsx` — canonical Avatar family.
- `src/brand-mark.tsx` — canonical BrandMark (+ `Wordmark`).
- `src/message.tsx` — canonical Message family.
- `src/bubble.tsx` — canonical Bubble family.
- `src/checkbox.tsx` — canonical Checkbox.
- `src/switch.tsx` — canonical Switch.
- `src/separator.tsx` — canonical Separator.
- `src/skeleton.tsx` — canonical Skeleton.
- `src/empty.tsx` — canonical Empty family.
- `src/item.tsx` — canonical Item row family (+ `itemVariants`).
- `src/combobox.tsx` — canonical Combobox family.
- `src/badge.tsx` — canonical Badge (+ `badgeVariants`, `BadgeTone`).
- `src/tooltip.tsx` — canonical Tooltip family.
- `src/sheet.tsx` — canonical Sheet family.
- `src/dropdown-menu.tsx` — canonical DropdownMenu family.
- `src/context-menu.tsx` — canonical ContextMenu family.
- `src/utils.ts` — `cn()` (clsx + tailwind-merge, same as app).
- `src/index.ts` — public exports.

## Token usage

```ts
import { colors, tokensCss, typography } from "@orbo/ui";
```

`tokensCss` is a `:root` block a Tailwind v4 consumer maps into `@theme`
(or reads via `var()`). Primitives reference `--orbo-*` vars **with hex
fallbacks** (e.g. `bg-[var(--orbo-purple-600,#6D28D9)]`), so they render
correctly before `tokensCss` is wired in. Radius/severity class names
(`rounded-lg`, `border-border`, …) intentionally match the app shadcn
scale 1:1 — `--radius-md` and friends resolve to the same values as the
token table, so no class churn is needed at port time.

## Divergences from `app/src/components/ui/`

- Native `<button>` / `<div>` — no `@base-ui/react` dependency.
  `Button` has no `render`/`nativeButton` props and defaults to
  `type="button"`.
- One additive variant: `Button` `ai` (royal-purple accent, DIYA/active
  agent surfaces). All six app variants and all sizes are unchanged.
- `ItemSeparator` is a native `<hr>` (predates the `Separator` primitive;
  kept as-is, no refactor this slice).
- `ItemGroup` renders a plain `<div>` group (no `role="list"`): the repo
  biome config relaxes `a11y/useSemanticElements` only for
  `app/src/components/ui/**`, so the app's `role="list"` markup does not
  pass lint here. List semantics are a follow-up once the override covers
  this package.
- `data-slot` / `data-variant` / `data-size` are rendered explicitly
  (the app receives them from Base UI state).
- `Input` swaps the Base UI `InputPrimitive` for a native `<input>`;
  `Textarea`/`Label` were already native in the app and are verbatim ports.
- `FieldSeparator` is a native `<hr>` (predates the `Separator` primitive;
  same call as `ItemSeparator`, kept as-is). `Field` omits
  the app's `role="group"` — `a11y/useSemanticElements` is relaxed only for
  `app/src/components/ui/**`, so it does not pass lint here (same category
  as `ItemGroup`'s missing `role="list"`). Otherwise verbatim
  (incl. `fieldVariants`).
- `Label` carries a `biome-ignore` for `a11y/noLabelWithoutControl` (generic
  primitive; the consumer associates the control via `htmlFor`). Same
  missing-override category as above.
- `Select` is styled shells, not behaviour: plain `<div>` wrapper (no Root
  context, no `value`/`onValueChange` state), native `<button>`
  `SelectTrigger` keeping the app `size` API (`sm` | `default`, defaults to
  `type="button"`), statically rendered `SelectContent` `<div>` (no
  Portal/Positioner, no `side`/`align` props, no keyboard/scroll behaviour),
  `SelectItem` `<div>` with optional `value` (no ItemText/ItemIndicator
  state), `SelectSeparator` native `<hr>`, chevron/check icons inline SVG
  (no Tabler dependency).
- `Dialog` is styled shells, not behaviour: plain `<div>` `Dialog` wrapper
  (no Root context, no `open` state, no focus trap / scroll lock / escape),
  `DialogPortal` a plain `<div>` (no portal), `DialogTrigger`/`DialogClose`
  native buttons (`type="button"`), `DialogTitle`/`DialogDescription`
  native `<h2>`/`<p>` (`DialogContent` carries `role="dialog"`
  `aria-modal="true"`), close control is the local `Button` (`ghost`,
  `icon-sm`) with an inline SVG X. `DialogContent` keeps the app
  `showCloseButton` + `overlayClassName` API; Base UI
  `data-ending-style`/`data-starting-style` animation attributes are dropped
  (transition classes kept).
- `InputGroup` composes the local canonical `Button`/`Input`/`Textarea` and
  keeps the app export names, `data-slot`s, align/size API, and Tailwind
  scale. Two lint-driven divergences (same missing-override category as
  above): `InputGroup`/`InputGroupAddon` omit the app's `role="group"`, and
  `InputGroupAddon` omits the app's click-to-focus handler (a `<div>` with
  `onClick` does not pass `a11y/useKeyWithClickEvents` here — focus the
  control directly or wrap it in a `<label>`). The addon/button `cva`
  variants stay module-private as in the app.
- `Checkbox` is a native `<input type="checkbox">` (`appearance-none`) in an
  unslotted wrapper span, no Base UI, no Tabler (inline SVG check toggled by
  `peer-checked:` — a native input cannot have children, so there is no
  indicator slot). The app's `data-checked:`/`data-disabled:` selectors
  become native `checked:`/`disabled:` variants; disabled dimming flows
  through `has-disabled:` so box and mark dim together.
- `Switch` is a native `<input type="checkbox">` with no `role`, no Base
  UI. Keeps the app `size` API (`sm` |
  `default`, `data-size`). The app's Base UI `role="switch"` is omitted: a
  lone `role="switch"` fails `a11y/useAriaPropsForRole` without a static
  `aria-checked`, which an uncontrolled native input cannot provide (its
  checked state lives in the DOM), and the native checked state already
  exposes toggle semantics. The app's `data-checked:`/`data-unchecked:`
  selectors become the native `checked:` variant over a base (unchecked)
  style (`dark:checked:` re-asserts the on-state over the dark unchecked
  base); the thumb is a `::before` pseudo-element (no
  `data-slot="switch-thumb"` node, no group-data size selectors — size flows
  through `data-[size=...]:` on the input itself).
- `Separator` is a native `<hr>` (same call as the earlier `ItemSeparator`/
  `FieldSeparator`/`SelectSeparator`), no Base UI. Keeps the app
  `orientation` API (`horizontal` | `vertical`, defaults to `horizontal`);
  `data-horizontal`/`data-vertical` are set explicitly from the prop,
  `decorative` maps to `aria-hidden`, vertical adds `aria-orientation`, and
  `border-0` resets the UA hr border so `h-px`/`w-px` read exactly.
- `Skeleton` was already a native `<div>` in the app and is a verbatim port
  (local `cn` import only).
- `Empty` was already plain `<div>`s in the app and is a verbatim port
  (local `cn` import only; `emptyMediaVariants` stays module-private as in
  the app, and `EmptyDescription` keeps the app's `ComponentProps<"p">`
  typing over a `<div>`).
- `Combobox` is styled shells, not behaviour: plain `<div>` wrapper (no Root
  context, no value/multiple/open state, no filtering), native `<input>` /
  trigger / clear buttons (`type="button"`, chevron/X inline SVG, no
  Tabler), `ComboboxInput` composes the local canonical `InputGroup` and
  keeps `showTrigger`/`showClear`. `Content` is statically rendered (no
  Portal/Positioner, no `side`/`align` props, no open/close animation
  attributes — the app `anchor` prop survives only as a `withChips` flag for
  the min-width rule); `Item` is a `<div>` with optional `value` (no
  highlight state); `Separator` is a native `<hr>` (with `border-0`, same
  call as `SelectSeparator`); `Collection` renders as a fragment (no
  filtering); `Chip` keeps `showRemove`/`removeLabel` with the remove control
  on the local `Button` (`ghost`, `icon-sm`). `ComboboxClear` is exported
  (additive — defined but unexported in the app).
- `Badge` is a native `<span>` + `badgeVariants` (`tone`: `neutral` |
  `positive` | `caution` | `negative`, `data-tone`). There is no
  `ui/badge.tsx` in the app — the tone API mirrors `gallery/frame.tsx`
  `Badge`/`Tone` (the canonical badge per 04 §3). Tint backgrounds derive
  from `--orbo-*` tokens with hex fallbacks (grey scale for neutral, state
  colors via `color-mix` for the rest); text keeps the gallery's
  contrast-tested emerald/amber/red scale.
- `Tooltip` is styled shells, not behaviour: plain `<div>` `Tooltip`/`Provider`
  wrappers (no Root context, no open state — `delay` is accepted and reflected
  as `data-delay` but schedules nothing), `Trigger` a native button
  (`type="button"`), `Content` a statically rendered `<div>`
  (`role="tooltip"`, no Portal/Positioner, no `side`/`align` props — renders
  the app's default `side="top"` placement with a non-positioned diamond
  arrow, no Arrow primitive). Base UI `data-open`/`data-closed`/
  `data-[state=...]` animation attributes are dropped (layout classes kept).
- `Sheet` is styled shells, not behaviour (same category as `Dialog`):
  plain `<div>` wrapper (no Root context, no `open` state, no focus trap /
  scroll lock / escape), `Portal` a plain `<div>` (no portal),
  `Trigger`/`Close` native buttons (`type="button"`), `Title`/`Description`
  native `<h2>`/`<p>`, close control is the local `Button` (`ghost`,
  `icon-sm`) with an inline SVG X. `Content` keeps the app `side` +
  `showCloseButton` API and always renders its own backdrop div; Base UI
  `data-ending-style`/`data-starting-style` animation attributes are dropped
  (transition classes kept). `SheetPortal`/`SheetOverlay` stay module-private,
  matching the app (the canonical `Dialog` exports its Portal/Overlay because
  the app dialog does too).
- `DropdownMenu`/`ContextMenu` are styled shells, not behaviour: plain
  `<div>` wrappers (no Root context, no open state, no keyboard/focus
  management, no menu roles — same lint-driven call as the `Field`/`ItemGroup`
  role omissions), `Portal` a plain `<div>` (no portal),
  `DropdownMenuTrigger` a native button (`type="button"`;
  `ContextMenuTrigger` stays a plain `<div>` area wrapper — the app trigger
  is the right-click region, not a button — with no `contextmenu` behavior),
  `Content` statically rendered (no Positioner, no `side`/`align` props),
  `Item` keeps the app `inset` + `variant` (`default` | `destructive`) API,
  `checked` maps to `data-checked` (the check mark renders when set — no
  indicator state machine), `Separator` a native `<hr>` (with `border-0`,
  same call as `SelectSeparator`), chevron/check icons inline SVG (no Tabler
  dependency). Base UI `data-open`/`data-closed`/`data-popup-open`/
  `data-[side=...]` slide-in animation attributes are dropped (layout classes
  kept). `RadioItem` gains an optional `checked` (additive — the app derives
  it from the radio group, which has no state here).
- `Carousel` is styled shells + native scrolling, not Embla: no
  `embla-carousel-react` dependency (`opts`/`plugins` are not accepted — the
  axis follows `orientation`), `setApi` receives a minimal
  `{ scrollPrev, scrollNext }` handle (not the Embla API), prev/next page
  the viewport via `scrollBy`, and `canScrollPrev`/`canScrollNext` derive
  from the viewport scroll position instead of Embla `select`/`reInit`
  events. The root is a native `<section>` keeping the app `role="region"`
  + `aria-roledescription`, and `CarouselItem` is a plain `<div>` (no
  `role="group"`) — same lint-driven call as the `Field`/`ItemGroup` role
  omissions. Previous/Next are the
  local `Button` (`outline`, `icon-sm`) with inline SVG chevrons (no Tabler).
  `carouselKeyboardAction` is a verbatim port (pure helper).
- `Questionnaire` is styled shells, not behaviour: native
  form/fieldset/legend/label/input/p/buttons, no
  `@shadcn/react/questionnaire`, no Tabler (inline SVG check,
  `buttonVariants` from the local canonical `Button` for the nav buttons).
  No step/item state — `items`/`item`/`defaultItem`/`onItemChange`/
  `shortcuts` are not accepted and every Item renders (the consumer controls
  visibility); no keyboard/shortcut handling (same category as the canonical
  `Select`'s dropped keyboard behavior). `Item` keeps
  `name`/`multiple`/`required`/`disabled`/`invalid` (`required` maps to
  `data-required` — a fieldset carries no `required` attribute; `invalid`
  maps to `aria-invalid` + `data-invalid`); `Choice` keeps
  `value`/`checked`/`defaultChecked`/`disabled` and gains an explicit `type`
  (`radio` | `checkbox`, reflected as `data-type` — the app derives it from
  the Item's `multiple` via context); `ChoiceShortcut` gains an explicit
  `shortcut`; `Error` gains an explicit `invalid` driving `hidden` +
  `role="alert"` (same additive call as the `DropdownMenu` `RadioItem`
  `checked`); `Submit` defaults to `type="submit"`, the other nav buttons to
  `type="button"`, matching the app. The choice `<input>` is inlined in
  `Choice` (rather than composed via a `ChoiceInput` piece, which the app
  file does not export either) so the nested control stays statically
  associated with its `<label>` for `a11y/noLabelWithoutControl`;
  `QuestionnaireChoiceLabel` stays module-private (same call as the
  canonical `Empty`/`InputGroup` variants);
  `QuestionnaireChoiceShortcut` is exported (additive).
- `Avatar`/`AvatarGroup` replace the app's `boring-avatars` sources
  (`agents/abstract-avatar.tsx`, `channels/avatar.tsx`) with the ORBO brand
  mark per 04 §3/§6: no generated art, no new dependency. A face is
  deterministic initials on a contrast-paired royal-purple / blue-grey token
  pair (hex fallbacks) hashed from `seed ?? name`, in a rounded-full shell
  (`role="img"` + `aria-label`, same announcement shape as
  `AbstractAvatar`). `AvatarGroup` keeps the `ChannelAvatar` overlap layout
  (first three faces, mask cutouts) and `typing` keeps the roster working
  indicator; the badge sits outside the clipped face (minor structural
  difference, so it is never cut off).
- `BrandMark` (+ `Wordmark`) has no app source: a static inline-SVG orb in
  the royal-purple token scale with an optional Montserrat wordmark (04
  §5.3), no `motion`/audio/amplitude/state (static divergence from
  `agents/orb/agent-orb.tsx`, same category as the other styled shells). No
  image assets, no font packaging (Montserrat with Inter/sans-serif
  fallback until G1 vendors the face). The mark is decorative
  (`aria-hidden` SVG); the wordmark text carries the name when shown.
- `Message` was already plain `<div>`s in the app and is a verbatim port
  (local `cn` import only; same `align` API).
- `Bubble` keeps the app export names, `data-slot`s, `variant`/`align`/
  `side` API, and Tailwind scale. One deliberate divergence: `BubbleContent`
  is a native `<div>` (the app composes Base UI `useRender` with a `render`
  prop — same call as the canonical `Button`); `bubbleVariants`/
  `bubbleReactionsVariants` stay module-private (the app exports neither,
  same call as the canonical `Empty`/`InputGroup` variants).

## Follow-ups (not this slice)

Remaining 8 canonical primitives per 04 §4 + §6 mapping; RN-port
decision (04 G2/B1); Montserrat vendoring + OFL notice (04 G1/B3);
`packages/ui` biome a11y overrides if `role="list"`-style markup needs
the same relaxations `app/src/components/ui/**` already has (would retire
the `Field`/`ItemGroup` role omissions and the `Label` ignore above).
