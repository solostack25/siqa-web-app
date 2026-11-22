// siqa.us/link-tv: opened by scanning the QR code on a TV (or typed in). Links the TV either
// to your home (Siqa Home) or, for masjid teams, to one of your masjids as a screen.
// Also lists the TVs linked to your home ("Your TVs" in Settings) so you can unlink them.

import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { font, radius, space, type, useDS } from '../lib/ds';
import { Button, TextField } from '../components/ui';
import { Icon } from '../components/Icon';
import { goBack } from '../lib/goBack';
import { confirmDialog } from '../lib/dialogs';

type M = { id: string; org_name: string };
type HomeTV = { id: string; name: string | null; last_seen_at: string | null };

function seenLabel(iso: string | null) {
  if (!iso) return 'Not seen yet';
  const mins = (Date.now() - new Date(iso).getTime()) / 60000;
  if (mins < 2) return 'Online now';
  if (mins < 60) return `Last seen ${Math.round(mins)} min ago`;
  if (mins < 48 * 60) return `Last seen ${Math.round(mins / 60)} h ago`;
  return `Last seen ${new Date(iso).toLocaleDateString()}`;
}

export default function LinkTV() {
  const { c } = useDS();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(String(params.code ?? '').replace(/\D/g, '').slice(0, 6));
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [masjids, setMasjids] = useState<M[]>([]);
  const [target, setTarget] = useState<string>('home');
  const [name, setName] = useState('Living room TV');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tvs, setTvs] = useState<HomeTV[]>([]);

  const loadTvs = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase.from('masjid_screens').select('id, name, last_seen_at')
      .eq('owner_id', session.user.id).eq('mode', 'home').order('paired_at', { ascending: false });
    setTvs((data as HomeTV[]) || []);
  };

  const [moving, setMoving] = useState<string | null>(null);
  const moveToMasjid = async (tv: HomeTV, m: M) => {
    if (!(await confirmDialog(`Make ${tv.name || 'this TV'} a screen at ${m.org_name}?`, 'It switches to the masjid screen within 20 seconds. Its saved Wi-Fi stays.', 'Move'))) return;
    const { error: e } = await supabase.rpc('screen_move_masjid', { p_screen: tv.id, p_org: m.id, p_name: 'Main hall TV' });
    if (e) { setError(e.message); return; }
    setMoving(null);
    loadTvs();
    router.push(`/masjid-admin?section=screens&org=${m.id}` as any);
  };

  const unlink = async (tv: HomeTV) => {
    if (!(await confirmDialog(`Unlink ${tv.name || 'this TV'}?`, 'It goes back to showing a code, so you can link it to a masjid or another account.', 'Unlink'))) return;
    const { error: e } = await supabase.from('masjid_screens').delete().eq('id', tv.id);
    if (e) { setError(e.message); return; }
    loadTvs();
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSignedIn(!!session);
      if (session) {
        const { data } = await supabase.rpc('my_masjids');
        const list = ((data as M[]) || []);
        setMasjids(list);
        if (list.length && !params.code) setTarget(list[0].id);
        loadTvs();
      }
    })();
  }, []);

  useEffect(() => { setName(target === 'home' ? 'Living room TV' : 'Main hall TV'); }, [target]);

  const link = async () => {
    setError(null);
    if (code.length !== 6) { setError('The code on the TV has 6 digits.'); return; }
    setBusy(true);
    const res = target === 'home'
      ? await supabase.rpc('screen_claim_home', { p_code: code, p_name: name })
      : await supabase.rpc('screen_claim_masjid', { p_code: code, p_org: target, p_name: name });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    loadTvs();
    setDone(target === 'home' ? 'Your TV is linked. It shows your Siqa within 20 seconds.' : 'Screen added. It switches to your masjid within 20 seconds.');
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + space[4], padding: space[5], paddingBottom: insets.bottom + 40, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 460, gap: space[5] }}>
        <Pressable onPress={() => goBack()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} style={{ alignSelf: 'flex-start' }}>
          <Icon name="chevron-back" size={24} color={c.ink} />
        </Pressable>
        <View style={{ gap: space[2] }}>
          <Text style={[type.display, { color: c.ink }]}>Link a TV</Text>
          <Text style={[type.callout, { color: c.ink2 }]}>The TV shows a 6-digit code while it waits to be linked.</Text>
        </View>

        {done ? (
          <View style={{ gap: space[4], alignItems: 'center', padding: space[6], borderRadius: radius.xl, backgroundColor: c.seedTint }}>
            <Icon name="checkmark-circle" size={44} color={c.seed} />
            <Text style={[type.headline, { color: c.ink, textAlign: 'center' }]}>{done}</Text>
            <Button label={target === 'home' ? 'Done' : 'Open Screens'} onPress={() => router.replace((target === 'home' ? '/(tabs)/home' : `/masjid-admin?section=screens&org=${target}`) as any)} style={{ alignSelf: 'stretch' }} />
          </View>
        ) : signedIn === false ? (
          <View style={{ gap: space[3] }}>
            <Text style={[type.body, { color: c.ink }]}>Sign in first, then scan the TV's code again.</Text>
            <Button label="Sign in" onPress={() => router.push('/sign-in' as any)} />
          </View>
        ) : (
          <>
            <TextField label="Code on the TV" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="123456" textStyle="title2" />
            {masjids.length ? (
              <View style={{ gap: space[2] }}>
                <Text style={[type.caption, font(600), { color: c.ink2 }]}>This TV is for</Text>
                {[{ id: 'home', org_name: 'My home' }, ...masjids].map((m) => {
                  const on = target === m.id;
                  return (
                    <Pressable key={m.id} onPress={() => setTarget(m.id)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: radius.lg, backgroundColor: on ? c.goldTint : c.surfaceSoft, borderWidth: 1.5, borderColor: on ? c.gold : 'transparent' }}>
                      <Icon name={m.id === 'home' ? 'home-outline' : 'business-outline'} size={20} color={c.ink} />
                      <Text style={[type.body, font(600), { color: c.ink, flex: 1 }]}>{m.org_name}</Text>
                      {on ? <Icon name="checkmark" size={18} color={c.ink} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            <TextField label="Name" value={name} onChangeText={setName} />
            {error ? <Text style={[type.callout, { color: c.danger }]}>{error}</Text> : null}
            <Button label="Link TV" onPress={link} loading={busy} disabled={signedIn === null} />
          </>
        )}

        {signedIn && tvs.length ? (
          <View style={{ gap: space[2], marginTop: space[4] }}>
            <Text style={[type.headline, { color: c.ink }]}>Your TVs</Text>
            {tvs.map((tv) => (
              <View key={tv.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: radius.lg, backgroundColor: c.surfaceSoft }}>
                <Icon name="tv-outline" size={20} color={c.ink} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, font(600), { color: c.ink }]}>{tv.name || 'TV'}</Text>
                  <Text style={[type.caption, { color: c.ink2 }]}>{seenLabel(tv.last_seen_at)}</Text>
                </View>
                {masjids.length ? (
                  <Pressable onPress={() => setMoving(moving === tv.id ? null : tv.id)} accessibilityRole="button" accessibilityLabel={`Move ${tv.name || 'TV'} to a masjid`} hitSlop={8}>
                    <Text style={[type.callout, font(600), { color: c.ink }]}>Move to masjid</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => unlink(tv)} accessibilityRole="button" accessibilityLabel={`Unlink ${tv.name || 'TV'}`} hitSlop={8}>
                  <Text style={[type.callout, font(600), { color: c.danger }]}>Unlink</Text>
                </Pressable>
              </View>
            ))}
            {moving ? (
              <View style={{ gap: space[2], padding: space[4], borderRadius: radius.lg, backgroundColor: c.goldTint }}>
                <Text style={[type.caption, font(600), { color: c.ink2 }]}>Make it a screen at</Text>
                {masjids.map((m) => (
                  <Pressable key={m.id} onPress={() => { const tv = tvs.find((t) => t.id === moving); if (tv) moveToMasjid(tv, m); }} accessibilityRole="button"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.md, backgroundColor: c.surface }}>
                    <Icon name="business-outline" size={18} color={c.ink} />
                    <Text style={[type.body, font(600), { color: c.ink, flex: 1 }]}>{m.org_name}</Text>
                    <Icon name="chevron-forward" size={16} color={c.ink3} />
                  </Pressable>
                ))}
              </View>
            ) : null}
            {masjids.length ? <Text style={[type.caption, { color: c.ink2 }]}>Masjid screens are managed in Siqa for Masjids → Screens.</Text> : null}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
