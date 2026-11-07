import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView } from 'react-native';
import { useCallback, useState } from 'react';
import { router, usePathname, useFocusEffect, useGlobalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { HomeIcon, DiscoverIcon, ChaiIcon, GemIcon, SeedsIcon, SiqaWordmark } from './Siqa';
import { Icon } from './Icon';
import { IS_MARKETPLACE_SITE, SITE_HOME } from '../lib/site';
import { brandStyles } from '../lib/ds';

// Marketplace site sidebar: quick category links (same list as the Shop's filter chips).
const SHOP_CATEGORIES = ['Home Decor', 'Books & Media', 'Clothing & Accessories', 'Art & Prints', 'Jewelry', 'Digital Downloads', 'Gifts', 'Other'];

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
  const globalParams = useGlobalSearchParams<{ category?: string }>();

  // The sidebar used to be static — same 5 links for every visitor,
  // signed in or not, with no way to reach your own stuff (orders,
  // messages, your shop) except by first opening the top-bar dropdown.
  // This is the "You" section that was missing.
  const [profile, setProfile] = useState<{ full_name: string | null; role: string | null; avatar_url: string | null } | null>(null);
  const [speaker, setSpeaker] = useState<{ id: string } | null>(null);
  const [isSeller, setIsSeller] = useState(false);
  const [hasBusiness, setHasBusiness] = useState(false);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setProfile(null); setSpeaker(null); setIsSeller(false); setHasBusiness(false); return; }

    const [{ data: profileData }, { data: speakerData }, { data: sellerData }] = await Promise.all([
      supabase.from('profiles').select('full_name, role, avatar_url').eq('id', session.user.id).maybeSingle(),
      supabase.from('speakers').select('id').eq('profile_id', session.user.id).maybeSingle(),
      supabase.from('marketplace_sellers').select('id').eq('user_id', session.user.id).maybeSingle(),
    ]);
    const { count: bizCount } = await supabase.from('business_listings').select('id', { count: 'exact', head: true }).eq('owner_id', session.user.id);
    setHasBusiness((bizCount ?? 0) > 0);
    setProfile(profileData ?? null);
    setSpeaker(speakerData ?? null);
    setIsSeller(Boolean(sellerData));
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/(auth)/sign-in' as any);
  }

  const allItems: NavItem[] = [
    {
      key: 'home',
      label: 'Home',
      path: '/home',
      matchPrefixes: ['/home', '/watch', '/channel', '/browse'],
      icon: (color) => <HomeIcon color={color} />,
    },
    {
      key: 'gems',
      label: 'Gems',
      path: '/(tabs)/gems',
      matchPrefixes: ['/gems'],
      icon: (color) => <GemIcon color={color} size={19} />,
    },
    {
      key: 'marketplace',
      label: 'Shop',
      path: '/(tabs)/marketplace',
      matchPrefixes: ['/marketplace', '/product', '/local'],
      icon: (color) => <DiscoverIcon color={color} />,
    },
    {
      key: 'seeds',
      label: 'Seeds',
      path: '/(tabs)/seeds',
      // Organizations live inside Seeds now (Seeds | Organizations).
      matchPrefixes: ['/seeds', '/orgs', '/seed/', '/org-profile', '/org-listing'],
      icon: (color) => <SeedsIcon color={color} />,
    },
    {
      key: 'chai',
      label: 'Chai',
      path: '/(tabs)/chai',
      matchPrefixes: ['/chai'],
      icon: (color) => <ChaiIcon color={color} size={22} />,
    },
  ];
  // Marketplace site: Shop only - no videos, Seeds or Orgs.
  const items = IS_MARKETPLACE_SITE ? allItems.filter((i) => i.key === 'marketplace') : allItems;

  const youItems: YouItem[] = [
    ...(speaker && !IS_MARKETPLACE_SITE ? [{ key: 'myprofile', label: 'My Public Profile', path: `/speaker/${speaker.id}`, matchPrefixes: [`/speaker/${speaker.id}`], icon: 'person-circle-outline' }] : []),
    ...(speaker && !IS_MARKETPLACE_SITE ? [{ key: 'studio', label: 'Speaker Studio', path: '/studio', matchPrefixes: ['/studio'], icon: 'stats-chart-outline' }] : []),
    { key: 'cart', label: 'Cart', path: '/cart', matchPrefixes: ['/cart'], icon: 'cart-outline' },
    { key: 'orders', label: 'My Orders', path: '/orders', matchPrefixes: ['/orders'], icon: 'receipt-outline' },
    { key: 'messages', label: 'Messages', path: '/messages', matchPrefixes: ['/messages'], icon: 'chatbubble-outline' },
    ...(hasBusiness ? [{ key: 'mybusiness', label: 'My business listing', path: '/local/inbox', matchPrefixes: ['/local/inbox', '/local/edit'], icon: 'briefcase-outline' }] : []),
    isSeller
      ? { key: 'sellerdash', label: 'My store', path: '/seller-dashboard', matchPrefixes: ['/seller-dashboard', '/listing-create'], icon: 'storefront-outline' }
      : { key: 'sell', label: 'Sell on Siqa', path: '/sell', matchPrefixes: ['/sell'], icon: 'storefront-outline' },
    ...(profile && isAdminRole(profile.role) ? [{ key: 'admin', label: 'Admin', path: '/admin', matchPrefixes: ['/admin'], icon: 'shield-checkmark-outline' }] : []),
  ];

  function isActive(item: { matchPrefixes: string[] }, key: string) {
    if (key === 'home') return pathname === '/home' || pathname.startsWith('/watch') || pathname.startsWith('/channel') || pathname.startsWith('/browse');
    return item.matchPrefixes.some((p) => pathname.startsWith(p));
  }

  const styles = makeStyles(C);
  const initial = (profile?.full_name || '?').charAt(0).toUpperCase();

  // The Marketplace sidebar is taller (categories), so its contents scroll.
  const Inner: any = IS_MARKETPLACE_SITE ? ScrollView : View;
  const innerProps = IS_MARKETPLACE_SITE
    ? { style: { flex: 1, marginTop: -20 }, contentContainerStyle: { paddingTop: 20, paddingBottom: 24 }, showsVerticalScrollIndicator: false }
    : {};

  return (
    <View style={styles.sidebar}>
    <Inner {...innerProps}>
      <TouchableOpacity style={styles.logoRow} onPress={() => router.push(SITE_HOME as any)}>
        <SiqaWordmark size={22} />
        {IS_MARKETPLACE_SITE && <Text style={styles.siteLabel}>MARKETPLACE</Text>}
      </TouchableOpacity>

      {profile ? (
        <TouchableOpacity style={styles.accountCard} onPress={() => router.push('/settings' as any)} {...({ dataSet: { hover: 'row' } } as any)}>
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
        // Signed out: the top bar already has the Sign In button, so no
        // second big gold one here — just a quiet prompt.
        <TouchableOpacity
          style={styles.signInPrompt}
          onPress={() => router.push('/(auth)/sign-in' as any)}
          {...({ dataSet: { hover: 'row' } } as any)}
        >
          <Text style={styles.signInPromptText}>Sign in to follow speakers, save Gems and track orders.</Text>
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
              {...({ dataSet: { hover: 'row' } } as any)}
            >
              <View style={[styles.iconWrap, isGems && { backgroundColor: active ? C.gold : C.surface2 }]}>
                {item.icon(isGems ? (active ? C.bg : C.gold) : active ? C.gold : C.text3)}
              </View>
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {IS_MARKETPLACE_SITE && (
        <>
          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>CATEGORIES</Text>
          <View style={{ gap: 2 }}>
            {SHOP_CATEGORIES.map((cat) => {
              const active = pathname.startsWith('/marketplace') && globalParams.category === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catItem, active && styles.navItemActive]}
                  {...({ dataSet: { hover: 'row' } } as any)}
                  onPress={() => router.push({ pathname: '/marketplace', params: { category: cat } } as any)}
                >
                  <Text style={[styles.catLabel, active && styles.navLabelActive]} numberOfLines={1}>{cat}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

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
                  {...({ dataSet: { hover: 'row' } } as any)}
                >
                  <View style={styles.iconWrap}>
                    <Icon name={item.icon as any} size={17} color={active ? C.gold : C.text3} />
                  </View>
                  <Text style={[styles.navLabel, active && styles.navLabelActive]} numberOfLines={1}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.navItem} onPress={handleSignOut} {...({ dataSet: { hover: 'row' } } as any)}>
              <View style={styles.iconWrap}>
                <Icon name="log-out-outline" size={17} color="#e84545" />
              </View>
              <Text style={[styles.navLabel, { color: '#e84545' }]}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </Inner>
    </View>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create(brandStyles({
    sidebar: {
      width: 220,
      flexShrink: 0,
      backgroundColor: C.bg,
      borderRightWidth: 1,
      borderRightColor: C.borderSoft,
      paddingTop: 20,
      paddingHorizontal: 12,
    },
    logoRow: { paddingHorizontal: 12, paddingBottom: 16, paddingTop: 4 },
    catItem: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8 },
    catLabel: { fontSize: 13, color: C.text2 },
    siteLabel: { fontSize: 10, fontWeight: '800', color: C.gold, letterSpacing: 2, marginTop: 6 },

    accountCard: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: C.surface2, borderRadius: 12, padding: 10, marginBottom: 14,
    },
    accountAvatar: {
      width: 34, height: 34, borderRadius: 17, backgroundColor: C.gold,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    accountAvatarText: { color: C.black, fontSize: 14, fontWeight: '800' },
    accountName: { fontSize: 13, fontWeight: '700', color: C.text },
    accountSub: { fontSize: 11, color: C.text3, marginTop: 1 },

    signInPrompt: {
      borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 14,
      backgroundColor: C.surface2,
    },
    signInPromptText: { color: C.text2, fontSize: 12.5, lineHeight: 18 },

    navList: { gap: 4 },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 10,
    },
    navItemActive: { backgroundColor: C.goldBg },
    iconWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navLabel: { fontSize: 14, fontWeight: '500', color: C.text2 },
    navLabelActive: { color: C.text, fontWeight: '600' },

    divider: { height: 0.5, backgroundColor: C.border, marginVertical: 16, marginHorizontal: 12 },
    sectionLabel: {
      fontSize: 11, fontWeight: '700', color: C.text3, letterSpacing: 1,
      paddingHorizontal: 12, marginBottom: 8,
    },
  }));
}
