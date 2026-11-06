import { forwardRef, useState } from 'react';
import { Pressable, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { Icon, type SiqaIconName } from '../Icon';
import { font, radius, size as SIZE, type, useDS } from '../../lib/ds';

// ── List row ───────────────────────────────────────────────────────────
/** Settings-style row: icon, label (+ sub line), value, chevron or a control on the right. */
export function ListRow({ icon, label, sub, value, onPress, right, last, danger, iconTone, disabled, style }: {
  icon?: SiqaIconName;
  label: string;
  sub?: string;
  value?: string;
  onPress?: () => void;
  /** A control in place of value + chevron (Switch, Stepper…). */
  right?: React.ReactNode;
  /** No divider under the last row. */
  last?: boolean;
  danger?: boolean;
  iconTone?: 'ink' | 'seed' | 'gold';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useDS();
  const ink = danger ? c.danger : c.ink;
  const iconColor = iconTone === 'seed' ? c.seed : iconTone === 'gold' ? c.gold : ink;
  const body = (
    <>
      {icon ? (
        <View style={{ width: 24, alignItems: 'center' }} importantForAccessibility="no">
          <Icon name={icon} size={22} color={iconColor} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, font(500), { color: ink }]} numberOfLines={1}>{label}</Text>
        {sub ? <Text style={[type.caption, font(400), { color: c.ink2 }]}>{sub}</Text> : null}
      </View>
      {right ?? (
        <>
          {value ? <Text style={[type.callout, { color: c.ink2, maxWidth: 170 }]} numberOfLines={1}>{value}</Text> : null}
          {onPress ? <Icon name="chevron-forward" size={17} color={c.ink3} /> : null}
        </>
      )}
    </>
  );
  const rowStyle: StyleProp<ViewStyle> = [
    { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: sub ? 66 : SIZE.row, paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line },
    style,
  ];
  if (!onPress) return <View style={rowStyle}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      style={({ pressed }) => [rowStyle, { opacity: disabled ? 0.5 : pressed ? 0.6 : 1 }]}
    >
      {body}
    </Pressable>
  );
}

/** Small grey label above a group of rows or a field. */
export function SectionLabel({ children, style }: { children: string; style?: StyleProp<ViewStyle> }) {
  const { c } = useDS();
  return (
    <View style={style}>
      <Text style={[type.caption, font(600), { color: c.ink2 }]} accessibilityRole="header">{children}</Text>
    </View>
  );
}

// ── Text field ─────────────────────────────────────────────────────────
type FieldProps = TextInputProps & {
  label?: string;
  help?: string;
  error?: string | null;
  /** boxed: filled field with a label. bare: no box, for big title inputs on create screens. */
  variant?: 'boxed' | 'bare';
  /** Text size for bare fields. */
  textStyle?: 'title2' | 'body' | 'callout' | 'story';
  containerStyle?: StyleProp<ViewStyle>;
};

export const TextField = forwardRef<TextInput, FieldProps>(function TextField(
  { label, help, error, variant = 'boxed', textStyle = 'body', containerStyle, style, multiline, onFocus, onBlur, ...rest },
  ref,
) {
  const { c } = useDS();
  const [focused, setFocused] = useState(false);
  const ts = textStyle === 'title2' ? type.title2
    : textStyle === 'callout' ? type.callout
    : textStyle === 'story' ? { ...type.body, fontSize: 17, lineHeight: 26 }
    : type.body;
  const boxed = variant === 'boxed';
  return (
    <View style={[{ gap: 6 }, containerStyle]}>
      {label && boxed ? <Text style={[type.caption, font(600), { color: c.ink2 }]}>{label}</Text> : null}
      <TextInput
        ref={ref}
        accessibilityLabel={label ?? rest.placeholder}
        placeholderTextColor={c.ink3}
        multiline={multiline}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        style={[
          ts,
          { color: c.ink, outlineStyle: 'none' } as any,
          boxed && {
            minHeight: SIZE.controlMd + 4, paddingHorizontal: 14, paddingVertical: 12,
            borderRadius: radius.md, backgroundColor: c.surfaceSoft,
            borderWidth: 1.5, borderColor: error ? c.danger : focused ? c.lineControl : 'transparent',
          },
          !boxed && { paddingHorizontal: 0, paddingVertical: 4 },
          multiline && { textAlignVertical: 'top' },
          style,
        ]}
        {...rest}
      />
      {error ? <Text style={[type.caption, { color: c.danger }]}>{error}</Text>
        : help ? <Text style={[type.caption, font(400), { color: c.ink2 }]}>{help}</Text> : null}
    </View>
  );
});
