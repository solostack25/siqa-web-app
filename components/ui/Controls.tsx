import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type SiqaIconName } from '../Icon';
import { font, radius, size as SIZE, type, useDS } from '../../lib/ds';

// ── Chip ───────────────────────────────────────────────────────────────
/** Small pill for picking topics, categories and quick values. */
export function Chip({ label, selected, onPress, icon, disabled, style }: {
  label: string; selected?: boolean; onPress?: () => void; icon?: SiqaIconName; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { c, shadow } = useDS();
  const fg = selected ? c.onPrimary : c.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={5}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={({ pressed }) => [
        {
          height: SIZE.controlSm, paddingHorizontal: 13, borderRadius: radius.pill,
          flexDirection: 'row', alignItems: 'center', gap: 6,
          backgroundColor: selected ? c.primary : c.surface,
          borderWidth: 1, borderColor: selected ? c.primary : c.line,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
        selected ? null : shadow('hairline'),
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={14} color={fg} /> : null}
      <Text style={[type.buttonSm, { color: fg }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

// ── Switch ─────────────────────────────────────────────────────────────
/** iOS-style switch. Gold when on (seed green with tone="seed"). */
export function Switch({ value, onValueChange, disabled, label, tone = 'gold' }: {
  value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean; label: string; tone?: 'gold' | 'seed';
}) {
  const { c } = useDS();
  const x = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(x, { toValue: value ? 1 : 0, duration: 160, useNativeDriver: false }).start();
  }, [value]);
  const on = tone === 'seed' ? c.seed : c.gold;
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      hitSlop={8}
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <Animated.View
        style={{
          width: 51, height: 31, borderRadius: radius.pill, padding: 2,
          backgroundColor: x.interpolate({ inputRange: [0, 1], outputRange: [c.surfaceStrong, on] }),
          boxShadow: 'inset 0px 1px 2px rgba(0,0,0,0.12)',
        } as any}
      >
        <Animated.View
          style={{
            width: 27, height: 27, borderRadius: radius.pill, backgroundColor: '#ffffff',
            boxShadow: '0px 2px 4px rgba(0,0,0,0.2)',
            transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) }],
          } as any}
        />
      </Animated.View>
    </Pressable>
  );
}

// ── Segmented control ──────────────────────────────────────────────────
export function SegmentedControl<T extends string>({ options, value, onChange, label, style }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; style?: StyleProp<ViewStyle>;
}) {
  const { c, shadow } = useDS();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[{ flexDirection: 'row', backgroundColor: c.surfaceSoft, borderRadius: radius.md, padding: 3 }, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            style={[
              { flexGrow: 1, height: SIZE.controlSm, paddingHorizontal: 12, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.surface : 'transparent' },
              on ? shadow('hairline') : null,
            ]}
          >
            <Text style={[type.buttonSm, font(on ? 700 : 600), { color: on ? c.ink : c.ink2 }]} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Stepper ────────────────────────────────────────────────────────────
/** − n + counter for quantities. */
export function Stepper({ value, onChange, min = 0, max = 9999, label }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; label: string;
}) {
  const { c, shadow } = useDS();
  const btn = (sign: -1 | 1) => {
    const next = value + sign;
    const off = next < min || next > max;
    return (
      <Pressable
        onPress={() => !off && onChange(next)}
        disabled={off}
        hitSlop={5}
        accessibilityRole="button"
        accessibilityLabel={`${sign < 0 ? 'Fewer' : 'More'} ${label}`}
        style={{ width: SIZE.controlSm, height: SIZE.controlSm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', opacity: off ? 0.3 : 1 }}
      >
        <Icon name={sign < 0 ? 'remove' : 'add'} size={18} color={c.ink} />
      </Pressable>
    );
  };
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 2, borderWidth: 1, borderColor: c.line, borderRadius: radius.pill, padding: 2, backgroundColor: c.surface }, shadow('hairline')]}>
      {btn(-1)}
      <TextInput
        value={String(value)}
        onChangeText={(v) => {
          const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
          onChange(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);
        }}
        keyboardType="number-pad"
        selectTextOnFocus
        accessibilityLabel={label}
        style={[type.headline, { width: 44, textAlign: 'center', color: c.ink, fontSize: 15, padding: 0, outlineStyle: 'none' } as any]}
      />
      {btn(1)}
    </View>
  );
}
