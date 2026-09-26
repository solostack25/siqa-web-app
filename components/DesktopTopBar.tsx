import { View, Text, StyleSheet, TouchableOpacity, TextInput, Image } from 'react-native';
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { Icon } from './Icon';
import { useSearchContext } from '../contexts/SearchContext';

// The desktop sidebar had no top-level search, notifications, or
// account access anywhere — search only existed buried inside
// individual tabs (Marketplace's own box, Orgs' own box), and there
// was no single place to reach Settings, Cart, or Sign Out except
// drilling into Settings from inside a tab. This is the persistent
// header every other major web app has for exactly that reason.
export function DesktopTopBar() {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  const { registration } = useSearchContext();

  // Fallback state/behavior for whenever no screen has registered its
  // own search (nothing focused that has one, or on a detail page) —
  // same as before: type, hit enter, land on /browse's general search.
  const [query, setQuery] = useState('');
  const [cartCount, setCartCount] = useState(0);
  const [profile, setProfile] = useState<{ full_name: string | null; avatar_url: string | null; role: string | null } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isSeller, setIsSeller] = useState(false);
  const [speaker, setSpeaker] = useState<{ id: string } | null>(null);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setProfile(null); setCartCount(0); setSpeaker(null); setIsSeller(false); return; }

    const [{ data: profileData }, { count }, { data: sellerData }, { data: speakerData }] = await Promise.all([
      supabase.from('profiles').select('full_name, avatar_url, role').eq('id', session.user.id).maybeSingle(),
      supabase.from('marketplace_cart_items').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id),
      supabase.from('marketplace_sellers').select('id').eq('user_id', session.user.id).maybeSingle(),
      supabase.from('speakers').select('id').eq('profile_id', session.user.id).maybeSingle(),
    ]);
    if (profileData) setProfile(profileData);
    setCartCount(count ?? 0);
    setIsSeller(Boolean(sellerData));
    setSpeaker(speakerData ?? null);
  }

  function isAdminRole(role?: string | null) {
    return ['admin', 'owner', 'moderator', 'super_admin'].includes(String(role || '').toLowerCase());
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setMenuOpen(false);
    router.replace('/(auth)/sign-in' as any);
  }

  function submitSearch() {
    if (!query.trim()) return;
    setMenuOpen(false);
    router.push({ pathname: '/browse', params: { search: query.trim() } } as any);
  }

  function goTo(path: string) {
    setMenuOpen(false);
    router.push(path as any);
  }

  const initial = (profile?.full_name || '?').charAt(0).toUpperCase();

  return (
    <View style={styles.bar}>
      <View style={styles.searchWrap}>
        <Icon name="search-outline" size={16} color={C.text3} />
        <TextInput
          style={styles.searchInput}
          value={registration ? registration.value : query}
          onChangeText={registration ? registration.onChangeText : setQuery}
          onSubmitEditing={registration ? registration.onSubmit : submitSearch}
          placeholder={registration ? registration.placeholder : 'Search Siqa...'}
          placeholderTextColor={C.text3}
          returnKeyType="search"
        />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => goTo('/cart')}>
          <Icon name="cart-outline" size={19} color={C.text} />
          {cartCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        {profile ? (
          <View style={{ position: 'relative' }}>
            <TouchableOpacity style={styles.avatarBtn} onPress={() => setMenuOpen(v => !v)}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <Text style={styles.avatarText}>{initial}</Text>
              )}
            </TouchableOpacity>

            {menuOpen && (
                <View style={styles.menu}>
                  <TouchableOpacity style={styles.menuItem} onPress={() => goTo('/settings')}>
                    <Icon name="settings-outline" size={16} color={C.text2} />
                    <Text style={styles.menuItemText}>Settings</Text>
                  </TouchableOpacity>
                  {speaker && (
                    <TouchableOpacity style={styles.menuItem} onPress={() => goTo(`/speaker/${speaker.id}`)}>
                      <Icon name="person-circle-outline" size={16} color={C.text2} />
                      <Text style={styles.menuItemText}>My Public Profile</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.menuItem} onPress={() => goTo('/orders')}>
                    <Icon name="receipt-outline" size={16} color={C.text2} />
                    <Text style={styles.menuItemText}>My Orders</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuItem} onPress={() => goTo('/messages')}>
                    <Icon name="chatbubble-outline" size={16} color={C.text2} />
                    <Text style={styles.menuItemText}>Messages</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuItem} onPress={() => goTo(isSeller ? '/seller-dashboard' : '/sell')}>
                    <Icon name="storefront-outline" size={16} color={C.text2} />
                    <Text style={styles.menuItemText}>{isSeller ? 'Seller Dashboard' : 'Sell on Siqa'}</Text>
                  </TouchableOpacity>
                  {profile && isAdminRole(profile.role) && (
                    <TouchableOpacity style={styles.menuItem} onPress={() => goTo('/admin')}>
                      <Icon name="shield-checkmark-outline" size={16} color={C.text2} />
                      <Text style={styles.menuItemText}>Admin</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={handleSignOut}>
                    <Icon name="log-out-outline" size={16} color="#e84545" />
                    <Text style={[styles.menuItemText, { color: '#e84545' }]}>Sign Out</Text>
                  </TouchableOpacity>
                </View>
            )}
          </View>
        ) : (
          <TouchableOpacity style={styles.signInBtn} onPress={() => goTo('/(auth)/sign-in')}>
            <Text style={styles.signInBtnText}>Sign In</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    bar: {
      height: 64,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      gap: 16,
      backgroundColor: C.bg,
      borderBottomWidth: 0.5,
      borderBottomColor: C.border2,
      // z-index only has any effect on a positioned element, and only
      // stacks against siblings that share the same stacking context.
      // The dropdown menu below is position:absolute with its own
      // z-index, but that was being compared against the page content
      // area (a later, normal-flow sibling of this bar) rather than
      // reliably painting above it. Making the bar itself positioned
      // and elevated gives everything inside it — including the
      // dropdown — a stacking context that sits above the content
      // below, regardless of DOM order.
      position: 'relative',
      zIndex: 100,
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: C.surface2,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 9,
      maxWidth: 480,
      flex: 1,
      borderWidth: 0.5,
      borderColor: C.border,
    },
    searchInput: { flex: 1, color: C.text, fontSize: 14, padding: 0 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconBtn: {
      width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.surface2, position: 'relative',
    },
    badge: {
      position: 'absolute', top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 9,
      backgroundColor: C.live, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    },
    badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
    avatarBtn: {
      width: 38, height: 38, borderRadius: 19, backgroundColor: C.gold,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    avatarText: { color: C.black, fontSize: 15, fontWeight: '800' },
    signInBtn: { backgroundColor: C.gold, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
    signInBtnText: { color: C.black, fontSize: 13, fontWeight: '800' },
    menu: {
      position: 'absolute', top: 46, right: 0, width: 210, backgroundColor: C.surface,
      borderRadius: 14, borderWidth: 0.5, borderColor: C.border2, paddingVertical: 6,
      zIndex: 50, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
    },
    menuItem: {
      flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11,
      borderBottomWidth: 0.5, borderBottomColor: C.border2,
    },
    menuItemText: { fontSize: 13, color: C.text, fontWeight: '600' },
  });
}
