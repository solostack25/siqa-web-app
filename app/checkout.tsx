import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useTheme, type AppColors } from '../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../constants/theme';
import { Icon } from '../components/Icon';

// Same platform split as donate.tsx: Stripe's native module doesn't
// support web, and stripe-js touches browser globals — only load
// whichever half of the pair actually applies.
const WebDonateForm =
  Platform.OS === 'web' ? require('../components/WebDonateForm').default : () => null;
const useStripe =
  Platform.OS === 'web'
    ? () => ({ initPaymentSheet: async () => ({ error: null }), presentPaymentSheet: async () => ({ error: null }) })
    : require('@stripe/stripe-react-native').useStripe;

const SUPABASE_URL = 'https://eixlmylbqqrfazjlgxcz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hGOrpdHS1fwFYwXGI8tN2g_Yeuzchmj';

type LineItem = {
  productId: string;
  title: string;
  price_cents: number;
  quantity: number;
  image: string | null;
};

function formatPrice(cents: number) {
  return '$' + (cents / 100).toFixed(2);
}

export default function CheckoutScreen() {
  const { productId, quantity } = useLocalSearchParams<{ productId?: string; quantity?: string }>();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { colors: C, isDark } = useTheme();
  const styles = makeStyles(C);

  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [webClientSecret, setWebClientSecret] = useState<string | null>(null);
  const [webPaymentIntentId, setWebPaymentIntentId] = useState<string | null>(null);
  const [buyerId, setBuyerId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [productId]);

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      Alert.alert('Sign in required', 'Sign in to check out.', [
        { text: 'OK', onPress: () => router.replace('/(auth)/sign-in' as any) },
      ]);
      return;
    }
    setBuyerId(session.user.id);

    if (productId) {
      // Buy-now: single product, quantity from params.
      const { data } = await supabase
        .from('marketplace_products')
        .select('id, title, price_cents, images')
        .eq('id', productId)
        .single();
      if (data) {
        setLineItems([{
          productId: data.id,
          title: data.title,
          price_cents: data.price_cents,
          quantity: Number(quantity) || 1,
          image: data.images?.[0] ?? null,
        }]);
      }
    } else {
      // Cart checkout.
      const { data } = await supabase
        .from('marketplace_cart_items')
        .select('quantity, marketplace_products(id, title, price_cents, images, status)')
        .eq('user_id', session.user.id);
      if (data) {
        setLineItems(
          data
            .filter((row: any) => row.marketplace_products?.status === 'active')
            .map((row: any) => ({
              productId: row.marketplace_products.id,
              title: row.marketplace_products.title,
              price_cents: row.marketplace_products.price_cents,
              quantity: row.quantity,
              image: row.marketplace_products.images?.[0] ?? null,
            }))
        );
      }
    }
    setLoading(false);
  }

  const total = lineItems.reduce((sum, i) => sum + i.price_cents * i.quantity, 0);

  async function createIntent() {
    setPlacingOrder(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-marketplace-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          buyerId,
          items: lineItems.map(i => ({ productId: i.productId, quantity: i.quantity })),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (Platform.OS === 'web') {
        setWebClientSecret(data.clientSecret);
        setWebPaymentIntentId(data.paymentIntentId);
      } else {
        const { error: initError } = await initPaymentSheet({
          merchantDisplayName: 'Siqa',
          paymentIntentClientSecret: data.clientSecret,
          applePay: { merchantCountryCode: 'US' },
          googlePay: { merchantCountryCode: 'US', testEnv: false },
          style: isDark ? 'alwaysDark' : 'alwaysLight',
        });
        if (initError) throw new Error(initError.message);

        const { error: payError } = await presentPaymentSheet();
        if (payError) {
          if (payError.code !== 'Canceled') Alert.alert('Payment failed', payError.message);
          setPlacingOrder(false);
          return;
        }
        onPaymentSuccess();
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setPlacingOrder(false);
    }
  }

  function onPaymentSuccess() {
    setWebClientSecret(null);
    router.replace({
      pathname: '/order-success',
      params: { total: formatPrice(total), count: String(lineItems.length) },
    } as any);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={C.gold} size="large" />
      </View>
    );
  }

  if (lineItems.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: C.text3 }}>Nothing to check out.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.roundBtn} onPress={() => router.back()}>
            <Icon name="arrow-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review your order</Text>
        </View>

        <View style={styles.card}>
          {lineItems.map(item => (
            <View key={item.productId} style={styles.itemRow}>
              <View style={styles.itemImage}>
                {item.image ? (
                  <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.itemMeta}>Qty {item.quantity} · {formatPrice(item.price_cents)} each</Text>
              </View>
              <Text style={styles.itemTotal}>{formatPrice(item.price_cents * item.quantity)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatPrice(total)}</Text>
          </View>
        </View>

        {Platform.OS === 'web' && webClientSecret && (
          <WebDonateForm
            clientSecret={webClientSecret}
            colors={C}
            isDark={isDark}
            confirmLabel="Confirm purchase"
            onSuccess={onPaymentSuccess}
            onCancel={() => setWebClientSecret(null)}
          />
        )}
      </ScrollView>

      {!webClientSecret && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.payBtn, placingOrder && styles.payBtnDisabled]}
            onPress={createIntent}
            disabled={placingOrder}
          >
            {placingOrder ? (
              <ActivityIndicator color={C.black} />
            ) : (
              <Text style={styles.payBtnText}>Pay {formatPrice(total)}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
    scroll: { paddingBottom: 140, maxWidth: 600, width: '100%', alignSelf: 'center' },

    header: {
      flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md,
      paddingHorizontal: Theme.spacing.lg, paddingTop: HEADER_TOP_PADDING, paddingBottom: Theme.spacing.lg,
    },
    roundBtn: {
      width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2,
    },
    headerTitle: { fontSize: Theme.fontSize.xl, fontWeight: '700', color: C.text },

    card: {
      marginHorizontal: Theme.spacing.lg, backgroundColor: C.surface, borderRadius: Theme.radius.lg,
      padding: Theme.spacing.lg, borderWidth: 0.5, borderColor: C.border2, gap: 14,
    },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    itemImage: { width: 48, height: 48, borderRadius: 10, backgroundColor: C.surface2, overflow: 'hidden' },
    itemTitle: { fontSize: 13, fontWeight: '600', color: C.text, lineHeight: 18 },
    itemMeta: { fontSize: 11, color: C.text3, marginTop: 2 },
    itemTotal: { fontSize: 13, fontWeight: '700', color: C.text },
    divider: { height: 0.5, backgroundColor: C.border2 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
    totalLabel: { fontSize: 15, color: C.text },
    totalValue: { fontSize: 18, fontWeight: '800', color: C.gold },

    footer: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      padding: Theme.spacing.lg, paddingBottom: 40,
      backgroundColor: C.bg, borderTopWidth: 0.5, borderTopColor: C.border2,
    },
    payBtn: { backgroundColor: C.gold, borderRadius: Theme.radius.md, padding: Theme.spacing.lg, alignItems: 'center' },
    payBtnDisabled: { opacity: 0.6 },
    payBtnText: { color: C.black, fontSize: Theme.fontSize.lg, fontWeight: '800' },
  });
}
