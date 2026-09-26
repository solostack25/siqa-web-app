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

type CartItem = {
  id: string;
  quantity: number;
  product_id: string;
  marketplace_products: {
    id: string;
    title: string;
    price_cents: number;
    currency: string | null;
    images: string[] | null;
    inventory_count: number;
    is_digital: boolean;
    status: string;
  } | null;
};

function formatPrice(cents: number) {
  return '$' + (cents / 100).toFixed(2);
}

export default function CartScreen() {
  const { colors: C } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const styles = makeStyles(C);

  const [items, setItems] = useState<CartItem[]>([]);
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

    const { data } = await supabase
      .from('marketplace_cart_items')
      .select('id, quantity, product_id, marketplace_products(id, title, price_cents, currency, images, inventory_count, is_digital, status)')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (data) setItems(data as any);
    setLoading(false);
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
  }

  const validItems = items.filter(i => i.marketplace_products && i.marketplace_products.status === 'active');
  const subtotal = validItems.reduce((sum, i) => sum + (i.marketplace_products?.price_cents ?? 0) * i.quantity, 0);

  if (loading) {
    return (
      <DesktopShell>
        <View style={styles.centered}>
          <ActivityIndicator color={C.gold} size="large" />
        </View>
      </DesktopShell>
    );
  }

  return (
    <DesktopShell>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.roundBtn} onPress={() => router.back()}>
            <Icon name="arrow-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Cart</Text>
          <View style={{ width: 38 }} />
        </View>

        {!signedIn ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>Sign in to view your cart.</Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/sign-in' as any)} style={{ marginTop: 10 }}>
              <Text style={{ color: C.gold, fontWeight: '700' }}>Sign In</Text>
            </TouchableOpacity>
          </View>
        ) : validItems.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyEmoji}>🛒</Text>
            <Text style={styles.emptyText}>Your cart is empty</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/marketplace' as any)} style={{ marginTop: 10 }}>
              <Text style={{ color: C.gold, fontWeight: '700' }}>Browse the Marketplace</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}>
              {validItems.map(item => {
                const p = item.marketplace_products!;
                const busy = busyId === item.id;
                return (
                  <View key={item.id} style={styles.row}>
                    <TouchableOpacity onPress={() => router.push({ pathname: '/product/[id]', params: { id: p.id } } as any)}>
                      <View style={styles.rowImage}>
                        {p.images?.[0] ? (
                          <Image source={{ uri: p.images[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        ) : (
                          <Text style={{ fontSize: 20, opacity: 0.4 }}>🛍️</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={2}>{p.title}</Text>
                      <Text style={styles.rowPrice}>{formatPrice(p.price_cents)}</Text>
                      <View style={styles.qtyRow}>
                        <TouchableOpacity
                          style={styles.qtyBtn}
                          onPress={() => updateQuantity(item.id, item.quantity - 1, p.inventory_count)}
                          disabled={busy}
                        >
                          <Icon name="remove" size={14} color={C.text} />
                        </TouchableOpacity>
                        <Text style={styles.qtyText}>{item.quantity}</Text>
                        <TouchableOpacity
                          style={styles.qtyBtn}
                          onPress={() => updateQuantity(item.id, item.quantity + 1, p.inventory_count)}
                          disabled={busy || (!p.is_digital && item.quantity >= p.inventory_count)}
                        >
                          <Icon name="add" size={14} color={C.text} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.removeBtn} onPress={() => removeItem(item.id)} disabled={busy}>
                          <Icon name="trash-outline" size={16} color={C.text3} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.footer}>
              <View style={styles.subtotalRow}>
                <Text style={styles.subtotalLabel}>Subtotal</Text>
                <Text style={styles.subtotalValue}>{formatPrice(subtotal)}</Text>
              </View>
              <TouchableOpacity style={styles.checkoutBtn} onPress={() => router.push('/checkout' as any)}>
                <Text style={styles.checkoutBtnText}>Checkout</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </DesktopShell>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, gap: 8, paddingHorizontal: 40 },
    emptyEmoji: { fontSize: 40, marginBottom: 4 },
    emptyText: { color: C.text3, fontSize: 14, textAlign: 'center' },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Theme.spacing.lg, paddingTop: HEADER_TOP_PADDING, paddingBottom: Theme.spacing.md,
    },
    roundBtn: {
      width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2,
    },
    headerTitle: { fontSize: Theme.fontSize.xl, fontWeight: '700', color: C.text },

    // Was full-width with no cap — a plain vertical list of line items
    // stretched edge-to-edge on desktop instead of staying a readable
    // width, same "mobile layout just wider" problem Seeds/Orgs/Settings
    // had before those got fixed.
    list: { paddingHorizontal: Theme.spacing.lg, paddingBottom: 20, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' },
    row: { flexDirection: 'row', gap: 12 },
    rowImage: {
      width: 72, height: 72, borderRadius: Theme.radius.md, backgroundColor: C.surface2,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    rowTitle: { fontSize: 13, fontWeight: '600', color: C.text, lineHeight: 18 },
    rowPrice: { fontSize: 13, fontWeight: '800', color: C.gold, marginTop: 2 },
    qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
    qtyBtn: {
      width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.surface2, borderWidth: 0.5, borderColor: C.border2,
    },
    qtyText: { fontSize: 13, fontWeight: '700', color: C.text, minWidth: 16, textAlign: 'center' },
    removeBtn: { marginLeft: 'auto', padding: 4 },

    footer: {
      borderTopWidth: 0.5, borderTopColor: C.border2, backgroundColor: C.bg,
      paddingHorizontal: Theme.spacing.lg, paddingTop: Theme.spacing.md, paddingBottom: 28,
    },
    subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    subtotalLabel: { fontSize: 14, color: C.text2 },
    subtotalValue: { fontSize: 18, fontWeight: '800', color: C.text },
    checkoutBtn: { backgroundColor: C.gold, borderRadius: Theme.radius.md, paddingVertical: 15, alignItems: 'center' },
    checkoutBtnText: { color: C.black, fontSize: 16, fontWeight: '800' },
  });
}
