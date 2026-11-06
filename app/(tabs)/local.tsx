import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Image, Linking, Platform,
  useWindowDimensions,
} from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTheme, type AppColors } from '../../lib/theme';
import { HEADER_TOP_PADDING } from '../../constants/theme';
import { useIsDesktopWeb } from '../../components/DesktopShell';
import { MobileBrandBar } from '../../components/MobileBrandBar';
import { directionsUrl } from '../../lib/directions';
import { Icon } from '../../components/Icon';
import { ShopSwitcher } from '../../components/ShopSwitcher';
import { LocationPicker } from '../../components/LocationPicker';
import {
  ANYWHERE, getSavedLocation, hasAskedBefore, locateDevice, locationPermission, saveLocation, type SavedLocation,
} from '../../lib/location';
import {
  BUSINESS_CATEGORIES, categoryLabel, initialsOf, placeLine, tintFor,
  type BusinessCategory, type BusinessListing,
} from '../../lib/businessCategories';
import { brandStyles, font } from '../../lib/ds';

/**
 * Shop › Local & services. Contact-only directory: no cart or checkout.
 * Listings come from owners plus businesses Siqa listed from public
 * sources (unclaimed until the owner claims them).
 */

const PAGE = 24;
const SIDEBAR_WIDTH = 220;
const MAX_WIDTH = 1180;

type Card = Pick<BusinessListing,
  'id' | 'owner_id' | 'name' | 'category' | 'tagline' | 'city' | 'state' | 'service_area' | 'is_online' | 'is_home_based' |
  'women_owned' | 'sisters_only' | 'halal_status' | 'phone' | 'price_text' | 'logo_url' | 'cover_url' | 'status' |
  'is_claimed' | 'is_verified' | 'featured_until' | 'source' | 'address' | 'zip'> & { distance_miles?: number | null; total_count?: number };

type Flag = 'women_owned' | 'sisters_only' | 'is_online' | 'is_home_based';
const FLAGS: { key: Flag; label: string }[] = [
  { key: 'women_owned', label: 'Women-owned' },
  { key: 'sisters_only', label: 'Sisters-only service' },
  { key: 'is_online', label: 'Online or remote' },
  { key: 'is_home_based', label: 'Home-based' },
];

function escapeLike(s: string) {
  return s.replace(/[%_,()]/g, ' ').trim();
}

