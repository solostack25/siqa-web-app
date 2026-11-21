// dashboard.siqa.us/manage-handoff: signs you in when you tap "Dashboard" on siqa.us.
// The session arrives in the URL fragment (browsers never send fragments to a server) and
// is wiped from the address bar before anything else happens.
import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { type, useDS } from '../lib/ds';

export default function Handoff() {
  const { c } = useDS();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web') { router.replace('/manage' as any); return; }
      const frag = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      try { window.history.replaceState(null, '', window.location.pathname); } catch {}
      const at = frag.get('at'), rt = frag.get('rt');
      const next = frag.get('next') || '/manage';
      const safeNext = next.startsWith('/manage') ? next : '/manage';
      if (at && rt) {
        const { error } = await supabase.auth.setSession({ access_token: at, refresh_token: rt });
        if (error) { setFailed(true); setTimeout(() => router.replace('/sign-in' as any), 1500); return; }
      }
      router.replace(safeNext as any);
    })();
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: c.bg }}>
      {failed ? <Text style={[type.callout, { color: c.ink2 }]}>Please sign in again.</Text> : <ActivityIndicator color={c.ink2} />}
    </View>
  );
}
