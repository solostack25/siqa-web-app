// Form pieces for the events dashboard: date/time, money, toggles, and a progress bar.
import { createElement } from 'react';
import { View, Text, Platform } from 'react-native';
import { font, radius, size as SIZE, space, type, useDS } from '../../lib/ds';
import { Switch, TextField } from '../ui';

/** ISO ⇄ the value an <input type="datetime-local"> wants (local time, no zone). */
const toLocal = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function DateTimeField({ label, value, onChange, help }: { label: string; value: string | null; onChange: (iso: string | null) => void; help?: string }) {
  const { c } = useDS();
  if (Platform.OS !== 'web') {
    return <TextField label={label} value={value ? toLocal(value).replace('T', ' ') : ''} placeholder="2026-12-20 18:30" help={help}
      onChangeText={(v) => { const d = new Date(v.replace(' ', 'T')); onChange(v.trim() && !isNaN(d.getTime()) ? d.toISOString() : null); }} />;
  }
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.caption, font(600), { color: c.ink2 }]}>{label}</Text>
      {createElement('input', {
        type: 'datetime-local',
        value: toLocal(value),
        'aria-label': label,
        onChange: (e: any) => { const v = e.target.value; onChange(v ? new Date(v).toISOString() : null); },
        style: {
          height: SIZE.controlMd + 4, padding: '0 14px', borderRadius: radius.md, border: '1.5px solid transparent',
          background: c.surfaceSoft, color: c.ink, fontSize: 16, fontFamily: 'inherit', colorScheme: 'light dark', outline: 'none',
        },
      })}
      {help ? <Text style={[type.caption, font(400), { color: c.ink2 }]}>{help}</Text> : null}
    </View>
  );
}

export function MoneyField({ label, cents, onChange, help, placeholder = '0', containerStyle }: {
  label: string; cents: number | null; onChange: (c: number | null) => void; help?: string; placeholder?: string; containerStyle?: any;
}) {
  return (
    <TextField label={label} help={help} placeholder={`$${placeholder}`} keyboardType="decimal-pad" containerStyle={containerStyle}
      defaultValue={cents ? String(cents / 100) : ''}
      onChangeText={(v) => {
        const n = parseFloat(v.replace(/[$,\s]/g, ''));
        onChange(v.trim() === '' ? null : Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : cents);
      }} />
  );
}

export function ToggleRow({ label, sub, value, onChange, last }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  const { c } = useDS();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, font(600), { color: c.ink }]}>{label}</Text>
        {sub ? <Text style={[type.caption, font(400), { color: c.ink2 }]}>{sub}</Text> : null}
      </View>
      <Switch label={label} value={value} onValueChange={onChange} />
    </View>
  );
}

export function Progress({ value, max, tone = 'gold', height = 10, track }: { value: number; max: number; tone?: 'gold' | 'seed'; height?: number; track?: string }) {
  const { c } = useDS();
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <View style={{ height, borderRadius: 999, backgroundColor: track ?? c.surfaceStrong, overflow: 'hidden' }} accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}>
      <View style={{ width: `${pct}%`, height: '100%', borderRadius: 999, backgroundColor: tone === 'gold' ? c.gold : c.seed }} />
    </View>
  );
}

/** Big number + label used in summary tiles. */
export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const { c } = useDS();
  return (
    <View style={{ flex: 1, minWidth: 140, gap: 2, padding: space[4], borderRadius: radius.lg, backgroundColor: c.surfaceSoft }}>
      <Text style={[type.micro, { color: c.ink2, textTransform: 'uppercase', letterSpacing: 0.6 }]}>{label}</Text>
      <Text style={[type.title2, { color: c.ink }]}>{value}</Text>
      {sub ? <Text style={[type.caption, font(400), { color: c.ink2 }]}>{sub}</Text> : null}
    </View>
  );
}
