// Siqa Admin console: page frame and small pieces shared by Overview, Review queue and Organizations.
import { View, Text, ScrollView, Pressable } from 'react-native';
import { font, radius, space, type, useDS } from '../../../lib/ds';
import { Icon, type SiqaIconName } from '../../Icon';

/** A full-width admin page: white header bar, then content on the sunk background. */
export function AdminPage({ title, sub, right, wide, children }: { title: string; sub?: string; right?: React.ReactNode; wide: boolean; children: React.ReactNode }) {
  const { c } = useDS();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bgSunk }} contentContainerStyle={{ paddingBottom: 60 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4], flexWrap: 'wrap', paddingHorizontal: wide ? 32 : space[5], paddingVertical: wide ? 22 : space[4], backgroundColor: c.bg, borderBottomWidth: 1, borderBottomColor: c.line }}>
        <View style={{ flex: 1, minWidth: 240, gap: 2 }}>
          <Text style={[{ fontSize: wide ? 26 : 22, lineHeight: wide ? 32 : 28, letterSpacing: -0.5 }, font(800, 'display'), { color: c.ink }]} accessibilityRole="header">{title}</Text>
          {sub ? <Text style={[type.subhead, font(400), { color: c.ink2 }]}>{sub}</Text> : null}
        </View>
        {right ? <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>{right}</View> : null}
      </View>
      <View style={{ paddingHorizontal: wide ? 32 : space[4], paddingTop: wide ? 28 : space[4], gap: wide ? 24 : space[4], maxWidth: 1400, width: '100%' }}>{children}</View>
    </ScrollView>
  );
}

/** White panel with a hairline border; optional title row. */
export function Panel({ title, action, onAction, children, style, flush }: {
  title?: string; action?: string; onAction?: () => void; children: React.ReactNode; style?: any; flush?: boolean;
}) {
  const { c } = useDS();
  return (
    <View style={[{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.xl, overflow: 'hidden' }, style]}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: 20, paddingVertical: 16 }}>
          <Text style={[{ fontSize: 18, lineHeight: 24 }, font(700, 'display'), { color: c.ink, flex: 1 }]} accessibilityRole="header">{title}</Text>
          {action ? <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}><Text style={[type.caption, font(600), { color: c.ink, textDecorationLine: 'underline' }]}>{action}</Text></Pressable> : null}
        </View>
      ) : null}
      <View style={flush ? null : { paddingHorizontal: 20, paddingBottom: 16 }}>{children}</View>
    </View>
  );
}

export function Kpi({ label, value, sub, icon, gold }: { label: string; value: string; sub?: string; icon: SiqaIconName; gold?: boolean }) {
  const { c } = useDS();
  return (
    <View style={{ flexGrow: 1, flexBasis: 180, minWidth: 160, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.lg, padding: 18, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[type.caption, font(600), { color: c.ink2 }]}>{label}</Text>
        <View style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: gold ? c.goldTint : c.surfaceSoft }}>
          <Icon name={icon} size={16} color={gold ? c.goldInk : c.ink} />
        </View>
      </View>
      <Text style={[{ fontSize: 30, lineHeight: 34, letterSpacing: -0.8 }, font(800, 'display'), { color: c.ink }]}>{value}</Text>
      {sub ? <Text style={[type.caption, font(400), { color: c.ink2 }]}>{sub}</Text> : null}
    </View>
  );
}

export function Pill({ label, tone = 'soft', dot }: { label: string; tone?: 'soft' | 'gold' | 'seed' | 'danger' | 'dark'; dot?: boolean }) {
  const { c } = useDS();
  const [bg, fg] = { soft: [c.surfaceSoft, c.ink2], gold: [c.goldTint, c.goldInk], seed: [c.seedTint, c.seed], danger: [c.dangerTint, c.danger], dark: [c.primary, c.onPrimary] }[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 24, paddingHorizontal: 10, borderRadius: 999, backgroundColor: bg, alignSelf: 'flex-start' }}>
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} /> : null}
      <Text style={[type.micro, { color: fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** Pill-shaped filter tab with a count. */
export function FilterTab({ label, count, on, onPress }: { label: string; count?: number; on: boolean; onPress: () => void }) {
  const { c } = useDS();
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: on }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, paddingHorizontal: 14, borderRadius: 999,
        backgroundColor: on ? c.primary : c.surface, borderWidth: on ? 0 : 1, borderColor: c.line, opacity: pressed ? 0.85 : 1 })}>
      <Text style={[type.buttonSm, { color: on ? c.onPrimary : c.ink }]}>{label}</Text>
      {count != null ? (
        <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? 'rgba(255,255,255,0.18)' : c.surfaceSoft }}>
          <Text style={[{ fontSize: 11, lineHeight: 14 }, font(700), { color: on ? c.onPrimary : c.ink2 }]}>{count > 999 ? '999+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export const since = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  if (s < 86400 * 60) return `${Math.round(s / 86400)} d`;
  return `${Math.round(s / (86400 * 30))} mo`;
};
