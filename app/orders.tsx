import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useTheme, type AppColors } from '../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../constants/theme';
import { DesktopShell } from '../components/DesktopShell';
import { Icon } from '../components/Icon';

type Order = {
  id: string;
  status: string;
  total_cents: number;
  quantity: number;
  created_at: string;
  product_id: string;
  marketplace_products: { title: string; images: string[] | null } | null;
};

function formatMoney(cents: number) {
  return '$' + (cents / 100).toFixed(2);
}

function statusColor(status: string, C: AppColors) {
  if (status === 'completed') return C.emeraldLight;
  if (status === 'cancelled') return C.live;
  return C.gold;
}

export default function OrdersScreen() {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reviewedOrderIds, setReviewedOrderIds] = useState<Set<string>>(new Set());
  const [reviewingOrderId, setReviewingOrderId] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { router.replace('/(auth)/sign-in' as any); return; }
    setUserId(session.user.id);

    const { data } = await supabase
      .from('marketplace_orders')
      .select('id, status, total_cents, quantity, created_at, product_id, marketplace_products(title, images)')
      .eq('buyer_id', session.user.id)
      .order('created_at', { ascending: false });

    if (data) {
      setOrders(data as any);
      const { data: reviews } = await supabase
        .from('marketplace_reviews')
        .select('order_id')
        .eq('buyer_id', session.user.id);
      if (reviews) setReviewedOrderIds(new Set(reviews.map(r => r.order_id)));
    }
    setLoading(false);
  }

  async function submitReview(order: Order) {
    if (!userId) return;
    setSubmittingReview(true);
    const { error } = await supabase.from('marketplace_reviews').insert({
      order_id: order.id,
      product_id: order.product_id,
      buyer_id: userId,
      rating: reviewRating,
      comment: reviewComment.trim() || null,
    });
    setSubmittingReview(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setReviewedOrderIds(prev => new Set(prev).add(order.id));
    setReviewingOrderId(null);
    setReviewRating(5);
    setReviewComment('');
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

  return (
    <DesktopShell>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.roundBtn} onPress={() => router.back()}>
            <Icon name="arrow-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Orders</Text>
          <View style={{ width: 38 }} />
        </View>

        {orders.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyEmoji}>📦</Text>
            <Text style={styles.emptyText}>No orders yet</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/marketplace' as any)} style={{ marginTop: 8 }}>
              <Text style={{ color: C.gold, fontWeight: '700' }}>Browse the Marketplace</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}>
            {orders.map(order => {
              const product = order.marketplace_products;
              const canReview = order.status === 'completed' && !reviewedOrderIds.has(order.id);
              const isReviewing = reviewingOrderId === order.id;
              return (
                <View key={order.id} style={styles.card}>
                  <TouchableOpacity
                    style={styles.cardRow}
                    onPress={() => router.push({ pathname: '/product/[id]', params: { id: order.product_id } } as any)}
                  >
                    <View style={styles.cardImage}>
                      {product?.images?.[0] ? (
                        <Image source={{ uri: product.images[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      ) : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{product?.title ?? 'Product'}</Text>
                      <Text style={styles.cardMeta}>Qty {order.quantity} · {formatMoney(order.total_cents)}</Text>
                      <Text style={[styles.cardStatus, { color: statusColor(order.status, C) }]}>{order.status.toUpperCase()}</Text>
                    </View>
                  </TouchableOpacity>

                  {canReview && !isReviewing && (
                    <TouchableOpacity style={styles.reviewBtn} onPress={() => setReviewingOrderId(order.id)}>
                      <Icon name="star-outline" size={14} color={C.gold} />
                      <Text style={styles.reviewBtnText}>Leave a Review</Text>
                    </TouchableOpacity>
                  )}
                  {reviewedOrderIds.has(order.id) && (
                    <Text style={styles.reviewedText}>✓ You reviewed this order</Text>
                  )}

                  {isReviewing && (
                    <View style={styles.reviewForm}>
                      <View style={styles.starRow}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <TouchableOpacity key={n} onPress={() => setReviewRating(n)}>
                            <Text style={n <= reviewRating ? styles.starOn : styles.starOff}>★</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TextInput
                        style={styles.reviewInput}
                        placeholder="Optional comment..."
                        placeholderTextColor={C.text3}
                        value={reviewComment}
                        onChangeText={setReviewComment}
                        multiline
                      />
                      <View style={styles.reviewFormActions}>
                        <TouchableOpacity onPress={() => setReviewingOrderId(null)}>
                          <Text style={styles.cancelReviewText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.submitReviewBtn}
                          onPress={() => submitReview(order)}
                          disabled={submittingReview}
                        >
                          {submittingReview ? (
                            <ActivityIndicator size="small" color={C.black} />
                          ) : (
                            <Text style={styles.submitReviewBtnText}>Submit</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </View>
    </DesktopShell>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, gap: 6 },
    emptyEmoji: { fontSize: 36 },
    emptyText: { color: C.text3, fontSize: 14, fontWeight: '600' },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Theme.spacing.lg, paddingTop: HEADER_TOP_PADDING, paddingBottom: Theme.spacing.md,
    },
    roundBtn: {
      width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2,
    },
    headerTitle: { fontSize: Theme.fontSize.xl, fontWeight: '700', color: C.text },

    list: { paddingHorizontal: Theme.spacing.lg, gap: 12, maxWidth: 760, width: '100%', alignSelf: 'center' },
    card: {
      backgroundColor: C.surface, borderRadius: Theme.radius.lg, padding: 12,
      borderWidth: 0.5, borderColor: C.border2,
    },
    cardRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    cardImage: { width: 56, height: 56, borderRadius: Theme.radius.md, backgroundColor: C.surface2, overflow: 'hidden' },
    cardTitle: { fontSize: 13, fontWeight: '700', color: C.text },
    cardMeta: { fontSize: 11, color: C.text3, marginTop: 2 },
    cardStatus: { fontSize: 10, fontWeight: '800', marginTop: 4, letterSpacing: 0.5 },

    reviewBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
      marginTop: 10, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
      backgroundColor: C.goldBg, borderWidth: 0.5, borderColor: C.goldDim,
    },
    reviewBtnText: { fontSize: 11, fontWeight: '700', color: C.gold },
    reviewedText: { fontSize: 11, color: C.emeraldLight, marginTop: 10, fontWeight: '600' },

    reviewForm: { marginTop: 12, gap: 10 },
    starRow: { flexDirection: 'row', gap: 4 },
    starOn: { color: C.gold, fontSize: 22 },
    starOff: { color: C.border, fontSize: 22 },
    reviewInput: {
      backgroundColor: C.bg2, borderRadius: Theme.radius.md, borderWidth: 0.5, borderColor: C.border,
      paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 13, minHeight: 60, textAlignVertical: 'top',
    },
    reviewFormActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 16 },
    cancelReviewText: { fontSize: 12, color: C.text3, fontWeight: '600' },
    submitReviewBtn: { backgroundColor: C.gold, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
    submitReviewBtnText: { fontSize: 12, fontWeight: '800', color: C.black },
  });
}
