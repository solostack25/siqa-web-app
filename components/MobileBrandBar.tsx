import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useTheme, type AppColors } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { SITE_HOME } from '../lib/site';
import { useIsDesktopWeb } from './DesktopShell';
import { Icon } from './Icon';
import { HEADER_TOP_PADDING } from '../constants/theme';

/**
 * The Siqa wordmark row at the top of each tab page on phones, matching the
 * Home tab. Desktop already has the wordmark in the sidebar, so this renders
 * nothing there.
 */
export function MobileBrandBar() {
  const isDesktopWeb = useIsDesktopWeb();
  const { colors: C } = useTheme();
  const s = makeStyles(C);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(!!session));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (isDesktopWeb) return null;

  return (
    <View style={s.bar}>
      <TouchableOpacity onPress={() => router.navigate(SITE_HOME as any)} accessibilityLabel="Siqa home">
        <Text style={s.logo}>صِقا</Text>
        <Text style={s.logoSub}>SIQA</Text>
      </TouchableOpacity>
      {signedIn === false ? (
        <TouchableOpacity style={s.authBtn} onPress={() => router.push('/(auth)/login' as any)}>
          <Text style={s.authText}>Sign In</Text>
        </TouchableOpacity>
      ) : signedIn ? (
        <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/(tabs)/dashboard' as any)} accessibilityLabel="Your account">
          <Icon name="person-circle-outline" size={26} color={C.text2} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: HEADER_TOP_PADDING, paddingBottom: 4,
    },
    logo: { fontSize: 28, color: C.gold },
    logoSub: { fontSize: 9, color: C.text3, letterSpacing: 3, marginTop: -4 },
    authBtn: { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
    authText: { fontSize: 13, color: C.text, fontWeight: '500' },
    iconBtn: { padding: 4 },
  });
}
