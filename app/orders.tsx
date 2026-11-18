import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useCallback, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { HEADER_TOP_PADDING } from '../constants/theme';
import { DesktopShell, useIsDesktopWeb } from '../components/DesktopShell';
import { Icon } from '../components/Icon';
import { Button, IconButton, Chip } from '../components/ui';
import { formatPrice as money } from '../lib/money';
import { font, radius, space, type, useDS, type DSColors } from '../lib/ds';
import { goBack } from '../lib/goBack';
import { notifyDialog as notify } from '../lib/dialogs';

// Buyer's order history. Desktop: list on the left, details of the picked
// order on the right. Phones: the details open under the picked card.
// Unpaid checkouts (status "pending") aren't orders yet, so they're hidden.

type Order = {
  id: string;
  status: 'paid' | 'shipped' | 'completed' | 'cancelled' | string;
  total_cents: number;
  shipping_cents: number | null;
  tax_cents: number | null;
  refunded_cents: number | null;
  quantity: number;
  variant_label: string | null;
  created_at: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  shipping_name: string | null;
  shipping_address: Record<string, any> | null;
  product_id: string;
  seller_id: string;
  marketplace_products: { title: string; images: string[] | null; is_digital: boolean | null } | null;
  marketplace_sellers: { shop_name: string | null; user_id: string | null } | null;
};

type Tab = 'all' | 'progress' | 'delivered' | 'cancelled';
const TAB_OF: Record<string, Tab> = { paid: 'progress', shipped: 'progress', completed: 'delivered', cancelled: 'cancelled' };
const STEP_OF: Record<string, number> = { paid: 1, shipped: 2, completed: 3, cancelled: 0 };
const STEPS = ['Ordered', 'Shipped', 'Delivered'];

const orderNo = (o: Order) => o.id.slice(0, 8).toUpperCase();
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const grandTotal = (o: Order) => o.total_cents + (o.shipping_cents ?? 0) + (o.tax_cents ?? 0);

function statusLook(status: string, c: DSColors) {
  switch (status) {
    case 'paid': return { label: 'Preparing', note: 'The shop is getting it ready', bg: c.goldTint, fg: c.goldInk, headline: 'Being prepared' };
    case 'shipped': return { label: 'Shipped', note: 'On its way to you', bg: c.surfaceSoft, fg: c.ink, headline: 'On its way' };
    case 'completed': return { label: 'Delivered', note: 'Delivered', bg: c.seedTint, fg: c.seed, headline: 'Delivered' };
    case 'cancelled': return { label: 'Cancelled', note: 'Cancelled', bg: c.dangerTint, fg: c.danger, headline: 'Cancelled' };
    default: return { label: status, note: '', bg: c.surfaceSoft, fg: c.ink, headline: status };
  }
}

