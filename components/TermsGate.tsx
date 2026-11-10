import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { supabase } from '../lib/supabase';
import { TERMS_VERSION } from '../lib/socialAuth';
import { font, radius, space, type, useDS } from '../lib/ds';
import { Icon } from './Icon';
import { Button } from './ui';

// Accounts made before the sign-up checkbox existed (or before the Terms
// changed) never agreed to the community rules. Google Play and the App
// Store require agreement before anyone can post, so a signed-in person
// who hasn't agreed to the current version sees this until they do.
// The Terms and Privacy pages stay readable behind it.

const OPEN_PATHS = ['/terms', '/privacy', '/support', '/delete-account'];

export function TermsGate() {
  const { c, shadow } = useDS();
  const pathname = usePathname();
  const [needs, setNeeds] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const check = (user: any) => {
      const meta = user?.user_metadata ?? {};
      setNeeds(Boolean(user) && (!meta.terms_accepted_at || meta.terms_version !== TERMS_VERSION));
    };
    supabase.auth.getSession().then(({ data }) => check(data.session?.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => check(session?.user));
    return () => subscription.unsubscribe();
  }, []);

  async function accept() {
    if (!agreed) { setError('Tick the box to agree first.'); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ data: { terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION } });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setNeeds(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setNeeds(false);
    router.replace('/(tabs)' as any);
  }

  const visible = needs && !OPEN_PATHS.some(p => pathname?.startsWith(p));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={{ flex: 1, backgroundColor: c.scrim, alignItems: 'center', justifyContent: 'center', padding: space[5] }}>
        <View style={[{ width: '100%', maxWidth: 480, maxHeight: '90%', backgroundColor: c.surface, borderRadius: radius.xl, overflow: 'hidden' }, shadow('raised')]}>
          <ScrollView contentContainerStyle={{ padding: space[6], gap: space[4] }}>
            <Text style={[type.title2, { color: c.ink }]} accessibilityRole="header">Before you continue</Text>
            <Text style={[type.callout, { color: c.ink2 }]}>
              Siqa's Terms of use and community rules apply to everything you post: Gems, comments, messages, listings and Seeds. Please read them and agree to keep using your account.
            </Text>
            <View style={{ gap: 8 }}>
              {[
                'No hateful, abusive, sexual or violent content, and no harassment.',
                'Post only videos and photos you have the right to share.',
                'Report anything that breaks the rules. Siqa reviews every report within 24 hours and removes content and accounts that break them.',
              ].map(t => (
                <View key={t} style={{ flexDirection: 'row', gap: 8 }}>
                  <Icon name="checkmark-circle-outline" size={18} color={c.ink2} />
                  <Text style={[type.subhead, font(400), { color: c.ink, flex: 1 }]}>{t}</Text>
                </View>
              ))}
            </View>
            <Pressable
              onPress={() => { setAgreed(a => !a); setError(null); }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreed }}
              style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', minHeight: 44, paddingVertical: 4 }}
            >
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: agreed ? c.primary : c.lineControl, backgroundColor: agreed ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                {agreed ? <Icon name="checkmark" size={15} color={c.onPrimary} /> : null}
              </View>
              <Text style={[type.subhead, font(400), { color: c.ink, flex: 1 }]}>
                I agree to the{' '}
                <Text style={{ textDecorationLine: 'underline', ...font(600) }} onPress={() => router.push('/terms' as any)}>Terms of use</Text>
                {' '}and{' '}
                <Text style={{ textDecorationLine: 'underline', ...font(600) }} onPress={() => router.push('/privacy' as any)}>Privacy policy</Text>.
              </Text>
            </Pressable>
            {error ? <Text style={[type.caption, { color: c.danger }]}>{error}</Text> : null}
            <Button label="Agree and continue" onPress={accept} loading={busy} />
            <Pressable onPress={signOut} accessibilityRole="button" style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[type.subhead, font(600), { color: c.ink2 }]}>Sign out instead</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
