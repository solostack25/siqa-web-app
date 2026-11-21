// A scannable QR code drawn with react-native-svg (web + phones), from qrcode-generator.
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const qrcode = require('qrcode-generator');

export function QRCode({ value, size = 160, color = '#0a0f1c', bg = '#ffffff', label }: {
  value: string; size?: number; color?: string; bg?: string; label?: string;
}) {
  const { path, n } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count: number = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) if (qr.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
    }
    return { path: d, n: count + 4 };
  }, [value]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} accessibilityLabel={label ?? 'QR code'}>
      <Rect x={0} y={0} width={n} height={n} fill={bg} />
      <Path d={path} fill={color} />
    </Svg>
  );
}
