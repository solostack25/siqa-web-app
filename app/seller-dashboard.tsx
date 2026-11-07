// My store: the seller's home for their shop. One screen for the store
// header, this month's numbers, payouts, orders to ship and listings, built
// on the Siqa design system (lib/ds.ts + components/ui). On phones it is one
// scrolling column with Add product pinned at the bottom; on desktop web it
// splits into listings on the left and orders/payouts/settings on the right.
// "All orders" switches to the full order list with cancel & refund.

import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { DesktopShell, useIsDesktopWeb } from '../components/DesktopShell';
import { Icon, type SiqaIconName } from '../components/Icon';
import { Button, IconButton, Chip, ListRow, SectionLabel, TextField, BottomSheet, OptionRow, SegmentedControl } from '../components/ui';
import { formatPrice as formatMoney } from '../lib/money';
import { font, radius, space, type, useDS, type DS } from '../lib/ds';
import { HEADER_TOP_PADDING } from '../constants/theme';
import { goBack } from '../lib/goBack';
import { shareShop } from '../lib/share';

type Seller = {
  id: string; shop_name: string; bio: string | null; avatar_url: string | null; banner_url: string | null;
  approval_status: string; stripe_onboarded: boolean; shipping_cents: number | null; featured_product_id: string | null;
};
type Product = {
  id: string; title: string; price_cents: number; images: string[] | null; status: string;
  inventory_count: number; is_digital: boolean | null;
};
type Order = {
  id: string; status: string; total_cents: number; quantity: number; variant_label?: string | null; created_at: string;
  siqa_fee_cents: number | null; processing_fee_cents: number | null; seller_payout_cents: number | null;
  shipping_cents: number | null; tax_fee_cents: number | null; tax_cents: number | null;
  cancel_reason: string | null; refunded_cents: number | null;
  shipping_name: string | null; shipping_address: { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string } | null;
  marketplace_products: { title: string; images: string[] | null } | null;
};
type Payout = { payout_cents: number; reversed_cents: number | null; status: string; transferred_at: string | null };

type ListingFilter = 'all' | 'active' | 'hidden' | 'soldout';

const NEXT_STATUS: Record<string, string> = { paid: 'shipped', shipped: 'completed' };
const NEXT_LABEL: Record<string, string> = { paid: 'Mark shipped', shipped: 'Mark completed' };
const CANCELLABLE = ['pending', 'paid'];
/** Orders that count as a sale (paid for and not cancelled). */
const SOLD = ['paid', 'shipped', 'completed'];
const SUPABASE_URL = 'https://eixlmylbqqrfazjlgxcz.supabase.co';
const OVERVIEW_LISTINGS = 8;

