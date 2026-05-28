/**
 * Design tokens mirrored from apps/web/tailwind.config.ts so the mobile app
 * feels identical to the web app. Do NOT inline raw colors / spacing elsewhere —
 * always import from here.
 */

// HSL values from tailwind.config.ts, pre-converted to hex for RN compatibility.
export const palette = {
  // bg
  bgDefault: "#0e1014", // hsl(224 14% 6%)
  bgElevated: "#13161b", // hsl(224 14% 8%)
  // fg
  fgDefault: "#f5f5f5", // hsl(0 0% 96%)
  fgMuted: "#a3a3a3", // hsl(0 0% 64%)
  fgSubtle: "#707070", // hsl(0 0% 44%)
  // border
  borderDefault: "#262a30", // hsl(224 8% 16%)
  borderStrong: "#34393f", // hsl(224 8% 22%)
  // accent
  accent: "#1ee07d", // hsl(150 80% 52%)
  accentFg: "#0d1f15", // hsl(150 30% 8%)
  // semantic
  danger: "#ef4444", // hsl(0 84% 60%)
  warn: "#f59e0b", // hsl(38 92% 60%)
  success: "#1ee07d"
} as const;

// Light palette for system override (still dark-leaning, just a touch brighter).
export const paletteLight = {
  bgDefault: "#ffffff",
  bgElevated: "#f6f7f9",
  fgDefault: "#0e1014",
  fgMuted: "#4a4a4a",
  fgSubtle: "#707070",
  borderDefault: "#e5e7eb",
  borderStrong: "#cbd0d6",
  accent: "#0fb869",
  accentFg: "#ffffff",
  danger: "#dc2626",
  warn: "#d97706",
  success: "#0fb869"
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  "2xl": 48
} as const;

export const typography = {
  xs: { fontSize: 12, lineHeight: 16 },
  sm: { fontSize: 13, lineHeight: 18 },
  base: { fontSize: 15, lineHeight: 22 },
  lg: { fontSize: 17, lineHeight: 24 },
  xl: { fontSize: 20, lineHeight: 26 },
  "2xl": { fontSize: 24, lineHeight: 30 },
  "3xl": { fontSize: 36, lineHeight: 42 },
  display: { fontSize: 52, lineHeight: 56 }
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999
} as const;

export type ColorToken = keyof typeof palette;
export type SpacingToken = keyof typeof spacing;
export type TypographyToken = keyof typeof typography;
export type RadiusToken = keyof typeof radii;
