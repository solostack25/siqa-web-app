import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTheme, type AppColors } from '../../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../../constants/theme';
import { useIsDesktopWeb } from '../../components/DesktopShell';
import { Icon } from '../../components/Icon';
import { useSearchContext } from '../../contexts/SearchContext';
import { formatPrice } from '../../lib/money';
import { addToCart } from '../../lib/cart';
import { AddedToCartDrawer, type AddedItem } from '../../components/AddedToCartDrawer';

// Mirrors types/marketplace.ts PRODUCT_CATEGORIES from the original
// Next.js marketplace app, so filters match what sellers actually pick
// from when listing a product.
const CATEGORIES = [
  'All',
  'Home Decor',
  'Books & Media',
  'Clothing & Accessories',
  'Art & Prints',
  'Jewelry',
  'Digital Downloads',
  'Gifts',
  'Other',
];

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
const LIMITED_STOCK = 5;


export default function MarketplaceScreen() {
  const { colors: C } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const styles = makeStyles(C);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const params = useLocalSearchParams<{ category?: string }>();
  const [category, setCategory] = useState(params.category || 'All');

  // Product pages link here with ?category=… (breadcrumb / category tag).
  // The tab stays mounted between visits, so follow the param when it changes.
  useEffect(() => {
    if (params.category) setCategory(params.category);
  }, [params.category]);
  const [query, setQuery] = useState('');
  const [cartCount, setCartCount] = useState(0);
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [addingId, setAddingId] = useState<string | null>(null);
  const [added, setAdded] = useState<AddedItem | null>(null);
  const [sponsored, setSponsored] = useState<Product[]>([]);

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
      .select('id, title, price_cents, currency, images, category, inventory_count, is_digital, marketplace_sellers!marketplace_products_seller_id_fkey!inner(shop_name, approval_status)')
      .eq('status', 'active')
      .eq('marketplace_sellers.approval_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(60);

    if (category !== 'All') q = q.eq('category', category);

    const [{ data, error }, sponsoredRows] = await Promise.all([q, loadSponsored()]);
    if (!error && data) {
      setProducts(data as any);
      loadRatings([...(data as any[]).map(p => p.id), ...sponsoredRows.map(p => p.id)]);
    }
    setLoading(false);
  }

  // Up to two moderator-picked products for the "Sponsored" row. Queried
  // on its own so that if the is_sponsored column isn't there (migration
  // not applied yet) this just comes back empty and the row stays hidden.
  async function loadSponsored(): Promise<Product[]> {
    const { data, error } = await supabase
      .from('marketplace_products')
      .select('id, title, price_cents, currency, images, category, inventory_count, is_digital, marketplace_sellers!marketplace_products_seller_id_fkey!inner(shop_name, approval_status)')
      .eq('status', 'active')
      .eq('is_sponsored', true)
      .eq('marketplace_sellers.approval_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(2);
    const rows = error || !data ? [] : (data as any as Product[]);
    setSponsored(rows);
    return rows;
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

  // The Sponsored row shows on the unfiltered "All" view only; those items
  // are then left out of the grid below so they don't appear twice.
  const showSponsored = sponsored.length > 0 && category === 'All' && !query.trim();
  const sponsoredIds = new Set(showSponsored ? sponsored.map(p => p.id) : []);
  const filtered = (query.trim()
    ? products.filter(p => p.title.toLowerCase().includes(query.trim().toLowerCase()))
    : products
  ).filter(p => !sponsoredIds.has(p.id));

  const numColumns = isDesktopWeb ? 4 : 2;
  // Pad the last row with empty slots so a short final row keeps normal
  // card widths instead of stretching (cards are flex: 1 in each row).
  const remainder = filtered.length % numColumns;
  const gridData: (Product | null)[] =
    remainder === 0 ? filtered : [...filtered, ...Array<null>(numColumns - remainder).fill(null)];

  const sponsoredRow = (
    <View style={styles.sponsoredWrap}>
      <View style={styles.sponsoredHead}>
        <Text style={styles.sponsoredLabel}>Sponsored</Text>
        <Text style={styles.sponsoredHint}>Highlighted shops on Siqa</Text>
      </View>
      <View style={[styles.sponsoredRow, !isDesktopWeb && { flexDirection: 'column' }]}>
        {sponsored.map(item => {
          const rating = ratings[item.id];
          const soldOut = !item.is_digital && (item.inventory_count ?? 1) <= 0;
          return (
            <View key={item.id} style={[styles.sponsoredCard, isDesktopWeb && styles.sponsoredCardDesktop]}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.id } } as any)}
              >
                <View style={[styles.sponsoredImage, isDesktopWeb ? styles.sponsoredImageDesktop : styles.sponsoredImagePhone]}>
                  {item.images?.[0] ? (
                    <Image source={{ uri: item.images[0] }} style={styles.cardImageInner} resizeMode="cover" />
                  ) : (
                    <Text style={styles.cardImageEmoji}>🛍️</Text>
                  )}
                </View>
              </TouchableOpacity>
              <View style={styles.sponsoredInfo}>
                <View style={styles.sponsoredChip}>
                  <Icon name="sparkles" size={11} color={C.gold} />
                  <Text style={styles.sponsoredChipText}>Sponsored</Text>
                </View>
                <TouchableOpacity onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.id } } as any)}>
                  <Text style={styles.sponsoredTitle} numberOfLines={2}>{item.title}</Text>
                </TouchableOpacity>
                <View style={styles.metaRow}>
                  {rating && (
                    <>
                      <Text style={styles.metaStrong}>{rating.avg.toFixed(1)}</Text>
                      <Icon name="star" size={12} color={C.text} />
                      <Text style={styles.metaText}>({rating.count})</Text>
                      {item.marketplace_sellers?.shop_name ? <Text style={styles.metaText}>·</Text> : null}
                    </>
                  )}
                  {item.marketplace_sellers?.shop_name ? (
                    <Text style={styles.metaText} numberOfLines={1}>By {item.marketplace_sellers.shop_name}</Text>
                  ) : null}
                </View>
                <Text style={styles.sponsoredPrice}>{formatPrice(item.price_cents, item.currency)}</Text>
                <TouchableOpacity
                  style={[styles.addBtn, { alignSelf: 'flex-start', marginTop: 10 }, (soldOut || addingId === item.id) && { opacity: 0.5 }]}
                  onPress={() => handleAddToCart(item)}
                  disabled={soldOut || addingId === item.id}
                  accessibilityLabel={`Add ${item.title} to cart`}
                >
                  {addingId === item.id ? (
                    <ActivityIndicator size="small" color={C.text} />
                  ) : (
                    <>
                      <Icon name="add" size={16} color={C.text} />
                      <Text style={styles.addBtnText}>{soldOut ? 'Sold out' : 'Add to cart'}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
        {/* Keep a lone sponsored card at half width on desktop. */}
        {isDesktopWeb && sponsored.length === 1 && <View style={{ flex: 1 }} />}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Marketplace</Text>
          <Text style={styles.headerSub}>Support Muslim-owned shops</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/messages' as any)}>
            <Icon name="chatbubble-outline" size={19} color={C.text} />
          </TouchableOpacity>
          {/* The global DesktopTopBar already has a cart icon with a live
              count, visible on every page — this page-level one was
              built before that existed and is now a literal duplicate
              on desktop. Mobile has no top bar at all, so it still
              needs this as its only way to reach the cart from here. */}
          {!isDesktopWeb && (
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/cart' as any)}>
              <Icon name="cart-outline" size={20} color={C.text} />
              {cartCount > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {!isDesktopWeb && (
        <View style={styles.searchWrap}>
          <Icon name="search-outline" size={16} color={C.text3} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products..."
            placeholderTextColor={C.text3}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
        </View>
      )}

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesList}
        contentContainerStyle={styles.categories}
        data={CATEGORIES}
        keyExtractor={c => c}
        renderItem={({ item: cat }) => (
          <TouchableOpacity
            style={[styles.catPill, category === cat && styles.catPillActive]}
            onPress={() => setCategory(cat)}
          >
            <Text style={[styles.catText, category === cat && styles.catTextActive]}>{cat}</Text>
          </TouchableOpacity>
        )}
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={C.gold} size="large" />
        </View>
      ) : (
        <FlatList
          key={numColumns}
          data={gridData}
          keyExtractor={(p, i) => p?.id ?? `filler-${i}`}
          numColumns={numColumns}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: Theme.spacing.md }}
          ListHeaderComponent={showSponsored ? sponsoredRow : null}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🛍️</Text>
              <Text style={styles.emptyTitle}>No products yet</Text>
              <Text style={styles.emptySub}>
                {category === 'All' ? 'Check back soon.' : 'Try a different category.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            if (!item) return <View style={styles.card} />;
            const rating = ratings[item.id];
            const soldOut = !item.is_digital && (item.inventory_count ?? 1) <= 0;
            const limited = !item.is_digital && !soldOut && (item.inventory_count ?? 99) <= LIMITED_STOCK;
            const openProduct = () => router.push({ pathname: '/product/[id]', params: { id: item.id } } as any);
            return (
              <View style={styles.card}>
                <TouchableOpacity activeOpacity={0.85} onPress={openProduct}>
                  <View style={styles.cardImage}>
                    {item.images?.[0] ? (
                      <Image source={{ uri: item.images[0] }} style={styles.cardImageInner} resizeMode="cover" />
                    ) : (
                      <Text style={styles.cardImageEmoji}>🛍️</Text>
                    )}
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                  <View style={styles.metaRow}>
                    {rating && (
                      <>
                        <Text style={styles.metaStrong}>{rating.avg.toFixed(1)}</Text>
                        <Icon name="star" size={12} color={C.text} />
                        <Text style={styles.metaText}>({rating.count})</Text>
                        {item.marketplace_sellers?.shop_name ? <Text style={styles.metaText}>·</Text> : null}
                      </>
                    )}
                    {item.marketplace_sellers?.shop_name ? (
                      <Text style={styles.metaText} numberOfLines={1}>By {item.marketplace_sellers.shop_name}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.cardPrice}>{formatPrice(item.price_cents, item.currency)}</Text>
                  {soldOut ? (
                    <Text style={styles.stockText}>Sold out</Text>
                  ) : limited ? (
                    <Text style={styles.stockText}>Limited stock</Text>
                  ) : null}
                </TouchableOpacity>

                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={[styles.addBtn, (soldOut || addingId === item.id) && { opacity: 0.5 }]}
                    onPress={() => handleAddToCart(item)}
                    disabled={soldOut || addingId === item.id}
                    accessibilityLabel={`Add ${item.title} to cart`}
                  >
                    {addingId === item.id ? (
                      <ActivityIndicator size="small" color={C.text} />
                    ) : (
                      <>
                        <Icon name="add" size={16} color={C.text} />
                        <Text style={styles.addBtnText}>{isDesktopWeb ? 'Add to cart' : 'Add'}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {isDesktopWeb && item.category && (
                    <TouchableOpacity style={styles.moreBtn} onPress={() => moreLikeThis(item)}>
                      <Text style={styles.moreBtnText}>More like this</Text>
                      <Icon name="arrow-forward" size={14} color={C.text} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}

      <AddedToCartDrawer item={added} onClose={() => setAdded(null)} />
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Theme.spacing.xl, paddingTop: HEADER_TOP_PADDING, paddingBottom: Theme.spacing.md,
    },
    headerTitle: { fontSize: Theme.fontSize.xxl, fontWeight: '700', color: C.text },
    headerSub: { fontSize: Theme.fontSize.xs, color: C.text3, marginTop: 2 },
    iconBtn: {
      width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2, position: 'relative',
    },
    cartBadge: {
      position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9,
      backgroundColor: C.live, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    },
    cartBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

    searchWrap: {
      flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.sm,
      marginHorizontal: Theme.spacing.xl, marginBottom: Theme.spacing.md,
      paddingHorizontal: Theme.spacing.md, paddingVertical: 9,
      borderRadius: Theme.radius.full, backgroundColor: C.surface,
      borderWidth: 0.5, borderColor: C.border,
    },
    searchInput: { flex: 1, color: C.text, fontSize: Theme.fontSize.base, padding: 0 },

    categoriesList: { flexGrow: 0, flexShrink: 0, minHeight: 32 + Theme.spacing.md },
    categories: { paddingHorizontal: Theme.spacing.xl, gap: 8, paddingBottom: Theme.spacing.md, alignItems: 'center' },
    catPill: {
      paddingHorizontal: Theme.spacing.md, paddingVertical: 7, minHeight: 32, flexShrink: 0,
      borderRadius: Theme.radius.full, backgroundColor: C.surface,
      borderWidth: 0.5, borderColor: C.border2, alignItems: 'center', justifyContent: 'center',
    },
    catPillActive: { backgroundColor: C.gold, borderColor: C.gold },
    catText: { fontSize: Theme.fontSize.sm, color: C.text2 },
    catTextActive: { color: C.black, fontWeight: '700' },

    grid: { paddingHorizontal: Theme.spacing.xl, paddingBottom: 100, gap: Theme.spacing.md },
    // Etsy-style card: borderless, photo on top, then title, rating · shop,
    // price, stock note, and the Add to cart / More like this actions.
    card: { flex: 1, marginBottom: Theme.spacing.lg, minWidth: 0 },
    cardImage: {
      aspectRatio: 1, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', borderRadius: Theme.radius.lg,
    },
    cardImageInner: { width: '100%', height: '100%' },
    cardImageEmoji: { fontSize: 32, opacity: 0.4 },
    cardTitle: { fontSize: 14, color: C.text, marginTop: 8, lineHeight: 19 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, flexWrap: 'nowrap', overflow: 'hidden' },
    metaStrong: { fontSize: 12, fontWeight: '700', color: C.text },
    metaText: { fontSize: 12, color: C.text3, flexShrink: 1 },
    cardPrice: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 5 },
    stockText: { fontSize: 12, fontWeight: '600', color: C.live, marginTop: 2 },
    cardActions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10, flexWrap: 'wrap' },
    addBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
      paddingHorizontal: 14, height: 36, minWidth: 80, borderRadius: 999, borderWidth: 1.5, borderColor: C.text,
    },
    addBtnText: { fontSize: 13, fontWeight: '700', color: C.text },
    moreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    moreBtnText: { fontSize: 13, fontWeight: '700', color: C.text },

    // Sponsored row: two larger, gold-outlined cards above the grid.
    sponsoredWrap: { marginBottom: Theme.spacing.xl },
    sponsoredHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: Theme.spacing.md },
    sponsoredLabel: { fontSize: 16, fontWeight: '800', color: C.text },
    sponsoredHint: { fontSize: 12, color: C.text3 },
    sponsoredRow: { flexDirection: 'row', gap: Theme.spacing.lg },
    sponsoredCard: {
      flexDirection: 'row', gap: Theme.spacing.lg, padding: Theme.spacing.md,
      borderRadius: Theme.radius.lg, borderWidth: 1.5, borderColor: C.goldDim, backgroundColor: C.goldBg,
    },
    sponsoredCardDesktop: { flex: 1, minWidth: 0, padding: Theme.spacing.lg },
    sponsoredImage: {
      backgroundColor: C.surface2, borderRadius: Theme.radius.md, overflow: 'hidden',
      alignItems: 'center', justifyContent: 'center',
    },
    sponsoredImageDesktop: { width: 220, height: 220 },
    sponsoredImagePhone: { width: 120, height: 120 },
    sponsoredInfo: { flex: 1, minWidth: 0, justifyContent: 'center' },
    sponsoredChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: C.bg, marginBottom: 8,
    },
    sponsoredChipText: { fontSize: 11, fontWeight: '700', color: C.gold },
    sponsoredTitle: { fontSize: 17, fontWeight: '600', color: C.text, lineHeight: 23 },
    sponsoredPrice: { fontSize: 20, fontWeight: '800', color: C.text, marginTop: 6 },

    empty: { alignItems: 'center', paddingTop: 60, gap: 8, width: '100%' },
    emptyEmoji: { fontSize: 40 },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: C.text2 },
    emptySub: { fontSize: 13, color: C.text3 },
  });
}
