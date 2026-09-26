import { Platform } from 'react-native';

// Screen headers use this to clear the native iOS status bar / notch.
// On web there's no system status bar drawn over the page, so the
// full 60px was pure dead space at the top of every screen.
export const HEADER_TOP_PADDING = Platform.OS === 'web' ? 20 : 60;

export const Theme = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    full: 9999,
  },
  // Bumped roughly 10-20% across the board (larger jump at the top end,
  // where headings benefit from more separation) — 29 files pull sizes
  // from this one scale rather than hardcoding pixels, so this is the
  // one change that actually reaches most of the app at once instead of
  // tuning each screen's text individually.
  fontSize: {
    xs: 11,
    sm: 13,
    md: 15,
    base: 16,
    lg: 18,
    xl: 21,
    xxl: 25,
    xxxl: 32,
  },
  fontWeight: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
  },
};