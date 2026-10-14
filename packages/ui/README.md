# @orbo/ui

Canonical ORBO design-system package (Phase 3, WS-01 first + second slice).
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
- `ItemSeparator` is a native `<hr>`; the `Separator` primitive does not
  exist in this package yet.
- `ItemGroup` renders a plain `<div>` group (no `role="list"`): the repo
  biome config relaxes `a11y/useSemanticElements` only for
  `app/src/components/ui/**`, so the app's `role="list"` markup does not
  pass lint here. List semantics are a follow-up once the override covers
  this package.
- `data-slot` / `data-variant` / `data-size` are rendered explicitly
  (the app receives them from Base UI state).
- `Input` swaps the Base UI `InputPrimitive` for a native `<input>`;
  `Textarea`/`Label` were already native in the app and are verbatim ports.
- `FieldSeparator` is a native `<hr>`; the `Separator` primitive does not
  exist in this package yet (same call as `ItemSeparator`). `Field` omits
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

## Follow-ups (not this slice)

Remaining 26 canonical primitives per 04 §4 + §6 mapping; RN-port
decision (04 G2/B1); Montserrat vendoring + OFL notice (04 G1/B3);
`packages/ui` biome a11y overrides if `role="list"`-style markup needs
the same relaxations `app/src/components/ui/**` already has (would retire
the `Field`/`ItemGroup` role omissions and the `Label` ignore above).
