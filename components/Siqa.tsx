import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '../lib/theme';

type IconProps = { size?: number; color?: string };

export function SiqaSeal({ size = 14, bgOverride }: { size?: number; bgOverride?: string }) {
  const { colors: C } = useTheme();
  return (
    <View style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: bgOverride ?? C.bg,
      borderWidth: 1.25,
      borderColor: C.gold,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <Text style={{
        fontSize: size * 0.62,
        color: C.gold,
        lineHeight: size * 0.8,
        textAlign: 'center',
        fontWeight: '700',
      }}>ص</Text>
    </View>
  );
}

export function SiqaAvatar({ initials, size = 44, fgOverride }: { initials: string; size?: number; fgOverride?: string }) {
  const { colors: C } = useTheme();
  return (
    <View style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: C.emeraldSoft,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <Text style={{
        fontSize: size * 0.42,
        color: fgOverride ?? C.gold,
        letterSpacing: -0.5,
        fontWeight: '600',
      }}>{initials}</Text>
    </View>
  );
}

export function SiqaEyebrow({ children, accent }: { children: React.ReactNode; accent?: string }) {
  const { colors: C } = useTheme();
  return (
    <Text style={{
      fontSize: 10,
      color: accent ?? C.gold,
      letterSpacing: 2,
      textTransform: 'uppercase',
      fontWeight: '700',
    }}>{children}</Text>
  );
}

export function SiqaWordmark({ size = 26 }: { size?: number }) {
  const { colors: C } = useTheme();
  return (
    <View>
      <Text style={{ fontSize: size, color: C.gold, lineHeight: size * 1.1, fontWeight: '700' }}>صِقا</Text>
      <Text style={{ fontSize: size * 0.32, color: C.inkSoft, letterSpacing: size * 0.18, marginTop: -size * 0.1 }}>SIQA</Text>
    </View>
  );
}

export function HomeIcon({ size = 22, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none">
      <Path d="M3 10l8-6 8 6v8a2 2 0 01-2 2h-3v-5h-6v5H5a2 2 0 01-2-2v-8z" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </Svg>
  );
}

export function DiscoverIcon({ size = 22, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none">
      <Circle cx="10" cy="10" r="6.5" stroke={color} strokeWidth={1.5} />
      <Path d="M15 15l4 4" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

export function SeedsIcon({ size = 22, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none">
      <Path d="M11 19c0-5 0-8 4-10M11 19c0-5 0-8-4-10M11 19v-7M11 12c-3 0-5-2-5-5 0 0 5 0 5 5zM11 12c3 0 5-2 5-5 0 0-5 0-5 5z" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function OrgsIcon({ size = 22, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none">
      <Path d="M4 19V7l4-3 4 3v12M12 19V11l4-2 2 1.5V19M4 19h16" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <Path d="M7 11h2M7 14h2" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

export function PlayIcon({ size = 14, color = '#1A1612' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14" fill={color}>
      <Path d="M3 2l9 5-9 5V2z" />
    </Svg>
  );
}
