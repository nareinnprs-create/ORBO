# @orbo/ui

Canonical ORBO design-system package (Phase 3, WS-01 first + second + third slice).
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
- `src/checkbox.tsx` — canonical Checkbox.
- `src/switch.tsx` — canonical Switch.
- `src/separator.tsx` — canonical Separator.
- `src/skeleton.tsx` — canonical Skeleton.
- `src/empty.tsx` — canonical Empty family.
- `src/item.tsx` — canonical Item row family (+ `itemVariants`).
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

## Follow-ups (not this slice)

Remaining 20 canonical primitives per 04 §4 + §6 mapping; RN-port
decision (04 G2/B1); Montserrat vendoring + OFL notice (04 G1/B3);
`packages/ui` biome a11y overrides if `role="list"`-style markup needs
the same relaxations `app/src/components/ui/**` already has (would retire
the `Field`/`ItemGroup` role omissions and the `Label` ignore above).
