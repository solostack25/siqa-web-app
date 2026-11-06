import { ActivityIndicator, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type SiqaIconName } from '../Icon';
import { radius, size as SIZE, type, useDS } from '../../lib/ds';

export type ButtonVariant = 'primary' | 'secondary' | 'gold' | 'soft' | 'danger' | 'ghost' | 'light';
export type ButtonSize = 'lg' | 'md' | 'sm';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: SiqaIconName;
  iconRight?: SiqaIconName;
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to fill the row (flex: 1). */
  grow?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/**
 * The one button. Primary is near-black (white in Night) and appears once
 * per screen; gold is for giving and following; secondary/soft for
 * everything else. Large buttons are rounded rectangles, medium and small
 * are pills.
 */
export function Button({
  label, onPress, variant = 'primary', size = 'lg', icon, iconRight,
  loading, disabled, grow, style, accessibilityLabel,
}: Props) {
  const { c, shadow } = useDS();
  const off = disabled || loading;

  const look: Record<ButtonVariant, { bg: string; fg: string; border?: string; sh?: Parameters<typeof shadow>[0] }> = {
    primary: { bg: c.primary, fg: c.onPrimary, sh: 'primary' },
    gold: { bg: c.gold, fg: c.onGold, sh: 'gold' },
    secondary: { bg: c.surface, fg: c.ink, border: c.line, sh: 'hairline' },
    soft: { bg: c.surfaceSoft, fg: c.ink },
    danger: { bg: c.dangerTint, fg: c.danger },
    ghost: { bg: 'transparent', fg: c.ink },
    light: { bg: 'rgba(255,255,255,0.92)', fg: '#111111', sh: 'hairline' },
  };
  const l = look[variant];
  const bg = disabled && (variant === 'primary' || variant === 'gold') ? c.surfaceStrong : l.bg;
  const fg = disabled && (variant === 'primary' || variant === 'gold') ? c.ink3 : l.fg;

  const h = size === 'lg' ? SIZE.controlLg : size === 'md' ? SIZE.controlMd : SIZE.controlSm;
  const text = size === 'lg' ? type.buttonLg : size === 'md' ? type.buttonMd : type.buttonSm;
  const iconSize = size === 'sm' ? 15 : 18;

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      hitSlop={size === 'sm' ? 5 : 0}
      style={({ pressed }) => [
        {
          // minHeight, not height: when the OS/browser scales text up
          // (Android font size), the button grows instead of clipping.
          minHeight: h,
          paddingVertical: 4,
          paddingHorizontal: size === 'lg' ? 20 : size === 'md' ? 18 : 14,
          borderRadius: size === 'lg' ? radius.lg : radius.pill,
          backgroundColor: bg,
          borderWidth: l.border ? 1 : 0,
          borderColor: l.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          transform: [{ scale: pressed && !off ? 0.97 : 1 }],
          opacity: pressed && !off ? 0.92 : 1,
        },
        grow && { flex: 1 },
        l.sh && !disabled ? shadow(l.sh) : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={iconSize} color={fg} /> : null}
          <Text style={[text, { color: fg, flexShrink: 1 }]} numberOfLines={1}>{label}</Text>
          {iconRight ? <Icon name={iconRight} size={iconSize} color={fg} /> : null}
        </>
      )}
    </Pressable>
  );
}

type IconButtonProps = {
  icon: SiqaIconName;
  onPress?: () => void;
  label: string;
  /** plain: no fill. soft: surface-soft circle. raised: white with a shadow. scrim: dark glass over photos. */
  variant?: 'plain' | 'soft' | 'raised' | 'scrim';
  size?: 'md' | 'sm';
  color?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Round icon-only button. Always 44px to touch, even when it draws smaller. */
export function IconButton({ icon, onPress, label, variant = 'plain', size = 'md', color, disabled, style }: IconButtonProps) {
  const { c, shadow } = useDS();
  const d = size === 'md' ? 44 : 34;
  const bg = variant === 'soft' ? c.surfaceSoft : variant === 'raised' ? c.surface : variant === 'scrim' ? c.scrim : 'transparent';
  const fg = color ?? (variant === 'scrim' ? '#ffffff' : c.ink);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={size === 'sm' ? 5 : 0}
      style={({ pressed }) => [
        { width: d, height: d, borderRadius: radius.pill, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        variant === 'raised' ? shadow('card') : null,
        style,
      ]}
    >
      <Icon name={icon} size={size === 'md' ? 22 : 17} color={fg} />
    </Pressable>
  );
}

/** Two buttons side by side at the bottom of a screen: secondary 1 : primary 1.6. */
export function ButtonPair({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 10 }}>{children}</View>;
}
