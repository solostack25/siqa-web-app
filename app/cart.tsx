import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useTheme, type AppColors } from '../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../constants/theme';
import { DesktopShell, useIsDesktopWeb } from '../components/DesktopShell';
import { Icon } from '../components/Icon';
import { formatPrice } from '../lib/money';
import { addToCart, notifyCartChanged } from '../lib/cart';

// Cart laid out like Etsy's: one card per shop (shop avatar, name and star
// rating), each item with its photo, title, price on the right, quantity,
// and Save for later / Remove. "Save for later" moves the item to the
// buyer's favorites, which are listed underneath with a Move to cart link.

type Shop = { id: string; shop_name: string; avatar_url: string | null };
type Product = {
  id: string;
  title: string;
  price_cents: number;
  currency: string | null;
  images: string[] | null;
  inventory_count: number;
  is_digital: boolean;
  status: string;
  category: string | null;
  seller_id: string;
  marketplace_sellers: Shop | null;
};
type CartItem = { id: string; quantity: number; product_id: string; marketplace_products: Product | null };
type SavedItem = { id: string; product_id: string; marketplace_products: Product | null };
type ShopRating = { avg: number; count: number };

const PRODUCT_FIELDS =
  'id, title, price_cents, currency, images, inventory_count, is_digital, status, category, seller_id, ' +
  'marketplace_sellers!marketplace_products_seller_id_fkey(id, shop_name, avatar_url)';

