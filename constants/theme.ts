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
  fontSize: {
    xs: 10,
    sm: 11,
    md: 13,
    base: 14,
    lg: 16,
    xl: 18,
    xxl: 22,
    xxxl: 28,
  },
  fontWeight: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
  },
};