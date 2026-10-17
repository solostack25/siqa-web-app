import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useTheme, type AppColors } from '../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../constants/theme';
import { DesktopShell } from '../components/DesktopShell';
import { Icon } from '../components/Icon';
import { formatPrice as formatMoney } from '../lib/money';

type Seller = { id: string; shop_name: string; approval_status: string; stripe_onboarded: boolean; shipping_cents: number | null };
type Product = { id: string; title: string; price_cents: number; images: string[] | null; status: string; inventory_count: number };
type Order = {
  id: string; status: string; total_cents: number; quantity: number; created_at: string;
  siqa_fee_cents: number | null; processing_fee_cents: number | null; seller_payout_cents: number | null;
  shipping_cents: number | null; tax_fee_cents: number | null; tax_cents: number | null;
  cancel_reason: string | null; refunded_cents: number | null;
  shipping_name: string | null; shipping_address: { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string } | null;
  marketplace_products: { title: string; images: string[] | null } | null;
};

const NEXT_STATUS: Record<string, string> = { paid: 'shipped', shipped: 'completed' };
const NEXT_LABEL: Record<string, string> = { paid: 'Mark Shipped', shipped: 'Mark Completed' };
const CANCELLABLE = ['pending', 'paid'];
const SUPABASE_URL = 'https://eixlmylbqqrfazjlgxcz.supabase.co';