export default function LocalDirectoryScreen() {
  const { colors: C } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const { width: windowWidth } = useWindowDimensions();
  const pad = isDesktopWeb ? 28 : 16;
  const contentWidth = Math.min(isDesktopWeb ? windowWidth - SIDEBAR_WIDTH : windowWidth, MAX_WIDTH) - pad * 2;
  const styles = makeStyles(C, isDesktopWeb);

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState<BusinessCategory | 'all'>('all');
  // null = still working out the viewer's location on first load.
  const [loc, setLoc] = useState<SavedLocation | null>(null);
  const [locReady, setLocReady] = useState(false);
  const [flags, setFlags] = useState<Record<Flag, boolean>>({ women_owned: false, sisters_only: false, is_online: false, is_home_based: false });

  const [rows, setRows] = useState<Card[]>([]);
  const [total, setTotal] = useState(0);
  const [featured, setFeatured] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [catCounts, setCatCounts] = useState<Record<string, number>>({});
  const [myListings, setMyListings] = useState(0);
  const reqId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useFocusEffect(useCallback(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setMyListings(0); return; }
      const { count } = await supabase.from('business_listings').select('id', { count: 'exact', head: true }).eq('owner_id', session.user.id);
      setMyListings(count ?? 0);
    })();
  }, []));

  useEffect(() => {
    // Facet counts (states and categories) for published listings.
    (async () => {
      const { data } = await supabase.rpc('business_directory_facets');
      const c: Record<string, number> = {};
      ((data as { state: string | null; category: string; n: number }[]) ?? []).forEach(r => {
        c[r.category] = (c[r.category] ?? 0) + Number(r.n);
      });
      setCatCounts(c);
    })();
  }, []);

  // Work out where to search: saved choice, else the device location if the
  // viewer has allowed it (or hasn't been asked yet), else anywhere.
  useEffect(() => {
    (async () => {
      const saved = await getSavedLocation();
      if (saved && saved.mode !== 'auto') { setLoc(saved); setLocReady(true); return; }
      const perm = await locationPermission();
      const shouldAsk = perm === 'granted' || (perm === 'prompt' && !(await hasAskedBefore()));
      if (saved?.mode === 'auto' || shouldAsk) {
        if (saved?.mode === 'auto') { setLoc(saved); setLocReady(true); }   // show last known right away
        const fresh = perm === 'denied' ? null : await locateDevice(saved?.radius);
        if (fresh) { await saveLocation(fresh); setLoc(fresh); }
        else if (!saved) setLoc(ANYWHERE);
        setLocReady(true);
        return;
      }
      setLoc(saved ?? ANYWHERE);
      setLocReady(true);
    })();
  }, []);

  function rpcArgs(featuredOnly: boolean, offset: number) {
    const L = loc ?? ANYWHERE;
    const point = L.mode !== 'anywhere' && L.lat != null && L.lon != null;
    return {
      p_lat: point ? L.lat : null,
      p_lon: point ? L.lon : null,
      p_radius_miles: L.radius,
      p_city: !point && L.mode !== 'anywhere' ? L.city ?? null : null,
      p_state: !point && L.mode !== 'anywhere' ? L.state ?? null : null,
      p_zip: !point && L.mode !== 'anywhere' ? L.zip ?? null : null,
      p_query: debounced || null,
      p_category: category === 'all' ? null : category,
      p_women_owned: flags.women_owned,
      p_sisters_only: flags.sisters_only,
      p_online: flags.is_online,
      p_home_based: flags.is_home_based,
      p_featured_only: featuredOnly,
      p_limit: featuredOnly ? 4 : PAGE,
      p_offset: offset,
    };
  }

  const load = useCallback(async (append: boolean) => {
    if (!locReady) return;
    const id = ++reqId.current;
    if (append) setLoadingMore(true); else setLoading(true);
    const from = append ? rows.length : 0;
    const [listRes, featRes] = await Promise.all([
      supabase.rpc('business_directory_search', rpcArgs(false, from)),
      append ? Promise.resolve({ data: null }) : supabase.rpc('business_directory_search', rpcArgs(true, 0)),
    ]);
    if (id !== reqId.current) return;
    const list = (listRes.data as Card[]) ?? [];
    setRows(prev => (append ? [...prev, ...list] : list));
    setTotal(list.length ? Number(list[0].total_count) : (append ? total : 0));
    if (!append) setFeatured(((featRes as any).data as Card[]) ?? []);
    setLoading(false);
    setLoadingMore(false);
  }, [rows.length, total, debounced, category, flags, loc, locReady]);

  useEffect(() => { load(false); }, [debounced, category, flags, loc, locReady]);

  const cols = contentWidth >= 900 ? 3 : contentWidth >= 580 ? 2 : 1;
  const GAP = 16;
  const cardW = (contentWidth - GAP * (cols - 1)) / cols;
  const tileCols = contentWidth >= 1000 ? 6 : contentWidth >= 700 ? 4 : contentWidth >= 420 ? 3 : 2;
  const tileW = (contentWidth - 10 * (tileCols - 1)) / tileCols;
  const featCols = contentWidth >= 820 ? 2 : 1;
  const featW = (contentWidth - GAP * (featCols - 1)) / featCols;
  const located = Boolean(loc && loc.mode !== 'anywhere');
  const filtersActive = Boolean(debounced || category !== 'all' || located || Object.values(flags).some(Boolean));
  const visibleCats = useMemo(
    () => BUSINESS_CATEGORIES.filter(c => c.key !== 'other' || (catCounts.other ?? 0) > 0),
    [catCounts],
  );

  function clearAll() {
    setQuery(''); setCategory('all');
    setFlags({ women_owned: false, sisters_only: false, is_online: false, is_home_based: false });
  }

  const Tag = ({ text }: { text: string }) => <Text style={styles.tag}>{text}</Text>;

  const tagsFor = (l: Card) => [
    l.women_owned ? 'Women-owned' : null,
    l.sisters_only ? 'Sisters-only' : null,
    l.is_online ? 'Online' : null,
    l.is_home_based ? 'Home-based' : null,
    l.halal_status && l.category !== 'shops' ? l.halal_status : null,
  ].filter(Boolean) as string[];

  const openListing = (l: Card) => router.push(`/local/${l.id}` as any);

  const ListingCard = ({ l, width }: { l: Card; width: number }) => {
    const tint = tintFor(l.id);
    const tags = tagsFor(l);
    return (
      <View style={[styles.card, { width }]}>
        <TouchableOpacity activeOpacity={0.9} onPress={() => openListing(l)} accessibilityLabel={`${l.name}, ${categoryLabel(l.category)}`}>
          <View style={[styles.cover, { backgroundColor: tint }]}>
            {l.cover_url ? <Image source={{ uri: l.cover_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : (
              <Text style={styles.coverInitials}>{initialsOf(l.name)}</Text>
            )}
            {l.is_claimed ? (
              l.is_verified ? (
                <View style={styles.badge}><Icon name="checkmark" size={12} color="#14523A" /><Text style={[styles.badgeText, { color: '#14523A' }]}>Verified business</Text></View>
              ) : null
            ) : (
              <View style={styles.badge}><Text style={styles.badgeText}>Unclaimed</Text></View>
            )}
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.eyebrow}>{categoryLabel(l.category)}</Text>
            <Text style={styles.cardName} numberOfLines={2}>{l.name}</Text>
            <Text style={styles.small} numberOfLines={1}>
              {l.distance_miles != null ? `${l.distance_miles < 10 ? l.distance_miles.toFixed(1) : Math.round(l.distance_miles)} mi · ` : ''}{placeLine(l)}
            </Text>
            {l.tagline ? <Text style={styles.tagline} numberOfLines={2}>{l.tagline}</Text> : null}
            {tags.length > 0 && <View style={styles.tagRow}>{tags.map(t => <Tag key={t} text={t} />)}</View>}
            {l.price_text ? <Text style={styles.price}>{l.price_text}</Text> : null}
          </View>
        </TouchableOpacity>
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[l.is_claimed ? styles.primaryBtn : styles.ghostBtn, { flex: 1 }]}
            onPress={() => openListing(l)}
          >
            <Text style={l.is_claimed ? styles.primaryBtnText : styles.ghostBtnText}>{l.is_claimed ? 'Contact' : 'View listing'}</Text>
          </TouchableOpacity>
          {l.phone ? (
            <TouchableOpacity style={styles.iconBtn} onPress={() => Linking.openURL(`tel:${l.phone!.replace(/[^\d+]/g, '')}`)} accessibilityLabel={`Call ${l.name}`}>
              <Icon name="call-outline" size={18} color={C.text} />
            </TouchableOpacity>
          ) : null}
          {directionsUrl(l) ? (
            <TouchableOpacity style={styles.iconBtn} onPress={() => Linking.openURL(directionsUrl(l)!)} accessibilityLabel={`Directions to ${l.name}`}>
              <Icon name="navigate-outline" size={18} color={C.text} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 72 }} keyboardShouldPersistTaps="handled">
          <MobileBrandBar />
          <View style={[styles.page, { paddingHorizontal: pad }]}>
            <ShopSwitcher active="local" stretch={!isDesktopWeb} />

            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.h1}>Local businesses & services</Text>
                <Text style={styles.lede}>
                  Muslim-owned businesses, home services and teachers. Reach out to them directly. Nothing here is bought through Siqa.
                </Text>
              </View>
              <View style={styles.headerBtns}>
                {myListings > 0 && (
                  <TouchableOpacity style={styles.ghostBtn} onPress={() => router.push('/local/inbox' as any)}>
                    <Text style={styles.ghostBtnText}>Your listing{myListings > 1 ? 's' : ''}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/local/edit' as any)}>
                  <Icon name="add" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>List your business</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Search */}
            <View style={styles.searchRow}>
              <View style={styles.searchBox}>
                <Icon name="search-outline" size={18} color={C.text3} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Quran teacher, caterer, handyman, henna…"
                  placeholderTextColor={C.text3}
                  style={styles.searchInput}
                  returnKeyType="search"
                  accessibilityLabel="What do you need?"
                />
                {query.length > 0 && (
                  <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Clear search" style={{ padding: 6 }}>
                    <Icon name="close-circle" size={18} color={C.text3} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <LocationPicker value={loc} onChange={setLoc} />

            {/* Categories: tiles on desktop, one scrolling row on phones */}
            {!isDesktopWeb && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {[{ key: 'all' as const, label: 'Everything', icon: 'apps-outline' }, ...visibleCats].map(c => {
                  const on = category === c.key;
                  return (
                    <TouchableOpacity key={c.key} style={[styles.catChip, on && styles.chipOn]} onPress={() => setCategory(c.key as any)}
                      accessibilityRole="button" accessibilityState={{ selected: on }}>
                      <Icon name={c.icon as any} size={15} color={on ? C.bg : C.text2} />
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            {isDesktopWeb && <View style={[styles.tiles, { gap: 10 }]}>
              {[{ key: 'all' as const, label: 'Everything', hint: 'All categories', icon: 'apps-outline' }, ...visibleCats].map(c => {
                const on = category === c.key;
                const n = c.key === 'all' ? null : catCounts[c.key];
                return (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.tile, { width: tileW }, on && styles.tileOn]}
                    onPress={() => setCategory(c.key as any)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Icon name={c.icon as any} size={18} color={on ? C.bg : C.text2} />
                    <Text style={[styles.tileLabel, on && { color: C.bg }]} numberOfLines={2}>{c.label}</Text>
                    <Text style={[styles.tileHint, on && { color: C.bg, opacity: 0.8 }]} numberOfLines={1}>{n && !located ? `${n.toLocaleString()} listed` : c.hint}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>}

            {/* Flags */}
            <ScrollView horizontal={!isDesktopWeb} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {FLAGS.map(f => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.flag, flags[f.key] && styles.flagOn]}
                  onPress={() => setFlags(prev => ({ ...prev, [f.key]: !prev[f.key] }))}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: flags[f.key] }}
                >
                  {flags[f.key] ? <Icon name="checkmark" size={14} color={C.gold} /> : null}
                  <Text style={[styles.flagText, flags[f.key] && { color: C.gold, ...font(700) }]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Featured */}
            {featured.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.h2}>Featured</Text>
                  <Text style={styles.sponsored}>Sponsored</Text>
                </View>
                <View style={[styles.grid, { gap: GAP }]}>
                  {featured.map(l => (
                    <TouchableOpacity key={l.id} style={[styles.featCard, { width: featW }]} onPress={() => openListing(l)}>
                      <View style={[styles.featImg, { backgroundColor: tintFor(l.id) }]}>
                        {l.cover_url ? <Image source={{ uri: l.cover_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : (
                          <Text style={styles.coverInitials}>{initialsOf(l.name)}</Text>
                        )}
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                        <Text style={styles.eyebrow}>{categoryLabel(l.category)}</Text>
                        <Text style={styles.cardName} numberOfLines={2}>{l.name}</Text>
                        <Text style={styles.small} numberOfLines={1}>{placeLine(l)}</Text>
                        {l.tagline ? <Text style={styles.tagline} numberOfLines={2}>{l.tagline}</Text> : null}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Results */}
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.h2}>{category === 'all' ? (located ? 'Near you' : 'All listings') : categoryLabel(category)}</Text>
                <Text style={styles.small}>{loading ? ' ' : `${total.toLocaleString()} listing${total === 1 ? '' : 's'}${located ? ` near ${loc!.label}` : ''}`}</Text>
              </View>
              {loading ? (
                <View style={styles.center}><ActivityIndicator color={C.gold} /></View>
              ) : rows.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Icon name="storefront-outline" size={30} color={C.text3} />
                  <Text style={styles.emptyTitle}>Nothing here yet</Text>
                  <Text style={styles.small}>
                    {filtersActive ? 'Try fewer filters, or be the first to list in this category.' : 'Be the first to list your business.'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {filtersActive && (
                      <TouchableOpacity style={styles.ghostBtn} onPress={clearAll}><Text style={styles.ghostBtnText}>Clear filters</Text></TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/local/edit' as any)}><Text style={styles.primaryBtnText}>List your business</Text></TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <View style={[styles.grid, { gap: GAP }]}>
                    {rows.map(l => <ListingCard key={l.id} l={l} width={cardW} />)}
                  </View>
                  {rows.length < total && (
                    <TouchableOpacity style={[styles.ghostBtn, { alignSelf: 'center', marginTop: 8 }]} onPress={() => load(true)} disabled={loadingMore}>
                      {loadingMore ? <ActivityIndicator color={C.gold} /> : <Text style={styles.ghostBtnText}>Show more</Text>}
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>

            {/* List your business */}
            <View style={styles.cta}>
              <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 360, gap: 8 }}>
                <Text style={styles.ctaTitle}>Run a business, teach a class, or offer a service?</Text>
                <Text style={styles.ctaBody}>
                  List it on Siqa. People find you, message you on Siqa, or call you directly. You never have to sell or ship anything through Siqa.
                </Text>
              </View>
              <TouchableOpacity style={styles.ctaBtn} onPress={() => router.push('/local/edit' as any)}>
                <Text style={styles.ctaBtnText}>List your business</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
  );
}

function makeStyles(C: AppColors, desktop: boolean) {
  return StyleSheet.create(brandStyles({
    page: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', gap: 22, paddingTop: desktop ? 28 : 8 },
    center: { paddingVertical: 60, alignItems: 'center' },
    header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 },
    headerText: { flexGrow: 1, flexShrink: 1, flexBasis: desktop ? 520 : 240, gap: 8 },
    h1: { fontSize: desktop ? 34 : 26, fontWeight: '700', color: C.text, letterSpacing: -0.5 },
    lede: { fontSize: desktop ? 16 : 14, lineHeight: desktop ? 24 : 20, color: C.text2, maxWidth: 640 },
    headerBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    primaryBtn: {
      minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: C.gold,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    },
    primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    ghostBtn: {
      minHeight: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: C.border,
      backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center',
    },
    ghostBtnText: { color: C.text, fontSize: 14, fontWeight: '600' },
    iconBtn: {
      width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.border,
      alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface,
    },

    searchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    searchBox: {
      flexGrow: 3, flexShrink: 1, flexBasis: 280, minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: C.border,
      backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14,
    },
    searchInput: { flex: 1, minWidth: 0, fontSize: 15, color: C.text, paddingVertical: 10, ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}) },
    stateBtn: {
      flexGrow: 1, flexBasis: 150, minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
      flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14,
    },
    stateBtnOn: { borderColor: C.gold, backgroundColor: C.goldBg },
    stateText: { flex: 1, fontSize: 15, color: C.text },
    statePanel: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -8 },
    chip: {
      minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: C.border,
      backgroundColor: C.surface, justifyContent: 'center',
    },
    chipOn: { backgroundColor: C.text, borderColor: C.text },
    chipText: { fontSize: 13, color: C.text, fontWeight: '500' },
    chipTextOn: { color: C.bg, fontWeight: '700' },

    tiles: { flexDirection: 'row', flexWrap: 'wrap' },
    catChip: {
      minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.border,
      backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 6,
    },
    tile: {
      minHeight: desktop ? 86 : 64, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.border2,
      backgroundColor: C.surface, gap: 4, justifyContent: 'center',
    },
    tileOn: { backgroundColor: C.text, borderColor: C.text },
    tileLabel: { fontSize: 13, fontWeight: '700', color: C.text },
    tileHint: { fontSize: 12, color: C.text2 },

    chipRow: { flexDirection: 'row', flexWrap: desktop ? 'wrap' : 'nowrap', gap: 8 },
    flag: {
      minHeight: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.border,
      backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 6,
    },
    flagOn: { borderColor: C.gold, backgroundColor: C.goldBg },
    flagText: { fontSize: 13, color: C.text, fontWeight: '500' },

    section: { gap: 14 },
    sectionHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
    h2: { fontSize: desktop ? 20 : 18, fontWeight: '700', color: C.text },
    sponsored: {
      fontSize: 12, fontWeight: '700', color: C.text2, borderWidth: 1, borderColor: C.border,
      paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', marginRight: 'auto', marginLeft: 10,
    },
    small: { fontSize: 13, color: C.text2, lineHeight: 18 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },

    featCard: {
      flexDirection: 'row', gap: 14, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: C.goldSoft, backgroundColor: C.surface,
    },
    featImg: { width: desktop ? 120 : 84, borderRadius: 12, minHeight: 96, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },

    card: { borderRadius: 18, borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface, overflow: 'hidden' },
    cover: { height: desktop ? 140 : 120, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    coverInitials: { fontSize: 30, fontWeight: '800', color: 'rgba(255,255,255,0.85)' },
    badge: {
      position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: '#FFFFFF', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
    },
    badgeText: { fontSize: 12, fontWeight: '700', color: '#3A3A3A' },
    cardBody: { padding: 16, paddingBottom: 6, gap: 5 },
    eyebrow: { fontSize: 11, fontWeight: '700', color: C.goldDim, textTransform: 'uppercase', letterSpacing: 0.5 },
    cardName: { fontSize: 16, fontWeight: '700', color: C.text },
    tagline: { fontSize: 14, lineHeight: 20, color: C.text, opacity: 0.85 },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
    tag: {
      fontSize: 12, fontWeight: '600', color: C.text2, backgroundColor: C.surface2,
      paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, overflow: 'hidden',
    },
    price: { fontSize: 13, color: C.text, fontWeight: '600', marginTop: 2 },
    cardActions: { flexDirection: 'row', gap: 8, padding: 16, paddingTop: 10 },

    emptyBox: {
      alignItems: 'center', gap: 10, padding: 32, borderRadius: 18, borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface,
    },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text },

    cta: {
      flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18, padding: desktop ? 28 : 18,
      borderRadius: 22, backgroundColor: '#141414',
    },
    ctaTitle: { fontSize: desktop ? 22 : 18, fontWeight: '700', color: '#FFFFFF' },
    ctaBody: { fontSize: 14, lineHeight: 21, color: '#D6D6D2' },
    ctaBtn: { minHeight: 48, paddingHorizontal: 22, borderRadius: 999, backgroundColor: '#A8843F', alignItems: 'center', justifyContent: 'center' },
    ctaBtnText: { color: '#141414', fontSize: 15, fontWeight: '700' },
  }));
}
