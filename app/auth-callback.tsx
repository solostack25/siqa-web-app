// Where Apple and Google send people back after signing in on the web
// (and the siqa://auth-callback link in the app). Supabase reads the
// session from the URL; this waits for it, records the terms agreement,
// then goes home.

import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { stampTermsIfMissing } from '../lib/socialAuth';
import { SITE_HOME } from '../lib/site';
import { Button } from '../components/ui';
import { type, space, useDS } from '../lib/ds';

export default function AuthCallback() {
  const { c } = useDS();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let done = false;
    if (Platform.OS === 'web') {
      const q = new URLSearchParams(window.location.search + '&' + window.location.hash.replace(/^#/, ''));
      const err = q.get('error_description') || q.get('error');
      if (err) { setError(err); return; }
      const code = q.get('code');
      if (code) supabase.auth.exchangeCodeForSession(code).catch(() => {});
    }
    const finish = async () => {
      if (done) return;
      done = true;
      await stampTermsIfMissing().catch(() => {});
      router.replace(SITE_HOME as any);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { if (session) finish(); });
    supabase.auth.getSession().then(({ data }) => { if (data.session) finish(); });
    const t = setTimeout(() => { if (!done) setError('Sign-in didn’t finish. Please try again.'); }, 12000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, padding: space[8], gap: space[4] }}>
      {error ? (
        <>
          <Text style={[type.headline, { color: c.ink, textAlign: 'center' }]}>Couldn't sign you in</Text>
          <Text style={[type.callout, { color: c.ink2, textAlign: 'center', maxWidth: 360 }]}>{error}</Text>
          <Button label="Back to sign in" variant="secondary" size="md" onPress={() => router.replace('/(auth)/sign-in' as any)} />
        </>
      ) : (
        <>
          <ActivityIndicator color={c.gold} size="large" />
          <Text style={[type.callout, { color: c.ink2 }]}>Signing you in…</Text>
        </>
      )}
    </View>
  );
}
