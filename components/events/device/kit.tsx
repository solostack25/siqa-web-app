// Shared look for event devices: night colors and big, easy-to-hit buttons.
import { Pressable, Text, View, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { font } from '../../../lib/ds';

export const N = {
  bg: '#0a0f1c', panel: '#141c30', panel2: '#1b2438', line: '#222b40',
  ink: '#edf1f7', ink2: '#9facc4', ink3: '#7e89a3',
  gold: '#d4ac73', goldInk: '#e6c290', seed: '#3fa070', danger: '#f08b74',
};

export function DarkButton({ label, onPress, tone = 'plain', grow, disabled, big, icon }: {
  label: string; onPress?: () => any; tone?: 'plain' | 'gold' | 'seed' | 'danger' | 'light'; grow?: boolean; disabled?: boolean; big?: boolean; icon?: string;
}) {
  const [busy, setBusy] = useState(false);
  const bg = { plain: N.panel2, gold: N.gold, seed: N.seed, danger: N.danger, light: '#edf1f7' }[tone];
  const fg = tone === 'plain' ? N.ink : '#0a0f1c';
  return (
    <Pressable
      onPress={async () => { if (busy || disabled) return; setBusy(true); try { await onPress?.(); } finally { setBusy(false); } }}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy }}
      style={({ pressed }) => ({
        flexGrow: grow ? 1 : 0, minHeight: big ? 76 : 52, paddingHorizontal: big ? 26 : 18, borderRadius: big ? 22 : 16,
        alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
        backgroundColor: bg, opacity: disabled ? 0.35 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[font(800), { fontSize: big ? 22 : 16, color: fg }]} numberOfLines={1}>{icon ? `${icon}  ` : ''}{label}</Text>}
    </Pressable>
  );
}

export function DarkChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ paddingHorizontal: 16, height: 44, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? N.gold : N.panel2 }}>
      <Text style={[font(700), { fontSize: 15, color: on ? '#0a0f1c' : N.ink }]}>{label}</Text>
    </Pressable>
  );
}

export function DeviceTop({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: N.line }}>
      <View style={{ flex: 1 }}>
        <Text style={[font(800, 'display'), { fontSize: 20, color: N.ink }]} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={[font(500), { fontSize: 14, color: N.ink2 }]} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Panel({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[{ backgroundColor: N.panel, borderRadius: 20, padding: 18, gap: 12 }, style]}>{children}</View>;
}

export const H = ({ children }: { children: string }) => (
  <Text style={[font(700), { fontSize: 13, letterSpacing: 0.8, color: N.ink2 }]}>{children.toUpperCase()}</Text>
);
