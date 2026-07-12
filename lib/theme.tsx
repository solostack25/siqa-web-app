export let currentIsDark = true;

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
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
  bg: '#F5F3EE',
  bg2: '#EDEAE3',
  bg3: '#E8E4DC',
  surface: '#FFFFFF',
  surface2: '#F0EDE6',
  surface3: '#E8E4DC',
  border: 'rgba(139,107,40,0.2)',
  border2: 'rgba(139,107,40,0.1)',
  borderSoft: 'rgba(139,107,40,0.08)',
  text: '#1A1712',
  text2: '#5C5240',
  text3: '#9C8E78',
  ink: '#1A1712',
  inkMuted: '#5C5240',
  inkSoft: '#9C8E78',
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
  mode: 'dark',
  isDark: true,
  colors: DarkColors,
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('dark');

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

  return (
    <ThemeContext.Provider value={{ mode, isDark, colors, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
