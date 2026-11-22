// Small building blocks shared by the masjid console's sections.
import { View, Text, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { font, radius, space, type, useDS } from '../../../lib/ds';
import { Icon, type SiqaIconName } from '../../Icon';

export type MasjidRef = { id: string; org_name: string; city: string | null; state: string | null; logo_url: string | null; my_role: string };
export type SectionKey = 'overview' | 'prayer' | 'schedule' | 'announcements' | 'seeds' | 'events' | 'screens' | 'team';
export const SECTIONS: { key: SectionKey; label: string; icon: SiqaIconName }[] = [
  { key: 'overview', label: 'Overview', icon: 'home-outline' },
  { key: 'prayer', label: 'Prayer times', icon: 'time-outline' },
  { key: 'schedule', label: 'Schedule', icon: 'calendar-outline' },
  { key: 'announcements', label: 'Announcements', icon: 'megaphone-outline' },
  { key: 'seeds', label: 'Seeds', icon: 'leaf-outline' },
  { key: 'events', label: 'Events', icon: 'sparkles-outline' },
  { key: 'screens', label: 'Screens', icon: 'tv-outline' },
  { key: 'team', label: 'Team', icon: 'people-outline' },
];
export type SectionProps = { masjid: MasjidRef; go: (s: SectionKey) => void; wide: boolean };

export function Card({ children, style, pad = space[5] }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; pad?: number }) {
  const { c, shadow } = useDS();
  return <View style={[{ backgroundColor: c.surface, borderRadius: radius.xl, padding: pad, gap: space[3] }, shadow('card'), style]}>{children}</View>;
}

export function CardTitle({ children, action, onAction }: { children: string; action?: string; onAction?: () => void }) {
  const { c } = useDS();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
      <Text style={[type.headline, { color: c.ink }]} accessibilityRole="header">{children}</Text>
      {action ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <Text style={[type.subhead, font(600), { color: c.ink, textDecorationLine: 'underline' }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  const { c } = useDS();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[3], flexWrap: 'wrap' }}>
      <View style={{ flex: 1, minWidth: 220, gap: 4 }}>
        <Text style={[type.display, { color: c.ink }]} accessibilityRole="header">{title}</Text>
        {sub ? <Text style={[type.callout, { color: c.ink2 }]}>{sub}</Text> : null}
      </View>
      {right ? <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>{right}</View> : null}
    </View>
  );
}

export function Tag({ label, tone = 'soft' }: { label: string; tone?: 'soft' | 'gold' | 'seed' | 'danger' | 'dark' }) {
  const { c } = useDS();
  const map = {
    soft: [c.surfaceSoft, c.ink2], gold: [c.goldTint, c.goldInk], seed: [c.seedTint, c.seed],
    danger: [c.dangerTint, c.danger], dark: [c.primary, c.onPrimary],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: bg, alignSelf: 'flex-start' }}>
      <Text style={[type.micro, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function Empty({ icon, title, sub, children }: { icon: SiqaIconName; title: string; sub?: string; children?: React.ReactNode }) {
  const { c } = useDS();
  return (
    <View style={{ alignItems: 'center', gap: space[2], paddingVertical: space[8], paddingHorizontal: space[5], borderRadius: radius.xl, backgroundColor: c.bgSunk }}>
      <Icon name={icon} size={28} color={c.ink3} />
      <Text style={[type.headline, { color: c.ink, textAlign: 'center' }]}>{title}</Text>
      {sub ? <Text style={[type.callout, { color: c.ink2, textAlign: 'center', maxWidth: 420 }]}>{sub}</Text> : null}
      {children}
    </View>
  );
}

export function Dot({ color }: { color: string }) {
  return <View style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: color }} />;
}

/** Simple label + value row used in summaries. */
export function KV({ k, v, last }: { k: string; v: React.ReactNode; last?: boolean }) {
  const { c } = useDS();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <Text style={[type.callout, { color: c.ink2, width: 120 }]}>{k}</Text>
      <View style={{ flex: 1 }}>{typeof v === 'string' ? <Text style={[type.body, font(500), { color: c.ink }]}>{v}</Text> : v}</View>
    </View>
  );
}

/** Pill choice row (radio-like). */
export function Choice<T extends string | number>({ options, value, onChange, label }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string;
}) {
  const { c } = useDS();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            style={({ pressed }) => ({
              height: 36, paddingHorizontal: 14, borderRadius: radius.pill, justifyContent: 'center',
              backgroundColor: on ? c.primary : c.surfaceSoft, opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={[type.buttonSm, { color: on ? c.onPrimary : c.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Seven day toggles, Sunday first. */
export function DayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const { c } = useDS();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }} accessibilityLabel="Repeats on">
      {days.map((d, i) => {
        const on = value.includes(i);
        return (
          <Pressable
            key={d}
            onPress={() => onChange(on ? value.filter((x) => x !== i) : [...value, i].sort())}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={d}
            style={{ width: 46, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.primary : c.surfaceSoft }}
          >
            <Text style={[type.buttonSm, { color: on ? c.onPrimary : c.ink }]}>{d}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const ago = (iso: string | null | undefined) => {
  if (!iso) return 'never';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
export const screenOnline = (lastSeen: string | null | undefined) => !!lastSeen && Date.now() - new Date(lastSeen).getTime() < 3 * 60 * 1000;

/** "HH:MM" validation and normalizing ("1:30 pm" → "13:30"). */
export function parseClock(input: string): string | null {
  const t = input.trim().toLowerCase().replace(/\s+/g, '');
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mi = m[2] ? parseInt(m[2], 10) : 0;
  if (mi > 59) return null;
  if (m[3]) { if (h < 1 || h > 12) return null; if (m[3] === 'pm' && h !== 12) h += 12; if (m[3] === 'am' && h === 12) h = 0; }
  if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}
