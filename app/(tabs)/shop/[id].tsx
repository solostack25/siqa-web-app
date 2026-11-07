// Storefront: the page buyers see for one shop (/shop/[sellerId]).
// Header (banner, avatar, name, bio, rating, sales, followers), Follow /
// Message / Share, trust lines (shipping, Muslim-owned, Stripe), the
// seller's featured item, every active listing with search, categories and
// sort, reviews across the shop, and an About section with policies.
// Phones: one column. Desktop web: search, categories and policies in a
// left column beside the items. The shop's owner sees the same page with
// Edit store / My store in place of Follow and Message.

import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  TextInput,
  Platform,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabase';
import { DesktopShell, useIsDesktopWeb } from '../../../components/DesktopShell';
import { Icon, type SiqaIconName } from '../../../components/Icon';
import { Button, IconButton, Chip, ListRow, BottomSheet, OptionRow } from '../../../components/ui';
import { focusedOnly } from '../../../components/FocusedOnly';
import { formatPrice } from '../../../lib/money';
import { shareShop } from '../../../lib/share';
import { priceRange, type Variations } from '../../../lib/productTaxonomy';
import { font, radius, space, type, useDS } from '../../../lib/ds';
import { HEADER_TOP_PADDING } from '../../../constants/theme';
import { goBack } from '../../../lib/goBack';

type Shop = {
  id: string; user_id: string; shop_name: string; bio: string | null; avatar_url: string | null; banner_url: string | null;
  created_at: string | null; approval_status: string; shipping_cents: number | null; featured_product_id: string | null;
  policies: { shipping?: string; returns?: string; message?: string } | null;
};
type Product = {
  id: string; title: string; price_cents: number; currency: string | null; images: string[] | null;
  inventory_count: number; is_digital: boolean | null; category: string | null; created_at: string; variations: Variations | null;
};
type Review = { id: string; product_id: string; buyer_id: string; rating: number; comment: string | null; created_at: string };
type Sort = 'newest' | 'price_low' | 'price_high' | 'top_rated';

const SORT_LABEL: Record<Sort, string> = {
  newest: 'Newest',
  price_low: 'Price: low to high',
  price_high: 'Price: high to low',
  top_rated: 'Top rated',
};

