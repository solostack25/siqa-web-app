import { Ionicons } from '@expo/vector-icons';
import type { StyleProp, TextStyle } from 'react-native';
import { useTheme } from '../lib/theme';

/**
 * Drop-in replacement for emoji used as icons.
 *
 *   <Text style={styles.emptyEmoji}>🛍️</Text>
 *   → <Glyph name="bag-handle-outline" style={styles.emptyEmoji} />
 *
 * It renders an Ionicons glyph (a Text under the hood), so it:
 *  - takes its size/color/margins/opacity from the same `style` the emoji had
 *    (style.fontSize wins over `size`, style.color wins over `color`),
 *  - can be nested inside another <Text> for inline labels:
 *      <Text style={s.btn}><Glyph name="leaf-outline" style={s.btn} /> Plant a Seed</Text>
 *
 * Emoji render differently on every OS/browser and read as dated; Ionicons'
 * outline set matches the nav icons and looks the same everywhere.
 */
export type GlyphName = keyof typeof Ionicons.glyphMap;

export function Glyph({
  name,
  style,
  size = 18,
  color,
}: {
  name: GlyphName;
  style?: StyleProp<TextStyle>;
  size?: number;
  color?: string;
}) {
  const { colors: C } = useTheme();
  return <Ionicons name={name} size={size} color={color ?? C.text3} style={style as any} />;
}
