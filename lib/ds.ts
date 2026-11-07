// Siqa design system: the brand kit's tokens in code.
// Source of truth: the "Siqa" design system artifact (tokens.json + README).
// New and rebuilt screens use these instead of one-off colors, sizes and
// font weights, so everything shares one look.

import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { InterTight_600SemiBold, InterTight_700Bold, InterTight_800ExtraBold } from '@expo-google-fonts/inter-tight';
// Chai only (its playful sub-brand): Fredoka headings, Space Mono labels.
import { Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { currentIsDark, useTheme } from './theme';

// ── Fonts ──────────────────────────────────────────────────────────────
// Inter for everything you read; Inter Tight (tighter, heavier) for titles
// and money. Custom fonts on phones need one family name per weight
// (fontWeight alone won't pick the bold file), so text styles set
// fontFamily from the weight.
// Phones only; the web uses the self-hosted variable fonts in public/index.html.
export const FONT_FILES: Record<string, number> = Platform.OS === 'web' ? {} : {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  InterTight_600SemiBold,
  InterTight_700Bold,
  InterTight_800ExtraBold,
  Fredoka_600SemiBold,
  Fredoka_700Bold,
  SpaceMono_700Bold,
};

export type Weight = 400 | 500 | 600 | 700 | 800;
export type Family = 'sans' | 'display';
const SANS: Record<Weight, string> = {
  400: 'Inter_400Regular',
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
  800: 'Inter_800ExtraBold',
};
const DISPLAY: Record<Weight, string> = {
  400: 'InterTight_600SemiBold',
  500: 'InterTight_600SemiBold',
  600: 'InterTight_600SemiBold',
  700: 'InterTight_700Bold',
  800: 'InterTight_800ExtraBold',
};
const WEB_STACK = {
  sans: '"Inter", system-ui, -apple-system, sans-serif',
  display: '"Inter Tight", "Inter", system-ui, -apple-system, sans-serif',
};

/** fontFamily (+ fontWeight on web, where the fonts are variable) for a weight. */
export function font(weight: Weight = 400, family: Family = 'sans'): TextStyle {
  if (Platform.OS === 'web') return { fontFamily: WEB_STACK[family], fontWeight: String(weight) as any };
  return { fontFamily: (family === 'display' ? DISPLAY : SANS)[weight] };
}

// ── Type styles ────────────────────────────────────────────────────────
function t(size: number, line: number, weight: Weight, tracking = 0, family: Family = 'sans'): TextStyle {
  return { fontSize: size, lineHeight: line, letterSpacing: tracking, ...font(weight, family) };
}
export const type = {
  display: t(34, 40, 800, -1, 'display'),
  title1: t(28, 32, 800, -0.7, 'display'),
  title2: t(22, 28, 700, -0.3, 'display'),
  amount: t(34, 40, 800, -1, 'display'),
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

// ── Migrating older screens ────────────────────────────────────────────
// Only styles that set a size or weight: a modifier that just changes the
// color (selected/active states) must not reset the weight of the base style.
const TEXT_KEYS = ['fontSize', 'fontWeight'];

function nearestWeight(w: unknown): Weight {
  const n = w === 'bold' ? 700 : w === 'normal' || w == null ? 400 : parseInt(String(w), 10) || 400;
  if (n <= 400) return 400;
  if (n >= 800) return 800;
  return (Math.round(n / 100) * 100) as Weight;
}

/**
 * Puts an existing screen's text on the brand fonts: every style that styles
 * text (has a font size or weight) gets the Inter file for its weight,
 * and big bold titles (20px+, semibold or heavier) get Inter Tight. Wrap a screen's style object before StyleSheet.create:
 *   StyleSheet.create(brandStyles({ ... }))
 * Styles that already set a fontFamily (icons, Arabic) are left alone.
 */
export function brandStyles<T extends Record<string, any>>(styles: T): T {
  const out: Record<string, any> = {};
  for (const key of Object.keys(styles)) {
    const s = styles[key];
    if (s && typeof s === 'object' && !s.fontFamily && TEXT_KEYS.some((k) => k in s)) {
      const w = nearestWeight(s.fontWeight);
      const title = typeof s.fontSize === 'number' && s.fontSize >= 20 && w >= 600;
      const next = { ...s, ...font(w, title ? 'display' : 'sans') };
      if (Platform.OS !== 'web') delete next.fontWeight;
      out[key] = next;
    } else {
      out[key] = s;
    }
  }
  return out as T;
}

// ── Static access (for StyleSheet factories outside React hooks) ──────
/** Brand colors/shadows for the current theme, for makeStyles(C) functions. */
export function dsStatic(): DS {
  const isDark = currentIsDark;
  const mode = isDark ? 'dark' : 'light';
  return { c: isDark ? dark : light, isDark, shadow: (name) => ({ boxShadow: SHADOWS[mode][name] } as ViewStyle) };
}

/**
 * Button look as plain styles, for older screens that draw their own
 * TouchableOpacity buttons: style={styles.primaryBtn} + styles.primaryBtnText.
 * Prefer <Button> from components/ui in new code.
 */
export function buttonStyles(variant: 'primary' | 'gold' | 'secondary' | 'soft' | 'danger', sz: 'lg' | 'md' | 'sm' = 'md') {
  const { c, shadow } = dsStatic();
  const look = {
    primary: { bg: c.primary, fg: c.onPrimary, sh: 'primary' as const },
    gold: { bg: c.gold, fg: c.onGold, sh: 'gold' as const },
    secondary: { bg: c.surface, fg: c.ink, border: c.line, sh: 'hairline' as const },
    soft: { bg: c.surfaceSoft, fg: c.ink },
    danger: { bg: c.dangerTint, fg: c.danger },
  }[variant] as { bg: string; fg: string; border?: string; sh?: ShadowName };
  const h = sz === 'lg' ? size.controlLg : sz === 'md' ? size.controlMd : size.controlSm;
  const box: ViewStyle = {
    minHeight: h,
    paddingHorizontal: sz === 'sm' ? 14 : 18,
    borderRadius: sz === 'lg' ? radius.lg : radius.pill,
    backgroundColor: look.bg,
    borderWidth: look.border ? 1 : 0,
    borderColor: look.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(look.sh ? shadow(look.sh) : null),
  };
  const text: TextStyle = { ...(sz === 'lg' ? type.buttonLg : sz === 'md' ? type.buttonMd : type.buttonSm), color: look.fg };
  return { box, text, fg: look.fg };
}
