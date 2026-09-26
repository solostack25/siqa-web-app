import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useCallback, useState } from 'react';
import { router, usePathname, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { HomeIcon, DiscoverIcon, OrgsIcon, PlayIcon, SeedsIcon, SiqaWordmark } from './Siqa';
import { Icon } from './Icon';

type NavItem = {
  key: string;
  label: string;
  path: string;
  // Pathname prefixes that should count as "active" for this item,
  // since /watch and /channel are reached from the video feed but
  // aren't literally the "/" route.
  matchPrefixes: string[];
  icon: (color: string) => React.ReactNode;
};

type YouItem = {
  key: string;
  label: string;
  path: string;
  matchPrefixes: string[];
  icon: string; // Ionicons name
};

function isAdminRole(role?: string | null) {
  return ['admin', 'owner', 'moderator', 'super_admin'].includes(String(role || '').toLowerCase());
}

export function DesktopSidebar() {
  const { colors: C } = useTheme();
  const pathname = usePathname();

  // The sidebar used to be static — same 5 links for every visitor,
  // signed in or not, with no way to reach your own stuff (orders,
  // messages, your shop) except by first opening the top-bar dropdown.
  // This is the "You" section that was missing.
  const [profile, setProfile] = useState<{ full_name: string | null; role: string | null; avatar_url: string | null } | null>(null);
  const [speaker, setSpeaker] = useState<{ id: string } | null>(null);
  const [isSeller, setIsSeller] = useState(false);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setProfile(null); setSpeaker(null); setIsSeller(false); return; }

    const [{ data: profileData }, { data: speakerData }, { data: sellerData }] = await Promise.all([
      supabase.from('profiles').select('full_name, role, avatar_url').eq('id', session.user.id).maybeSingle(),
      supabase.from('speakers').select('id').eq('profile_id', session.user.id).maybeSingle(),
      supabase.from('marketplace_sellers').select('id').eq('user_id', session.user.id).maybeSingle(),
    ]);
    setProfile(profileData ?? null);
    setSpeaker(speakerData ?? null);
    setIsSeller(Boolean(sellerData));
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/(auth)/sign-in' as any);
  }

  const items: NavItem[] = [
    {
      key: 'home',
      label: 'Home',
      path: '/(tabs)',
      matchPrefixes: ['/', '/watch', '/channel', '/browse'],
      icon: (color) => <HomeIcon color={color} />,
    },
    {
      key: 'gems',
      label: 'Gems',
      path: '/(tabs)/gems',
      matchPrefixes: ['/gems'],
      icon: (color) => <PlayIcon color={color} size={16} />,
    },
    {
      key: 'marketplace',
      label: 'Shop',
      path: '/(tabs)/marketplace',
      matchPrefixes: ['/marketplace', '/product'],
      icon: (color) => <DiscoverIcon color={color} />,
    },
    {
      key: 'seeds',
      label: 'Seeds',
      path: '/(tabs)/seeds',
      matchPrefixes: ['/seeds'],
      icon: (color) => <SeedsIcon color={color} />,
    },
    {
      key: 'orgs',
      label: 'Orgs',
      path: '/(tabs)/orgs',
      matchPrefixes: ['/orgs'],
      icon: (color) => <OrgsIcon color={color} />,
    },
  ];

  const youItems: YouItem[] = [
    ...(speaker ? [{ key: 'myprofile', label: 'My Public Profile', path: `/speaker/${speaker.id}`, matchPrefixes: [`/speaker/${speaker.id}`], icon: 'person-circle-outline' }] : []),
    { key: 'cart', label: 'Cart', path: '/cart', matchPrefixes: ['/cart'], icon: 'cart-outline' },
    { key: 'orders', label: 'My Orders', path: '/orders', matchPrefixes: ['/orders'], icon: 'receipt-outline' },
    { key: 'messages', label: 'Messages', path: '/messages', matchPrefixes: ['/messages'], icon: 'chatbubble-outline' },
    isSeller
      ? { key: 'sellerdash', label: 'Seller Dashboard', path: '/seller-dashboard', matchPrefixes: ['/seller-dashboard', '/listing-create'], icon: 'storefront-outline' }
      : { key: 'sell', label: 'Sell on Siqa', path: '/sell', matchPrefixes: ['/sell'], icon: 'storefront-outline' },
    ...(profile && isAdminRole(profile.role) ? [{ key: 'admin', label: 'Admin', path: '/admin', matchPrefixes: ['/admin'], icon: 'shield-checkmark-outline' }] : []),
  ];

  function isActive(item: { matchPrefixes: string[] }, key: string) {
    if (key === 'home') return pathname === '/' || pathname.startsWith('/watch') || pathname.startsWith('/channel') || pathname.startsWith('/browse');
    return item.matchPrefixes.some((p) => pathname.startsWith(p));
  }

  const styles = makeStyles(C);
  const initial = (profile?.full_name || '?').charAt(0).toUpperCase();

  return (
    <View style={styles.sidebar}>
      <TouchableOpacity style={styles.logoRow} onPress={() => router.push('/(tabs)' as any)}>
        <SiqaWordmark size={22} />
      </TouchableOpacity>

      {profile ? (
        <TouchableOpacity style={styles.accountCard} onPress={() => router.push('/settings' as any)}>
          <View style={styles.accountAvatar}>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <Text style={styles.accountAvatarText}>{initial}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.accountName} numberOfLines={1}>{profile.full_name || 'Your account'}</Text>
            <Text style={styles.accountSub}>View settings</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.signInCard} onPress={() => router.push('/(auth)/sign-in' as any)}>
          <Text style={styles.signInCardText}>Sign In</Text>
        </TouchableOpacity>
      )}

      <View style={styles.navList}>
        {items.map((item) => {
          const active = isActive(item, item.key);
          const isGems = item.key === 'gems';
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.navItem, active && styles.navItemActive]}
              onPress={() => router.push(item.path as any)}
            >
              <View style={[styles.iconWrap, isGems && { backgroundColor: active ? C.gold : C.surface2 }]}>
                {item.icon(isGems ? (active ? C.bg : C.gold) : active ? C.gold : C.text3)}
              </View>
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {profile && (
        <>
          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>YOU</Text>
          <View style={styles.navList}>
            {youItems.map((item) => {
              const active = isActive(item, item.key);
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.navItem, active && styles.navItemActive]}
                  onPress={() => router.push(item.path as any)}
                >
                  <View style={styles.iconWrap}>
                    <Icon name={item.icon as any} size={17} color={active ? C.gold : C.text3} />
                  </View>
                  <Text style={[styles.navLabel, active && styles.navLabelActive]} numberOfLines={1}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.navItem} onPress={handleSignOut}>
              <View style={styles.iconWrap}>
                <Icon name="log-out-outline" size={17} color="#e84545" />
              </View>
              <Text style={[styles.navLabel, { color: '#e84545' }]}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    sidebar: {
      width: 220,
      flexShrink: 0,
      backgroundColor: C.bg2,
      borderRightWidth: 0.5,
      borderRightColor: C.border,
      paddingTop: 20,
      paddingHorizontal: 12,
    },
    logoRow: { paddingHorizontal: 12, paddingBottom: 16, paddingTop: 4 },

    accountCard: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: C.surface, borderRadius: 12, padding: 10, marginBottom: 18,
      borderWidth: 0.5, borderColor: C.border2,
    },
    accountAvatar: {
      width: 34, height: 34, borderRadius: 17, backgroundColor: C.gold,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    accountAvatarText: { color: C.black, fontSize: 14, fontWeight: '800' },
    accountName: { fontSize: 13, fontWeight: '700', color: C.text },
    accountSub: { fontSize: 11, color: C.text3, marginTop: 1 },

    signInCard: {
      backgroundColor: C.gold, borderRadius: 12, paddingVertical: 10,
      alignItems: 'center', marginBottom: 18,
    },
    signInCardText: { color: C.black, fontSize: 13, fontWeight: '800' },

    navList: { gap: 4 },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
    },
    navItemActive: { backgroundColor: C.surface },
    iconWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navLabel: { fontSize: 14, fontWeight: '500', color: C.text2 },
    navLabelActive: { color: C.text, fontWeight: '700' },

    divider: { height: 0.5, backgroundColor: C.border, marginVertical: 16, marginHorizontal: 12 },
    sectionLabel: {
      fontSize: 11, fontWeight: '700', color: C.text3, letterSpacing: 1,
      paddingHorizontal: 12, marginBottom: 8,
    },
  });
}
