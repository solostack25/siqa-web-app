import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { HEADER_TOP_PADDING } from '../constants/theme';
import { font, radius, type, useDS } from '../lib/ds';
import { Icon } from './Icon';

/**
 * Phone header for the Shop tab: "Products" and "Local" as big text tabs
 * on the left, Messages / Cart / Account on the right. One 52px row, in
 * place of the old brand bar + pill switcher + page title, so products
 * start higher on the screen.
 */
export function ShopTabsHeader({ active, cartCount = 0, showCart = true }: {
  active: 'products' | 'local';
  cartCount?: number;
  showCart?: boolean;
}) {
  const { c } = useDS();
  const insets = useSafeAreaInsets();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(!!session));
    return () => sub.subscription.unsubscribe();
  }, []);

  function go(to: 'products' | 'local') {
    if (to === active) return;
    // Both live under the Shop tab, so switch in place (no back stack).
    router.navigate((to === 'local' ? '/local' : '/(tabs)/marketplace') as any);
  }

  const tab = (key: 'products' | 'local', label: string) => {
    const on = key === active;
    return (
      <Pressable
        key={key}
        onPress={() => go(key)}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        style={{ height: 44, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: on ? c.ink : 'transparent' }}
      >
        <Text style={[type.title2, font(on ? 800 : 700, 'display'), { color: on ? c.ink : c.ink2, letterSpacing: -0.4 }]}>{label}</Text>
      </Pressable>
    );
  };

  const iconBtn = (icon: Parameters<typeof Icon>[0]['name'], label: string, onPress: () => void, badge?: number) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} ${badge === 1 ? 'item' : 'items'}` : label}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
    >
      <Icon name={icon} size={23} color={c.ink} />
      {badge ? (
        <View style={{ position: 'absolute', top: 5, right: 3, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[type.micro, { fontSize: 11, lineHeight: 14, color: c.onPrimary }]}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 8, paddingTop: Math.max(insets.top, HEADER_TOP_PADDING - 20) + 4 }}>
      <View style={{ flexDirection: 'row', gap: 20 }} accessibilityRole="tablist">
        {tab('products', 'Products')}
        {tab('local', 'Local')}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {iconBtn('chatbubble-outline', 'Messages', () => router.push((signedIn ? '/messages' : '/(auth)/sign-in') as any))}
        {showCart ? iconBtn('bag-outline', 'Cart', () => router.push('/cart' as any), cartCount) : null}
        {iconBtn('person-circle-outline', signedIn ? 'Your account' : 'Sign in', () => router.push((signedIn ? '/(tabs)/dashboard' : '/(auth)/login') as any))}
      </View>
    </View>
  );
}