function notify(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

function monthYear(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "Aisha Mahmoud" → "Aisha M." so reviews don't show buyers' full names. */
function shortName(full: string | null | undefined) {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Siqa buyer';
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

function isSoldOut(p: Product) {
  if (p.is_digital) return false;
  const v = p.variations;
  const stock = v?.quantity_varies && v.variants?.length
    ? v.variants.reduce((n, x) => n + Math.max(0, x.inventory), 0)
    : p.inventory_count;
  return (stock ?? 0) <= 0;
}

function priceLabel(p: Product) {
  const r = priceRange(p);
  return r.min === r.max ? formatPrice(r.min, p.currency) : `${formatPrice(r.min, p.currency)}–${formatPrice(r.max, p.currency)}`;
}

function ShopScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ds = useDS();
  const { c, shadow } = ds;
  const isDesktop = useIsDesktopWeb();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sideBySide = isDesktop && width >= 1150;
  const cols = !isDesktop ? 2 : width >= 1420 ? 4 : 3;

  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [salesCount, setSalesCount] = useState<number | null>(null);
  const [followers, setFollowers] = useState(0);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [sort, setSort] = useState<Sort>('newest');
  const [sortOpen, setSortOpen] = useState(false);
  const [showAllItems, setShowAllItems] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [messageBusy, setMessageBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setQuery(''); setCategory('All'); setShowAllItems(false); setShowAllReviews(false);
    load(id);
  }, [id]);

  async function load(sellerId: string) {
    const [{ data: shopData }, { data: { session } }] = await Promise.all([
      supabase.from('marketplace_sellers')
        .select('id, user_id, shop_name, bio, avatar_url, banner_url, created_at, approval_status, shipping_cents, featured_product_id, policies')
        .eq('id', sellerId).maybeSingle(),
      supabase.auth.getSession(),
    ]);
    const me = session?.user?.id ?? null;
    setViewerId(me);
    // Shops that aren't open yet (or were closed) are only visible to their owner.
    if (!shopData || (shopData.approval_status !== 'approved' && shopData.user_id !== me)) {
      setShop(null); setLoading(false); return;
    }
    setShop(shopData as Shop);

    const [{ data: productData }, followersRes, followRow] = await Promise.all([
      supabase.from('marketplace_products')
        .select('id, title, price_cents, currency, images, inventory_count, is_digital, category, created_at, variations')
        .eq('seller_id', sellerId).eq('status', 'active')
        .order('created_at', { ascending: false }),
      supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', shopData.user_id),
      me ? supabase.from('follows').select('follower_id').eq('follower_id', me).eq('following_id', shopData.user_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const prods = (productData ?? []) as Product[];
    setProducts(prods);
    setFollowers(followersRes.count ?? 0);
    setFollowing(Boolean((followRow as any).data));

    const ids = prods.map(p => p.id);
    if (ids.length) {
      const [{ data: reviewData }, favRes] = await Promise.all([
        supabase.from('marketplace_reviews').select('id, product_id, buyer_id, rating, comment, created_at')
          .in('product_id', ids).order('created_at', { ascending: false }),
        me ? supabase.from('marketplace_favorites').select('product_id').eq('user_id', me).in('product_id', ids) : Promise.resolve({ data: [] }),
      ]);
      const revs = (reviewData ?? []) as Review[];
      setReviews(revs);
      setFavorites(new Set(((favRes as any).data ?? []).map((f: any) => f.product_id)));
      const buyerIds = Array.from(new Set(revs.map(r => r.buyer_id))).slice(0, 50);
      if (buyerIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', buyerIds);
        setNames(Object.fromEntries((profs ?? []).map((p: any) => [p.id, shortName(p.full_name)])));
      }
    } else {
      setReviews([]);
    }

    // Order rows are private to buyers and sellers, so the sales count only
    // shows to the owner; everyone else sees reviews and followers instead.
    if (me && me === shopData.user_id) {
      const { data: sold } = await supabase.from('marketplace_orders').select('quantity')
        .eq('seller_id', sellerId).in('status', ['paid', 'shipped', 'completed']);
      setSalesCount((sold ?? []).reduce((n: number, o: any) => n + (o.quantity ?? 0), 0));
    } else {
      setSalesCount(null);
    }

    setLoading(false);
  }

  async function requireSignedIn() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      router.push('/(auth)/sign-in' as any);
      return null;
    }
    return session.user.id;
  }

  async function toggleFollow() {
    if (!shop) return;
    const me = await requireSignedIn();
    if (!me) return;
    setFollowBusy(true);
    const { error } = following
      ? await supabase.from('follows').delete().eq('follower_id', me).eq('following_id', shop.user_id)
      : await supabase.from('follows').insert({ follower_id: me, following_id: shop.user_id });
    setFollowBusy(false);
    if (error) return notify('Error', "Couldn't update that. Please try again.");
    setFollowers(n => n + (following ? -1 : 1));
    setFollowing(!following);
  }

  async function toggleFavorite(productId: string) {
    const me = await requireSignedIn();
    if (!me) return;
    const on = favorites.has(productId);
    setFavorites(prev => {
      const next = new Set(prev);
      if (on) next.delete(productId); else next.add(productId);
      return next;
    });
    const { error } = on
      ? await supabase.from('marketplace_favorites').delete().eq('product_id', productId).eq('user_id', me)
      : await supabase.from('marketplace_favorites').insert({ product_id: productId, user_id: me });
    if (error) {
      setFavorites(prev => {
        const next = new Set(prev);
        if (on) next.add(productId); else next.delete(productId);
        return next;
      });
    }
  }

  // Message threads hang off a product, so a shop-level message reuses any
  // open thread with this shop, or starts one on the featured (else newest) item.
  async function messageShop() {
    if (!shop) return;
    const me = await requireSignedIn();
    if (!me || me === shop.user_id) return;
    setMessageBusy(true);
    const { data: existing } = await supabase.from('marketplace_threads').select('id')
      .eq('seller_id', shop.id).eq('buyer_id', me)
      .order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (existing) {
      setMessageBusy(false);
      router.push({ pathname: '/messages/[id]', params: { id: existing.id } } as any);
      return;
    }
    const productId = (featured ?? products[0])?.id;
    if (!productId) { setMessageBusy(false); return notify('Message', 'This shop has no items listed yet.'); }
    const { data: thread, error } = await supabase.from('marketplace_threads')
      .insert({ product_id: productId, seller_id: shop.id, buyer_id: me }).select('id').single();
    setMessageBusy(false);
    if (error || !thread) return notify('Error', "Couldn't start a conversation. Please try again.");
    router.push({ pathname: '/messages/[id]', params: { id: thread.id } } as any);
  }

  const ratingByProduct = useMemo(() => {
    const m: Record<string, { sum: number; n: number }> = {};
    reviews.forEach(r => { (m[r.product_id] ??= { sum: 0, n: 0 }); m[r.product_id].sum += r.rating; m[r.product_id].n++; });
    return m;
  }, [reviews]);
  const shopRating = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : null;
  const titleById = useMemo(() => Object.fromEntries(products.map(p => [p.id, p.title])), [products]);

  const featured = shop?.featured_product_id ? products.find(p => p.id === shop.featured_product_id) ?? null : null;

  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    products.forEach(p => { if (p.category) counts[p.category] = (counts[p.category] ?? 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [products]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = products.filter(p =>
      (category === 'All' || p.category === category) && (!q || p.title.toLowerCase().includes(q)));
    const avg = (p: Product) => { const r = ratingByProduct[p.id]; return r ? r.sum / r.n : 0; };
    list = [...list].sort((a, b) => {
      if (sort === 'price_low') return priceRange(a).min - priceRange(b).min;
      if (sort === 'price_high') return priceRange(b).min - priceRange(a).min;
      if (sort === 'top_rated') return avg(b) - avg(a) || (ratingByProduct[b.id]?.n ?? 0) - (ratingByProduct[a.id]?.n ?? 0);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    // In-stock items first; sold-out ones still show, at the end.
    return [...list.filter(p => !isSoldOut(p)), ...list.filter(isSoldOut)];
  }, [products, query, category, sort, ratingByProduct]);

  const pageSize = isDesktop ? cols * 4 : 8;
  const shownItems = showAllItems ? visible : visible.slice(0, pageSize);
  const shownReviews = showAllReviews ? reviews.filter(r => r.comment?.trim()) : reviews.filter(r => r.comment?.trim()).slice(0, isDesktop ? 3 : 2);
  const writtenReviews = reviews.filter(r => r.comment?.trim()).length;

  if (loading) {
    return (
      <DesktopShell>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
          <ActivityIndicator color={c.gold} size="large" />
        </View>
      </DesktopShell>
    );
  }

  if (!shop) {
    return (
      <DesktopShell>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, padding: space[8], gap: space[4] }}>
          <Icon name="storefront-outline" size={34} color={c.ink3} />
          <Text style={[type.headline, { color: c.ink }]}>This shop isn't open right now</Text>
          <Button label="Back to Shop" variant="secondary" size="md" onPress={() => router.replace('/(tabs)/marketplace' as any)} />
        </View>
      </DesktopShell>
    );
  }

  const isOwner = viewerId === shop.user_id;
  const pad = isDesktop ? space[10] : space[5];
  const card = [{ backgroundColor: c.surface, borderRadius: radius.xl }, shadow('card')];
  const since = monthYear(shop.created_at);
  const shippingLine = (shop.shipping_cents ?? 0) > 0 ? `Flat ${formatPrice(shop.shipping_cents)} shipping per order, any number of items` : 'Free shipping on physical items';
  const shippingPolicy = shop.policies?.shipping?.trim();
  const returnsPolicy = shop.policies?.returns?.trim();
  const openProduct = (pid: string) => router.push({ pathname: '/product/[id]', params: { id: pid } } as any);

  // ── Pieces ─────────────────────────────────────────────────────────
  const avatar = (d: number) => (
    <View style={[{ width: d, height: d, borderRadius: d / 2, backgroundColor: c.night, borderWidth: d > 100 ? 5 : 4, borderColor: c.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, shadow('card')]}>
      {shop.avatar_url
        ? <Image source={{ uri: shop.avatar_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityIgnoresInvertColors />
        : <Text style={[type.title1, { color: c.brandGold, fontSize: d * 0.36, lineHeight: d * 0.44 }]}>{shop.shop_name.trim().charAt(0).toUpperCase()}</Text>}
    </View>
  );

  const starsRow = (value: number, size: number) => (
    <View style={{ flexDirection: 'row', gap: 1 }} accessibilityLabel={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(n => (
        <Icon key={n} name={value >= n - 0.25 ? 'star' : value >= n - 0.75 ? 'star-half' : 'star-outline'} size={size} color={c.gold} />
      ))}
    </View>
  );

  const metaBits = [
    salesCount != null ? `${salesCount} ${salesCount === 1 ? 'sale' : 'sales'}` : null,
    `${followers} ${followers === 1 ? 'follower' : 'followers'}`,
    isDesktop && since ? `On Siqa since ${since}` : null,
  ].filter(Boolean).join(' · ');

  const meta = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
      {shopRating != null ? (
        <>
          <Icon name="star" size={14} color={c.gold} />
          <Text style={[type.subhead, font(600), { color: c.ink }]}>{shopRating.toFixed(1)}</Text>
          <Text style={[type.subhead, { color: c.ink2 }]}>({reviews.length}) ·</Text>
        </>
      ) : null}
      <Text style={[type.subhead, { color: c.ink2 }]}>{metaBits}</Text>
    </View>
  );

  const actions = isOwner ? (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
      <Button label="Edit store" variant="soft" size="md" grow={!isDesktop} onPress={() => router.push({ pathname: '/seller-dashboard', params: { edit: '1' } } as any)} />
      <Button label="My store" variant="secondary" size="md" icon="storefront-outline" grow={!isDesktop} onPress={() => router.push('/seller-dashboard' as any)} />
      {isDesktop ? <IconButton icon="share-outline" label="Share shop" variant="soft" onPress={() => shareShop(shop.id, shop.shop_name)} /> : null}
    </View>
  ) : (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
      <Button
        label={following ? 'Following' : 'Follow shop'}
        variant={following ? 'soft' : 'gold'}
        size="md"
        icon={following ? 'checkmark' : 'add'}
        loading={followBusy}
        grow={!isDesktop}
        onPress={toggleFollow}
        accessibilityLabel={following ? `Unfollow ${shop.shop_name}` : `Follow ${shop.shop_name}`}
      />
      <Button label="Message" variant="secondary" size="md" icon="chatbubble-outline" loading={messageBusy} grow={!isDesktop} onPress={messageShop} />
      {isDesktop ? <IconButton icon="share-outline" label="Share shop" variant="soft" onPress={() => shareShop(shop.id, shop.shop_name)} /> : null}
    </View>
  );

  const ownerNote = isOwner ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: radius.lg, backgroundColor: c.goldTint }}>
      <Icon name="eye-outline" size={20} color={c.goldInk} />
      <Text style={[type.callout, { color: c.ink, flex: 1 }]}>
        This is how buyers see your shop.{shop.approval_status !== 'approved' ? ' It goes public once Siqa approves it.' : ''}
      </Text>
    </View>
  ) : null;

  const trustLine = (icon: SiqaIconName, text: string) => (
    <View key={text} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 44 }}>
      <Icon name={icon} size={20} color={c.ink} />
      <Text style={[type.subhead, { color: c.ink, flex: 1 }]}>{text}</Text>
    </View>
  );
  const trust = [
    trustLine('cube-outline', shippingLine),
    trustLine('shield-checkmark-outline', 'Checkout secured by Stripe'),
  ];

  const sectionTitle = (title: string, count?: number) => (
    <Text style={[isDesktop ? type.title2 : type.headline, { color: c.ink }]} accessibilityRole="header">
      {title}{count != null ? <Text style={[type.headline, font(500), { color: c.ink2 }]}> · {count}</Text> : null}
    </Text>
  );

  const linkText = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={10}>
      <Text style={[type.subhead, { color: c.ink, textDecorationLine: 'underline' }]}>{label}</Text>
    </Pressable>
  );

  const featuredCard = featured ? (
    <Pressable
      onPress={() => openProduct(featured.id)}
      accessibilityRole="link"
      accessibilityLabel={`Featured: ${featured.title}, ${priceLabel(featured)}`}
      style={({ pressed }) => [card, { overflow: 'hidden', flexDirection: isDesktop ? 'row' : 'column', flexWrap: isDesktop ? 'wrap' : 'nowrap', opacity: pressed ? 0.92 : 1 }]}
    >
      <View style={{ flexGrow: 1, flexBasis: isDesktop ? 320 : 'auto', width: isDesktop ? undefined : '100%', height: isDesktop ? undefined : 230, minHeight: isDesktop ? 280 : undefined, backgroundColor: c.bgSunk, alignItems: 'center', justifyContent: 'center' }}>
        {featured.images?.[0]
          ? <Image source={{ uri: featured.images[0] }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" accessibilityIgnoresInvertColors />
          : <Icon name="image-outline" size={30} color={c.ink3} />}
      </View>
      <View style={{ flexGrow: 1, flexBasis: isDesktop ? 300 : 'auto', padding: isDesktop ? 28 : space[4], gap: isDesktop ? 10 : 4, justifyContent: 'center' }}>
        <View style={{ alignSelf: 'flex-start', height: 24, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: c.goldTint, justifyContent: 'center' }}>
          <Text style={[type.micro, { color: c.goldInk }]}>Featured</Text>
        </View>
        <Text style={[isDesktop ? type.title1 : type.headline, { color: c.ink }]} numberOfLines={2}>{featured.title}</Text>
        {ratingByProduct[featured.id] ? (
          <Text style={[type.caption, { color: c.ink2 }]}>
            {(ratingByProduct[featured.id].sum / ratingByProduct[featured.id].n).toFixed(1)} stars · {ratingByProduct[featured.id].n} {ratingByProduct[featured.id].n === 1 ? 'review' : 'reviews'}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4], marginTop: isDesktop ? 6 : 2 }}>
          <Text style={[isDesktop ? type.amount : type.title2, { color: c.ink }]}>{priceLabel(featured)}</Text>
          {isDesktop ? (
            <View style={{ height: 44, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: c.surfaceSoft, justifyContent: 'center' }}>
              <Text style={[type.buttonMd, { color: c.ink }]}>View item</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  ) : null;

  const searchBox = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], height: 44, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: c.surfaceSoft }}>
      <Icon name="search-outline" size={18} color={c.ink2} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search this shop"
        placeholderTextColor={c.ink3}
        accessibilityLabel="Search this shop"
        returnKeyType="search"
        style={[type.callout, { flex: 1, minWidth: 0, color: c.ink, paddingVertical: 0, outlineStyle: 'none' } as any]}
      />
      {query ? <IconButton icon="close-circle" label="Clear search" size="sm" color={c.ink3} onPress={() => setQuery('')} /> : null}
    </View>
  );

  const categoryChips = categories.length > 1 ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2], paddingVertical: 5 }}>
      <Chip label="All" selected={category === 'All'} onPress={() => setCategory('All')} />
      {categories.map(([name, n]) => (
        <Chip key={name} label={`${name} ${n}`} selected={category === name} onPress={() => setCategory(name)} />
      ))}
    </ScrollView>
  ) : null;

  const categoryList = categories.length > 1 ? (
    <View style={{ gap: 2 }}>
      <Text style={[type.caption, { color: c.ink2, paddingHorizontal: space[3], paddingBottom: 6 }]}>Categories</Text>
      {[['All items', products.length] as [string, number], ...categories].map(([name, n]) => {
        const key = name === 'All items' ? 'All' : name;
        const on = category === key;
        return (
          <Pressable key={name} onPress={() => setCategory(key)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={({ hovered }: any) => ({ height: 40, paddingHorizontal: space[3], borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: on || hovered ? c.surfaceSoft : 'transparent' })}>
            <Text style={[type.callout, font(on ? 700 : 500), { color: c.ink }]} numberOfLines={1}>{name}</Text>
            <Text style={[type.subhead, { color: c.ink2 }]}>{n}</Text>
          </Pressable>
        );
      })}
    </View>
  ) : null;

  const sortButton = (
    <Pressable onPress={() => setSortOpen(true)} accessibilityRole="button" accessibilityLabel={`Sort: ${SORT_LABEL[sort]}`}
      style={({ pressed }) => [{ height: 34, paddingHorizontal: 14, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, opacity: pressed ? 0.8 : 1 }, shadow('hairline')]}>
      <Icon name="swap-vertical" size={14} color={c.ink} />
      <Text style={[type.buttonSm, { color: c.ink }]}>{SORT_LABEL[sort]}</Text>
    </Pressable>
  );

  const itemWidth = `${(100 - (cols - 1) * (isDesktop ? 2 : 3.4)) / cols}%` as `${number}%`;
  const grid = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: isDesktop ? '2%' : '3.4%', rowGap: isDesktop ? 28 : 20 } as any}>
      {shownItems.map(p => {
        const r = ratingByProduct[p.id];
        const sold = isSoldOut(p);
        const fav = favorites.has(p.id);
        return (
          <Pressable key={p.id} onPress={() => openProduct(p.id)} accessibilityRole="link" accessibilityLabel={`${p.title}, ${priceLabel(p)}${sold ? ', sold out' : ''}`}
            style={({ pressed }) => ({ width: itemWidth, gap: 10, opacity: pressed ? 0.85 : 1 })}>
            <View style={{ aspectRatio: 1, borderRadius: radius.lg, backgroundColor: c.bgSunk, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
              {p.images?.[0]
                ? <Image source={{ uri: p.images[0] }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: sold ? 0.6 : 1 }} resizeMode="cover" accessibilityIgnoresInvertColors />
                : <Icon name="image-outline" size={26} color={c.ink3} />}
              {!isOwner ? (
                <IconButton
                  icon={fav ? 'heart' : 'heart-outline'}
                  label={fav ? `Remove ${p.title} from favorites` : `Save ${p.title} to favorites`}
                  variant="raised"
                  size="sm"
                  color={fav ? c.danger : c.ink}
                  onPress={() => toggleFavorite(p.id)}
                  style={{ position: 'absolute', top: 8, right: 8 }}
                />
              ) : null}
              {sold ? (
                <View style={{ position: 'absolute', left: 8, bottom: 8, height: 22, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: c.scrim, justifyContent: 'center' }}>
                  <Text style={[type.micro, { color: '#ffffff' }]}>Sold out</Text>
                </View>
              ) : null}
            </View>
            <View style={{ gap: 3 }}>
              <Text style={[isDesktop ? type.callout : type.subhead, font(500), { color: c.ink }]} numberOfLines={2}>{p.title}</Text>
              {r ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name="star" size={12} color={c.gold} />
                  <Text style={[type.micro, { color: c.ink2 }]}>{(r.sum / r.n).toFixed(1)} ({r.n})</Text>
                </View>
              ) : null}
              <Text style={[isDesktop ? type.headline : type.callout, font(800, 'display'), { color: c.ink }]}>{priceLabel(p)}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  const itemsSection = (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
        {sectionTitle('All items', products.length)}
        {products.length > 1 ? sortButton : null}
      </View>
      {!sideBySide && products.length > 4 ? searchBox : null}
      {!sideBySide ? categoryChips : null}
      {products.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: space[8], gap: space[3] }}>
          <Icon name="bag-handle-outline" size={30} color={c.ink3} />
          <Text style={[type.callout, { color: c.ink2 }]}>{isOwner ? 'Add a product and it shows up here.' : 'No items for sale right now.'}</Text>
          {isOwner ? <Button label="Add product" variant="secondary" size="md" icon="add" onPress={() => router.push('/listing-create' as any)} /> : null}
        </View>
      ) : visible.length === 0 ? (
        <Text style={[type.callout, { color: c.ink2, paddingVertical: space[6], textAlign: 'center' }]}>No items match that.</Text>
      ) : grid}
      {visible.length > pageSize ? (
        <Button
          label={showAllItems ? 'Show fewer' : `Show ${visible.length - pageSize} more ${visible.length - pageSize === 1 ? 'item' : 'items'}`}
          variant="secondary"
          size="md"
          onPress={() => setShowAllItems(v => !v)}
          style={{ alignSelf: isDesktop ? 'center' : 'stretch', marginTop: space[2] }}
        />
      ) : null}
    </View>
  );

  const reviewsSection = reviews.length ? (
    <View style={{ gap: space[4] }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
        {sectionTitle('Reviews')}
        {writtenReviews > shownReviews.length || showAllReviews
          ? linkText(showAllReviews ? 'Show fewer' : `See all ${writtenReviews}`, () => setShowAllReviews(v => !v))
          : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <Text style={[type.amount, { color: c.ink }]}>{shopRating!.toFixed(1)}</Text>
        <View style={{ gap: 4 }}>
          {starsRow(shopRating!, 16)}
          <Text style={[type.caption, { color: c.ink2 }]}>{reviews.length} {reviews.length === 1 ? 'review' : 'reviews'} from buyers</Text>
        </View>
      </View>
      <View style={{ flexDirection: isDesktop ? 'row' : 'column', flexWrap: 'wrap', gap: space[4] }}>
        {shownReviews.map(r => (
          <View key={r.id} style={{ flexGrow: 1, flexBasis: isDesktop ? 280 : 'auto', padding: isDesktop ? 18 : space[4], borderRadius: radius.lg, backgroundColor: c.bgSunk, gap: space[2] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.surfaceStrong, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[type.caption, font(700), { color: c.ink }]}>{(names[r.buyer_id] ?? 'S').charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.subhead, font(600), { color: c.ink }]}>{names[r.buyer_id] ?? 'Siqa buyer'}</Text>
                <Text style={[type.micro, font(500), { color: c.ink2 }]}>{shortDate(r.created_at)}</Text>
              </View>
              {starsRow(r.rating, 12)}
            </View>
            <Text style={[type.callout, { color: c.ink }]}>{r.comment}</Text>
            {titleById[r.product_id] ? (
              <Pressable onPress={() => openProduct(r.product_id)} accessibilityRole="link">
                <Text style={[type.caption, { color: c.ink2 }]} numberOfLines={1}>Bought: {titleById[r.product_id]}</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  ) : null;

  const policyRows = (
    <View>
      <ListRow label="Shipping" sub={shippingPolicy || shippingLine} />
      <ListRow label="Returns and exchanges" sub={returnsPolicy || 'Message the seller about returns or exchanges.'} />
      {since ? <ListRow label="On Siqa since" value={since} last /> : null}
    </View>
  );

  const aboutSection = (
    <View style={[!isDesktop ? null : card, { padding: isDesktop ? 28 : 0, gap: space[2] }]}>
      {sectionTitle('About the shop')}
      {shop.bio ? <Text style={[type.callout, { color: c.ink, lineHeight: 22 }]}>{shop.bio}</Text> : null}
      {!sideBySide ? policyRows : null}
      {isDesktop && !isOwner ? (
        <Button label="Message the seller" variant="soft" size="sm" onPress={messageShop} style={{ alignSelf: 'flex-start', marginTop: space[2] }} />
      ) : null}
    </View>
  );

  // ── Layouts ────────────────────────────────────────────────────────
  const mobile = (
    <View>
      <View style={{ height: 176 + insets.top, backgroundColor: c.bgSunk, alignItems: 'center', justifyContent: 'center' }}>
        {shop.banner_url
          ? <Image source={{ uri: shop.banner_url }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" accessibilityIgnoresInvertColors />
          : <Icon name="storefront-outline" size={28} color={c.ink3} />}
        <View style={{ position: 'absolute', top: Math.max(insets.top, HEADER_TOP_PADDING - 20), left: space[3], right: space[3], flexDirection: 'row', justifyContent: 'space-between' }}>
          <IconButton icon="chevron-back" label="Back" variant="scrim" onPress={() => goBack('/marketplace')} />
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <IconButton icon="share-outline" label="Share shop" variant="scrim" onPress={() => shareShop(shop.id, shop.shop_name)} />
            <IconButton icon="bag-outline" label="Cart" variant="scrim" onPress={() => router.push('/cart' as any)} />
          </View>
        </View>
      </View>
      <View style={{ paddingHorizontal: pad, gap: space[6] }}>
        <View>
          <View style={{ marginTop: -42 }}>{avatar(84)}</View>
          <View style={{ marginTop: space[3], gap: 6 }}>
            <Text style={[type.title1, { color: c.ink }]} accessibilityRole="header">{shop.shop_name}</Text>
            {shop.bio ? <Text style={[type.callout, { color: c.ink }]} numberOfLines={3}>{shop.bio}</Text> : null}
            {meta}
          </View>
          <View style={{ marginTop: space[4] }}>{actions}</View>
        </View>
        {ownerNote}
        <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.line, paddingVertical: 4 }}>{trust}</View>
        {featured ? <View style={{ gap: space[3] }}>{sectionTitle('Featured')}{featuredCard}</View> : null}
        {itemsSection}
        {reviewsSection}
        {aboutSection}
      </View>
    </View>
  );

  const desktop = (
    <View style={{ paddingHorizontal: pad, gap: space[6], width: '100%', maxWidth: 1160 + pad * 2, alignSelf: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Pressable onPress={() => router.push('/(tabs)/marketplace' as any)} accessibilityRole="link">
          <Text style={[type.subhead, { color: c.ink2 }]}>Shop</Text>
        </Pressable>
        <Icon name="chevron-forward" size={14} color={c.ink2} />
        <Text style={[type.subhead, { color: c.ink }]} numberOfLines={1}>{shop.shop_name}</Text>
      </View>

      <View>
        <View style={{ height: 240, borderRadius: radius.xl, backgroundColor: c.bgSunk, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
          {shop.banner_url
            ? <Image source={{ uri: shop.banner_url }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" accessibilityIgnoresInvertColors />
            : <Icon name="storefront-outline" size={30} color={c.ink3} />}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: space[6], paddingHorizontal: space[6] }}>
          <View style={{ marginTop: -52 }}>{avatar(116)}</View>
          <View style={{ flexGrow: 1, flexBasis: 360, minWidth: 0, gap: 6, paddingTop: space[4] }}>
            <Text style={[type.display, { color: c.ink }]} accessibilityRole="header">{shop.shop_name}</Text>
            {shop.bio ? <Text style={[type.callout, { color: c.ink }]} numberOfLines={2}>{shop.bio}</Text> : null}
            {meta}
          </View>
          {actions}
        </View>
      </View>

      {ownerNote}

      <View style={{ flexDirection: sideBySide ? 'row' : 'column', gap: space[8], alignItems: 'flex-start', marginTop: space[2] }}>
        {sideBySide ? (
          <View style={{ width: 280, gap: space[6] }}>
            {products.length > 4 ? searchBox : null}
            {categoryList}
            <View style={{ padding: space[4], borderRadius: radius.lg, backgroundColor: c.bgSunk }}>{trust}</View>
            <View>
              <Text style={[type.caption, { color: c.ink2, marginBottom: 2 }]}>Shop policies</Text>
              {policyRows}
            </View>
          </View>
        ) : (
          <View style={{ alignSelf: 'stretch', padding: space[4], borderRadius: radius.lg, backgroundColor: c.bgSunk }}>{trust}</View>
        )}
        <View style={{ flex: sideBySide ? 1 : undefined, alignSelf: 'stretch', minWidth: 0, gap: space[8] }}>
          {featuredCard}
          {itemsSection}
          {reviewsSection ? <View style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: space[6] }}>{reviewsSection}</View> : null}
          {aboutSection}
        </View>
      </View>
    </View>
  );

  return (
    <DesktopShell>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: isDesktop ? space[6] : 0, paddingBottom: isDesktop ? 64 : space[10] }}
          keyboardShouldPersistTaps="handled"
        >
          {isDesktop ? desktop : mobile}
        </ScrollView>
      </View>

      <BottomSheet visible={sortOpen} onClose={() => setSortOpen(false)} title="Sort items">
        {(Object.keys(SORT_LABEL) as Sort[]).map((s, i, all) => (
          <OptionRow key={s} label={SORT_LABEL[s]} selected={sort === s} last={i === all.length - 1} onPress={() => { setSort(s); setSortOpen(false); }} />
        ))}
      </BottomSheet>
    </DesktopShell>
  );
}

export default focusedOnly(ShopScreen);
