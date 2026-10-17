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
  TextInput,
} from 'react-native';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useTheme, type AppColors } from '../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../constants/theme';
import { Icon } from '../components/Icon';
import { formatPrice } from '../lib/money';
import { DesktopShell, useIsDesktopWeb } from '../components/DesktopShell';

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
  is_digital: boolean;
};

type Address = { name: string; line1: string; line2: string; city: string; state: string; postal_code: string };
const EMPTY_ADDRESS: Address = { name: '', line1: '', line2: '', city: '', state: '', postal_code: '' };

type Quote = {
  itemsCents: number;
  shippingCents: number;
  shippingByShop: { sellerId: string; shopName: string; cents: number }[];
  taxCents: number;
  totalCents: number;
  taxStatus: 'calculated' | 'not_configured';
};

// Alert.alert is a no-op on react-native-web, so web uses the browser alert.
function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

async function callCheckout(body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-marketplace-payment-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export default function CheckoutScreen() {
  const { productId, quantity } = useLocalSearchParams<{ productId?: string; quantity?: string }>();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { colors: C, isDark } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const styles = makeStyles(C);

  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [buyerId, setBuyerId] = useState<string | null>(null);
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [webClientSecret, setWebClientSecret] = useState<string | null>(null);
  const [paidTotal, setPaidTotal] = useState<number | null>(null);

  useEffect(() => {
    load();
  }, [productId]);

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setSignedOut(true);
      setLoading(false);
      if (Platform.OS === 'web') router.replace('/(auth)/sign-in' as any);
      else Alert.alert('Sign in required', 'Sign in to check out.', [
        { text: 'OK', onPress: () => router.replace('/(auth)/sign-in' as any) },
      ]);
      return;
    }
    setBuyerId(session.user.id);

    if (productId) {
      // Buy-now: single product, quantity from params.
      const { data } = await supabase
        .from('marketplace_products')
        .select('id, title, price_cents, images, is_digital')
        .eq('id', productId)
        .single();
      if (data) {
        setLineItems([{
          productId: data.id,
          title: data.title,
          price_cents: data.price_cents,
          quantity: Number(quantity) || 1,
          image: data.images?.[0] ?? null,
          is_digital: Boolean(data.is_digital),
        }]);
      }
    } else {
      // Cart checkout.
      const { data } = await supabase
        .from('marketplace_cart_items')
        .select('quantity, marketplace_products(id, title, price_cents, images, status, is_digital)')
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
              is_digital: Boolean(row.marketplace_products.is_digital),
            }))
        );
      }
    }

    // Prefill the address from this buyer's last checkout, if any. (Fails
    // quietly if the checkouts table isn't there yet.)
    const { data: last } = await supabase
      .from('marketplace_checkouts')
      .select('shipping_name, shipping_address')
      .eq('buyer_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last?.shipping_address) {
      const a = last.shipping_address as Record<string, string | null>;
      setAddress({
        name: last.shipping_name ?? '',
        line1: a.line1 ?? '',
        line2: a.line2 ?? '',
        city: a.city ?? '',
        state: a.state ?? '',
        postal_code: a.postal_code ?? '',
      });
    }
    setLoading(false);
  }

  const hasPhysical = lineItems.some(i => !i.is_digital);
  const itemsTotal = lineItems.reduce((sum, i) => sum + i.price_cents * i.quantity, 0);
  const addressComplete = hasPhysical
    ? Boolean(address.name.trim() && address.line1.trim() && address.city.trim() && address.state.trim().length === 2 && address.postal_code.trim().length >= 5)
    : address.postal_code.trim().length >= 5;

  function updateAddress(field: keyof Address, value: string) {
    setAddress(prev => ({ ...prev, [field]: field === 'state' ? value.toUpperCase().slice(0, 2) : value }));
    // Any change to the address invalidates the shipping/tax quote.
    setQuote(null);
    setQuoteError(null);
  }

  function requestBody(mode: 'quote' | 'pay') {
    return {
      mode,
      buyerId,
      items: lineItems.map(i => ({ productId: i.productId, quantity: i.quantity })),
      address: {
        name: address.name.trim(),
        line1: address.line1.trim(),
        line2: address.line2.trim(),
        city: address.city.trim(),
        state: address.state.trim(),
        postal_code: address.postal_code.trim(),
        country: 'US',
      },
    };
  }

  async function getQuote() {
    if (!addressComplete) return;
    setQuoting(true);
    setQuoteError(null);
    try {
      setQuote(await callCheckout(requestBody('quote')));
    } catch (err: any) {
      setQuoteError(err.message);
    } finally {
      setQuoting(false);
    }
  }

  async function createIntent() {
    if (!quote) return;
    setPlacingOrder(true);
    try {
      const data = await callCheckout(requestBody('pay'));
      setPaidTotal(data.totalCents);
      if (Platform.OS === 'web') {
        setWebClientSecret(data.clientSecret);
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
          if (payError.code !== 'Canceled') notify('Payment failed', payError.message);
          return;
        }
        onPaymentSuccess(data.totalCents);
      }
    } catch (err: any) {
      notify('Checkout problem', err.message);
    } finally {
      setPlacingOrder(false);
    }
  }

  function onPaymentSuccess(totalCents?: number) {
    setWebClientSecret(null);
    router.replace({
      pathname: '/order-success',
      params: { total: formatPrice(totalCents ?? paidTotal ?? quote?.totalCents ?? itemsTotal), count: String(lineItems.length) },
    } as any);
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

  if (signedOut || lineItems.length === 0) {
    return (
      <DesktopShell>
        <View style={styles.centered}>
          <Text style={{ color: C.text3 }}>{signedOut ? 'Sign in to check out.' : 'Nothing to check out.'}</Text>
        </View>
      </DesktopShell>
    );
  }

  const header = (
    <View style={styles.header}>
      <TouchableOpacity style={styles.roundBtn} onPress={() => router.back()} accessibilityLabel="Back">
        <Icon name="arrow-back" size={20} color={C.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Checkout</Text>
    </View>
  );

  const field = (key: keyof Address, label: string, props: Partial<React.ComponentProps<typeof TextInput>> = {}, flex = 1) => (
    <View style={{ flex, minWidth: 0 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={address[key]}
        onChangeText={v => updateAddress(key, v)}
        placeholderTextColor={C.text3}
        editable={!webClientSecret && !placingOrder}
        {...props}
      />
    </View>
  );

  const addressCard = (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{hasPhysical ? 'Shipping address' : 'Billing ZIP code'}</Text>
      {!hasPhysical && <Text style={styles.cardHint}>Digital items only — we just need your ZIP code to work out sales tax.</Text>}
      {hasPhysical && (
        <>
          {field('name', 'Full name', { placeholder: 'Name on the package', autoComplete: 'name' as any })}
          {field('line1', 'Street address', { placeholder: '123 Main St', autoComplete: 'street-address' as any })}
          {field('line2', 'Apt, suite (optional)', { placeholder: 'Apt 4B' })}
        </>
      )}
      <View style={styles.fieldRow}>
        {hasPhysical && field('city', 'City', { placeholder: 'Houston' }, 2)}
        {hasPhysical && field('state', 'State', { placeholder: 'TX', autoCapitalize: 'characters', maxLength: 2 }, 1)}
        {field('postal_code', 'ZIP code', { placeholder: '77001', keyboardType: 'number-pad', maxLength: 10 }, hasPhysical ? 1.4 : 1)}
      </View>
      <Text style={styles.cardHint}>US addresses only for now.</Text>
    </View>
  );

  const itemsCard = (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Your items</Text>
      {lineItems.map(item => (
        <View key={item.productId} style={styles.itemRow}>
          <View style={[styles.itemImage, isDesktopWeb && styles.itemImageDesktop]}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.itemTitle, isDesktopWeb && styles.itemTitleDesktop]} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.itemMeta}>
              Qty {item.quantity} · {formatPrice(item.price_cents)} each{item.is_digital ? ' · Digital' : ''}
            </Text>
          </View>
          <Text style={[styles.itemTotal, isDesktopWeb && styles.itemTitleDesktop]}>{formatPrice(item.price_cents * item.quantity)}</Text>
        </View>
      ))}
    </View>
  );

  const summaryRow = (label: string, value: string, strong = false) => (
    <View style={styles.totalRow}>
      <Text style={strong ? styles.totalLabel : styles.summaryLabel}>{label}</Text>
      <Text style={strong ? styles.totalValue : styles.summaryValue}>{value}</Text>
    </View>
  );

  const summaryCard = (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Order summary</Text>
      {summaryRow(`Items (${lineItems.reduce((n, i) => n + i.quantity, 0)})`, formatPrice(quote?.itemsCents ?? itemsTotal))}
      {quote ? (
        <>
          {quote.shippingByShop.length > 1
            ? quote.shippingByShop.map(s => summaryRow(`Shipping · ${s.shopName}`, formatPrice(s.cents)))
            : summaryRow('Shipping', quote.shippingCents > 0 ? formatPrice(quote.shippingCents) : 'Free')}
          {summaryRow('Sales tax', formatPrice(quote.taxCents))}
          <View style={styles.divider} />
          {summaryRow('Total', formatPrice(quote.totalCents), true)}
        </>
      ) : (
        <Text style={styles.cardHint}>Shipping and sales tax are added once you enter your address.</Text>
      )}

      {quoteError && <Text style={styles.errorText}>{quoteError}</Text>}

      {webClientSecret ? (
        <WebDonateForm
          clientSecret={webClientSecret}
          colors={C}
          isDark={isDark}
          confirmLabel="Confirm purchase"
          onSuccess={() => onPaymentSuccess()}
          onCancel={() => setWebClientSecret(null)}
        />
      ) : quote ? (
        <TouchableOpacity
          style={[styles.payBtn, placingOrder && styles.payBtnDisabled]}
          onPress={createIntent}
          disabled={placingOrder}
        >
          {placingOrder ? <ActivityIndicator color={C.black} /> : <Text style={styles.payBtnText}>Pay {formatPrice(quote.totalCents)}</Text>}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.payBtn, (!addressComplete || quoting) && styles.payBtnDisabled]}
          onPress={getQuote}
          disabled={!addressComplete || quoting}
        >
          {quoting ? <ActivityIndicator color={C.black} /> : <Text style={styles.payBtnText}>Calculate total</Text>}
        </TouchableOpacity>
      )}
      <Text style={styles.secureNote}>Payments are processed securely by Stripe.</Text>
    </View>
  );

  if (isDesktopWeb) {
    return (
      <DesktopShell>
        <ScrollView style={styles.container} contentContainerStyle={styles.desktopScroll}>
          {header}
          <View style={styles.desktopColumns}>
            <View style={[styles.desktopMain, { gap: Theme.spacing.lg }]}>
              {addressCard}
              {itemsCard}
            </View>
            <View style={styles.desktopSide}>{summaryCard}</View>
          </View>
        </ScrollView>
      </DesktopShell>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {header}
        <View style={{ gap: Theme.spacing.lg }}>
          {itemsCard}
          {addressCard}
          {summaryCard}
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
    scroll: { paddingBottom: 60, maxWidth: 600, width: '100%', alignSelf: 'center' },

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
      padding: Theme.spacing.lg, borderWidth: 0.5, borderColor: C.border2, gap: 12,
    },
    cardTitle: { fontSize: Theme.fontSize.md, fontWeight: '700', color: C.text },
    cardHint: { fontSize: 12, color: C.text3, lineHeight: 17 },

    fieldRow: { flexDirection: 'row', gap: 10 },
    fieldLabel: { fontSize: 12, fontWeight: '600', color: C.text2, marginBottom: 5 },
    input: {
      borderWidth: 1, borderColor: C.border, borderRadius: Theme.radius.md, backgroundColor: C.bg,
      paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.text,
    },

    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    itemImage: { width: 48, height: 48, borderRadius: 10, backgroundColor: C.surface2, overflow: 'hidden' },
    itemImageDesktop: { width: 72, height: 72, borderRadius: Theme.radius.md },
    itemTitle: { fontSize: 13, fontWeight: '600', color: C.text, lineHeight: 18 },
    itemTitleDesktop: { fontSize: 15 },
    itemMeta: { fontSize: 11, color: C.text3, marginTop: 2 },
    itemTotal: { fontSize: 13, fontWeight: '700', color: C.text },

    divider: { height: 0.5, backgroundColor: C.border2 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    summaryLabel: { fontSize: 14, color: C.text2, flexShrink: 1 },
    summaryValue: { fontSize: 14, fontWeight: '600', color: C.text },
    totalLabel: { fontSize: 15, fontWeight: '700', color: C.text },
    totalValue: { fontSize: 19, fontWeight: '800', color: C.gold },
    errorText: { fontSize: 13, color: C.live, lineHeight: 18 },
    secureNote: { fontSize: 12, color: C.text3, textAlign: 'center' },

    desktopScroll: { paddingHorizontal: Theme.spacing.xxxl, paddingBottom: 60, maxWidth: 1100, width: '100%', alignSelf: 'center' },
    desktopColumns: { flexDirection: 'row', alignItems: 'flex-start', gap: Theme.spacing.xxl },
    desktopMain: { flex: 1, minWidth: 0 },
    desktopSide: { width: 380 },

    payBtn: { backgroundColor: C.gold, borderRadius: 999, paddingVertical: 15, alignItems: 'center' },
    payBtnDisabled: { opacity: 0.5 },
    payBtnText: { color: C.black, fontSize: Theme.fontSize.lg, fontWeight: '800' },
  });
}
