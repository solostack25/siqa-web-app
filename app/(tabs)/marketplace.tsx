import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  TextInput,
  Platform,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useTheme, type AppColors } from '../../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../../constants/theme';
import { useIsDesktopWeb } from '../../components/DesktopShell';
import { Icon } from '../../components/Icon';
import { Glyph } from '../../components/Glyph';
import { useSearchContext } from '../../contexts/SearchContext';
import { formatPrice } from '../../lib/money';
import { addToCart } from '../../lib/cart';
import { AddedToCartDrawer, type AddedItem } from '../../components/AddedToCartDrawer';
import { ShopSwitcher } from '../../components/ShopSwitcher';
import { IS_MARKETPLACE_SITE } from '../../lib/site';
import { ShopTabsHeader } from '../../components/ShopTabsHeader';
import { brandStyles, font, radius, type, useDS } from '../../lib/ds';
import { guardTabSwipe } from '../../components/useTabSwipe';
import { CATEGORY_NAMES } from '../../lib/productTaxonomy';

// Mirrors types/marketplace.ts PRODUCT_CATEGORIES from the original
// Next.js marketplace app, so filters match what sellers actually pick
// from when listing a product.
export const CATEGORIES = ['All', ...CATEGORY_NAMES];

type Product = {
  id: string;
  title: string;
  price_cents: number;
  currency: string | null;
  images: string[] | null;
  category: string | null;
  inventory_count: number | null;
  is_digital: boolean | null;
  marketplace_sellers: { shop_name: string; approval_status: string } | null;
};

type Rating = { avg: number; count: number };
/** "Only N left" shows at or below this many. */
const LOW_STOCK = 5;
/** The Sponsored strip goes after this many products. */
const SPONSORED_AFTER = 4;


