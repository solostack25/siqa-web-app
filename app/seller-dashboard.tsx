import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useTheme, type AppColors } from '../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../constants/theme';
import { DesktopShell } from '../components/DesktopShell';
import { Icon } from '../components/Icon';

type Seller = { id: string; shop_name: string; approval_status: string; stripe_onboarded: boolean };
type Product = { id: string; title: string; price_cents: number; images: string[] | null; status: string; inventory_count: number };
type Order = {
  id: string; status: string; total_cents: number; quantity: number; created_at: string;
  marketplace_products: { title: string; images: string[] | null } | null;
};

const NEXT_STATUS: Record<string, string> = { paid: 'shipped', shipped: 'completed' };
const NEXT_LABEL: Record<string, string> = { paid: 'Mark Shipped', shipped: 'Mark Completed' };
const CANCELLABLE = ['pending', 'paid'];

function statusColor(status: string, C: AppColors) {
  if (status === 'completed') return C.emeraldLight;
  if (status === 'cancelled') return C.live;
  return C.gold;
}

function formatMoney(cents: number) {
  return '$' + (cents / 100).toFixed(2);
}

export default function SellerDashboardScreen() {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);

  const [loading, setLoading] = useState(true);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState<'listings' | 'orders'>('orders');
  const [busyId, setBusyId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { router.replace('/(auth)/sign-in' as any); return; }

    const { data: sellerData } = await supabase
      .from('marketplace_sellers')
      .select('id, shop_name, approval_status, stripe_onboarded')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (!sellerData) {
      router.replace('/sell' as any);
      return;
    }
    setSeller(sellerData as any);

    const [{ data: productsData }, { data: ordersData }] = await Promise.all([
      supabase.from('marketplace_products').select('id, title, price_cents, images, status, inventory_count').eq('seller_id', sellerData.id).order('created_at', { ascending: false }),
      supabase.from('marketplace_orders').select('id, status, total_cents, quantity, created_at, marketplace_products(title, images)').eq('seller_id', sellerData.id).order('created_at', { ascending: false }),
    ]);

    if (productsData) setProducts(productsData as any);
    if (ordersData) setOrders(ordersData as any);
    setLoading(false);
  }

  async function updateOrderStatus(orderId: string, status: string) {
    setBusyId(orderId);
    const { error } = await supabase.from('marketplace_orders').update({ status }).eq('id', orderId);
    setBusyId(null);
    if (error) return Alert.alert('Error', error.message);
    setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, status } : o)));
  }

  function cancelOrder(orderId: string) {
    Alert.alert('Cancel order?', 'This cannot be undone.', [
      { text: 'Back', style: 'cancel' },
      { text: 'Cancel Order', style: 'destructive', onPress: () => updateOrderStatus(orderId, 'cancelled') },
    ]);
  }

  async function toggleListing(product: Product) {
    const newStatus = product.status === 'active' ? 'archived' : 'active';
    setBusyId(product.id);
    const { error } = await supabase.from('marketplace_products').update({ status: newStatus }).eq('id', product.id);
    setBusyId(null);
    if (error) return Alert.alert('Error', error.message);
    setProducts(prev => prev.map(p => (p.id === product.id ? { ...p, status: newStatus } : p)));
  }

  if (loading || !seller) {
    return (
      <DesktopShell>
        <View style={styles.centered}>
          <ActivityIndicator color={C.gold} size="large" />
        </View>
      </DesktopShell>
    );
  }

  const needsAction = orders.filter(o => o.status === 'paid');

  return (
    <DesktopShell>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.roundBtn} onPress={() => router.back()}>
            <Icon name="arrow-back" size={20} color={C.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>{seller.shop_name}</Text>
            <Text style={styles.headerSub}>
              {seller.approval_status === 'approved' ? '✓ Approved seller' : 'Approval pending'}
            </Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/listing-create' as any)}>
            <Icon name="add" size={20} color={C.black} />
          </TouchableOpacity>
        </View>

        {!seller.stripe_onboarded && (
          <TouchableOpacity style={styles.notice} onPress={() => router.push('/sell' as any)}>
            <Text style={styles.noticeText}>⚠️ Connect Stripe to receive payments — tap to finish setup.</Text>
          </TouchableOpacity>
        )}

        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, tab === 'orders' && styles.tabActive]} onPress={() => setTab('orders')}>
            <Text style={[styles.tabText, tab === 'orders' && styles.tabTextActive]}>
              Orders{needsAction.length > 0 ? ` (${needsAction.length})` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tab === 'listings' && styles.tabActive]} onPress={() => setTab('listings')}>
            <Text style={[styles.tabText, tab === 'listings' && styles.tabTextActive]}>Listings ({products.length})</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body}>
          {tab === 'orders' ? (
            orders.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>📭</Text>
                <Text style={styles.emptyText}>No orders yet</Text>
              </View>
            ) : (
              orders.map(order => {
                const nextStatus = NEXT_STATUS[order.status];
                const canCancel = CANCELLABLE.includes(order.status);
                return (
                  <View key={order.id} style={styles.orderCard}>
                    <View style={styles.orderImage}>
                      {order.marketplace_products?.images?.[0] ? (
                        <Image source={{ uri: order.marketplace_products.images[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      ) : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.orderTitle} numberOfLines={1}>{order.marketplace_products?.title ?? 'Product'}</Text>
                      <Text style={styles.orderMeta}>Qty {order.quantity} · {formatMoney(order.total_cents)}</Text>
                      <Text style={[styles.orderStatus, { color: statusColor(order.status, C) }]}>{order.status.toUpperCase()}</Text>
                      {(nextStatus || canCancel) && (
                        <View style={styles.orderActions}>
                          {nextStatus && (
                            <TouchableOpacity style={styles.smallBtn} onPress={() => updateOrderStatus(order.id, nextStatus)} disabled={busyId === order.id}>
                              <Text style={styles.smallBtnText}>{busyId === order.id ? '...' : NEXT_LABEL[order.status]}</Text>
                            </TouchableOpacity>
                          )}
                          {canCancel && (
                            <TouchableOpacity style={styles.smallBtnGhost} onPress={() => cancelOrder(order.id)} disabled={busyId === order.id}>
                              <Text style={styles.smallBtnGhostText}>Cancel</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                );
              })
            )
          ) : products.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🛍️</Text>
              <Text style={styles.emptyText}>No listings yet</Text>
              <TouchableOpacity style={styles.smallBtn} onPress={() => router.push('/listing-create' as any)}>
                <Text style={styles.smallBtnText}>Create your first listing</Text>
              </TouchableOpacity>
            </View>
          ) : (
            products.map(product => (
              <TouchableOpacity
                key={product.id}
                style={styles.orderCard}
                onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id } } as any)}
              >
                <View style={styles.orderImage}>
                  {product.images?.[0] ? (
                    <Image source={{ uri: product.images[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderTitle} numberOfLines={1}>{product.title}</Text>
                  <Text style={styles.orderMeta}>
                    {formatMoney(product.price_cents)} · {product.inventory_count} in stock
                  </Text>
                  <Text style={[styles.orderStatus, { color: product.status === 'active' ? C.emeraldLight : C.text3 }]}>
                    {product.status.toUpperCase()}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.smallBtnGhost}
                  onPress={(e) => { e.stopPropagation(); toggleListing(product); }}
                  disabled={busyId === product.id}
                >
                  <Text style={styles.smallBtnGhostText}>{product.status === 'active' ? 'Deactivate' : 'Reactivate'}</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </DesktopShell>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },

    header: {
      flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md,
      paddingHorizontal: Theme.spacing.lg, paddingTop: HEADER_TOP_PADDING, paddingBottom: Theme.spacing.md,
    },
    roundBtn: {
      width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2,
    },
    headerTitle: { fontSize: Theme.fontSize.lg, fontWeight: '700', color: C.text },
    headerSub: { fontSize: 11, color: C.text3, marginTop: 1 },
    addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },

    notice: {
      marginHorizontal: Theme.spacing.lg, marginBottom: Theme.spacing.md,
      backgroundColor: C.goldBg, borderRadius: Theme.radius.md, padding: 10, borderWidth: 0.5, borderColor: C.goldDim,
    },
    noticeText: { fontSize: 12, color: C.gold, fontWeight: '600' },

    tabs: {
      flexDirection: 'row', marginHorizontal: Theme.spacing.lg, marginBottom: Theme.spacing.md,
      backgroundColor: C.surface2, borderRadius: 999, padding: 3,
    },
    tab: { flex: 1, paddingVertical: 9, borderRadius: 999, alignItems: 'center' },
    tabActive: { backgroundColor: C.gold },
    tabText: { fontSize: 12, fontWeight: '700', color: C.text3 },
    tabTextActive: { color: C.black },

    body: { paddingHorizontal: Theme.spacing.lg, gap: 12, maxWidth: 760, width: '100%', alignSelf: 'center' },
    empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
    emptyEmoji: { fontSize: 36 },
    emptyText: { color: C.text3, fontSize: 14, fontWeight: '600' },

    orderCard: {
      flexDirection: 'row', gap: 12, backgroundColor: C.surface, borderRadius: Theme.radius.lg,
      padding: 12, borderWidth: 0.5, borderColor: C.border2, alignItems: 'center',
    },
    orderImage: { width: 56, height: 56, borderRadius: Theme.radius.md, backgroundColor: C.surface2, overflow: 'hidden' },
    orderTitle: { fontSize: 13, fontWeight: '700', color: C.text },
    orderMeta: { fontSize: 11, color: C.text3, marginTop: 2 },
    orderStatus: { fontSize: 10, fontWeight: '800', marginTop: 4, letterSpacing: 0.5 },
    orderActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
    smallBtn: { backgroundColor: C.gold, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
    smallBtnText: { fontSize: 11, fontWeight: '800', color: C.black },
    smallBtnGhost: { borderWidth: 0.5, borderColor: C.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
    smallBtnGhostText: { fontSize: 11, fontWeight: '700', color: C.text2 },
  });
}
