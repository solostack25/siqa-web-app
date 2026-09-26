import { Ionicons } from '@expo/vector-icons';

// Central icon component. The app's bottom-nav icons (Home/Discover/
// Seeds/Orgs in Siqa.tsx) were already clean hand-drawn SVGs — it was
// specifically the raw emoji used everywhere else (⚙️🚪🎬💚🔔🏢🛡️ etc.)
// that read as inconsistent/dated across platforms. This swaps those
// for Ionicons' outline set, which matches the nav bar's line-icon
// style and renders identically everywhere instead of depending on the
// OS/browser's emoji font.
export type SiqaIconName = keyof typeof Ionicons.glyphMap;

export function Icon({
  name,
  size = 18,
  color = '#000',
}: {
  name: SiqaIconName;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}
