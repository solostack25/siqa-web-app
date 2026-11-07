// Shared pieces for the combined Seeds | Organizations tab.

import { useEffect, useState } from 'react';
import { View, Text, Pressable, Image, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { SegmentedControl, Button } from './ui';
import { Icon } from './Icon';
import { font, radius, space, type, useDS } from '../lib/ds';
import { guardTabSwipe } from './useTabSwipe';

/** The Seeds | Organizations switch at the top of both screens. */
export function SeedsOrgsSwitch({ value, style }: { value: 'seeds' | 'orgs'; style?: any }) {
  return (
    <SegmentedControl
      label="Seeds or Organizations"
      value={value}
      style={[{ maxWidth: 420, width: '100%' }, style]}
      onChange={(v) => { if (v !== value) router.replace((v === 'seeds' ? '/seeds' : '/orgs') as any); }}
      options={[{ value: 'seeds', label: 'Seeds' }, { value: 'orgs', label: 'Organizations' }]}
    />
  );
}

/** Follow an organization's account. Uses the profile→profile follows table. */
export function FollowOrgButton({ profileId, compact }: { profileId: string | null | undefined; compact?: boolean }) {
  const { c } = useDS();
  const [me, setMe] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      if (!live) return;
      setMe(uid);
      if (uid && profileId) {
        const { data } = await supabase.from('follows').select('follower_id').eq('follower_id', uid).eq('following_id', profileId).maybeSingle();
        if (live) setFollowing(!!data);
      }
    })();
    return () => { live = false; };
  }, [profileId]);
  if (!profileId || profileId === me) return null;
  async function toggle() {
    if (!me) { router.push('/(auth)/sign-in' as any); return; }
    setBusy(true);
    const next = !following;
    setFollowing(next);
    const res = next
      ? await supabase.from('follows').insert({ follower_id: me, following_id: profileId })
      : await supabase.from('follows').delete().eq('follower_id', me).eq('following_id', profileId!);
    if (res.error) setFollowing(!next);
    setBusy(false);
  }
  return (
    <Pressable
      onPress={guardTabSwipe(toggle)}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ selected: following }}
      style={{ height: compact ? 32 : 40, paddingHorizontal: compact ? 12 : 16, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, backgroundColor: following ? c.surfaceSoft : c.primary }}
    >
      {busy ? <ActivityIndicator size="small" color={following ? c.ink : c.onPrimary} /> : (
        <Text style={[type.buttonSm, { color: following ? c.ink : c.onPrimary }]}>{following ? 'Following' : 'Follow'}</Text>
      )}
    </Pressable>
  );
}

/** "Run a masjid or nonprofit?" call to action. */
export function RegisterOrgCard({ style }: { style?: any }) {
  const { c } = useDS();
  return (
    <View style={[{ backgroundColor: c.seedTint, borderRadius: radius.xl, padding: space[5], gap: space[3] }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.seed, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="business-outline" size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.headline, { color: c.ink }]}>Run a masjid or nonprofit?</Text>
          <Text style={[type.caption, { color: c.ink2 }]}>Register or claim your organization to take donations and launch Seeds.</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <Button label="Register" size="sm" onPress={guardTabSwipe(() => router.push('/org-register' as any))} />
        <Button label="Find and claim" size="sm" variant="secondary" onPress={guardTabSwipe(() => router.push('/orgs' as any))} />
      </View>
    </View>
  );
}

type RailOrg = { id: string; profile_id: string | null; org_name: string; city: string | null; state: string | null; logo_url: string | null };

/** Desktop right rail on Seeds: verified organizations with Follow. */
export function VerifiedOrgsRail() {
  const { c, shadow } = useDS();
  const [orgs, setOrgs] = useState<RailOrg[]>([]);
  useEffect(() => {
    supabase.from('organizations').select('id, profile_id, org_name, city, state, logo_url')
      .eq('approval_status', 'approved').eq('is_verified', true).order('org_name').limit(8)
      .then(({ data }) => setOrgs((data ?? []) as RailOrg[]));
  }, []);
  return (
    <View style={{ gap: space[4] }}>
      {orgs.length ? (
        <View style={[{ backgroundColor: c.surface, borderRadius: radius.xl, padding: space[4], gap: space[1] }, shadow('card')]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space[2] }}>
            <Text style={[type.headline, { color: c.ink }]}>Verified organizations</Text>
            <Pressable onPress={() => router.replace('/orgs' as any)} hitSlop={8}><Text style={[type.caption, font(600), { color: c.ink2 }]}>See all ›</Text></Pressable>
          </View>
          {orgs.map(o => (
            <View key={o.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2] }}>
              <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], flex: 1, minWidth: 0 }} onPress={() => router.push({ pathname: '/org-profile', params: { id: o.id } } as any)} accessibilityRole="link">
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c.seedTint, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                  {o.logo_url ? <Image source={{ uri: o.logo_url }} style={{ width: '100%', height: '100%' }} /> : <Text style={[type.caption, font(700), { color: c.seed }]}>{o.org_name.slice(0, 1)}</Text>}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.subhead, font(600), { color: c.ink }]} numberOfLines={1}>{o.org_name}</Text>
                  <Text style={[type.micro, font(500), { color: c.ink2 }]} numberOfLines={1}>{[o.city, o.state].filter(Boolean).join(', ') || 'Verified'}</Text>
                </View>
              </Pressable>
              <FollowOrgButton profileId={o.profile_id} compact />
            </View>
          ))}
        </View>
      ) : null}
      <RegisterOrgCard />
    </View>
  );
}