export default function CartScreen() {
  const { colors: C } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const styles = makeStyles(C);

  const [items, setItems] = useState<CartItem[]>([]);
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [shopRatings, setShopRatings] = useState<Record<string, ShopRating>>({});
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setSignedIn(false);
      setLoading(false);
      return;
    }
    setSignedIn(true);

    const [{ data: cartData }, { data: savedData }] = await Promise.all([
      supabase
        .from('marketplace_cart_items')
        .select(`id, quantity, product_id, marketplace_products(${PRODUCT_FIELDS})`)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('marketplace_favorites')
        .select(`id, product_id, marketplace_products(${PRODUCT_FIELDS})`)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false }),
    ]);

    const cart = (cartData as any as CartItem[]) ?? [];
    setItems(cart);
    // Favorites already in the cart don't need to show twice.
    const inCart = new Set(cart.map(i => i.product_id));
    setSaved(((savedData as any as SavedItem[]) ?? []).filter(s => s.marketplace_products?.status === 'active' && !inCart.has(s.product_id)));
    setLoading(false);
    loadShopRatings(cart);
  }

  // Shop-wide star rating for each shop in the cart, like Etsy's shop headers.
  async function loadShopRatings(cart: CartItem[]) {
    const sellerIds = [...new Set(cart.map(i => i.marketplace_products?.seller_id).filter(Boolean))] as string[];
    if (sellerIds.length === 0) { setShopRatings({}); return; }
    const { data: shopProducts } = await supabase
      .from('marketplace_products')
      .select('id, seller_id')
      .in('seller_id', sellerIds);
    const sellerOf: Record<string, string> = {};
    for (const p of (shopProducts ?? []) as { id: string; seller_id: string }[]) sellerOf[p.id] = p.seller_id;
    const ids = Object.keys(sellerOf);
    if (ids.length === 0) { setShopRatings({}); return; }
    const { data: reviews } = await supabase.from('marketplace_reviews').select('product_id, rating').in('product_id', ids);
    const sums: Record<string, { total: number; count: number }> = {};
    for (const r of (reviews ?? []) as { product_id: string; rating: number }[]) {
      const sid = sellerOf[r.product_id];
      if (!sid) continue;
      const e = (sums[sid] ??= { total: 0, count: 0 });
      e.total += r.rating;
      e.count += 1;
    }
    const next: Record<string, ShopRating> = {};
    for (const [sid, e] of Object.entries(sums)) next[sid] = { avg: e.total / e.count, count: e.count };
    setShopRatings(next);
  }

  async function updateQuantity(itemId: string, next: number, max: number) {
    if (next < 1) return removeItem(itemId);
    if (next > max) return;
    setBusyId(itemId);
    await supabase.from('marketplace_cart_items').update({ quantity: next }).eq('id', itemId);
    setItems(prev => prev.map(i => (i.id === itemId ? { ...i, quantity: next } : i)));
    setBusyId(null);
  }

  async function removeItem(itemId: string) {
    setBusyId(itemId);
    await supabase.from('marketplace_cart_items').delete().eq('id', itemId);
    setItems(prev => prev.filter(i => i.id !== itemId));
    setBusyId(null);
    notifyCartChanged();
  }

  // Save for later = move from cart to favorites.
  async function saveForLater(item: CartItem) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user || !item.marketplace_products) return;
    setBusyId(item.id);
    const { data: existing } = await supabase
      .from('marketplace_favorites')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('product_id', item.product_id)
      .maybeSingle();
    let favId = existing?.id as string | undefined;
    if (!favId) {
      const { data: inserted } = await supabase
        .from('marketplace_favorites')
        .insert({ user_id: session.user.id, product_id: item.product_id })
        .select('id')
        .single();
      favId = inserted?.id;
    }
    await supabase.from('marketplace_cart_items').delete().eq('id', item.id);
    setItems(prev => prev.filter(i => i.id !== item.id));
    if (favId) setSaved(prev => [{ id: favId!, product_id: item.product_id, marketplace_products: item.marketplace_products }, ...prev]);
    setBusyId(null);
    notifyCartChanged();
  }

  async function moveToCart(entry: SavedItem) {
    if (!entry.marketplace_products) return;
    setBusyId(entry.id);
    const result = await addToCart(entry.marketplace_products, 1);
    if (result.ok) {
      await supabase.from('marketplace_favorites').delete().eq('id', entry.id);
      setSaved(prev => prev.filter(s => s.id !== entry.id));
      await load();
    }
    setBusyId(null);
  }

  const validItems = items.filter(i => i.marketplace_products && i.marketplace_products.status === 'active');
  const itemCount = validItems.reduce((n, i) => n + i.quantity, 0);
  const subtotal = validItems.reduce((sum, i) => sum + (i.marketplace_products?.price_cents ?? 0) * i.quantity, 0);

  // Group items by shop, keeping the order shops first appear in.
  const groups: { shop: Shop; items: CartItem[] }[] = [];
  for (const item of validItems) {
    const p = item.marketplace_products!;
    const shop = p.marketplace_sellers ?? { id: p.seller_id, shop_name: 'Shop', avatar_url: null };
    let g = groups.find(x => x.shop.id === shop.id);
    if (!g) { g = { shop, items: [] }; groups.push(g); }
    g.items.push(item);
  }

  function openProduct(id: string) {
    router.push({ pathname: '/product/[id]', params: { id } } as any);
  }

  if (loading) {
    return (
      <DesktopShell>
        <View style={styles.centered}>
          <ActivityIndicator color={C.gold} size="large" />
        </View>
      </DesktopShell>
    );
  }

  const imgSize = isDesktopWeb ? 140 : 88;

  const shopCards = groups.map(({ shop, items: shopItems }) => {
    const rating = shopRatings[shop.id];
    return (
      <View key={shop.id} style={styles.shopCard}>
        <View style={styles.shopHead}>
          <View style={styles.shopAvatar}>
            {shop.avatar_url ? (
              <Image source={{ uri: shop.avatar_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <Text style={styles.shopAvatarText}>{shop.shop_name.charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <Text style={styles.shopName} numberOfLines={1}>{shop.shop_name}</Text>
          {rating && (
            <View style={styles.shopRating}>
              <Icon name="star" size={14} color={C.gold} />
              <Text style={styles.shopRatingText}>{rating.avg.toFixed(1)}</Text>
              <Text style={styles.shopRatingCount}>({rating.count})</Text>
            </View>
          )}
        </View>

        {shopItems.map((item, idx) => {
          const p = item.marketplace_products!;
          const busy = busyId === item.id;
          const max = p.is_digital ? 99 : p.inventory_count;
          return (
            <View key={item.id} style={[styles.itemRow, idx > 0 && styles.itemDivider, busy && { opacity: 0.6 }]}>
              <TouchableOpacity onPress={() => openProduct(p.id)}>
                <View style={[styles.itemImage, { width: imgSize, height: imgSize }]}>
                  {p.images?.[0] ? (
                    <Image source={{ uri: p.images[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : (
                    <Text style={{ fontSize: 24, opacity: 0.4 }}>🛍️</Text>
                  )}
                </View>
              </TouchableOpacity>

              <View style={styles.itemMain}>
                <View style={styles.itemTop}>
                  <TouchableOpacity style={{ flex: 1, minWidth: 0 }} onPress={() => openProduct(p.id)}>
                    <Text style={styles.itemTitle} numberOfLines={2}>{p.title}</Text>
                  </TouchableOpacity>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.itemPrice}>{formatPrice(p.price_cents * item.quantity, p.currency)}</Text>
                    {item.quantity > 1 && (
                      <Text style={styles.itemEach}>{formatPrice(p.price_cents, p.currency)} each</Text>
                    )}
                  </View>
                </View>

                {!p.is_digital && p.inventory_count <= 5 && (
                  <Text style={styles.stockNote}>Only {p.inventory_count} left</Text>
                )}
                {p.is_digital && <Text style={styles.itemNote}>Digital download</Text>}

                <View style={styles.qtyRow}>
                  <View style={styles.qtyStepper}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => updateQuantity(item.id, item.quantity - 1, max)}
                      disabled={busy}
                      accessibilityLabel="Decrease quantity"
                    >
                      <Icon name={item.quantity <= 1 ? 'trash-outline' : 'remove'} size={15} color={C.text} />
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{item.quantity}</Text>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => updateQuantity(item.id, item.quantity + 1, max)}
                      disabled={busy || item.quantity >= max}
                      accessibilityLabel="Increase quantity"
                    >
                      <Icon name="add" size={15} color={item.quantity >= max ? C.text3 : C.text} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.linkRow}>
                  <TouchableOpacity onPress={() => saveForLater(item)} disabled={busy}>
                    <Text style={styles.linkText}>Save for later</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeItem(item.id)} disabled={busy}>
                    <Text style={styles.linkText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    );
  });

  const savedSection = saved.length > 0 ? (
    <View style={{ marginTop: 28 }}>
      <Text style={styles.sectionTitle}>Saved for later ({saved.length})</Text>
      <View style={styles.shopCard}>
        {saved.map((entry, idx) => {
          const p = entry.marketplace_products!;
          return (
            <View key={entry.id} style={[styles.savedRow, idx > 0 && styles.itemDivider, busyId === entry.id && { opacity: 0.6 }]}>
              <TouchableOpacity onPress={() => openProduct(p.id)}>
                <View style={[styles.itemImage, { width: 64, height: 64 }]}>
                  {p.images?.[0] ? (
                    <Image source={{ uri: p.images[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : (
                    <Text style={{ fontSize: 18, opacity: 0.4 }}>🛍️</Text>
                  )}
                </View>
              </TouchableOpacity>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.savedTitle} numberOfLines={1}>{p.title}</Text>
                <Text style={styles.savedPrice}>{formatPrice(p.price_cents, p.currency)}</Text>
              </View>
              <TouchableOpacity style={styles.moveBtn} onPress={() => moveToCart(entry)} disabled={busyId === entry.id}>
                <Text style={styles.moveBtnText}>Move to cart</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  ) : null;

  const notes = (
    <View style={styles.notes}>
      <View style={styles.noteRow}>
        <Icon name="storefront-outline" size={18} color={C.text2} />
        <Text style={styles.noteText}>Every order on Siqa goes directly to a Muslim-owned shop.</Text>
      </View>
      <View style={styles.noteRow}>
        <Icon name="lock-closed-outline" size={18} color={C.text2} />
        <Text style={styles.noteText}>Payments are processed securely by Stripe.</Text>
      </View>
    </View>
  );

  const summary = (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>Order summary</Text>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Item(s) total ({itemCount})</Text>
        <Text style={styles.summaryValue}>{formatPrice(subtotal)}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Shops</Text>
        <Text style={styles.summaryValue}>{groups.length}</Text>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryRow}>
        <Text style={styles.totalLabel}>Subtotal</Text>
        <Text style={styles.totalValue}>{formatPrice(subtotal)}</Text>
      </View>
      <TouchableOpacity style={styles.checkoutBtn} onPress={() => router.push('/checkout' as any)}>
        <Text style={styles.checkoutBtnText}>Proceed to checkout</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push('/(tabs)/marketplace' as any)} style={{ alignItems: 'center' }}>
        <Text style={styles.continueText}>Continue shopping</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <DesktopShell>
      <View style={styles.container}>
        {!signedIn ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>Sign in to view your cart.</Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/sign-in' as any)} style={{ marginTop: 10 }}>
              <Text style={{ color: C.gold, fontWeight: '700' }}>Sign In</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.scroll, isDesktopWeb && styles.scrollDesktop]}>
            <View style={styles.header}>
              <TouchableOpacity style={styles.roundBtn} onPress={() => router.back()} accessibilityLabel="Back">
                <Icon name="arrow-back" size={20} color={C.text} />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>
                {validItems.length === 0 ? 'Your cart' : `${itemCount} ${itemCount === 1 ? 'item' : 'items'} in your cart`}
              </Text>
            </View>

            {validItems.length === 0 ? (
              <>
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyEmoji}>🛒</Text>
                  <Text style={styles.emptyTitle}>Your cart is empty</Text>
                  <TouchableOpacity onPress={() => router.push('/(tabs)/marketplace' as any)} style={styles.emptyBtn}>
                    <Text style={styles.emptyBtnText}>Browse the Marketplace</Text>
                  </TouchableOpacity>
                </View>
                {savedSection}
              </>
            ) : isDesktopWeb ? (
              <View style={styles.columns}>
                <View style={styles.mainCol}>
                  {shopCards}
                  {notes}
                  {savedSection}
                </View>
                <View style={styles.sideCol}>{summary}</View>
              </View>
            ) : (
              <>
                {shopCards}
                {summary}
                {notes}
                {savedSection}
              </>
            )}
          </ScrollView>
        )}
      </View>
    </DesktopShell>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, gap: 8, paddingHorizontal: 40 },
    emptyText: { color: C.text3, fontSize: 14, textAlign: 'center' },

    scroll: { paddingHorizontal: Theme.spacing.lg, paddingBottom: 60, gap: 16 },
    scrollDesktop: { paddingHorizontal: Theme.spacing.xxxl, maxWidth: 1200, width: '100%', alignSelf: 'center' },

    header: { flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md, paddingTop: HEADER_TOP_PADDING, paddingBottom: 4 },
    roundBtn: {
      width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2,
    },
    headerTitle: { fontSize: Theme.fontSize.xl, fontWeight: '700', color: C.text },

    columns: { flexDirection: 'row', alignItems: 'flex-start', gap: Theme.spacing.xxl },
    mainCol: { flex: 1, minWidth: 0, gap: 16 },
    sideCol: { width: 340 },

    // Shop card
    shopCard: {
      backgroundColor: C.surface, borderRadius: Theme.radius.lg, borderWidth: 0.5, borderColor: C.border2,
      padding: Theme.spacing.lg,
    },
    shopHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: Theme.spacing.lg },
    shopAvatar: {
      width: 36, height: 36, borderRadius: 8, backgroundColor: C.goldBg,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    shopAvatarText: { fontSize: 15, fontWeight: '800', color: C.gold },
    shopName: { fontSize: 16, fontWeight: '700', color: C.text, flexShrink: 1 },
    shopRating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    shopRatingText: { fontSize: 14, fontWeight: '700', color: C.text },
    shopRatingCount: { fontSize: 13, color: C.text3 },

    // Item
    itemRow: { flexDirection: 'row', gap: Theme.spacing.lg },
    itemDivider: { marginTop: Theme.spacing.lg, paddingTop: Theme.spacing.lg, borderTopWidth: 0.5, borderTopColor: C.border2 },
    itemImage: {
      borderRadius: Theme.radius.md, backgroundColor: C.surface2,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    itemMain: { flex: 1, minWidth: 0, gap: 6 },
    itemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    itemTitle: { fontSize: 15, color: C.text, lineHeight: 21 },
    itemPrice: { fontSize: 17, fontWeight: '800', color: C.text },
    itemEach: { fontSize: 11, color: C.text3, marginTop: 2 },
    itemNote: { fontSize: 12, color: C.text3 },
    stockNote: { fontSize: 12, fontWeight: '600', color: C.live },
    qtyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
    qtyStepper: {
      flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border,
      borderRadius: Theme.radius.md, backgroundColor: C.bg,
    },
    qtyBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
    qtyText: { fontSize: 14, fontWeight: '700', color: C.text, minWidth: 24, textAlign: 'center' },
    linkRow: { flexDirection: 'row', gap: 24, marginTop: 4 },
    linkText: { fontSize: 14, fontWeight: '700', color: C.text },

    // Saved for later
    sectionTitle: { fontSize: 17, fontWeight: '800', color: C.text, marginBottom: 12 },
    savedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    savedTitle: { fontSize: 14, color: C.text },
    savedPrice: { fontSize: 14, fontWeight: '800', color: C.text, marginTop: 2 },
    moveBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: C.text },
    moveBtnText: { fontSize: 13, fontWeight: '700', color: C.text },

    // Notes
    notes: { gap: 12, paddingVertical: 4 },
    noteRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    noteText: { flex: 1, fontSize: 13, color: C.text2, lineHeight: 19 },

    // Summary
    summaryCard: {
      backgroundColor: C.surface, borderRadius: Theme.radius.lg, padding: Theme.spacing.xl,
      borderWidth: 0.5, borderColor: C.border2, gap: 12,
    },
    summaryTitle: { fontSize: Theme.fontSize.md, fontWeight: '700', color: C.text },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    summaryLabel: { fontSize: 14, color: C.text2 },
    summaryValue: { fontSize: 14, fontWeight: '600', color: C.text },
    summaryDivider: { height: 0.5, backgroundColor: C.border2 },
    totalLabel: { fontSize: 15, fontWeight: '700', color: C.text },
    totalValue: { fontSize: 19, fontWeight: '800', color: C.text },
    checkoutBtn: { backgroundColor: C.gold, borderRadius: 999, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
    checkoutBtnText: { color: C.black, fontSize: 16, fontWeight: '800' },
    continueText: { color: C.gold, fontWeight: '700', fontSize: 13 },

    // Empty
    emptyCard: {
      alignItems: 'center', gap: 10, paddingVertical: 48, borderRadius: Theme.radius.lg,
      backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2,
    },
    emptyEmoji: { fontSize: 40 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text },
    emptyBtn: { marginTop: 6, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 999, backgroundColor: C.gold },
    emptyBtnText: { color: C.black, fontWeight: '800', fontSize: 14 },
  });
}
