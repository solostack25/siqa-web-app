// "Continue with Apple" and "Continue with Google", for the sign-in and
// sign-up screens. On iPhone the Apple button is Apple's own native button
// (their rules). Both buttons are the same size and Apple comes first.

import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform } from 'react-native';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Icon } from './Icon';
import { signInWith, nativeAppleAvailable, type SocialProvider } from '../lib/socialAuth';

function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

export function SocialSignIn({ onSignedIn, colors, dark }: {
  onSignedIn: () => void;
  colors: { text: string; text2: string; text3: string; bg: string; border: string };
  dark?: boolean;
}) {
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [error, setError] = useState('');
  const [native, setNative] = useState(false);
  useEffect(() => { nativeAppleAvailable().then(setNative); }, []);

  async function go(p: SocialProvider) {
    if (busy) return;
    setBusy(p); setError('');
    const r = await signInWith(p);
    setBusy(null);
    if (r.ok) { if (Platform.OS !== 'web') onSignedIn(); return; } // web leaves the page
    if (!r.cancelled) setError(r.error ?? 'That didn’t work. Try again.');
  }

  const H = 50;
  const outline = { height: H, borderRadius: 12, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 10 };

  return (
    <View style={{ gap: 10 }}>
      {native ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={dark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={12}
          style={{ height: H, width: '100%', opacity: busy ? 0.6 : 1 }}
          onPress={() => go('apple')}
        />
      ) : (
        <Pressable onPress={() => go('apple')} accessibilityRole="button" accessibilityLabel="Continue with Apple"
          style={({ pressed }) => [outline, { backgroundColor: dark ? '#fff' : '#000', opacity: pressed ? 0.85 : 1 }]}>
          {busy === 'apple' ? <ActivityIndicator color={dark ? '#000' : '#fff'} /> : <>
            <Icon name="logo-apple" size={20} color={dark ? '#000' : '#fff'} />
            <Text style={{ color: dark ? '#000' : '#fff', fontSize: 16, fontWeight: '600' }}>Continue with Apple</Text>
          </>}
        </Pressable>
      )}
      <Pressable onPress={() => go('google')} accessibilityRole="button" accessibilityLabel="Continue with Google"
        style={({ pressed }) => [outline, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dadce0', opacity: pressed ? 0.85 : 1 }]}>
        {busy === 'google' ? <ActivityIndicator color="#1f1f1f" /> : <>
          <GoogleG />
          <Text style={{ color: '#1f1f1f', fontSize: 16, fontWeight: '600' }}>Continue with Google</Text>
        </>}
      </Pressable>
      {error ? <Text style={{ color: '#d14b3a', fontSize: 13 }}>{error}</Text> : null}
      <Text style={{ fontSize: 12, lineHeight: 17, color: colors.text3, textAlign: 'center' }}>
        By continuing with Apple or Google you agree to the{' '}
        <Text style={{ color: colors.text2, textDecorationLine: 'underline' }} onPress={() => router.push('/terms' as any)}>Terms of use</Text>
        {' '}and{' '}
        <Text style={{ color: colors.text2, textDecorationLine: 'underline' }} onPress={() => router.push('/privacy' as any)}>Privacy policy</Text>.
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 6 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <Text style={{ fontSize: 12, color: colors.text3 }}>or use email</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </View>
    </View>
  );
}