function addressLines(o: Order): string[] {
  const a = o.shipping_address;
  if (!a) return o.shipping_name ? [o.shipping_name] : [];
  const cityLine = [a.city, [a.state, a.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const line1 = String(a.line1 ?? '');
  // Some saved addresses hold the whole address in line1; don't repeat it.
  const full = !!a.postal_code && line1.includes(String(a.postal_code));
  return [o.shipping_name ?? '', line1, full ? '' : String(a.line2 ?? ''), full ? '' : cityLine]
    .map((s) => s.trim()).filter(Boolean);
}

export default function OrdersScreen() {
  const { c, shadow } = useDS();
  const isDesktop = useIsDesktopWeb();
  const s = useMemo(() => makeStyles(c), [c]);

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { router.replace('/(auth)/sign-in' as any); return; }
    setUserId(session.user.id);

    const { data } = await supabase
      .from('marketplace_orders')
      .select('id, status, total_cents, shipping_cents, tax_cents, refunded_cents, quantity, variant_label, created_at, cancelled_at, cancel_reason, shipping_name, shipping_address, product_id, seller_id, marketplace_products(title, images, is_digital), marketplace_sellers(shop_name, user_id)')
      .eq('buyer_id', session.user.id)
      .neq('status', 'pending')
      .order('created_at', { ascending: false });

    const list = (data ?? []) as any as Order[];
    setOrders(list);
    setSelectedId((cur) => (cur && list.some((o) => o.id === cur) ? cur : isDesktop ? list[0]?.id ?? null : null));

    const { data: reviews } = await supabase.from('marketplace_reviews').select('order_id').eq('buyer_id', session.user.id);
    if (reviews) setReviewed(new Set(reviews.map((r: any) => r.order_id)));
    setLoading(false);
  }

  const counts = useMemo(() => {
    const n: Record<Tab, number> = { all: orders.length, progress: 0, delivered: 0, cancelled: 0 };
    orders.forEach((o) => { const t = TAB_OF[o.status]; if (t) n[t] += 1; });
    return n;
  }, [orders]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (tab !== 'all' && TAB_OF[o.status] !== tab) return false;
      if (!q) return true;
      return [o.marketplace_products?.title, o.marketplace_sellers?.shop_name, orderNo(o), o.variant_label]
        .some((v) => String(v ?? '').toLowerCase().includes(q));
    });
  }, [orders, tab, query]);

  const selected = orders.find((o) => o.id === selectedId) ?? (isDesktop ? visible[0] : undefined);

  function pick(o: Order) {
    setReviewing(false);
    setSelectedId((cur) => (!isDesktop && cur === o.id ? null : o.id));
  }

  async function messageShop(o: Order) {
    if (!userId) return;
    setBusy(true);
    const { data: existing } = await supabase
      .from('marketplace_threads').select('id')
      .eq('product_id', o.product_id).eq('buyer_id', userId).maybeSingle();
    let threadId = existing?.id as string | undefined;
    if (!threadId) {
      const { data: t, error } = await supabase
        .from('marketplace_threads')
        .insert({ product_id: o.product_id, seller_id: o.seller_id, buyer_id: userId })
        .select('id').single();
      if (error || !t) { setBusy(false); notify('Error', "Couldn't start a conversation. Please try again."); return; }
      threadId = t.id;
    }
    setBusy(false);
    router.push({ pathname: '/messages/[id]', params: { id: threadId } } as any);
  }

  function viewItem(o: Order) {
    router.push({ pathname: '/product/[id]', params: { id: o.product_id } } as any);
  }

  async function submitReview(o: Order) {
    if (!userId) return;
    setBusy(true);
    const { error } = await supabase.from('marketplace_reviews').insert({
      order_id: o.id, product_id: o.product_id, buyer_id: userId, rating, comment: comment.trim() || null,
    });
    setBusy(false);
    if (error) { notify('Error', error.message); return; }
    setReviewed((prev) => new Set(prev).add(o.id));
    setReviewing(false);
    setRating(5);
    setComment('');
  }

  // ── Pieces ──────────────────────────────────────────────────────────
  function Thumb({ o, size }: { o: Order; size: number }) {
    const img = o.marketplace_products?.images?.[0];
    return (
      <View style={[s.thumb, { width: size, height: size }]}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={o.marketplace_products?.title ?? 'Product'} />
        ) : (
          <Icon name="cube-outline" size={size * 0.3} color={c.ink3} />
        )}
      </View>
    );
  }

  function Meta({ label, value, right }: { label: string; value: string; right?: boolean }) {
    return (
      <View style={right ? { marginLeft: 'auto', alignItems: 'flex-end' } : null}>
        <Text style={[type.micro, { color: c.ink3 }]}>{label}</Text>
        <Text style={[type.subhead, { color: c.ink }]} numberOfLines={1}>{value}</Text>
      </View>
    );
  }

  function Progress({ o }: { o: Order }) {
    const step = STEP_OF[o.status] ?? 0;
    const tone = o.status === 'completed' ? c.seed : c.primary;
    return (
      <View style={s.progress}>
        {STEPS.map((label, i) => {
          const done = i < step;
          return (
            <View key={label} style={{ flex: 1, gap: 8 }}>
              <View style={[s.bar, { backgroundColor: done ? tone : c.surfaceStrong }]} />
              <Text style={[type.caption, { color: done ? c.ink : c.ink3 }, done && font(600)]}>{label}</Text>
            </View>
          );
        })}
      </View>
    );
  }

  function Card({ o }: { o: Order }) {
    const look = statusLook(o.status, c);
    const isSel = selected?.id === o.id;
    const p = o.marketplace_products;
    const shop = o.marketplace_sellers?.shop_name ?? 'Shop';
    const shipTo = addressLines(o)[0];
    return (
      <View style={[s.card, shadow('card'), { borderColor: isSel ? c.ink : 'transparent' }]}>
        <View style={s.cardTop}>
          {Meta({ label: 'Order placed', value: fmtDate(o.created_at) })}
          {Meta({ label: 'Total', value: money(grandTotal(o)) })}
          {shipTo ? Meta({ label: 'Ship to', value: shipTo }) : null}
          {Meta({ label: 'Order', value: `#${orderNo(o)}`, right: true })}
        </View>
        <View style={s.cardBody}>
          {Thumb({ o, size: isDesktop ? 104 : 72 })}
          <View style={{ flex: 1, minWidth: 180, gap: 4 }}>
            <Text style={[type.headline, { color: c.ink }]} numberOfLines={2}>{p?.title ?? 'Product'}</Text>
            <Text style={[type.subhead, { color: c.ink2 }]} numberOfLines={1}>
              {shop}{o.variant_label ? ` · ${o.variant_label}` : ''} · Qty {o.quantity}
            </Text>
            <View style={s.statusRow}>
              <View style={[s.pill, { backgroundColor: look.bg }]}>
                <Text style={[type.micro, font(700), { color: look.fg }]}>{look.label}</Text>
              </View>
              <Text style={[type.caption, { color: c.ink2 }]}>
                {o.status === 'cancelled' && (o.refunded_cents ?? 0) > 0 ? `Refunded ${money(o.refunded_cents!)}` : look.note}
              </Text>
            </View>
          </View>
          <View style={s.cardActions}>
            <Button label={isSel && !isDesktop ? 'Hide details' : 'View details'} variant="secondary" size="md" onPress={() => pick(o)} />
            <Button label="Buy again" variant="soft" size="md" onPress={() => viewItem(o)} />
          </View>
        </View>
        {o.status !== 'cancelled' ? Progress({ o }) : null}
        {!isDesktop && isSel ? <View style={{ padding: space[4], paddingTop: 0 }}>{Details({ o, inline: true })}</View> : null}
      </View>
    );
  }

  function Details({ o, inline }: { o: Order; inline?: boolean }) {
    const look = statusLook(o.status, c);
    const step = STEP_OF[o.status] ?? 0;
    const shop = o.marketplace_sellers?.shop_name ?? 'the shop';
    const canReview = o.status === 'completed' && !reviewed.has(o.id);
    const digital = !!o.marketplace_products?.is_digital;
    const addr = digital ? [] : addressLines(o);
    const accent = o.status === 'completed' ? c.seed : c.primary;

    const timeline = o.status === 'cancelled'
      ? [
          { title: 'Ordered', when: fmtDate(o.created_at), done: true, tone: c.primary },
          { title: 'Cancelled', when: [fmtDate(o.cancelled_at), o.cancel_reason].filter(Boolean).join(' · '), done: true, tone: c.danger },
          ...((o.refunded_cents ?? 0) > 0
            ? [{ title: `Refunded ${money(o.refunded_cents!)}`, when: 'Usually shows on your card in 5–10 days', done: true, tone: c.danger }]
            : []),
        ]
      : STEPS.map((t, i) => ({
          title: t,
          when: i === 0 ? fmtDate(o.created_at) : i < step ? 'Done' : 'Not yet',
          done: i < step,
          tone: accent,
        }));

    return (
      <View style={[inline ? s.detailsInline : [s.details, shadow('raised')]]}>
        <View>
          <Text style={[type.micro, { color: c.goldInk, letterSpacing: 0.7, textTransform: 'uppercase' }]}>Order #{orderNo(o)}</Text>
          <Text style={[type.title2, { color: c.ink, marginTop: 4 }]}>{look.headline}</Text>
          <Text style={[type.subhead, { color: c.ink2, marginTop: 2 }]}>Placed {fmtDate(o.created_at)} · from {shop}</Text>
        </View>

        <View accessibilityRole="list">
          {timeline.map((t, i) => {
            const last = i === timeline.length - 1;
            return (
              <View key={`${t.title}-${i}`} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 20, alignItems: 'center' }}>
                  <View style={[s.dot, t.done ? { backgroundColor: t.tone } : { backgroundColor: c.surface, borderWidth: 2, borderColor: c.lineControl }]} />
                  {!last ? <View style={{ width: 2, flex: 1, minHeight: 20, backgroundColor: t.done ? t.tone : c.surfaceStrong }} /> : null}
                </View>
                <View style={{ paddingBottom: last ? 0 : 16, flex: 1 }}>
                  <Text style={[type.callout, t.done ? font(700) : font(500), { color: t.done ? c.ink : c.ink3 }]}>{t.title}</Text>
                  {t.when ? <Text style={[type.caption, { color: c.ink2 }]}>{t.when}</Text> : null}
                </View>
              </View>
            );
          })}
        </View>

        <View style={s.summary}>
          {Row({ label: `Item${o.quantity > 1 ? `s (${o.quantity})` : ''}`, value: money(o.total_cents) })}
          {!digital ? Row({ label: 'Shipping', value: o.shipping_cents ? money(o.shipping_cents) : 'Free' }) : null}
          {o.tax_cents ? Row({ label: 'Tax', value: money(o.tax_cents) }) : null}
          <View style={{ height: 1, backgroundColor: c.line, marginVertical: 4 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={[type.callout, font(700), { color: c.ink }]}>Total</Text>
            <Text style={[type.title2, font(800, 'display'), { color: c.ink }]}>{money(grandTotal(o))}</Text>
          </View>
        </View>

        {addr.length ? (
          <View style={{ gap: 2 }}>
            <Text style={[type.micro, { color: c.ink2, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 4 }]}>Shipping to</Text>
            {addr.map((l, i) => <Text key={i} style={[type.callout, { color: i === 0 ? c.ink : c.ink2 }]}>{l}</Text>)}
          </View>
        ) : null}

        {reviewing && canReview ? (
          <View style={{ gap: 10 }}>
            <Text style={[type.headline, { color: c.ink }]}>How was it?</Text>
            <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole="radiogroup">
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setRating(n)} accessibilityRole="radio" accessibilityState={{ checked: n === rating }} accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`} hitSlop={6}>
                  <Icon name={n <= rating ? 'star' : 'star-outline'} size={26} color={n <= rating ? c.gold : c.lineControl} />
                </Pressable>
              ))}
            </View>
            <TextInput
              style={s.input}
              placeholder="Tell others about it (optional)"
              placeholderTextColor={c.ink3}
              value={comment}
              onChangeText={setComment}
              multiline
              accessibilityLabel="Review comment"
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label="Cancel" variant="secondary" size="md" grow onPress={() => setReviewing(false)} />
              <Button label="Post review" variant="primary" size="md" grow loading={busy} onPress={() => submitReview(o)} />
            </View>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {canReview ? (
              <Button label="Leave a review" variant="primary" icon="star-outline" onPress={() => setReviewing(true)} />
            ) : (
              <Button label="Buy again" variant="primary" onPress={() => viewItem(o)} />
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label="Message shop" variant="secondary" size="md" grow loading={busy} onPress={() => messageShop(o)} />
              <Button label="View item" variant="secondary" size="md" grow onPress={() => viewItem(o)} />
            </View>
            {reviewed.has(o.id) ? (
              <Text style={[type.caption, { color: c.seed, textAlign: 'center' }]}>You reviewed this order</Text>
            ) : null}
            <Pressable onPress={() => router.push('/support' as any)} accessibilityRole="link" style={{ alignSelf: 'center', paddingVertical: 8 }}>
              <Text style={[type.subhead, { color: c.ink, textDecorationLine: 'underline' }]}>Problem with this order?</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  function Row({ label, value }: { label: string; value: string }) {
    return (
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[type.subhead, { color: c.ink2 }]}>{label}</Text>
        <Text style={[type.subhead, { color: c.ink }]}>{value}</Text>
      </View>
    );
  }

  // ── Screen ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <DesktopShell>
        <View style={s.centered}><ActivityIndicator color={c.gold} size="large" /></View>
      </DesktopShell>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'progress', label: 'In progress' },
    { key: 'delivered', label: 'Delivered' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <DesktopShell>
      <ScrollView style={{ flex: 1, backgroundColor: c.bgSunk }} contentContainerStyle={[s.page, { paddingHorizontal: isDesktop ? space[10] : space[5] }]}>
        <View style={s.inner}>
          <View style={s.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4], flexShrink: 1 }}>
              <IconButton icon="arrow-back" label="Back" variant="raised" onPress={() => goBack('/marketplace')} />
              <View style={{ flexShrink: 1 }}>
                <Text style={[isDesktop ? type.display : type.title1, { color: c.ink }]} accessibilityRole="header">Your orders</Text>
                <Text style={[type.subhead, { color: c.ink2 }]}>Everything you've bought from shops on Siqa</Text>
              </View>
            </View>
            {orders.length > 0 ? (
              <View style={[s.search, !isDesktop && { width: '100%' }]}>
                <Icon name="search-outline" size={18} color={c.ink2} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search by item, shop or order #"
                  placeholderTextColor={c.ink3}
                  style={[type.callout, { flex: 1, color: c.ink, outlineStyle: 'none' } as any]}
                  accessibilityLabel="Search orders"
                />
              </View>
            ) : null}
          </View>

          {orders.length === 0 ? (
            <View style={[s.empty, shadow('card')]}>
              <Icon name="bag-handle-outline" size={36} color={c.ink3} />
              <Text style={[type.headline, { color: c.ink }]}>No orders yet</Text>
              <Text style={[type.callout, { color: c.ink2, textAlign: 'center' }]}>Things you buy from shops on Siqa show up here.</Text>
              <Button label="Browse the Shop" variant="primary" size="md" onPress={() => router.push('/(tabs)/marketplace' as any)} style={{ marginTop: 8 }} />
            </View>
          ) : (
            <>
              <View style={s.tabs} accessibilityRole="tablist">
                {tabs.map((t) => (
                  <Chip key={t.key} label={`${t.label}  ${counts[t.key]}`} selected={tab === t.key} onPress={() => setTab(t.key)} />
                ))}
              </View>

              <View style={s.columns}>
                <View style={s.list}>
                  {visible.map((o) => <View key={o.id}>{Card({ o })}</View>)}
                  {visible.length === 0 ? (
                    <View style={[s.empty, { paddingVertical: 40 }]}>
                      <Text style={[type.callout, { color: c.ink2 }]}>No orders match.</Text>
                    </View>
                  ) : null}
                  <Text style={[type.caption, { color: c.ink2, marginTop: 4 }]}>
                    Checkouts you didn't finish paying for aren't shown here. Those items are still in your cart.
                  </Text>
                </View>
                {isDesktop && selected ? (
                  <View style={s.side}>{Details({ o: selected })}</View>
                ) : null}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </DesktopShell>
  );
}

function makeStyles(c: DSColors) {
  return StyleSheet.create({
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
    page: { paddingTop: HEADER_TOP_PADDING + space[4], paddingBottom: 64 },
    inner: { width: '100%', maxWidth: 1240, alignSelf: 'center', gap: space[6] },
    header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[4] },
    search: {
      flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, width: 340, maxWidth: '100%',
      paddingHorizontal: 14, backgroundColor: c.surfaceSoft, borderRadius: radius.md,
    },
    tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
    columns: { flexDirection: 'row', flexWrap: 'wrap', gap: space[6], alignItems: 'flex-start' },
    list: { flexGrow: 999, flexShrink: 1, flexBasis: 560, minWidth: 0, gap: space[4] },
    side: { flexGrow: 1, flexShrink: 1, flexBasis: 360, maxWidth: 420, position: 'sticky' as any, top: space[6] },

    card: { backgroundColor: c.surface, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 2 },
    cardTop: {
      flexDirection: 'row', flexWrap: 'wrap', columnGap: space[8], rowGap: space[2],
      paddingHorizontal: space[5], paddingVertical: 14, backgroundColor: c.bgSunk,
      borderBottomWidth: 1, borderBottomColor: c.line,
    },
    cardBody: { flexDirection: 'row', flexWrap: 'wrap', gap: space[5], padding: space[5], alignItems: 'center' },
    cardActions: { gap: space[2] },
    thumb: { borderRadius: radius.lg, backgroundColor: c.surfaceSoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    statusRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2], marginTop: space[2] },
    pill: { height: 24, paddingHorizontal: 10, borderRadius: radius.pill, justifyContent: 'center' },
    progress: { flexDirection: 'row', gap: space[2], paddingHorizontal: space[5], paddingBottom: space[5] },
    bar: { height: 6, borderRadius: radius.pill },

    details: { backgroundColor: c.surface, borderRadius: radius.xl, padding: space[6], gap: space[5] },
    detailsInline: { backgroundColor: c.bgSunk, borderRadius: radius.lg, padding: space[4], gap: space[5] },
    dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
    summary: { backgroundColor: c.bgSunk, borderRadius: radius.lg, padding: space[4], gap: space[2] },
    input: {
      ...type.callout, color: c.ink, backgroundColor: c.surfaceSoft, borderRadius: radius.md,
      paddingHorizontal: 12, paddingVertical: 10, minHeight: 72, textAlignVertical: 'top',
    },
    empty: { backgroundColor: c.surface, borderRadius: radius.xl, padding: space[8], alignItems: 'center', gap: space[2] },
  });
}