export default function MarketplaceScreen() {
  const { colors: C } = useTheme();
  const { c, shadow } = useDS();
  const insets = useSafeAreaInsets();
  const isDesktopWeb = useIsDesktopWeb();
  const styles = makeStyles(C);
  // Phones: once you scroll, the Products / Local row tucks away and search,
  // cart and categories stay pinned.
  const [compact, setCompact] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const params = useLocalSearchParams<{ category?: string; search?: string }>();
  const [category, setCategory] = useState(params.category || 'All');

  // Product pages link here with ?category=… (breadcrumb / category tag).
  // The tab stays mounted between visits, so follow the param when it changes.
  useEffect(() => {
    if (params.category) setCategory(params.category);
  }, [params.category]);
  const [query, setQuery] = useState(params.search || '');
  // The top bar's search on other pages sends you here with ?search=…
  useEffect(() => {
    if (params.search) setQuery(params.search);
  }, [params.search]);
  const [cartCount, setCartCount] = useState(0);
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [addingId, setAddingId] = useState<string | null>(null);
  const [added, setAdded] = useState<AddedItem | null>(null);
  const [sponsored, setSponsored] = useState<Product[]>([]);
  // Sellers get an "Add product" button right in the Shop header.
  const [isSeller, setIsSeller] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data } = await supabase.from('marketplace_sellers').select('id').eq('user_id', session.user.id).maybeSingle();
      if (alive) setIsSeller(Boolean(data));
    })();
    return () => { alive = false; };
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      loadCartCount();
    }, [category])
  );

  const { registerSearch, unregisterSearch } = useSearchContext();
  useFocusEffect(
    useCallback(() => {
      if (!isDesktopWeb) return;
      // This page's search filters the already-loaded product list
      // live as you type (see `filtered` below) — a different, real
      // behavior from the top bar's default of navigating to /browse,
      // which is exactly why this couldn't just be deleted in favor of
      // the top bar. Registering it means the top bar drives this
      // page's actual filtering instead of duplicating a second box.
      registerSearch({ placeholder: 'Search products...', value: query, onChangeText: setQuery });
      return () => unregisterSearch();
    }, [isDesktopWeb, query])
  );

  async function openAccount() {
    const { data: { session } } = await supabase.auth.getSession();
    router.push((session?.user ? '/settings' : '/(auth)/sign-in') as any);
  }

  async function loadCartCount() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setCartCount(0); return; }
    const { count } = await supabase
      .from('marketplace_cart_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id);
    setCartCount(count ?? 0);
  }

  async function load() {
    setLoading(true);
    let q = supabase
      .from('marketplace_products')
      // marketplace_sellers has its own FK back to marketplace_products
      // (featured_product_id), so there are two relationships between
      // these tables — PostgREST can't infer which one without an
      // explicit hint here, and silently 300s the whole request
      // instead of just dropping the embed. Naming the real FK
      // (marketplace_products.seller_id) resolves it.
      .select('id, title, price_cents, currency, images, category, inventory_count, is_digital, variations, marketplace_sellers!marketplace_products_seller_id_fkey!inner(shop_name, approval_status)')
      .eq('status', 'active')
      .eq('marketplace_sellers.approval_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(60);

    if (category !== 'All') q = q.eq('category', category);

    const [{ data, error }, sponsoredRows] = await Promise.all([q, loadSponsored()]);
    if (!error && data) {
      setProducts(data as any);
      const ids = [...(data as any[]).map(p => p.id), ...sponsoredRows.map(p => p.id)];
      loadRatings(ids);
      loadFavorites(ids);
    }
    setLoading(false);
  }

  // Up to two moderator-picked products for the "Sponsored" row. Queried
  // on its own so that if the is_sponsored column isn't there (migration
  // not applied yet) this just comes back empty and the row stays hidden.
  async function loadSponsored(): Promise<Product[]> {
    const { data, error } = await supabase
      .from('marketplace_products')
      .select('id, title, price_cents, currency, images, category, inventory_count, is_digital, variations, marketplace_sellers!marketplace_products_seller_id_fkey!inner(shop_name, approval_status)')
      .eq('status', 'active')
      .eq('is_sponsored', true)
      .eq('marketplace_sellers.approval_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(2);
    const rows = error || !data ? [] : (data as any as Product[]);
    setSponsored(rows);
    return rows;
  }

  async function loadFavorites(ids: string[]) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user || !ids.length) { setFavorites(new Set()); return; }
    const { data } = await supabase.from('marketplace_favorites').select('product_id').eq('user_id', session.user.id).in('product_id', ids);
    setFavorites(new Set((data ?? []).map((f: any) => f.product_id)));
  }

  async function toggleFavorite(productId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { router.push('/(auth)/sign-in' as any); return; }
    const on = favorites.has(productId);
    const flip = (add: boolean) => setFavorites(prev => {
      const next = new Set(prev);
      if (add) next.add(productId); else next.delete(productId);
      return next;
    });
    flip(!on);
    const { error } = on
      ? await supabase.from('marketplace_favorites').delete().eq('product_id', productId).eq('user_id', session.user.id)
      : await supabase.from('marketplace_favorites').insert({ product_id: productId, user_id: session.user.id });
    if (error) flip(on);
  }

  // Star rating + review count per card (reviews are public).
  async function loadRatings(ids: string[]) {
    if (ids.length === 0) { setRatings({}); return; }
    const { data } = await supabase.from('marketplace_reviews').select('product_id, rating').in('product_id', ids);
    const sums: Record<string, { total: number; count: number }> = {};
    for (const r of (data ?? []) as { product_id: string; rating: number }[]) {
      const e = (sums[r.product_id] ??= { total: 0, count: 0 });
      e.total += r.rating;
      e.count += 1;
    }
    const next: Record<string, Rating> = {};
    for (const [id, e] of Object.entries(sums)) next[id] = { avg: e.total / e.count, count: e.count };
    setRatings(next);
  }

  async function handleAddToCart(item: Product) {
    // Sizes/colors to choose: send them to the product page to pick.
    if ((item as any).variations?.attributes?.length) {
      router.push({ pathname: '/product/[id]', params: { id: item.id } } as any);
      return;
    }
    setAddingId(item.id);
    const result = await addToCart(item, 1);
    setAddingId(null);
    if (!result.ok) {
      if (result.reason === 'signed_out') router.push('/(auth)/sign-in' as any);
      else if (result.reason === 'error' && Platform.OS === 'web') window.alert("Couldn't add this to your cart. Please try again.");
      return;
    }
    loadCartCount();
    setAdded({
      id: item.id,
      title: item.title,
      price_cents: item.price_cents,
      currency: item.currency,
      image: item.images?.[0] ?? null,
      category: item.category,
    });
  }

  function moreLikeThis(item: Product) {
    if (item.category) setCategory(item.category);
  }

  // The Sponsored strip shows on the unfiltered "All" view only; those items
  // are then left out of the grid so they don't appear twice.
  const showSponsored = sponsored.length > 0 && category === 'All' && !query.trim();
  const sponsoredIds = new Set(showSponsored ? sponsored.map(p => p.id) : []);
  const filtered = (query.trim()
    ? products.filter(p => p.title.toLowerCase().includes(query.trim().toLowerCase()))
    : products
  ).filter(p => !sponsoredIds.has(p.id));

  const numColumns = isDesktopWeb ? 4 : 2;
  const colGap = isDesktopWeb ? 20 : 12;
  const cardWidth = `calc((100% - ${colGap * (numColumns - 1)}px) / ${numColumns})`;
  // Native has no calc(): percentages with the gap folded in.
  const cardWidthNative = `${(100 - (numColumns - 1) * 3.4) / numColumns}%`;

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (isDesktopWeb) return;
    const y = e.nativeEvent.contentOffset.y;
    // Two thresholds so it doesn't flicker right at the edge.
    if (!compact && y > 64) setCompact(true);
    else if (compact && y < 12) setCompact(false);
  }

  const stockState = (item: Product) => {
    if (item.is_digital) return { soldOut: false, low: null as number | null };
    const n = item.inventory_count ?? 99;
    return { soldOut: n <= 0, low: n > 0 && n <= LOW_STOCK ? n : null };
  };

  const openProduct = (id: string) => router.push({ pathname: '/product/[id]', params: { id } } as any);

  const roundAdd = (item: Product, soldOut: boolean) => (
    <Pressable
      onPress={guardTabSwipe(() => handleAddToCart(item))}
      disabled={soldOut || addingId === item.id}
      accessibilityRole="button"
      accessibilityLabel={soldOut ? `${item.title} is sold out` : `Add ${item.title} to cart`}
      hitSlop={4}
      style={({ pressed }) => [{
        width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
        backgroundColor: soldOut ? c.surfaceStrong : c.primary,
        transform: [{ scale: pressed ? 0.94 : 1 }],
      }, soldOut ? null : { boxShadow: '0px 4px 12px rgba(0,0,0,0.22)' } as any]}
    >
      {addingId === item.id
        ? <ActivityIndicator size="small" color={c.onPrimary} />
        : <Icon name="add" size={20} color={soldOut ? c.ink3 : c.onPrimary} />}
    </Pressable>
  );

  const heart = (item: Product) => {
    const on = favorites.has(item.id);
    return (
      <Pressable
        onPress={guardTabSwipe(() => toggleFavorite(item.id))}
        accessibilityRole="button"
        accessibilityLabel={on ? `Remove ${item.title} from favorites` : `Save ${item.title} to favorites`}
        hitSlop={5}
        style={({ pressed }) => [{ width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.92)', opacity: pressed ? 0.7 : 1 }, shadow('hairline')]}
      >
        <Icon name={on ? 'heart' : 'heart-outline'} size={17} color={on ? c.danger : '#111111'} />
      </Pressable>
    );
  };

  const metaLine = (item: Product) => {
    const rating = ratings[item.id];
    const shop = item.marketplace_sellers?.shop_name;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
        {rating ? (
          <>
            <Icon name="star" size={11} color={c.gold} />
            <Text style={[type.micro, { color: c.ink }]}>{rating.avg.toFixed(1)}</Text>
            {shop ? <Text style={[type.micro, font(500), { color: c.ink2 }]}>·</Text> : null}
          </>
        ) : null}
        {shop ? <Text style={[type.micro, font(500), { color: c.ink2, flexShrink: 1 }]} numberOfLines={1}>{shop}</Text> : null}
      </View>
    );
  };

  const card = (item: Product) => {
    const { soldOut, low } = stockState(item);
    return (
      <View key={item.id} style={{ width: (Platform.OS === 'web' ? cardWidth : cardWidthNative) as any, gap: 8 }}>
        <View style={styles.cardImage}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={guardTabSwipe(() => openProduct(item.id))}
            accessibilityRole="link"
            accessibilityLabel={`${item.title}, ${formatPrice(item.price_cents, item.currency)}${soldOut ? ', sold out' : ''}`}
            style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
            {...({ dataSet: { hover: 'card' } } as any)}
          >
            {item.images?.[0] ? (
              <View style={StyleSheet.absoluteFill} {...({ dataSet: { hoverMedia: '1' } } as any)}>
                <Image source={{ uri: item.images[0] }} style={[styles.cardImageInner, soldOut && { opacity: 0.55 }]} resizeMode="cover" />
              </View>
            ) : (
              <Glyph name="bag-handle-outline" style={styles.cardImageEmoji} />
            )}
          </TouchableOpacity>
          <View style={{ position: 'absolute', top: 8, right: 8 }}>{heart(item)}</View>
          <View style={{ position: 'absolute', bottom: 8, right: 8 }}>{roundAdd(item, soldOut)}</View>
          {soldOut ? (
            <View pointerEvents="none" style={{ position: 'absolute', left: 8, bottom: 8, height: 22, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: c.scrim, justifyContent: 'center' }}>
              <Text style={[type.micro, { color: '#ffffff' }]}>Sold out</Text>
            </View>
          ) : null}
        </View>
        <Pressable onPress={guardTabSwipe(() => openProduct(item.id))} style={{ gap: 2 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={[isDesktopWeb ? type.callout : type.subhead, font(500), { color: c.ink }]} numberOfLines={1}>{item.title}</Text>
          {metaLine(item)}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
            <Text style={[isDesktopWeb ? type.headline : type.callout, font(800, 'display'), { color: c.ink, fontSize: isDesktopWeb ? 18 : 17 }]}>{formatPrice(item.price_cents, item.currency)}</Text>
            {low ? <Text style={[type.micro, { color: c.danger }]}>Only {low} left</Text> : null}
          </View>
        </Pressable>
        {isDesktopWeb && item.category ? (
          <Pressable onPress={guardTabSwipe(() => moreLikeThis(item))} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
            <Text style={[type.caption, font(600), { color: c.ink }]}>More like this</Text>
            <Icon name="arrow-forward" size={13} color={c.ink} />
          </Pressable>
        ) : null}
      </View>
    );
  };

  const sponsoredCard = (item: Product) => {
    const { soldOut } = stockState(item);
    return (
      <View key={item.id} style={[{ flexDirection: 'row', gap: 12, padding: 12, borderRadius: radius.lg, backgroundColor: c.goldTint }, isDesktopWeb ? { flex: 1, minWidth: 0 } : { width: 300 }]}>
        <TouchableOpacity activeOpacity={0.85} onPress={guardTabSwipe(() => openProduct(item.id))} accessibilityRole="link" accessibilityLabel={`Sponsored: ${item.title}`}>
          <View style={{ width: isDesktopWeb ? 140 : 96, height: isDesktopWeb ? 140 : 96, borderRadius: radius.md, backgroundColor: c.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            {item.images?.[0]
              ? <Image source={{ uri: item.images[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              : <Glyph name="bag-handle-outline" style={styles.cardImageEmoji} />}
          </View>
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0, justifyContent: 'center', gap: 3 }}>
          <Text style={[type.micro, { color: c.goldInk }]}>Sponsored</Text>
          <Pressable onPress={guardTabSwipe(() => openProduct(item.id))}>
            <Text style={[type.subhead, font(600), { color: c.ink }]} numberOfLines={2}>{item.title}</Text>
          </Pressable>
          {metaLine(item)}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
            <Text style={[type.callout, font(800, 'display'), { color: c.ink, fontSize: 17 }]}>{formatPrice(item.price_cents, item.currency)}</Text>
            {roundAdd(item, soldOut)}
          </View>
        </View>
      </View>
    );
  };

  const sponsoredStrip = showSponsored ? (
    isDesktopWeb ? (
      <View style={{ flexDirection: 'row', gap: 20, marginVertical: 8 }}>
        {sponsored.map(sponsoredCard)}
        {sponsored.length === 1 ? <View style={{ flex: 1 }} /> : null}
      </View>
    ) : (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, marginVertical: 4 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
        {sponsored.map(sponsoredCard)}
      </ScrollView>
    )
  ) : null;

  const gridRow = (items: Product[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: Platform.OS === 'web' ? colGap : '3.4%', rowGap: isDesktopWeb ? 28 : 20 } as any}>
      {items.map(card)}
    </View>
  );

  const searchBox = (
    <View style={styles.searchWrap}>
      <Icon name="search-outline" size={18} color={c.ink2} />
      <TextInput
        style={[styles.searchInput, { outlineStyle: 'none' } as any]}
        placeholder="Search the marketplace"
        placeholderTextColor={c.ink3}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel="Search products"
      />
      {query ? (
        <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear search" hitSlop={8}>
          <Icon name="close-circle" size={18} color={c.ink3} />
        </Pressable>
      ) : null}
    </View>
  );

  const categoryChips = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.categories}>
      {CATEGORIES.map(cat => {
        const on = category === cat;
        return (
          <Pressable
            key={cat}
            onPress={guardTabSwipe(() => setCategory(cat))}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.catPill, on ? { backgroundColor: c.primary, borderColor: c.primary } : shadow('hairline')]}
            {...({ dataSet: on ? undefined : { hover: 'row' } } as any)}
          >
            <Text style={[type.buttonSm, font(on ? 600 : 500), { color: on ? c.onPrimary : c.ink }]}>{cat}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  // ── Header ─────────────────────────────────────────────────────────
  const mobileHeader = (
    <View style={[{ backgroundColor: c.bg, zIndex: 2 }, compact ? { boxShadow: `0px 1px 0px ${c.line}, 0px 6px 16px rgba(0,0,0,0.04)` } as any : null]}>
      {compact ? (
        <View style={{ height: Math.max(insets.top, HEADER_TOP_PADDING - 20) }} />
      ) : (
        <ShopTabsHeader active="products" cartCount={cartCount} />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: compact ? 8 : 20, paddingTop: 8, gap: 4 }}>
        <View style={{ flex: 1 }}>{searchBox}</View>
        {compact ? (
          <Pressable onPress={() => router.push('/cart' as any)} accessibilityRole="button" accessibilityLabel={cartCount ? `Cart, ${cartCount} items` : 'Cart'} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="bag-outline" size={23} color={c.ink} />
            {cartCount > 0 ? (
              <View style={{ position: 'absolute', top: 5, right: 3, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[type.micro, { fontSize: 11, lineHeight: 14, color: c.onPrimary }]}>{cartCount > 9 ? '9+' : cartCount}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>
      {categoryChips}
    </View>
  );

  const desktopHeader = (
    <View style={{ width: '100%', maxWidth: 1480, alignSelf: 'center', paddingHorizontal: 40, paddingTop: 24, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <Text style={[type.display, { color: c.ink }]} accessibilityRole="header">Marketplace</Text>
          <ShopSwitcher active="products" />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {isSeller ? (
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/listing-create' as any)} accessibilityLabel="Add a product">
              <Icon name="add" size={22} color={c.ink} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/messages' as any)} accessibilityLabel="Messages">
            <Icon name="chatbubble-outline" size={19} color={c.ink} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={{ marginHorizontal: -20 }}>{categoryChips}</View>
    </View>
  );

  const first = filtered.slice(0, SPONSORED_AFTER);
  const rest = filtered.slice(SPONSORED_AFTER);

  return (
    <View style={styles.container}>
      {isDesktopWeb ? desktopHeader : mobileHeader}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={C.gold} size="large" />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.grid, isDesktopWeb && styles.gridDesktop]}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}
          keyboardShouldPersistTaps="handled"
        >
          {filtered.length === 0 && !showSponsored ? (
            <View style={styles.empty}>
              <Glyph name="bag-handle-outline" style={styles.emptyEmoji} />
              <Text style={styles.emptyTitle}>{query.trim() ? 'No products match that' : 'No products yet'}</Text>
              <Text style={styles.emptySub}>
                {query.trim() ? 'Try a different word.' : category === 'All' ? 'Check back soon.' : 'Try a different category.'}
              </Text>
            </View>
          ) : (
            <View style={{ gap: isDesktopWeb ? 28 : 20 }}>
              {first.length ? gridRow(first) : null}
              {sponsoredStrip}
              {rest.length ? gridRow(rest) : null}
            </View>
          )}
        </ScrollView>
      )}

      <AddedToCartDrawer item={added} onClose={() => setAdded(null)} />
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create(brandStyles({
    container: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },

    iconBtn: {
      width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.surface, borderWidth: 1, borderColor: '#ecece9', position: 'relative',
    },

    searchWrap: {
      flexDirection: 'row', alignItems: 'center', gap: 10, height: 44,
      paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#f2f2f0',
    },
    searchInput: { flex: 1, minWidth: 0, color: C.text, fontSize: 15, padding: 0 },

    categories: { paddingHorizontal: 20, gap: 8, paddingTop: 10, paddingBottom: 10, alignItems: 'center' },
    catPill: {
      paddingHorizontal: 14, height: 34, flexShrink: 0, borderRadius: 999,
      backgroundColor: C.surface, borderWidth: 1, borderColor: '#ecece9',
      alignItems: 'center', justifyContent: 'center',
    },

    grid: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 100 },
    // Stop growing on very wide screens; 4 columns stay a comfortable size.
    gridDesktop: { width: '100%', maxWidth: 1480, alignSelf: 'center', paddingHorizontal: 40, paddingTop: 12 } as any,
    cardImage: {
      aspectRatio: 1, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', borderRadius: 16,
    },
    cardImageInner: { width: '100%', height: '100%' },
    cardImageEmoji: { fontSize: 32, color: C.text3, opacity: 0.6 },

    empty: { alignItems: 'center', paddingTop: 60, gap: 8, width: '100%' },
    emptyEmoji: { fontSize: 40, color: C.text3 },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: C.text2 },
    emptySub: { fontSize: 13, color: C.text3 },
  }));
}
