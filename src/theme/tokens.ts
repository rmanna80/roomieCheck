/**
 * "Porch Light" design tokens. See docs/02-design-system.md for rationale and contrast checks.
 * Pure data — safe to import from tests.
 */
import type { MemberColor, SignalKind } from '../types/domain';

export type ColorScheme = 'light' | 'dark';

export const palette = {
  light: {
    bg: '#F7F1E8',
    surface: '#FFFBF5',
    surfaceSunken: '#EFE6D8',
    ink: '#2A211B',
    inkMuted: '#6B5D52',
    line: '#E3D7C6',
    ember: '#A84A24',
    onEmber: '#FFFFFF',
    danger: '#B3261E',
    success: '#2F6B45',
    overlay: 'rgba(42, 33, 27, 0.35)',
    windowDim: '#E7DDCE',
  },
  dark: {
    bg: '#17120F',
    surface: '#221B16',
    surfaceSunken: '#2C241E',
    ink: '#F4EADF',
    inkMuted: '#B4A597',
    line: '#3A3029',
    ember: '#F08A5D',
    onEmber: '#1E130D',
    danger: '#F2B8B5',
    success: '#9ED3AE',
    overlay: 'rgba(0, 0, 0, 0.55)',
    windowDim: '#2A221C',
  },
} as const;

export type Palette = { [K in keyof (typeof palette)['light']]: string };

export interface HearthColor {
  tint: string;
  ink: string;
  fuse: string;
}

export const hearth: Record<ColorScheme, Record<SignalKind, HearthColor>> = {
  light: {
    food: { tint: '#F8E7C8', ink: '#6B4106', fuse: '#D9922B' },
    leftovers: { tint: '#F8E7C8', ink: '#6B4106', fuse: '#D9922B' },
    run: { tint: '#DDEBDD', ink: '#2A5234', fuse: '#5E8C6A' },
    space: { tint: '#E8DFF1', ink: '#45305E', fuse: '#7A5C99' },
    reset: { tint: '#D8ECEB', ink: '#1C4F4F', fuse: '#3D8A8A' },
    spark: { tint: '#F8DDE1', ink: '#7D2133', fuse: '#D4566A' },
    return: { tint: '#DEE5F3', ink: '#283F6B', fuse: '#4F6FA8' },
    quiet: { tint: '#E4E2EC', ink: '#3A374F', fuse: '#6E6A86' },
  },
  dark: {
    food: { tint: '#3A2B14', ink: '#F3C579', fuse: '#D9922B' },
    leftovers: { tint: '#3A2B14', ink: '#F3C579', fuse: '#D9922B' },
    run: { tint: '#1F2E22', ink: '#A9D2B2', fuse: '#5E8C6A' },
    space: { tint: '#2B2236', ink: '#CDB8E6', fuse: '#7A5C99' },
    reset: { tint: '#17302F', ink: '#9FD6D3', fuse: '#3D8A8A' },
    spark: { tint: '#3A1C22', ink: '#F2A9B5', fuse: '#D4566A' },
    return: { tint: '#1C2433', ink: '#AFC3EA', fuse: '#4F6FA8' },
    quiet: { tint: '#25232F', ink: '#C3C0D8', fuse: '#6E6A86' },
  },
};

/** Member colors (chosen by each person; never derived from behavior). */
export const memberColors: Record<MemberColor, { light: string; dark: string }> = {
  ember: { light: '#C2562E', dark: '#F08A5D' },
  saffron: { light: '#C98A1E', dark: '#F3C579' },
  sage: { light: '#4F7F5B', dark: '#A9D2B2' },
  plum: { light: '#7A5C99', dark: '#CDB8E6' },
  teal: { light: '#2F7C7C', dark: '#9FD6D3' },
  coral: { light: '#C9475B', dark: '#F2A9B5' },
  dusk: { light: '#4F6FA8', dark: '#AFC3EA' },
  slate: { light: '#5F5B78', dark: '#C3C0D8' },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 40 } as const;
export const radius = { chip: 999, input: 14, button: 16, card: 22, sheet: 28 } as const;
export const gutter = 20;
export const touch = { min: 44, button: 52 } as const;

export const fonts = {
  display: 'Fraunces_600SemiBold',
  displayMedium: 'Fraunces_500Medium',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemi: 'DMSans_600SemiBold',
  bodyBold: 'DMSans_700Bold',
} as const;

export const type = {
  display: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38 },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30 },
  headline: { fontFamily: fonts.displayMedium, fontSize: 19, lineHeight: 25 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 23 },
  label: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 19 },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  micro: { fontFamily: fonts.bodyBold, fontSize: 11, lineHeight: 14, letterSpacing: 0.6, textTransform: 'uppercase' as const },
} as const;

export type TypeVariant = keyof typeof type;

export const motion = {
  enterMs: 180,
  staggerMs: 30,
  pressScale: 0.97,
  pulseMs: 400,
} as const;
