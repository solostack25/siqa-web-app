export let currentIsDark = true;

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Colors } from '../constants/colors';

export const DarkColors = { ...Colors };

export const LightColors = {
  gold: '#B8860B',
  goldLight: '#DAA520',
  goldDim: '#8B6914',
  goldBg: 'rgba(184,134,11,0.1)',
  goldSoft: 'rgba(184,134,11,0.14)',
  emerald: '#1B6B4A',
  emeraldLight: '#2D9B6E',
  emeraldBg: 'rgba(27,107,74,0.1)',
  emeraldSoft: 'rgba(27,107,74,0.14)',
  live: '#D9755F',
  danger: '#D9755F',
  // Neutrals below were previously warm/tan-tinted (bg #F5F3EE, border
  // rgba(139,107,40,...) — literally brown) which cast a beige tone over
  // every card and divider in the app. Swapped for true neutral gray,
  // closer to how YouTube/most modern apps do a light theme.
  bg: '#FFFFFF',
  bg2: '#F2F2F0',
  bg3: '#EAEAE8',
  surface: '#FFFFFF',
  surface2: '#F5F5F4',
  surface3: '#EAEAE8',
  border: 'rgba(20,20,20,0.12)',
  border2: 'rgba(20,20,20,0.08)',
  borderSoft: 'rgba(20,20,20,0.05)',
  text: '#141414',
  text2: '#5B5B5B',
  text3: '#8E8E8E',
  ink: '#141414',
  inkMuted: '#5B5B5B',
  inkSoft: '#8E8E8E',
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
};

export type AppColors = typeof DarkColors;

type ThemeMode = 'light' | 'dark' | 'system';

type ThemeContextType = {
  mode: ThemeMode;
  isDark: boolean;
  colors: AppColors;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextType>({
  mode: 'light',
  isDark: false,
  colors: LightColors,
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('light');

  useEffect(() => {
    AsyncStorage.getItem('siqa_theme').then(saved => {
      if (saved) setModeState(saved as ThemeMode);
    });
  }, []);

  function setMode(newMode: ThemeMode) {
    setModeState(newMode);
    AsyncStorage.setItem('siqa_theme', newMode);
  }

  const isDark =
    mode === 'dark' ? true :
    mode === 'light' ? false :
    systemScheme === 'dark';
  currentIsDark = isDark;

  const colors = isDark ? DarkColors : LightColors;

  // The root app/+html.tsx document has no way to know the in-app theme
  // choice at static-render time — it can only guess via the OS-level
  // prefers-color-scheme, which is a *different* setting from this
  // toggle and often won't match it. That mismatch left html/body a
  // fixed color regardless of what the person actually picked here, so
  // any area taller than the app's own content (or a browser overscroll
  // bounce) revealed the wrong one. Set the real DOM background directly
  // from the resolved theme instead, every time it changes.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    document.documentElement.style.backgroundColor = colors.bg;
    document.body.style.backgroundColor = colors.bg;
  }, [colors.bg]);

  return (
    <ThemeContext.Provider value={{ mode, isDark, colors, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
