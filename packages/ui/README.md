# @orbo/ui

Canonical ORBO design-system package (Phase 3, WS-01 first slice).
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

## Follow-ups (not this slice)

Remaining 32 canonical primitives per 04 §4 + §6 mapping; RN-port
decision (04 G2/B1); Montserrat vendoring + OFL notice (04 G1/B3);
`packages/ui` biome a11y overrides if `role="list"`-style markup needs
the same relaxations `app/src/components/ui/**` already has.
