/*
 * ORBO design tokens — single source of truth.
 *
 * Values transcribed from docs/planning/04-design-system.md §5. The purple
 * scale is anchored to the near-purple already shipped in the app dark
 * sidebar (oklch(0.488 0.243 264.376)); the blue-grey base deliberately
 * re-tints the current achromatic oklch neutrals. Radius preserves the app
 * scheme (app/src/styles.css --radius: 0.55rem and its multipliers).
 *
 * Motion must honor prefers-reduced-motion (see tokensCss below).
 */

export const colors = {
  /**
   * Royal Purple — AI accents. 600 is the primary AI accent.
   *
   * D6 accessibility (recomputed from the hex values below): purple-600
   * (#6D28D9) is 2.63:1 as text on dark grey-950 (FAIL, needs 4.5:1) and
   * ~2.5:1 as a ring on dark (FAIL, needs 3:1). Use purple-400 (#A78BFA,
   * 6.85:1) or purple-300 (#C4B5FD, 10.10:1) for text/rings on dark.
   * White on purple-600 is 7.10:1 (PASS), so solid 600 fills with white
   * text stay as-is.
   */
  purple: {
    50: "#F5F3FF",
    100: "#EDE9FE",
    200: "#DDD6FE",
    300: "#C4B5FD",
    400: "#A78BFA",
    500: "#8B5CF6",
    600: "#6D28D9",
    700: "#5B21B6",
    800: "#4C1D95",
    900: "#2E1065",
  },
  /**
   * Deep blue-grey base. 900 is the light-theme foreground, 950 dark bg.
   *
   * D6 accessibility (recomputed from the hex values below): grey-400
   * (#8A98AB) is 2.71:1 on grey-50 (FAIL, needs 4.5:1) and must not be
   * used for body/secondary text on light. Grey-600 (#4A5668) is 6.87:1
   * on grey-50 (PASS) and is the minimum for muted text on light.
   */
  grey: {
    50: "#F4F6F8",
    100: "#E8ECF1",
    200: "#D3DAE3",
    300: "#B4BFCD",
    400: "#8A98AB",
    500: "#64748B",
    600: "#4A5668",
    700: "#363F4D",
    800: "#232B36",
    900: "#161C24",
    950: "#0E1319",
  },
} as const;

/**
 * Semantic state colors (kept from app gallery palette/frame).
 *
 * D6 accessibility (recomputed from the hex values below): positive
 * (#10B981) is 2.54:1 and caution (#F59E0B) is 2.15:1 as text on white
 * (FAIL, needs 4.5:1; also below the 3:1 non-text/large threshold), so
 * restrict them to icon/border/large-only usage, never body text.
 * Negative (#EF4444) is 3.76:1 (passes 3:1 non-text, still fails 4.5:1
 * body text). Do not darken these hex values here; fix usages instead.
 */
export const state = {
  positive: "#10B981",
  caution: "#F59E0B",
  negative: "#EF4444",
} as const;

/** Chart series colors (kept from app gallery palette; indigo leads). */
export const chart = {
  seriesLead: "#6366F1",
} as const;

export const typography = {
  families: {
    /** Wordmark/headlines. Vendored in app via @fontsource-variable/montserrat (04 G1). */
    display: "Montserrat",
    /** UI/body. Shipped via @fontsource-variable/inter. */
    body: "Inter",
    code: "ui-monospace",
  },
  scale: {
    wordmark: { size: "23px", lineHeight: 1.1, weight: 700, tracking: "-1px" },
    display: {
      size: "32px",
      lineHeight: 1.15,
      weight: 600,
      tracking: "-0.7px",
    },
    heading: {
      size: "23px",
      lineHeight: 1.25,
      weight: 600,
      tracking: "-0.5px",
    },
    title: { size: "18px", lineHeight: 1.3, weight: 600, tracking: "0" },
    body: { size: "15px", lineHeight: 1.5, weight: 400, tracking: "0" },
    bodySm: { size: "14px", lineHeight: 1.45, weight: 400, tracking: "0" },
    small: { size: "12px", lineHeight: 1.4, weight: 400, tracking: "0" },
    label: {
      size: "10px",
      lineHeight: 1.3,
      weight: 700,
      tracking: "1.4px",
      transform: "uppercase",
    },
    code: { size: "13px", lineHeight: 1.5, weight: 400, tracking: "0" },
  },
} as const;

/** Spacing — 4px base. Keys are token steps, values px. */
export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radius = {
  /** Base --radius, preserved from app/src/styles.css. */
  base: "0.55rem",
  /** Multipliers of base, preserved from the app @theme block. */
  scale: {
    sm: 0.6,
    md: 0.8,
    lg: 1.0,
    xl: 1.4,
    "2xl": 1.8,
    "3xl": 2.2,
    "4xl": 2.6,
  },
  /** Resolved values (base x multiplier). 4xl is in styles.css but not 04. */
  resolved: {
    sm: "0.33rem",
    md: "0.44rem",
    lg: "0.55rem",
    xl: "0.77rem",
    "2xl": "0.99rem",
    "3xl": "1.21rem",
    "4xl": "1.43rem",
    full: "9999px",
  },
} as const;

export const shadows = {
  xs: "0 1px 2px rgb(22 28 36 / 0.05)",
  sm: "0 1px 3px rgb(22 28 36 / 0.08)",
  md: "0 4px 12px rgb(22 28 36 / 0.10)",
  lg: "0 12px 32px rgb(22 28 36 / 0.16)",
  accent: "0 0 0 3px rgb(109 40 217 / 0.35)",
} as const;

export const motion = {
  fast: "120ms",
  base: "150ms",
  slow: "240ms",
  easeOut: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  easeInOut: "ease-in-out",
  shimmer: "1.6s linear infinite",
} as const;

/*
 * CSS custom-property build of the tokens above. A Tailwind v4 consumer maps
 * these into @theme (or reads them via var()); primitives in this package
 * reference --orbo-* vars with hex fallbacks so they render before this
 * block is wired in. The reduced-motion rule mirrors app/src/styles.css.
 */
export const tokensCss = `:root {
  --orbo-purple-50: #F5F3FF;
  --orbo-purple-100: #EDE9FE;
  --orbo-purple-200: #DDD6FE;
  --orbo-purple-300: #C4B5FD;
  --orbo-purple-400: #A78BFA;
  --orbo-purple-500: #8B5CF6;
  --orbo-purple-600: #6D28D9;
  --orbo-purple-700: #5B21B6;
  --orbo-purple-800: #4C1D95;
  --orbo-purple-900: #2E1065;
  --orbo-grey-50: #F4F6F8;
  --orbo-grey-100: #E8ECF1;
  --orbo-grey-200: #D3DAE3;
  --orbo-grey-300: #B4BFCD;
  --orbo-grey-400: #8A98AB;
  --orbo-grey-500: #64748B;
  --orbo-grey-600: #4A5668;
  --orbo-grey-700: #363F4D;
  --orbo-grey-800: #232B36;
  --orbo-grey-900: #161C24;
  --orbo-grey-950: #0E1319;
  --orbo-positive: #10B981;
  --orbo-caution: #F59E0B;
  --orbo-negative: #EF4444;
  --orbo-radius: 0.55rem;
  --orbo-shadow-accent: 0 0 0 3px rgb(109 40 217 / 0.35);
  --orbo-motion-fast: 120ms;
  --orbo-motion-base: 150ms;
  --orbo-motion-slow: 240ms;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
`;