function statusColor(status: string, C: AppColors) {
  if (status === 'completed') return C.emeraldLight;
  if (status === 'cancelled') return C.live;
  return C.gold;
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
  const [shippingInput, setShippingInput] = useState('');
  const [editingShipping, setEditingShipping] = useState(false);
  const [savingShipping, setSavingShipping] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);

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
      .select('id, shop_name, approval_status, stripe_onboarded, shipping_cents')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (!sellerData) {
      router.replace('/sell' as any);
      return;
    }
    setSeller(sellerData as any);

    const [{ data: productsData }, { data: ordersData }] = await Promise.all([
      supabase.from('marketplace_products').select('id, title, price_cents, images, status, inventory_count').eq('seller_id', sellerData.id).order('created_at', { ascending: false }),
      supabase.from('marketplace_orders').select('id, status, total_cents, quantity, created_at, siqa_fee_cents, processing_fee_cents, seller_payout_cents, shipping_cents, tax_fee_cents, tax_cents, cancel_reason, refunded_cents, shipping_name, shipping_address, marketplace_products(title, images)').eq('seller_id', sellerData.id).order('created_at', { ascending: false }),
    ]);

    if (productsData) setProducts(productsData as any);
    if (ordersData) setOrders(ordersData as any);
    setLoading(false);
  }

  // Flat shipping price, charged once per checkout when the buyer has at
  // least one of this shop's physical items in their cart.
  async function saveShipping() {
    if (!seller) return;
    const dollars = parseFloat(shippingInput.replace(/[^0-9.]/g, '') || '0');
    if (!Number.isFinite(dollars) || dollars < 0 || dollars > 500) {
      const msg = 'Enter a shipping price between $0 and $500.';
      return Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Shipping', msg);
    }
    const cents = Math.round(dollars * 100);
    setSavingShipping(true);
    const { error } = await supabase.from('marketplace_sellers').update({ shipping_cents: cents }).eq('id', seller.id);
    setSavingShipping(false);
    if (error) return Platform.OS === 'web' ? window.alert(error.message) : Alert.alert('Error', error.message);
    setSeller({ ...seller, shipping_cents: cents });
    setEditingShipping(false);
  }

  async function updateOrderStatus(orderId: string, status: string) {
    setBusyId(orderId);
    const { error } = await supabase.from('marketplace_orders').update({ status }).eq('id', orderId);
    setBusyId(null);
    if (error) return Alert.alert('Error', error.message);
    setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, status } : o)));
  }

  // Cancel & refund runs on the server (cancel-marketplace-order): it
  // refunds the buyer this item's price + shipping share + tax, takes the
  // payout back from the shop, reverses the sales tax and saves the reason.
  // A paid order can't be cancelled any other way.
  async function confirmCancel(order: Order) {
    if (!cancelReason.trim()) {
      setCancelError('Add a short reason for the buyer.');
      return;
    }
    setBusyId(order.id);
    setCancelError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/cancel-marketplace-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ orderId: order.id, reason: cancelReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? 'Could not cancel the order.');
      setOrders(prev => prev.map(o => (o.id === order.id
        ? { ...o, status: 'cancelled', cancel_reason: cancelReason.trim(), refunded_cents: data.refundedCents ?? 0 }
        : o)));
      setCancellingId(null);
      setCancelReason('');
    } catch (err: any) {
      setCancelError(err.message);
    } finally {
      setBusyId(null);
    }
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
        {/* Header, notice and tabs share the list's centered column so the
            tab switch doesn't stretch across the whole window on desktop. */}
        <View style={styles.topColumn}>
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

        <View style={styles.shippingRow}>
          <Icon name="cube-outline" size={16} color={C.text2} />
          {editingShipping ? (
            <>
              <Text style={styles.shippingLabel}>Shipping per order $</Text>
              <TextInput
                style={styles.shippingInput}
                value={shippingInput}
                onChangeText={setShippingInput}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={C.text3}
                autoFocus
              />
              <TouchableOpacity style={styles.smallBtn} onPress={saveShipping} disabled={savingShipping}>
                <Text style={styles.smallBtnText}>{savingShipping ? '...' : 'Save'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditingShipping(false)}>
                <Text style={styles.shippingEdit}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.shippingLabel}>
                Shipping per order: <Text style={styles.shippingValue}>{(seller.shipping_cents ?? 0) > 0 ? formatMoney(seller.shipping_cents) : 'Free'}</Text>
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShippingInput(((seller.shipping_cents ?? 0) / 100).toFixed(2));
                  setEditingShipping(true);
                }}
              >
                <Text style={styles.shippingEdit}>Edit</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

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
                      {(order.shipping_cents ?? 0) > 0 && (
                        <Text style={styles.orderMeta}>+ {formatMoney(order.shipping_cents)} shipping</Text>
                      )}
                      {order.seller_payout_cents != null && (
                        // Same split the admin Payouts page shows: Siqa's 6.5% fee,
                        // this order's share of Stripe processing and of the
                        // Stripe Tax fee come off first.
                        <Text style={styles.orderMeta}>
                          You get {formatMoney(order.seller_payout_cents)}
                          {' '}(fees {formatMoney((order.siqa_fee_cents ?? 0) + (order.processing_fee_cents ?? 0) + (order.tax_fee_cents ?? 0))})
                        </Text>
                      )}
                      {order.shipping_address?.line1 && order.status !== 'pending' && (
                        <View style={styles.shipTo}>
                          <Text style={styles.shipToLabel}>Ship to</Text>
                          <Text style={styles.shipToText} selectable>
                            {[
                              order.shipping_name,
                              order.shipping_address.line1,
                              order.shipping_address.line2,
                              [order.shipping_address.city, order.shipping_address.state, order.shipping_address.postal_code].filter(Boolean).join(' '),
                            ].filter(Boolean).join('\n')}
                          </Text>
                        </View>
                      )}
                      <Text style={[styles.orderStatus, { color: statusColor(order.status, C) }]}>{order.status.toUpperCase()}</Text>
                      {order.status === 'cancelled' && (order.refunded_cents || order.cancel_reason) ? (
                        <Text style={styles.orderMeta}>
                          {(order.refunded_cents ?? 0) > 0 ? `Refunded ${formatMoney(order.refunded_cents)} to the buyer` : 'Not charged'}
                          {order.cancel_reason ? ` · "${order.cancel_reason}"` : ''}
                        </Text>
                      ) : null}
                      {cancellingId === order.id && (
                        <View style={styles.cancelPanel}>
                          <Text style={styles.cancelTitle}>
                            {order.status === 'pending'
                              ? 'Cancel this unpaid order?'
                              : `Refund the buyer ${formatMoney(order.total_cents + (order.shipping_cents ?? 0) + (order.tax_cents ?? 0))}?`}
                          </Text>
                          {order.status !== 'pending' && (
                            <Text style={styles.cancelHint}>
                              The buyer gets this item's price, shipping and tax back. Your payout for it
                              {order.seller_payout_cents != null ? ` (${formatMoney(order.seller_payout_cents)})` : ''} is taken back.
                            </Text>
                          )}
                          <TextInput
                            style={styles.cancelInput}
                            value={cancelReason}
                            onChangeText={setCancelReason}
                            placeholder="Reason for the buyer (e.g. out of stock)"
                            placeholderTextColor={C.text3}
                            maxLength={500}
                            multiline
                          />
                          {cancelError && <Text style={styles.cancelErrorText}>{cancelError}</Text>}
                          <View style={styles.orderActions}>
                            <TouchableOpacity style={styles.dangerBtn} onPress={() => confirmCancel(order)} disabled={busyId === order.id}>
                              {busyId === order.id
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <Text style={styles.dangerBtnText}>{order.status === 'pending' ? 'Cancel order' : 'Cancel & refund'}</Text>}
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.smallBtnGhost} onPress={() => setCancellingId(null)} disabled={busyId === order.id}>
                              <Text style={styles.smallBtnGhostText}>Keep order</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                      {(nextStatus || canCancel) && cancellingId !== order.id && (
                        <View style={styles.orderActions}>
                          {nextStatus && (
                            <TouchableOpacity style={styles.smallBtn} onPress={() => updateOrderStatus(order.id, nextStatus)} disabled={busyId === order.id}>
                              <Text style={styles.smallBtnText}>{busyId === order.id ? '...' : NEXT_LABEL[order.status]}</Text>
                            </TouchableOpacity>
                          )}
                          {canCancel && cancellingId !== order.id && (
                            <TouchableOpacity
                              style={styles.smallBtnGhost}
                              onPress={() => { setCancellingId(order.id); setCancelReason(''); setCancelError(null); }}
                              disabled={busyId === order.id}
                            >
                              <Text style={styles.smallBtnGhostText}>{order.status === 'pending' ? 'Cancel' : 'Cancel & refund'}</Text>
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
    topColumn: { maxWidth: 760, width: '100%', alignSelf: 'center' },
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
    cancelPanel: {
      marginTop: 10, padding: 10, borderRadius: 10, gap: 8,
      backgroundColor: C.surface2, borderWidth: 0.5, borderColor: C.border2,
    },
    cancelTitle: { fontSize: 13, fontWeight: '700', color: C.text },
    cancelHint: { fontSize: 12, color: C.text2, lineHeight: 17 },
    cancelInput: {
      minHeight: 56, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 8,
      fontSize: 13, color: C.text, backgroundColor: C.bg, textAlignVertical: 'top',
    },
    cancelErrorText: { fontSize: 12, color: C.live },
    dangerBtn: { backgroundColor: C.live, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, minWidth: 110, alignItems: 'center' },
    dangerBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    shipTo: { marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: C.surface2 },
    shipToLabel: { fontSize: 10, fontWeight: '700', color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
    shipToText: { fontSize: 12, color: C.text, lineHeight: 17 },
    shippingRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      marginHorizontal: Theme.spacing.lg, marginBottom: Theme.spacing.md,
      padding: 10, borderRadius: Theme.radius.md, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2,
    },
    shippingLabel: { fontSize: 13, color: C.text2 },
    shippingValue: { fontWeight: '700', color: C.text },
    shippingEdit: { fontSize: 13, fontWeight: '700', color: C.gold, marginLeft: 4 },
    shippingInput: {
      width: 80, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
      fontSize: 14, color: C.text, backgroundColor: C.bg,
    },
    orderStatus: { fontSize: 10, fontWeight: '800', marginTop: 4, letterSpacing: 0.5 },
    orderActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
    smallBtn: { backgroundColor: C.gold, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
    smallBtnText: { fontSize: 11, fontWeight: '800', color: C.black },
    smallBtnGhost: { borderWidth: 0.5, borderColor: C.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
    smallBtnGhostText: { fontSize: 11, fontWeight: '700', color: C.text2 },
  });
}
