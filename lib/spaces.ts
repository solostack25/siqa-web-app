// "Spaces": the things a person runs on Siqa (a store, a Studio channel, a nonprofit,
// a masjid, Siqa admin). dashboard.siqa.us shows one space at a time with a switcher.

import { Platform } from 'react-native';
import { supabase } from './supabase';

export type SpaceKind = 'store' | 'studio' | 'org' | 'masjid' | 'admin';
export type Space = { kind: SpaceKind; id: string; name: string; label: string; image: string | null; role?: string };

export const SPACE_LABEL: Record<SpaceKind, string> = { store: 'Store', studio: 'Studio', org: 'Organization', masjid: 'Masjid', admin: 'Admin' };
export const spaceKey = (s: Pick<Space, 'kind' | 'id'>) => `${s.kind}:${s.id}`;

export async function loadSpaces(): Promise<Space[] | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const uid = session.user.id;
  const [seller, speaker, orgs, masjids, profile] = await Promise.all([
    supabase.from('marketplace_sellers').select('id, shop_name, avatar_url').eq('user_id', uid).maybeSingle(),
    supabase.from('speakers').select('id, display_name, avatar_url').eq('profile_id', uid).maybeSingle(),
    supabase.from('organizations').select('id, org_name, logo_url, org_kind').eq('profile_id', uid),
    supabase.rpc('my_masjids'),
    supabase.from('profiles').select('role').eq('id', uid).maybeSingle(),
  ]);
  const isAdmin = (profile.data as any)?.role === 'admin';
  const out: Space[] = [];
  if (seller.data) out.push({ kind: 'store', id: (seller.data as any).id, name: (seller.data as any).shop_name || 'My store', label: 'Store', image: (seller.data as any).avatar_url ?? null });
  if (speaker.data) out.push({ kind: 'studio', id: (speaker.data as any).id, name: (speaker.data as any).display_name || 'My channel', label: 'Studio', image: (speaker.data as any).avatar_url ?? null });
  for (const o of ((orgs.data as any[]) || [])) {
    if (o.org_kind === 'masjid') continue;
    out.push({ kind: 'org', id: o.id, name: o.org_name, label: 'Organization', image: o.logo_url ?? null });
  }
  // Siqa admins see every masjid in my_masjids; only list the ones they actually run here.
  for (const m of ((masjids.data as any[]) || [])) {
    if (isAdmin && m.my_role === 'siqa') continue;
    out.push({ kind: 'masjid', id: m.id, name: m.org_name, label: 'Masjid', image: m.logo_url ?? null, role: m.my_role });
  }
  if (isAdmin) out.push({ kind: 'admin', id: 'siqa', name: 'Siqa admin', label: 'Admin', image: null });
  return out;
}

const LAST = 'siqa_dashboard_space';
export function lastSpace(): string | null {
  try { return Platform.OS === 'web' ? localStorage.getItem(LAST) : null; } catch { return null; }
}
export function rememberSpace(key: string) {
  try { if (Platform.OS === 'web') localStorage.setItem(LAST, key); } catch {}
}

export function initials(name: string) {
  const words = name.split(/\s+/).map((w) => w.replace(/^(al|an|as|ar|at|ad|ash|az)-/i, '').replace(/[^A-Za-z0-9]/g, '')).filter((w) => w && !/^(masjid|the|of|islamic|center|inc|usa)$/i.test(w));
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase() || name.slice(0, 1).toUpperCase();
}
