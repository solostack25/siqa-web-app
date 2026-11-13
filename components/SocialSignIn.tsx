// "Continue with Apple / Google" for siqa.us and shop.siqa.us.
//
// Web only for now. The iPhone app needs a new build for native Sign in with
// Apple (and Apple requires Apple whenever Google is offered there), so the
// native app keeps email sign-in until that build ships.
//
// New accounts get a profile from the handle_new_user trigger; the first-login
// touches (name fallback, terms acceptance) happen in finishSocialSignIn.

import { useState } from 'react';
import { View, Text, Pressable, Platform, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../lib/supabase';
import { SITE_HOME } from '../lib/site';
import { setSignupIntent, type SignupIntent } from '../lib/signupIntent';
import { Icon } from './Icon';
import { font, useDS } from '../lib/ds';

type Provider = 'apple' | 'google';

export const SOCIAL_SIGN_IN_ENABLED = Platform.OS === 'web';

function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

export function SocialSignIn({ onError, intent = null }: { onError?: (message: string) => void; intent?: SignupIntent | null }) {
  const { c, isDark } = useDS();
  const [busy, setBusy] = useState<Provider | null>(null);

  if (!SOCIAL_SIGN_IN_ENABLED) return null;

  async function go(provider: Provider) {
    setBusy(provider);
    // Survives the trip to Apple/Google; read back in the root layout on SIGNED_IN.
    setSignupIntent(intent);
    // Come back to the site home on whichever site they started from
    // (www.siqa.us or shop.siqa.us). Both are in Supabase's redirect list.
    const redirectTo = `${window.location.origin}${SITE_HOME}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}) },
    });
    if (error) {
      setBusy(null);
      onError?.(error.message);
    }
    // On success the browser leaves for Apple/Google; nothing else to do here.
  }

  const base = {
    height: 50,
    borderRadius: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 10,
  };
  // Apple's guidelines: black button on light backgrounds, white on dark.
  const appleBg = isDark ? '#ffffff' : '#000000';
  const appleFg = isDark ? '#000000' : '#ffffff';

  return (
    <View style={{ gap: 10 }}>
      <Pressable
        onPress={() => go('apple')}
        disabled={!!busy}
        accessibilityRole="button"
        accessibilityLabel="Continue with Apple"
        style={({ pressed }) => [base, { backgroundColor: appleBg, opacity: pressed || (busy && busy !== 'apple') ? 0.7 : 1 }]}
      >
        {busy === 'apple' ? <ActivityIndicator color={appleFg} /> : <Icon name="logo-apple" size={20} color={appleFg} />}
        <Text style={[font(600), { fontSize: 16, color: appleFg }]}>Continue with Apple</Text>
      </Pressable>
      <Pressable
        onPress={() => go('google')}
        disabled={!!busy}
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        style={({ pressed }) => [base, { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#dadce0', opacity: pressed || (busy && busy !== 'google') ? 0.7 : 1 }]}
      >
        {busy === 'google' ? <ActivityIndicator color="#1f1f1f" /> : <GoogleG />}
        <Text style={[font(600), { fontSize: 16, color: '#1f1f1f' }]}>Continue with Google</Text>
      </Pressable>
      <Text style={{ fontSize: 12, lineHeight: 17, color: c.ink2, textAlign: 'center', marginTop: 2 }}>
        By continuing with Apple or Google, you agree to the{' '}
        <Text style={{ color: c.ink, textDecorationLine: 'underline' }} onPress={() => router.push('/terms' as any)}>Terms of use</Text>
        , including the community rules, and the{' '}
        <Text style={{ color: c.ink, textDecorationLine: 'underline' }} onPress={() => router.push('/privacy' as any)}>Privacy policy</Text>.
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 6 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
        <Text style={{ fontSize: 12, color: c.ink2 }}>or use email</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
      </View>
    </View>
  );
}
