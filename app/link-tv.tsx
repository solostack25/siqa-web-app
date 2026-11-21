// siqa.us/link-tv: opened by scanning the QR code on a TV (or typed in). Links the TV either
// to your home (Siqa Home) or, for masjid teams, to one of your masjids as a screen.

import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { font, radius, space, type, useDS } from '../lib/ds';
import { Button, TextField } from '../components/ui';
import { Icon } from '../components/Icon';
import { goBack } from '../lib/goBack';

type M = { id: string; org_name: string };

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

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSignedIn(!!session);
      if (session) {
        const { data } = await supabase.rpc('my_masjids');
        const list = ((data as M[]) || []);
        setMasjids(list);
        if (list.length && !params.code) setTarget(list[0].id);
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
      </View>
    </ScrollView>
  );
}
