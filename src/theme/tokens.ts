/**
 * Design tokens. Every size, color and font in the app comes from here.
 *
 * Spacing follows a 4pt grid, radius has 5 steps, and type uses one family
 * (Onest, full Cyrillic incl. Ө/Ү) in 6 sizes with fixed line heights.
 * Colors come as a light and a dark palette with the same roles; components read
 * them through `useColors` / `makeStyles` (theme.ts). Text colors meet WCAG AA
 * (4.5:1) on their backgrounds in both.
 */

const light = {
  ink: '#1C1917',
  inkSoft: '#57534E',
  muted: '#736C65',
  line: '#ECE7E0',
  paper: '#FAF8F5',
  /** Cards, pills, options: anything that sits on the paper background. */
  card: '#FFFFFF',
  soft: '#F3EFE9',
  /** Literal white for text and icons on colored fills. Same in both themes. */
  white: '#FFFFFF',
  toast: '#1C1917',

  primary: '#CC4C0A',
  primaryText: '#B8430A',
  primaryShadow: '#9E3A08',
  primaryLight: '#FFEEE3',
  primaryMid: '#FFC49E',

  sun: '#FFC233',
  sunDark: '#C98A00',
  sunLight: '#FFF4D6',
  sunBorder: '#F5DD9A',
  sunText: '#8A5E00',

  fire: '#FF6A3D',
  fireText: '#B3390D',
  fireLight: '#FFE8DF',
  fireBorder: '#FFD3C3',

  success: '#16834A',
  successDark: '#0F6537',
  successLight: '#E3F5EA',
  successBorder: '#A6DDBE',
  successText: '#0E6B3B',

  danger: '#C9353B',
  dangerDark: '#9E2A2F',
  dangerLight: '#FDE8E9',
  dangerBorder: '#F4B3B6',
  dangerText: '#9B1C24',

  lock: '#E9E5DE',
  lockDark: '#D3CDC3',
  lockIcon: '#A39C92',

  sky: '#0284C7',
  skyLight: '#E0F2FE',

  video: '#1E120B',
  shadow: 'rgba(28, 25, 23, 0.5)',

  /** Floating glass tab bar (iOS 18 and earlier): wash over the blur, rim light and selected lens. */
  glass: 'rgba(255, 255, 255, 0.42)',
  glassRim: 'rgba(255, 255, 255, 0.9)',
  glassEdge: 'rgba(28, 25, 23, 0.08)',
  glassLens: 'rgba(28, 25, 23, 0.07)',
};

export type Palette = typeof light;

/**
 * Same roles, tuned for a dark background: warm near-black surfaces, lighter
 * tints for colored text, and fills (primary, success, danger) kept dark
 * enough for white labels.
 */
const dark: Palette = {
  ink: '#F5F1EC',
  inkSoft: '#CFC7BE',
  muted: '#A59C92',
  line: '#352F2A',
  paper: '#151210',
  card: '#211D1A',
  soft: '#2C2723',
  white: '#FFFFFF',
  toast: '#3A332E',

  primary: '#CC4C0A',
  primaryText: '#FF8C52',
  primaryShadow: '#7E2E06',
  primaryLight: '#3A2114',
  primaryMid: '#7A3B17',

  sun: '#FFC233',
  sunDark: '#C98A00',
  sunLight: '#33280F',
  sunBorder: '#5C4815',
  sunText: '#FFD36B',

  fire: '#FF6A3D',
  fireText: '#FF9472',
  fireLight: '#3A1E15',
  fireBorder: '#5E2C1D',

  success: '#16834A',
  successDark: '#0C4F2B',
  successLight: '#11291B',
  successBorder: '#1F5C38',
  successText: '#74DBA0',

  danger: '#C9353B',
  dangerDark: '#7E1F23',
  dangerLight: '#341719',
  dangerBorder: '#6B2A2E',
  dangerText: '#FF9EA3',

  lock: '#2E2925',
  lockDark: '#1F1B18',
  lockIcon: '#7D736A',

  sky: '#4FC3F7',
  skyLight: '#10283A',

  video: '#000000',
  shadow: 'rgba(0, 0, 0, 0.6)',

  glass: 'rgba(33, 29, 26, 0.38)',
  glassRim: 'rgba(255, 255, 255, 0.22)',
  glassEdge: 'rgba(0, 0, 0, 0.4)',
  glassLens: 'rgba(255, 255, 255, 0.12)',
};

export const palettes = { light, dark } as const;

export type ColorScheme = keyof typeof palettes;

/** 4pt grid. Use `space[4]` (16) rather than raw numbers. */
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
} as const;

/** Horizontal screen padding. */
export const gutter = space[5];

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  full: 999,
} as const;

/** Touch targets: every control is at least 44pt (Apple HIG). */
export const controlHeight = {
  button: 52,
  control: 44,
  pill: 40,
} as const;

/** Depth of the "3D" press shadow under buttons, nodes and options. */
export const pressDepth = 4;

export const fonts = {
  medium: 'Onest_500Medium',
  semibold: 'Onest_600SemiBold',
  bold: 'Onest_700Bold',
} as const;

export type FontWeight = keyof typeof fonts;

export const typeScale = {
  display: { fontSize: 32, lineHeight: 40, weight: 'bold' },
  title: { fontSize: 24, lineHeight: 32, weight: 'bold' },
  heading: { fontSize: 20, lineHeight: 28, weight: 'bold' },
  body: { fontSize: 16, lineHeight: 24, weight: 'medium' },
  label: { fontSize: 14, lineHeight: 20, weight: 'medium' },
  caption: { fontSize: 12, lineHeight: 16, weight: 'semibold' },
} as const satisfies Record<string, { fontSize: number; lineHeight: number; weight: FontWeight }>;

export type TextVariant = keyof typeof typeScale;
