import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTheme, type AppColors } from '../../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../../constants/theme';
import { useIsDesktopWeb } from '../../components/DesktopShell';
import { Icon } from '../../components/Icon';

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
  marketplace_sellers: { shop_name: string; approval_status: string } | null;
};

function formatPrice(cents: number, currency?: string | null) {
  const symbol = (currency || 'USD') === 'USD' ? '$' : (currency || '') + ' ';
  return symbol + (cents / 100).toFixed(2);
}

export default function MarketplaceScreen() {
  const { colors: C } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const styles = makeStyles(C);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [cartCount, setCartCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      load();
      loadCartCount();
    }, [category])
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
      .select('id, title, price_cents, currency, images, category, marketplace_sellers!marketplace_products_seller_id_fkey!inner(shop_name, approval_status)')
      .eq('status', 'active')
      .eq('marketplace_sellers.approval_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(60);

    if (category !== 'All') q = q.eq('category', category);

    const { data, error } = await q;
    if (!error && data) setProducts(data as any);
    setLoading(false);
  }

  const filtered = query.trim()
    ? products.filter(p => p.title.toLowerCase().includes(query.trim().toLowerCase()))
    : products;

  const numColumns = isDesktopWeb ? 4 : 2;

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
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/cart' as any)}>
            <Icon name="cart-outline" size={20} color={C.text} />
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

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
          data={filtered}
          keyExtractor={p => p.id}
          numColumns={numColumns}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: Theme.spacing.md }}
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
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.id } } as any)}
            >
              <View style={styles.cardImage}>
                {item.images?.[0] ? (
                  <Image source={{ uri: item.images[0] }} style={styles.cardImageInner} resizeMode="cover" />
                ) : (
                  <Text style={styles.cardImageEmoji}>🛍️</Text>
                )}
              </View>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.cardPrice}>{formatPrice(item.price_cents, item.currency)}</Text>
              {item.marketplace_sellers?.shop_name && (
                <Text style={styles.cardSeller} numberOfLines={1}>{item.marketplace_sellers.shop_name}</Text>
              )}
            </TouchableOpacity>
          )}
        />
      )}
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

    categoriesList: { flexGrow: 0, flexShrink: 0, height: 32 + Theme.spacing.md },
    categories: { paddingHorizontal: Theme.spacing.xl, gap: 8, paddingBottom: Theme.spacing.md, alignItems: 'center' },
    catPill: {
      paddingHorizontal: Theme.spacing.md, paddingVertical: 6, height: 32,
      borderRadius: Theme.radius.full, backgroundColor: C.surface,
      borderWidth: 0.5, borderColor: C.border2, alignItems: 'center', justifyContent: 'center',
    },
    catPillActive: { backgroundColor: C.gold, borderColor: C.gold },
    catText: { fontSize: Theme.fontSize.sm, color: C.text2 },
    catTextActive: { color: C.black, fontWeight: '700' },

    grid: { paddingHorizontal: Theme.spacing.xl, paddingBottom: 100, gap: Theme.spacing.md },
    card: {
      flex: 1, backgroundColor: C.surface, borderRadius: Theme.radius.lg,
      borderWidth: 0.5, borderColor: C.border2, overflow: 'hidden', marginBottom: Theme.spacing.md,
    },
    cardImage: {
      aspectRatio: 1, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    cardImageInner: { width: '100%', height: '100%' },
    cardImageEmoji: { fontSize: 32, opacity: 0.4 },
    cardTitle: { fontSize: 12, fontWeight: '600', color: C.text, marginTop: 8, marginHorizontal: 8, lineHeight: 16 },
    cardPrice: { fontSize: 14, fontWeight: '800', color: C.gold, marginTop: 4, marginHorizontal: 8 },
    cardSeller: { fontSize: 10, color: C.text3, marginTop: 2, marginHorizontal: 8, marginBottom: 10 },

    empty: { alignItems: 'center', paddingTop: 60, gap: 8, width: '100%' },
    emptyEmoji: { fontSize: 40 },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: C.text2 },
    emptySub: { fontSize: 13, color: C.text3 },
  });
}