function showError(title: string, msg: string) {
  if (Platform.OS === 'web') window.alert(msg);
  else Alert.alert(title, msg);
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dollars(cents: number) {
  // Whole dollars for the big numbers ($1,240); cents only when they matter.
  return cents % 100 === 0
    ? '$' + (cents / 100).toLocaleString('en-US')
    : formatMoney(cents);
}

function change(now: number, before: number, unit: 'money' | 'count'): { text: string; good: boolean } {
  if (before === 0) return now > 0 ? { text: 'New this month', good: true } : { text: 'Nothing yet', good: false };
  if (unit === 'count') {
    const d = now - before;
    return { text: d === 0 ? 'Same as last month' : `${d > 0 ? '+' : ''}${d} vs last month`, good: d > 0 };
  }
  const pct = Math.round(((now - before) / before) * 100);
  return { text: pct === 0 ? 'Same as last month' : `${pct > 0 ? '+' : ''}${pct}% vs last month`, good: pct > 0 };
}

function listingState(p: Product): 'active' | 'hidden' | 'soldout' {
  if (p.status !== 'active') return 'hidden';
  if (!p.is_digital && (p.inventory_count ?? 0) <= 0) return 'soldout';
  return 'active';
}

function orderStatusLabel(status: string) {
  return ({ pending: 'Awaiting payment', paid: 'To ship', shipped: 'Shipped', completed: 'Completed', cancelled: 'Cancelled' } as Record<string, string>)[status] ?? status;
}

export default function MyStoreScreen() {
  const ds = useDS();
  const { c, shadow } = ds;
  const isDesktop = useIsDesktopWeb();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Two columns only when there's room for the listings table beside the side column.
  const twoCol = isDesktop && width >= 1180;

  const [loading, setLoading] = useState(true);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [rating, setRating] = useState<{ avg: number; count: number }>({ avg: 0, count: 0 });
  const [unread, setUnread] = useState(0);

  const [view, setView] = useState<'overview' | 'orders'>('overview');
  const [orderFilter, setOrderFilter] = useState<'toship' | 'all'>('toship');
  const [listingFilter, setListingFilter] = useState<ListingFilter>('all');
  const [showAllListings, setShowAllListings] = useState(false);
  const [menuProduct, setMenuProduct] = useState<Product | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const params = useLocalSearchParams<{ edit?: string }>();
  const [editOpen, setEditOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [bioInput, setBioInput] = useState('');
  const [savingStore, setSavingStore] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [shippingOpen, setShippingOpen] = useState(false);
  const [shippingInput, setShippingInput] = useState('');
  const [savingShipping, setSavingShipping] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  // The storefront's "Edit store" button links here with ?edit=1.
  const editParam = params.edit;
  const sellerReady = !!seller;
  useEffect(() => {
    if (editParam === '1' && sellerReady) {
      openEditStore();
      router.setParams({ edit: undefined } as any);
    }
  }, [editParam, sellerReady]);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { router.replace('/(auth)/sign-in' as any); return; }
    const uid = session.user.id;

    const { data: sellerData } = await supabase
      .from('marketplace_sellers')
      .select('id, shop_name, bio, avatar_url, banner_url, approval_status, stripe_onboarded, shipping_cents, featured_product_id')
      .eq('user_id', uid)
      .maybeSingle();

    if (!sellerData) {
      router.replace('/sell' as any);
      return;
    }
    setSeller(sellerData as Seller);

    const [{ data: productsData }, { data: ordersData }, { data: payoutsData }, { data: threadsData }] = await Promise.all([
      supabase.from('marketplace_products')
        .select('id, title, price_cents, images, status, inventory_count, is_digital')
        .eq('seller_id', sellerData.id).order('created_at', { ascending: false }),
      supabase.from('marketplace_orders')
        .select('id, status, total_cents, quantity, variant_label, created_at, siqa_fee_cents, processing_fee_cents, seller_payout_cents, shipping_cents, tax_fee_cents, tax_cents, cancel_reason, refunded_cents, shipping_name, shipping_address, marketplace_products(title, images)')
        .eq('seller_id', sellerData.id).order('created_at', { ascending: false }),
      supabase.from('marketplace_seller_payouts')
        .select('payout_cents, reversed_cents, status, transferred_at')
        .eq('seller_id', sellerData.id),
      supabase.from('marketplace_threads').select('id').eq('seller_id', sellerData.id),
    ]);

    const prods = (productsData ?? []) as Product[];
    setProducts(prods);
    setOrders((ordersData ?? []) as any);
    setPayouts((payoutsData ?? []) as Payout[]);

    // Reviews are public; unread = buyer messages in this shop's threads not yet read.
    const threadIds = (threadsData ?? []).map((t: any) => t.id);
    const [reviewsRes, unreadRes] = await Promise.all([
      prods.length
        ? supabase.from('marketplace_reviews').select('rating').in('product_id', prods.map(p => p.id))
        : Promise.resolve({ data: [] as { rating: number }[] }),
      threadIds.length
        ? supabase.from('marketplace_messages').select('id', { count: 'exact', head: true })
            .in('thread_id', threadIds).is('read_at', null).neq('sender_id', uid)
        : Promise.resolve({ count: 0 }),
    ]);
    const ratings = ((reviewsRes as any).data ?? []).map((r: any) => r.rating as number);
    setRating({ avg: ratings.length ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : 0, count: ratings.length });
    setUnread((unreadRes as any).count ?? 0);

    setLoading(false);
  }

  // ── Actions ────────────────────────────────────────────────────────
  // Flat shipping price, charged once per checkout when the buyer has at
  // least one of this shop's physical items in their cart.
  async function saveShipping() {
    if (!seller) return;
    const amount = parseFloat(shippingInput.replace(/[^0-9.]/g, '') || '0');
    if (!Number.isFinite(amount) || amount < 0 || amount > 500) {
      return showError('Shipping', 'Enter a shipping price between $0 and $500.');
    }
    const cents = Math.round(amount * 100);
    setSavingShipping(true);
    const { error } = await supabase.from('marketplace_sellers').update({ shipping_cents: cents }).eq('id', seller.id);
    setSavingShipping(false);
    if (error) return showError('Error', error.message);
    setSeller({ ...seller, shipping_cents: cents });
    setShippingOpen(false);
  }

  async function updateOrderStatus(orderId: string, status: string) {
    setBusyId(orderId);
    const { error } = await supabase.from('marketplace_orders').update({ status }).eq('id', orderId);
    setBusyId(null);
    if (error) return showError('Error', error.message);
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
    if (error) return showError('Error', error.message);
    setProducts(prev => prev.map(p => (p.id === product.id ? { ...p, status: newStatus } : p)));
  }

  // The featured item gets the big card at the top of the storefront.
  async function setFeatured(productId: string | null) {
    if (!seller) return;
    const { error } = await supabase.from('marketplace_sellers').update({ featured_product_id: productId }).eq('id', seller.id);
    if (error) return showError('Error', error.message);
    setSeller({ ...seller, featured_product_id: productId });
  }

  function openEditStore(s: Seller | null = seller) {
    if (!s) return;
    setNameInput(s.shop_name);
    setBioInput(s.bio ?? '');
    setStoreError(null);
    setEditOpen(true);
  }

  async function saveStore() {
    if (!seller) return;
    const name = nameInput.trim();
    if (!name) { setStoreError('Your shop needs a name.'); return; }
    setSavingStore(true);
    const { error } = await supabase.from('marketplace_sellers')
      .update({ shop_name: name, bio: bioInput.trim() || null }).eq('id', seller.id);
    setSavingStore(false);
    if (error) { setStoreError(error.message); return; }
    setSeller({ ...seller, shop_name: name, bio: bioInput.trim() || null });
    setEditOpen(false);
  }

  function openShipping() {
    setShippingInput(((seller?.shipping_cents ?? 0) / 100).toFixed(2));
    setShippingOpen(true);
  }

  // ── Numbers ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const sold = orders.filter(o => SOLD.includes(o.status));
    const inRange = (o: Order, from: number, to: number) => {
      const t = new Date(o.created_at).getTime();
      return t >= from && t < to;
    };
    const thisMonth = sold.filter(o => inRange(o, monthStart, Infinity));
    const lastMonth = sold.filter(o => inRange(o, lastStart, monthStart));
    const sum = (xs: Order[]) => xs.reduce((a, o) => a + o.total_cents, 0);
    const owed = payouts.filter(p => p.status === 'owed').reduce((a, p) => a + p.payout_cents, 0);
    const paidThisMonth = payouts
      .filter(p => p.status === 'transferred' && p.transferred_at && new Date(p.transferred_at).getTime() >= monthStart)
      .reduce((a, p) => a + p.payout_cents - (p.reversed_cents ?? 0), 0);
    return {
      salesNow: sum(thisMonth), salesBefore: sum(lastMonth),
      ordersNow: thisMonth.length, ordersBefore: lastMonth.length,
      totalSales: sold.reduce((a, o) => a + o.quantity, 0),
      owed, paidThisMonth,
    };
  }, [orders, payouts]);

  const toShip = orders.filter(o => o.status === 'paid');
  const counts = useMemo(() => {
    const out = { all: products.length, active: 0, hidden: 0, soldout: 0 };
    products.forEach(p => { out[listingState(p)]++; });
    return out;
  }, [products]);
  const filteredListings = listingFilter === 'all' ? products : products.filter(p => listingState(p) === listingFilter);
  const shownListings = showAllListings ? filteredListings : filteredListings.slice(0, OVERVIEW_LISTINGS);

  if (loading || !seller) {
    return (
      <DesktopShell>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
          <ActivityIndicator color={c.gold} size="large" />
        </View>
      </DesktopShell>
    );
  }

  const pad = isDesktop ? space[10] : space[5];
  const card = [{ backgroundColor: c.surface, borderRadius: radius.lg }, shadow('card')];
  const viewAsBuyer = () => router.push({ pathname: '/shop/[id]', params: { id: seller.id } } as any);
  const shippingValue = (seller.shipping_cents ?? 0) > 0 ? `Flat ${formatMoney(seller.shipping_cents)}` : 'Free';

  // ── Pieces ─────────────────────────────────────────────────────────
  const statusPill = (() => {
    const s = seller.approval_status;
    const look = s === 'approved'
      ? { bg: c.seedTint, fg: c.seed, label: 'Open' }
      : s === 'pending'
        ? { bg: c.goldTint, fg: c.goldInk, label: 'In review' }
        : { bg: c.surfaceSoft, fg: c.ink2, label: s.charAt(0).toUpperCase() + s.slice(1) };
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: look.bg, alignSelf: 'flex-start' }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: look.fg }} />
        <Text style={[type.micro, { color: look.fg }]}>{look.label}</Text>
      </View>
    );
  })();

  const avatar = (d: number) => (
    <View style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: c.night, borderWidth: 4, borderColor: c.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {seller.avatar_url
        ? <Image source={{ uri: seller.avatar_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityIgnoresInvertColors />
        : <Text style={[type.title1, { color: c.brandGold, fontSize: d * 0.36, lineHeight: d * 0.44 }]}>{seller.shop_name.trim().charAt(0).toUpperCase()}</Text>}
    </View>
  );

  const banner = (h: number, rounded: boolean) => (
    <View style={{ height: h, backgroundColor: c.bgSunk, borderRadius: rounded ? radius.lg : 0, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      {seller.banner_url
        ? <Image source={{ uri: seller.banner_url }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" accessibilityIgnoresInvertColors />
        : <Icon name="storefront-outline" size={26} color={c.ink3} />}
    </View>
  );

  const metaLine = (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
      {rating.count > 0 ? (
        <>
          <Icon name="star" size={14} color={c.gold} />
          <Text style={[type.subhead, { color: c.ink }]}>{rating.avg.toFixed(1)}</Text>
          <Text style={[type.subhead, { color: c.ink2 }]}>· {rating.count} {rating.count === 1 ? 'review' : 'reviews'} ·</Text>
        </>
      ) : null}
      <Text style={[type.subhead, { color: c.ink2 }]}>{stats.totalSales} {stats.totalSales === 1 ? 'sale' : 'sales'}</Text>
    </View>
  );

  const stripeNotice = !seller.stripe_onboarded ? (
    <Pressable
      onPress={() => router.push('/sell' as any)}
      accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.lg, backgroundColor: c.goldTint, opacity: pressed ? 0.8 : 1 })}
    >
      <IconTile icon="card-outline" bg={c.surface} fg={c.goldInk} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.callout, font(700), { color: c.ink }]}>Finish setting up payouts</Text>
        <Text style={[type.caption, { color: c.goldInk }]}>Connect Stripe so buyers can pay you.</Text>
      </View>
      <Icon name="chevron-forward" size={18} color={c.goldInk} />
    </Pressable>
  ) : null;

  const payoutTitle = stats.owed > 0 ? 'On the way to you' : 'Paid out this month';
  const payoutAmount = stats.owed > 0 ? stats.owed : stats.paidThisMonth;

  const kpi = (label: string, value: string, sub: { text: string; good: boolean } | string, tone: 'card' | 'gold' = 'card') => {
    const gold = tone === 'gold';
    const subText = typeof sub === 'string' ? sub : sub.text;
    const subGood = typeof sub !== 'string' && sub.good;
    return (
      <View key={label} style={[
        { flexGrow: 1, flexBasis: isDesktop ? 200 : 0, minWidth: isDesktop ? 180 : 0, padding: isDesktop ? 20 : 14, borderRadius: radius.lg, gap: isDesktop ? 6 : 4 },
        gold ? { backgroundColor: c.goldTint } : card,
      ]}>
        <Text style={[isDesktop ? type.subhead : type.micro, { color: gold ? c.goldInk : c.ink2 }]} numberOfLines={1}>{label}</Text>
        <Text style={[isDesktop ? type.amount : type.title2, font(800, 'display'), { color: c.ink }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        <Text style={[type.micro, font(isDesktop ? 500 : 600), { color: gold ? c.goldInk : subGood ? c.seed : c.ink2 }]} numberOfLines={2}>{subText}</Text>
      </View>
    );
  };

  const sectionHead = (title: string, count?: number, link?: { label: string; onPress: () => void }) => (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
      <Text style={[isDesktop && title === 'Listings' ? type.title2 : type.headline, { color: c.ink }]} accessibilityRole="header">
        {title}{count != null ? <Text style={[font(500), { color: c.ink2 }]}> · {count}</Text> : null}
      </Text>
      {link ? (
        <Pressable onPress={link.onPress} accessibilityRole="link" hitSlop={10}>
          <Text style={[type.subhead, { color: c.ink, textDecorationLine: 'underline' }]}>{link.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const thumb = (uri: string | undefined | null, d: number, r: number = radius.md) => (
    <View style={{ width: d, height: d, borderRadius: r, backgroundColor: c.bgSunk, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityIgnoresInvertColors />
        : <Icon name="image-outline" size={d > 60 ? 26 : 18} color={c.ink3} />}
    </View>
  );

  const toShipList = (
    <View style={{ gap: 4 }}>
      {sectionHead('To ship', toShip.length, { label: 'All orders', onPress: () => { setOrderFilter(toShip.length ? 'toship' : 'all'); setView('orders'); } })}
      {toShip.length === 0 ? (
        <Text style={[type.callout, { color: c.ink2, paddingVertical: 12 }]}>Nothing to ship right now.</Text>
      ) : toShip.slice(0, 4).map((o, i) => (
        <View key={o.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i === Math.min(toShip.length, 4) - 1 ? 0 : 1, borderBottomColor: c.line }}>
          {isDesktop ? null : thumb(o.marketplace_products?.images?.[0], 48)}
          <Pressable style={{ flex: 1, minWidth: 0, gap: 2 }} onPress={() => { setOrderFilter('toship'); setView('orders'); }} accessibilityRole="button">
            <Text style={[type.callout, font(600), { color: c.ink }]} numberOfLines={1}>
              {o.marketplace_products?.title ?? 'Product'}{o.quantity > 1 ? ` × ${o.quantity}` : ''}
            </Text>
            <Text style={[type.caption, { color: c.ink2 }]} numberOfLines={1}>
              {[o.shipping_name, o.variant_label, `Ordered ${shortDate(o.created_at)}`].filter(Boolean).join(' · ')}
            </Text>
          </Pressable>
          <Button label="Mark shipped" size="sm" variant="soft" loading={busyId === o.id} onPress={() => updateOrderStatus(o.id, 'shipped')} />
        </View>
      ))}
      {toShip.length > 4 ? (
        <Text style={[type.caption, { color: c.ink2, paddingTop: 6 }]}>+ {toShip.length - 4} more in All orders</Text>
      ) : null}
    </View>
  );

  const tag = (p: Product, overImage = false) => {
    const s = listingState(p);
    const look = s === 'active'
      ? (overImage ? { bg: 'rgba(255,255,255,0.92)', fg: '#111111' } : { bg: c.seedTint, fg: c.seed })
      : s === 'soldout' ? { bg: c.dangerTint, fg: c.danger } : { bg: c.surfaceSoft, fg: c.ink2 };
    const label = s === 'active' ? (seller.featured_product_id === p.id ? 'Featured' : 'Active') : s === 'soldout' ? 'Sold out' : 'Hidden';
    return (
      <View style={{ height: 22, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: look.bg, justifyContent: 'center', alignSelf: 'flex-start' }}>
        <Text style={[type.micro, { color: look.fg }]}>{label}</Text>
      </View>
    );
  };

  const stockText = (p: Product) => p.is_digital ? 'Digital' : `${p.inventory_count ?? 0} left`;
  const editListing = (p: Product) => router.push({ pathname: '/listing-create', params: { id: p.id } } as any);

  const listingFilters = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2], paddingVertical: 5 }}>
      <Chip label={`All ${counts.all}`} selected={listingFilter === 'all'} onPress={() => setListingFilter('all')} />
      <Chip label={`Active ${counts.active}`} selected={listingFilter === 'active'} onPress={() => setListingFilter('active')} />
      {counts.soldout > 0 ? <Chip label={`Sold out ${counts.soldout}`} selected={listingFilter === 'soldout'} onPress={() => setListingFilter('soldout')} /> : null}
      {counts.hidden > 0 ? <Chip label={`Hidden ${counts.hidden}`} selected={listingFilter === 'hidden'} onPress={() => setListingFilter('hidden')} /> : null}
    </ScrollView>
  );

  const listingsEmpty = (
    <View style={{ alignItems: 'center', paddingVertical: space[8], gap: space[3] }}>
      <Icon name="bag-handle-outline" size={30} color={c.ink3} />
      <Text style={[type.callout, { color: c.ink2 }]}>
        {products.length === 0 ? 'Your listings show up here.' : 'No listings in this group.'}
      </Text>
      {products.length === 0 ? <Button label="Add your first product" size="md" variant="secondary" icon="add" onPress={() => router.push('/listing-create' as any)} /> : null}
    </View>
  );

  const listingsGrid = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space[4] }}>
      {shownListings.map(p => (
        <Pressable key={p.id} onPress={() => editListing(p)} accessibilityRole="button" accessibilityLabel={`Edit ${p.title}`}
          style={({ pressed }) => ({ width: '48.3%', gap: space[2], opacity: pressed ? 0.85 : 1 })}>
          <View style={{ aspectRatio: 1, borderRadius: radius.lg, backgroundColor: c.bgSunk, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            {p.images?.[0] ? <Image source={{ uri: p.images[0] }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" accessibilityIgnoresInvertColors />
              : <Icon name="image-outline" size={26} color={c.ink3} />}
            <View style={{ position: 'absolute', top: 8, left: 8 }}>{tag(p, true)}</View>
            <IconButton icon="ellipsis-horizontal" label={`Options for ${p.title}`} variant="raised" size="sm" onPress={() => setMenuProduct(p)} style={{ position: 'absolute', top: 6, right: 6 }} />
          </View>
          <View style={{ gap: 2 }}>
            <Text style={[type.subhead, font(600), { color: c.ink }]} numberOfLines={2}>{p.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text style={[type.callout, font(800, 'display'), { color: c.ink }]}>{formatMoney(p.price_cents)}</Text>
              <Text style={[type.micro, { color: c.ink2 }]}>{stockText(p)}</Text>
            </View>
          </View>
        </Pressable>
      ))}
    </View>
  );

  const listingsTable = (
    <View style={[card, { overflow: 'hidden' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 44, borderBottomWidth: 1, borderBottomColor: c.line }}>
        <Text style={[type.caption, { color: c.ink2, flex: 1 }]}>Product</Text>
        <Text style={[type.caption, { color: c.ink2, width: 90 }]}>Price</Text>
        <Text style={[type.caption, { color: c.ink2, width: 80 }]}>Stock</Text>
        <Text style={[type.caption, { color: c.ink2, width: 84 }]}>Status</Text>
        <View style={{ width: 44 }} />
      </View>
      {shownListings.map((p, i) => (
        <Pressable key={p.id} onPress={() => editListing(p)} accessibilityRole="button" accessibilityLabel={`Edit ${p.title}`}
          style={({ hovered, pressed }: any) => ({
            flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10,
            borderBottomWidth: i === shownListings.length - 1 ? 0 : 1, borderBottomColor: c.line,
            backgroundColor: hovered || pressed ? c.bgSunk : 'transparent',
          })}>
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {thumb(p.images?.[0], 48, radius.sm)}
            <Text style={[type.subhead, font(600), { color: c.ink, flex: 1 }]} numberOfLines={1}>{p.title}</Text>
          </View>
          <Text style={[type.callout, font(800, 'display'), { color: c.ink, width: 90 }]}>{formatMoney(p.price_cents)}</Text>
          <Text style={[type.subhead, font(400), { color: c.ink2, width: 80 }]}>{p.is_digital ? 'Digital' : String(p.inventory_count ?? 0)}</Text>
          <View style={{ width: 84 }}>{tag(p)}</View>
          <IconButton icon="ellipsis-horizontal" label={`Options for ${p.title}`} onPress={() => setMenuProduct(p)} />
        </Pressable>
      ))}
    </View>
  );

  const listingsSection = (
    <View style={{ gap: space[3] }}>
      {sectionHead('Listings', undefined, isDesktop ? undefined : { label: 'Add', onPress: () => router.push('/listing-create' as any) })}
      {products.length > 0 ? listingFilters : null}
      {filteredListings.length === 0 ? listingsEmpty : isDesktop ? listingsTable : listingsGrid}
      {filteredListings.length > OVERVIEW_LISTINGS ? (
        <Pressable onPress={() => setShowAllListings(v => !v)} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 6 }}>
          <Text style={[type.subhead, { color: c.ink, textDecorationLine: 'underline' }]}>
            {showAllListings ? 'Show fewer' : `See all ${filteredListings.length} listings`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  const settingsRows = (
    <View>
      <SectionLabel style={{ marginBottom: 2 }}>Store settings</SectionLabel>
      <ListRow icon="card-outline" label="Payouts" value={seller.stripe_onboarded ? 'Stripe connected' : 'Set up'} onPress={() => router.push('/sell' as any)} />
      <ListRow icon="cube-outline" label="Shipping" value={shippingValue} onPress={openShipping} />
      <ListRow icon="chatbubble-outline" label="Messages" value={unread > 0 ? `${unread} new` : undefined} onPress={() => router.push('/messages' as any)} />
      <ListRow icon="create-outline" label="Store name and bio" onPress={() => openEditStore()} last />
    </View>
  );

  // ── Overview ───────────────────────────────────────────────────────
  const salesChange = change(stats.salesNow, stats.salesBefore, 'money');
  const ordersChange = change(stats.ordersNow, stats.ordersBefore, 'count');
  const kpis = (
    <View style={{ flexDirection: 'row', flexWrap: isDesktop ? 'wrap' : 'nowrap', gap: isDesktop ? space[4] : space[2] }}>
      {kpi(isDesktop ? 'Sales this month' : 'Sales', dollars(stats.salesNow), salesChange)}
      {kpi('Orders', String(stats.ordersNow), isDesktop && toShip.length ? `${toShip.length} waiting to ship` : ordersChange)}
      {kpi('Rating', rating.count ? rating.avg.toFixed(1) : '—', rating.count ? `${rating.count} ${rating.count === 1 ? 'review' : 'reviews'}` : 'No reviews yet')}
      {isDesktop && seller.stripe_onboarded ? kpi(payoutTitle, formatMoney(payoutAmount), 'Sent to your bank by Stripe', 'gold') : null}
    </View>
  );

  const mobilePayout = seller.stripe_onboarded && payoutAmount > 0 ? (
    <Pressable onPress={() => router.push('/sell' as any)} accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.lg, backgroundColor: c.goldTint, opacity: pressed ? 0.8 : 1 })}>
      <IconTile icon="wallet-outline" bg={c.surface} fg={c.goldInk} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.callout, font(700), { color: c.ink }]}>{payoutTitle} {formatMoney(payoutAmount)}</Text>
        <Text style={[type.caption, { color: c.goldInk }]}>Sent to your bank by Stripe</Text>
      </View>
      <Icon name="chevron-forward" size={18} color={c.goldInk} />
    </Pressable>
  ) : null;

  const mobileOverview = (
    <View style={{ gap: space[6] }}>
      <View>
        {banner(128, true)}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: -32, paddingLeft: 12 }}>
          {avatar(76)}
          <View style={{ paddingBottom: 6 }}>{statusPill}</View>
        </View>
        <View style={{ marginTop: space[3], gap: 4 }}>
          <Text style={[type.title1, { color: c.ink }]} accessibilityRole="header">{seller.shop_name}</Text>
          {seller.bio ? <Text style={[type.subhead, { color: c.ink2 }]} numberOfLines={2}>{seller.bio}</Text> : null}
          {metaLine}
        </View>
        <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[4] }}>
          <Button label="Edit store" variant="soft" size="md" grow onPress={() => openEditStore()} />
          <Button label="View as buyer" variant="secondary" size="md" icon="eye-outline" grow onPress={viewAsBuyer} />
        </View>
      </View>
      {stripeNotice ?? mobilePayout}
      <View style={{ gap: space[3] }}>
        {sectionHead('This month')}
        {kpis}
      </View>
      {toShipList}
      {listingsSection}
      {settingsRows}
    </View>
  );

  const desktopOverview = (
    <View style={{ gap: space[6] }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[4] }}>
        <Text style={[type.display, { color: c.ink }]} accessibilityRole="header">My store</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          <Button label="View as buyer" variant="secondary" size="md" icon="eye-outline" onPress={viewAsBuyer} />
          <Button label="Share" variant="secondary" size="md" icon="share-outline" onPress={() => shareShop(seller.id, seller.shop_name)} />
          <Button label="Add product" variant="primary" size="md" icon="add" onPress={() => router.push('/listing-create' as any)} />
        </View>
      </View>

      <View style={[card, { borderRadius: radius.xl, overflow: 'hidden' }]}>
        {banner(150, false)}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: space[5], paddingHorizontal: space[6], paddingBottom: space[6] }}>
          <View style={{ marginTop: -40 }}>{avatar(96)}</View>
          <View style={{ flexGrow: 1, flexBasis: 320, minWidth: 0, gap: 4, paddingTop: space[4] }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              <Text style={[type.title1, { color: c.ink }]}>{seller.shop_name}</Text>
              {statusPill}
            </View>
            {seller.bio ? <Text style={[type.subhead, { color: c.ink2 }]} numberOfLines={2}>{seller.bio}</Text> : null}
            {metaLine}
          </View>
          <Button label="Edit store" variant="soft" size="md" onPress={() => openEditStore()} />
        </View>
      </View>

      {stripeNotice}
      {kpis}

      <View style={{ flexDirection: twoCol ? 'row' : 'column', gap: space[6], alignItems: 'flex-start' }}>
        <View style={{ flex: twoCol ? 1 : undefined, alignSelf: 'stretch', minWidth: 0 }}>{listingsSection}</View>
        <View style={{ width: twoCol ? 360 : '100%', gap: space[6] }}>
          <View style={[card, { borderRadius: radius.xl, padding: space[5] }]}>{toShipList}</View>
          {settingsRows}
        </View>
      </View>
    </View>
  );

  // ── All orders ─────────────────────────────────────────────────────
  const visibleOrders = orderFilter === 'toship' ? toShip : orders;
  const ordersView = (
    <View style={{ gap: space[5] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <IconButton icon="arrow-back" label="Back to my store" onPress={() => setView('overview')} />
        <Text style={[isDesktop ? type.display : type.title1, { color: c.ink, flex: 1 }]} accessibilityRole="header">Orders</Text>
      </View>
      <SegmentedControl
        label="Which orders"
        value={orderFilter}
        onChange={setOrderFilter}
        options={[{ value: 'toship', label: `To ship · ${toShip.length}` }, { value: 'all', label: `All · ${orders.length}` }]}
        style={{ maxWidth: 420 }}
      />
      {visibleOrders.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: space[10], gap: space[3] }}>
          <Icon name="file-tray-outline" size={30} color={c.ink3} />
          <Text style={[type.callout, { color: c.ink2 }]}>{orderFilter === 'toship' ? 'Nothing to ship right now.' : 'No orders yet.'}</Text>
        </View>
      ) : (
        <View style={{ gap: space[3] }}>
          {visibleOrders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              ds={ds}
              busy={busyId === order.id}
              cancelling={cancellingId === order.id}
              cancelReason={cancelReason}
              cancelError={cancelError}
              thumb={thumb(order.marketplace_products?.images?.[0], 56)}
              onAdvance={() => updateOrderStatus(order.id, NEXT_STATUS[order.status])}
              onStartCancel={() => { setCancellingId(order.id); setCancelReason(''); setCancelError(null); }}
              onStopCancel={() => setCancellingId(null)}
              onReason={setCancelReason}
              onConfirmCancel={() => confirmCancel(order)}
            />
          ))}
        </View>
      )}
    </View>
  );

  return (
    <DesktopShell>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        {!isDesktop && view === 'overview' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[3], paddingTop: Math.max(insets.top, HEADER_TOP_PADDING - 16), paddingBottom: 4 }}>
            <IconButton icon="chevron-back" label="Back" onPress={() => goBack('/marketplace')} />
            <Text style={[type.headline, font(700, 'display'), { color: c.ink }]}>My store</Text>
            <IconButton icon="share-outline" label="Share your shop" onPress={() => shareShop(seller.id, seller.shop_name)} />
          </View>
        ) : null}

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: pad,
            paddingTop: isDesktop ? space[8] : view === 'orders' ? Math.max(insets.top, HEADER_TOP_PADDING - 16) : space[2],
            paddingBottom: isDesktop ? 56 : space[8],
            width: '100%', maxWidth: 1120 + pad * 2, alignSelf: 'center',
          }}
          keyboardShouldPersistTaps="handled"
        >
          {view === 'orders' ? ordersView : isDesktop ? desktopOverview : mobileOverview}
        </ScrollView>

        {!isDesktop && view === 'overview' ? (
          <View style={{ paddingHorizontal: space[5], paddingTop: space[3], paddingBottom: Math.max(insets.bottom, 12) + 8, backgroundColor: c.bg, borderTopWidth: 1, borderTopColor: c.line }}>
            <Button label="Add product" icon="add" onPress={() => router.push('/listing-create' as any)} />
          </View>
        ) : null}
      </View>

      <BottomSheet visible={!!menuProduct} onClose={() => setMenuProduct(null)} title={menuProduct?.title ?? 'Listing'}>
        {menuProduct ? (
          <>
            <OptionRow action icon="eye-outline" label="View listing" onPress={() => { const id = menuProduct.id; setMenuProduct(null); router.push({ pathname: '/product/[id]', params: { id } } as any); }} />
            <OptionRow action icon="create-outline" label="Edit listing" onPress={() => { const p = menuProduct; setMenuProduct(null); editListing(p); }} />
            {menuProduct.status === 'active' ? (
              <OptionRow
                action
                icon={seller.featured_product_id === menuProduct.id ? 'star' : 'star-outline'}
                label={seller.featured_product_id === menuProduct.id ? 'Stop featuring' : 'Feature on your storefront'}
                sub={seller.featured_product_id === menuProduct.id ? undefined : 'Shows as the big card at the top of your shop.'}
                onPress={() => { const p = menuProduct; setMenuProduct(null); setFeatured(seller.featured_product_id === p.id ? null : p.id); }}
              />
            ) : null}
            <OptionRow
              action
              last
              icon={menuProduct.status === 'active' ? 'eye-off-outline' : 'refresh-outline'}
              label={menuProduct.status === 'active' ? 'Hide from shoppers' : 'Show to shoppers again'}
              sub={menuProduct.status === 'active' ? 'You can bring it back any time.' : undefined}
              onPress={() => { const p = menuProduct; setMenuProduct(null); toggleListing(p); }}
            />
          </>
        ) : null}
      </BottomSheet>

      <BottomSheet
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit store"
        footer={<Button label="Save changes" loading={savingStore} onPress={saveStore} />}
      >
        <View style={{ gap: space[4] }}>
          <TextField
            label="Shop name"
            value={nameInput}
            onChangeText={(v) => { setNameInput(v); setStoreError(null); }}
            placeholder="e.g. Nour Handmade"
            maxLength={60}
            error={storeError}
          />
          <TextField
            label="About your shop"
            value={bioInput}
            onChangeText={setBioInput}
            placeholder="What you make and what makes it special"
            help="Shows under your shop name on your storefront."
            multiline
            maxLength={500}
            style={{ minHeight: 110 }}
          />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={shippingOpen}
        onClose={() => setShippingOpen(false)}
        title="Shipping"
        footer={<Button label="Save shipping" loading={savingShipping} onPress={saveShipping} />}
      >
        <TextField
          label="Flat price per order ($)"
          value={shippingInput}
          onChangeText={setShippingInput}
          keyboardType="decimal-pad"
          placeholder="0.00"
          help="Charged once per checkout when a buyer has any of your physical items. Enter 0 for free shipping."
          autoFocus
        />
      </BottomSheet>
    </DesktopShell>
  );
}

