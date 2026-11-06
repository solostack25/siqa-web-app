import { Platform } from 'react-native';

type Place = {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

function usesAppleMaps(): boolean {
  if (Platform.OS === 'ios') return true;
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent || '');
}

/**
 * A link that opens the phone's maps app with driving directions to the
 * place already set: Apple Maps on iPhone/iPad/Mac, Google Maps everywhere
 * else (the Google link opens the Maps app on Android).
 * Null when there's no street address — a city alone would send people to
 * the middle of town.
 */
export function directionsUrl(p: Place): string | null {
  const street = p.address?.trim();
  if (!street) return null;
  const region = [p.state?.trim(), p.zip?.trim()].filter(Boolean).join(' ');
  const where = [street, p.city?.trim(), region].filter(Boolean).join(', ');

  if (usesAppleMaps()) {
    return `https://maps.apple.com/?daddr=${encodeURIComponent(where)}&dirflg=d`;
  }
  // Including the business name lets Google match the actual place.
  const dest = [p.name?.trim(), where].filter(Boolean).join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
}
