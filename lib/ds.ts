// Siqa design system: the brand kit's tokens in code.
// Source of truth: the "Siqa" design system artifact (tokens.json + README).
// New and rebuilt screens use these instead of one-off colors, sizes and
// font weights, so everything shares one look.

import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { useTheme } from './theme';

// ── Fonts ──────────────────────────────────────────────────────────────
// Custom fonts on phones need one family name per weight (fontWeight alone
// won't pick the bold file), so text styles set fontFamily from the weight.
export const FONT_FILES = {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
};

export type Weight = 400 | 500 | 600 | 700 | 800;
const FAMILY: Record<Weight, string> = {
  400: 'PlusJakartaSans_400Regular',
  500: 'PlusJakartaSans_500Medium',
  600: 'PlusJakartaSans_600SemiBold',
  700: 'PlusJakartaSans_700Bold',
  800: 'PlusJakartaSans_800ExtraBold',
};

/** fontFamily (+ fontWeight on web, where it's harmless) for a weight. */
export function font(weight: Weight = 400): TextStyle {
  return Platform.OS === 'web'
    ? { fontFamily: `${FAMILY[weight]}, "Plus Jakarta Sans", system-ui, -apple-system, sans-serif`, fontWeight: String(weight) as any }
    : { fontFamily: FAMILY[weight] };
}

// ── Type styles ────────────────────────────────────────────────────────
function t(size: number, line: number, weight: Weight, tracking = 0): TextStyle {
  return { fontSize: size, lineHeight: line, letterSpacing: tracking, ...font(weight) };
}
export const type = {
  display: t(34, 40, 800, -1),
  title1: t(28, 32, 800, -0.7),
  title2: t(22, 28, 700, -0.3),
  amount: t(34, 40, 800, -1),
  headline: t(17, 22, 700),
  body: t(16, 22, 400),
  callout: t(15, 21, 400),
  subhead: t(14, 20, 500),
  caption: t(13, 18, 500),
  micro: t(12, 16, 600),
  buttonLg: t(16, 20, 700),
  buttonMd: t(15, 20, 700),
  buttonSm: t(13, 16, 600),
};

// ── Space, radius, size ────────────────────────────────────────────────
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 } as const;
export const radius = { sm: 10, md: 12, lg: 16, xl: 20, sheet: 26, pill: 999 } as const;
export const size = { controlLg: 54, controlMd: 44, controlSm: 34, row: 58 } as const;

// ── Colors ─────────────────────────────────────────────────────────────
const light = {
  night: '#0a0f1c',
  brandGold: '#d4ac73',
  stage: '#0a0f1c',
  bg: '#ffffff',
  bgSunk: '#f7f7f5',
  surface: '#ffffff',
  surfaceSoft: '#f2f2f0',
  surfaceStrong: '#e4e4e1',
  line: '#ecece9',
  lineControl: '#8a8a85',
  ink: '#111111',
  ink2: '#5e5e5e',
  ink3: '#767676',
  /** Placeholder for big amount inputs ($0.00), so it can't be mistaken for a real value. */
  ghost: '#c8c8c4',
  primary: '#111111',
  onPrimary: '#ffffff',
  gold: '#a8843f',
  onGold: '#111111',
  goldInk: '#7e6330',
  goldTint: '#f7f1e4',
  seed: '#1b6b4a',
  seedTint: '#e7f0ea',
  danger: '#b4412c',
  dangerTint: '#fbedea',
  scrim: 'rgba(0,0,0,0.45)',
};
export type DSColors = typeof light;
const dark: DSColors = {
  night: '#0a0f1c',
  brandGold: '#d4ac73',
  stage: '#141c30',
  bg: '#0a0f1c',
  bgSunk: '#0f1526',
  surface: '#141c30',
  surfaceSoft: '#1b2438',
  surfaceStrong: '#243049',
  line: '#222b40',
  lineControl: '#7e89a3',
  ink: '#edf1f7',
  ink2: '#9facc4',
  ink3: '#7e89a3',
  ghost: '#3e4a64',
  primary: '#edf1f7',
  onPrimary: '#0a0f1c',
  gold: '#d4ac73',
  onGold: '#0a0f1c',
  goldInk: '#e6c290',
  goldTint: '#2b2618',
  seed: '#3fa070',
  seedTint: '#15302a',
  danger: '#f08b74',
  dangerTint: '#33201f',
  scrim: 'rgba(0,0,0,0.55)',
};

// ── Shadows ────────────────────────────────────────────────────────────
// boxShadow works on web and on phones with the new architecture (on).
export type ShadowName = 'hairline' | 'card' | 'raised' | 'primary' | 'gold' | 'sheet';
const SHADOWS: Record<'light' | 'dark', Record<ShadowName, string>> = {
  light: {
    hairline: '0px 1px 2px rgba(0,0,0,0.06)',
    card: '0px 1px 2px rgba(0,0,0,0.04), 0px 8px 24px rgba(0,0,0,0.06)',
    raised: '0px 2px 4px rgba(0,0,0,0.04), 0px 16px 40px rgba(0,0,0,0.10)',
    primary: '0px 10px 24px rgba(0,0,0,0.28), inset 0px 1px 0px rgba(255,255,255,0.12)',
    gold: '0px 10px 24px rgba(168,132,63,0.35), inset 0px 1px 0px rgba(255,255,255,0.2)',
    sheet: '0px -10px 30px rgba(0,0,0,0.12)',
  },
  dark: {
    hairline: '0px 1px 2px rgba(0,0,0,0.4)',
    card: '0px 1px 2px rgba(0,0,0,0.5), 0px 8px 24px rgba(0,0,0,0.35)',
    raised: '0px 2px 4px rgba(0,0,0,0.5), 0px 16px 40px rgba(0,0,0,0.5)',
    primary: '0px 10px 24px rgba(0,0,0,0.6), inset 0px 1px 0px rgba(255,255,255,0.6)',
    gold: '0px 10px 24px rgba(0,0,0,0.6), inset 0px 1px 0px rgba(255,255,255,0.25)',
    sheet: '0px -10px 30px rgba(0,0,0,0.6)',
  },
};

export type DS = {
  c: DSColors;
  isDark: boolean;
  shadow: (name: ShadowName) => ViewStyle;
};

export function useDS(): DS {
  const { isDark } = useTheme();
  const mode = isDark ? 'dark' : 'light';
  return {
    c: isDark ? dark : light,
    isDark,
    shadow: (name) => ({ boxShadow: SHADOWS[mode][name] } as ViewStyle),
  };
}