function IconTile({ icon, bg, fg }: { icon: SiqaIconName; bg: string; fg: string }) {
  return (
    <View style={{ width: 36, height: 36, borderRadius: radius.md, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }} importantForAccessibility="no">
      <Icon name={icon} size={20} color={fg} />
    </View>
  );
}

function OrderCard({
  order, ds, busy, cancelling, cancelReason, cancelError, thumb,
  onAdvance, onStartCancel, onStopCancel, onReason, onConfirmCancel,
}: {
  order: Order; ds: DS; busy: boolean; cancelling: boolean; cancelReason: string; cancelError: string | null; thumb: React.ReactNode;
  onAdvance: () => void; onStartCancel: () => void; onStopCancel: () => void; onReason: (v: string) => void; onConfirmCancel: () => void;
}) {
  const { c, shadow } = ds;
  const nextStatus = NEXT_STATUS[order.status];
  const canCancel = CANCELLABLE.includes(order.status);
  const statusLook = order.status === 'completed' ? { bg: c.seedTint, fg: c.seed }
    : order.status === 'cancelled' ? { bg: c.dangerTint, fg: c.danger }
    : order.status === 'paid' ? { bg: c.goldTint, fg: c.goldInk }
    : { bg: c.surfaceSoft, fg: c.ink2 };
  const addr = order.shipping_address;

  return (
    <View style={[{ flexDirection: 'row', gap: space[3], padding: space[4], borderRadius: radius.lg, backgroundColor: c.surface }, shadow('card')]}>
      {thumb}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2] }}>
          <Text style={[type.callout, font(700), { color: c.ink, flex: 1 }]} numberOfLines={2}>{order.marketplace_products?.title ?? 'Product'}</Text>
          <View style={{ height: 22, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: statusLook.bg, justifyContent: 'center' }}>
            <Text style={[type.micro, { color: statusLook.fg }]}>{orderStatusLabel(order.status)}</Text>
          </View>
        </View>
        <Text style={[type.caption, { color: c.ink2 }]}>
          {order.variant_label ? `${order.variant_label} · ` : ''}Qty {order.quantity} · {formatMoney(order.total_cents)}
          {(order.shipping_cents ?? 0) > 0 ? ` + ${formatMoney(order.shipping_cents)} shipping` : ''} · {shortDate(order.created_at)}
        </Text>
        {order.seller_payout_cents != null ? (
          // Same split the admin Payouts page shows: Siqa's 6.5% fee,
          // this order's share of Stripe processing and of the
          // Stripe Tax fee come off first.
          <Text style={[type.caption, { color: c.ink2 }]}>
            You get <Text style={[font(700), { color: c.ink }]}>{formatMoney(order.seller_payout_cents)}</Text>
            {' '}(fees {formatMoney((order.siqa_fee_cents ?? 0) + (order.processing_fee_cents ?? 0) + (order.tax_fee_cents ?? 0))})
          </Text>
        ) : null}
        {addr?.line1 && order.status !== 'pending' ? (
          <View style={{ marginTop: 6, padding: space[3], borderRadius: radius.sm, backgroundColor: c.bgSunk, gap: 2 }}>
            <Text style={[type.micro, { color: c.ink2 }]}>Ship to</Text>
            <Text style={[type.caption, font(400), { color: c.ink }]} selectable>
              {[
                order.shipping_name,
                addr.line1,
                addr.line2,
                [addr.city, addr.state, addr.postal_code].filter(Boolean).join(' '),
              ].filter(Boolean).join('\n')}
            </Text>
          </View>
        ) : null}
        {order.status === 'cancelled' && (order.refunded_cents || order.cancel_reason) ? (
          <Text style={[type.caption, { color: c.ink2 }]}>
            {(order.refunded_cents ?? 0) > 0 ? `Refunded ${formatMoney(order.refunded_cents)} to the buyer` : 'Not charged'}
            {order.cancel_reason ? ` · "${order.cancel_reason}"` : ''}
          </Text>
        ) : null}

        {cancelling ? (
          <View style={{ marginTop: space[2], padding: space[3], borderRadius: radius.md, backgroundColor: c.bgSunk, gap: space[2] }}>
            <Text style={[type.callout, font(700), { color: c.ink }]}>
              {order.status === 'pending'
                ? 'Cancel this unpaid order?'
                : `Refund the buyer ${formatMoney(order.total_cents + (order.shipping_cents ?? 0) + (order.tax_cents ?? 0))}?`}
            </Text>
            {order.status !== 'pending' ? (
              <Text style={[type.caption, font(400), { color: c.ink2 }]}>
                The buyer gets this item's price, shipping and tax back. Your payout for it
                {order.seller_payout_cents != null ? ` (${formatMoney(order.seller_payout_cents)})` : ''} is taken back.
              </Text>
            ) : null}
            <TextInput
              value={cancelReason}
              onChangeText={onReason}
              placeholder="Reason for the buyer (e.g. out of stock)"
              placeholderTextColor={c.ink3}
              accessibilityLabel="Reason for the buyer"
              maxLength={500}
              multiline
              style={[type.callout, { minHeight: 64, padding: space[3], borderRadius: radius.sm, backgroundColor: c.surface, color: c.ink, textAlignVertical: 'top', outlineStyle: 'none' } as any]}
            />
            {cancelError ? <Text style={[type.caption, { color: c.danger }]}>{cancelError}</Text> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              <Button label={order.status === 'pending' ? 'Cancel order' : 'Cancel & refund'} variant="danger" size="sm" loading={busy} onPress={onConfirmCancel} />
              <Button label="Keep order" variant="secondary" size="sm" disabled={busy} onPress={onStopCancel} />
            </View>
          </View>
        ) : (nextStatus || canCancel) ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[2] }}>
            {nextStatus ? <Button label={NEXT_LABEL[order.status]} variant="primary" size="sm" loading={busy} onPress={onAdvance} /> : null}
            {canCancel ? <Button label={order.status === 'pending' ? 'Cancel' : 'Cancel & refund'} variant="secondary" size="sm" disabled={busy} onPress={onStartCancel} /> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
