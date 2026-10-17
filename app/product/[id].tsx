import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  useWindowDimensions,
  Alert,
  Platform,
} from 'react-native';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTheme, type AppColors } from '../../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../../constants/theme';
import { DesktopShell, useIsDesktopWeb } from '../../components/DesktopShell';
import { Icon } from '../../components/Icon';
import { formatPrice } from '../../lib/money';

// Product page laid out like an Etsy listing: gallery with a thumbnail
// rail on the left, a purchase panel on the right (price, title, shop and
// rating, quantity, Add to cart / Buy it now, then expandable item
// details, policies and a seller card), and reviews plus "more from this
// shop" underneath. On phones the same sections stack in that order.

type ProductDetail = {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  price_cents: number;
  currency: string | null;
  images: string[] | null;
  inventory_count: number;
  is_digital: boolean;
  category: string | null;
};

type SellerPolicies = { shipping?: string; returns?: string; message?: string } | null;
type Seller = {
  id: string;
  user_id: string;
  shop_name: string;
  bio: string | null;
  avatar_url: string | null;
  created_at: string | null;
  approval_status: string | null;
  policies: SellerPolicies;
};
type Review = { id: string; rating: number; comment: string | null; created_at: string };
type RelatedProduct = { id: string; title: string; price_cents: number; currency: string | null; images: string[] | null };
type ShopStats = { avg: number | null; count: number; listings: number };

const LOW_STOCK = 5;
const MAX_QTY = 10;

function monthYear(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Alert.alert is a no-op in react-native-web, so on the website these
// messages silently did nothing. Web gets the browser's alert instead.
function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: C } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const { width: windowWidth } = useWindowDimensions();
  const styles = makeStyles(C);

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [related, setRelated] = useState<RelatedProduct[]>([]);
  const [shopStats, setShopStats] = useState<ShopStats>({ avg: null, count: 0, listings: 0 });
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [messagingBusy, setMessagingBusy] = useState(false);
  const [open, setOpen] = useState({ details: true, policies: false });

  useEffect(() => {
    if (!id) return;
    // Reset per-product UI state when navigating between listings
    // (e.g. tapping an item under "More from this shop").
    setLoading(true);
    setActiveImage(0);
    setQuantity(1);
    setJustAdded(false);
    load(id);
  }, [id]);

  async function load(productId: string) {
    const { data: productData } = await supabase
      .from('marketplace_products')
      .select('id, seller_id, title, description, price_cents, currency, images, inventory_count, is_digital, category')
      .eq('id', productId)
      .single();
    if (!productData) { setProduct(null); setLoading(false); return; }
    setProduct(productData as any);

    const [{ data: sellerData }, { data: reviewData }, { data: shopProducts }, { data: { session } }] = await Promise.all([
      supabase
        .from('marketplace_sellers')
        .select('id, user_id, shop_name, bio, avatar_url, created_at, approval_status, policies')
        .eq('id', productData.seller_id)
        .single(),
      supabase
        .from('marketplace_reviews')
        .select('id, rating, comment, created_at')
        .eq('product_id', productId)
        .order('created_at', { ascending: false }),
      supabase
        .from('marketplace_products')
        .select('id, title, price_cents, currency, images')
        .eq('seller_id', productData.seller_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
      supabase.auth.getSession(),
    ]);
    setSeller((sellerData as any) ?? null);
    setReviews(reviewData ?? []);
    setViewerId(session?.user?.id ?? null);

    const shopList = (shopProducts as RelatedProduct[] | null) ?? [];
    setRelated(shopList.filter(p => p.id !== productId).slice(0, 8));

    // Shop-wide rating across all of the seller's listings, like the
    // star rating Etsy shows next to the shop name.
    const shopIds = shopList.map(p => p.id);
    if (shopIds.length > 0) {
      const { data: shopReviews } = await supabase
        .from('marketplace_reviews')
        .select('rating')
        .in('product_id', shopIds);
      const ratings = (shopReviews ?? []).map((r: any) => r.rating as number);
      setShopStats({
        avg: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
        count: ratings.length,
        listings: shopIds.length,
      });
    } else {
      setShopStats({ avg: null, count: 0, listings: 0 });
    }

    if (session?.user) {
      const { data: favRow } = await supabase
        .from('marketplace_favorites')
        .select('id')
        .eq('product_id', productId)
        .eq('user_id', session.user.id)
        .maybeSingle();
      setIsFavorited(Boolean(favRow));
    }

    setLoading(false);
  }

  async function requireSignedIn() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      if (Platform.OS === 'web') {
        // The native "Sign in required" alert never showed on web, so
        // clicks did nothing; send people straight to sign-in instead.
        router.push('/(auth)/sign-in' as any);
      } else {
        Alert.alert('Sign in required', 'Sign in to buy or save items.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign In', onPress: () => router.push('/(auth)/sign-in' as any) },
        ]);
      }
      return null;
    }
    return session.user.id;
  }

  async function toggleFavorite() {
    if (!product) return;
    const userId = await requireSignedIn();
    if (!userId) return;
    setFavBusy(true);
    if (isFavorited) {
      await supabase.from('marketplace_favorites').delete().eq('product_id', product.id).eq('user_id', userId);
      setIsFavorited(false);
    } else {
      await supabase.from('marketplace_favorites').insert({ product_id: product.id, user_id: userId });
      setIsFavorited(true);
    }
    setFavBusy(false);
  }

  async function addToCart() {
    if (!product) return;
    const userId = await requireSignedIn();
    if (!userId) return;

    setAddingToCart(true);
    // One row per (user, product) — bump quantity if it's already there
    // rather than inserting a duplicate line.
    const { data: existing } = await supabase
      .from('marketplace_cart_items')
      .select('id, quantity')
      .eq('user_id', userId)
      .eq('product_id', product.id)
      .maybeSingle();

    let error: unknown = null;
    if (existing) {
      const wanted = existing.quantity + quantity;
      const next = product.is_digital ? wanted : Math.min(wanted, product.inventory_count);
      ({ error } = await supabase.from('marketplace_cart_items').update({ quantity: next }).eq('id', existing.id));
    } else {
      ({ error } = await supabase.from('marketplace_cart_items').insert({ user_id: userId, product_id: product.id, quantity }));
    }
    setAddingToCart(false);
    if (error) {
      notify('Error', "Couldn't add this to your cart. Please try again.");
      return;
    }
    // Inline confirmation under the button (works on web too, unlike Alert).
    setJustAdded(true);
  }

  async function messageSeller() {
    if (!product) return;
    const userId = await requireSignedIn();
    if (!userId) return;

    if (userId === seller?.user_id) return; // sellers can't message themselves via their own listing

    setMessagingBusy(true);
    // Reuse an existing thread for this product+buyer if one's already open.
    const { data: existing } = await supabase
      .from('marketplace_threads')
      .select('id')
      .eq('product_id', product.id)
      .eq('buyer_id', userId)
      .maybeSingle();

    if (existing) {
      setMessagingBusy(false);
      router.push({ pathname: '/messages/[id]', params: { id: existing.id } } as any);
      return;
    }

    const { data: newThread, error } = await supabase
      .from('marketplace_threads')
      .insert({ product_id: product.id, seller_id: product.seller_id, buyer_id: userId })
      .select('id')
      .single();

    setMessagingBusy(false);
    if (error || !newThread) {
      notify('Error', "Couldn't start a conversation. Please try again.");
      return;
    }
    router.push({ pathname: '/messages/[id]', params: { id: newThread.id } } as any);
  }

  async function buyNow() {
    if (!product) return;
    const userId = await requireSignedIn();
    if (!userId) return;
    router.push({
      pathname: '/checkout',
      params: { productId: product.id, quantity: String(quantity) },
    } as any);
  }

  function goToCategory(category: string) {
    router.push({ pathname: '/(tabs)/marketplace', params: { category } } as any);
  }

  function stars(value: number, size = 14) {
    return (
      <View style={{ flexDirection: 'row', gap: 1 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <Icon
            key={n}
            name={value >= n - 0.25 ? 'star' : value >= n - 0.75 ? 'star-half' : 'star-outline'}
            size={size}
            color={C.gold}
          />
        ))}
      </View>
    );
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

  if (!product) {
    return (
      <DesktopShell>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>This product couldn't be found.</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
            <Text style={{ color: C.gold, fontWeight: '600' }}>← Go Back</Text>
          </TouchableOpacity>
        </View>
      </DesktopShell>
    );
  }

  const images = product.images?.length ? product.images : [];
  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;
  const soldOut = !product.is_digital && product.inventory_count <= 0;
  const maxQty = product.is_digital ? MAX_QTY : Math.max(1, Math.min(product.inventory_count, MAX_QTY));
  const isOwnListing = Boolean(viewerId && seller && viewerId === seller.user_id);
  const shippingText = seller?.policies?.shipping?.trim() || null;
  const returnsText = seller?.policies?.returns?.trim() || null;
  const sellerSince = monthYear(seller?.created_at);

  // Desktop content width: the shell's main area minus the 220px sidebar,
  // capped so the two columns stay a comfortable reading size.
  const contentWidth = isDesktopWeb ? Math.min(windowWidth - 220, 1200) : windowWidth;
  const gridCols = isDesktopWeb ? (contentWidth > 1000 ? 4 : 3) : 2;
  const gridGap = isDesktopWeb ? 16 : 12;
  const cardWidth = isDesktopWeb
    ? (contentWidth - Theme.spacing.xxxl * 2 - (gridCols - 1) * gridGap) / gridCols
    : (windowWidth - Theme.spacing.lg * 2 - gridGap) / 2;

  // ── Gallery ───────────────────────────────────────────────────────────
  const gallery = (
    <View style={isDesktopWeb ? styles.galleryRow : undefined}>
      {isDesktopWeb && images.length > 1 && (
        <View style={styles.thumbRail}>
          {images.map((uri, index) => (
            <TouchableOpacity key={uri + index} onPress={() => setActiveImage(index)}>
              <Image source={{ uri }} style={[styles.thumbRailImg, index === activeImage && styles.thumbActive]} resizeMode="cover" />
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.mainImage}>
          {images.length > 0 ? (
            <Image source={{ uri: images[activeImage] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <Text style={styles.galleryEmoji}>🛍️</Text>
          )}

          <TouchableOpacity
            style={styles.favOverlay}
            onPress={toggleFavorite}
            disabled={favBusy}
            accessibilityLabel={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Icon name={isFavorited ? 'heart' : 'heart-outline'} size={20} color={isFavorited ? C.live : '#1A1A1A'} />
          </TouchableOpacity>

          {images.length > 1 && (
            <>
              <TouchableOpacity
                style={[styles.navArrow, { left: 12 }]}
                onPress={() => setActiveImage(i => (i - 1 + images.length) % images.length)}
                accessibilityLabel="Previous photo"
              >
                <Icon name="chevron-back" size={20} color="#1A1A1A" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.navArrow, { right: 12 }]}
                onPress={() => setActiveImage(i => (i + 1) % images.length)}
                accessibilityLabel="Next photo"
              >
                <Icon name="chevron-forward" size={20} color="#1A1A1A" />
              </TouchableOpacity>
              <View style={styles.counterPill}>
                <Text style={styles.counterText}>{activeImage + 1} / {images.length}</Text>
              </View>
            </>
          )}
        </View>

        {!isDesktopWeb && images.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
            {images.map((uri, index) => (
              <TouchableOpacity key={uri + index} onPress={() => setActiveImage(index)}>
                <Image source={{ uri }} style={[styles.thumbRowImg, index === activeImage && styles.thumbActive]} resizeMode="cover" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );

  // ── Purchase panel ────────────────────────────────────────────────────
  const stockNote = product.is_digital
    ? null
    : soldOut
      ? 'Sold out'
      : product.inventory_count <= LOW_STOCK
        ? `Only ${product.inventory_count} left`
        : null;

  const purchasePanel = (
    <View style={styles.panel}>
      {stockNote && <Text style={styles.stockNote}>{stockNote}</Text>}

      <Text style={styles.price}>{formatPrice(product.price_cents, product.currency)}</Text>
      <Text style={styles.title}>{product.title}</Text>

      {seller && (
        <View style={styles.shopLine}>
          <Text style={styles.shopName}>{seller.shop_name}</Text>
          {seller.approval_status === 'approved' && (
            <View style={styles.verifiedBadge}>
              <Icon name="checkmark-circle" size={13} color={C.emeraldLight} />
              <Text style={styles.verifiedText}>Verified shop</Text>
            </View>
          )}
          {shopStats.avg !== null && (
            <View style={styles.inlineRating}>
              {stars(shopStats.avg, 13)}
              <Text style={styles.ratingCount}>({shopStats.count})</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.factList}>
        <View style={styles.factRow}>
          <Icon name={product.is_digital ? 'download-outline' : 'cube-outline'} size={16} color={C.text2} />
          <Text style={styles.factText}>
            {product.is_digital
              ? 'Digital download — available right after purchase'
              : soldOut
                ? 'Currently unavailable'
                : 'In stock and ready to ship'}
          </Text>
        </View>
        {!product.is_digital && returnsText && (
          <View style={styles.factRow}>
            <Icon name="return-down-back-outline" size={16} color={C.text2} />
            <Text style={styles.factText} numberOfLines={2}>{returnsText}</Text>
          </View>
        )}
        <View style={styles.factRow}>
          <Icon name="storefront-outline" size={16} color={C.text2} />
          <Text style={styles.factText}>Every purchase supports a Muslim-owned shop</Text>
        </View>
      </View>

      {!soldOut && (
        <View style={styles.qtyBlock}>
          <Text style={styles.fieldLabel}>Quantity</Text>
          <View style={styles.qtyStepper}>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => setQuantity(q => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              accessibilityLabel="Decrease quantity"
            >
              <Icon name="remove" size={16} color={quantity <= 1 ? C.text3 : C.text} />
            </TouchableOpacity>
            <Text style={styles.qtyValue}>{quantity}</Text>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => setQuantity(q => Math.min(maxQty, q + 1))}
              disabled={quantity >= maxQty}
              accessibilityLabel="Increase quantity"
            >
              <Icon name="add" size={16} color={quantity >= maxQty ? C.text3 : C.text} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[styles.primaryBtn, (soldOut || addingToCart) && styles.btnDisabled]}
        onPress={addToCart}
        disabled={soldOut || addingToCart}
      >
        {addingToCart ? (
          <ActivityIndicator color={C.black} size="small" />
        ) : (
          <Text style={styles.primaryBtnText}>{soldOut ? 'Sold out' : 'Add to cart'}</Text>
        )}
      </TouchableOpacity>

      {justAdded && (
        <View style={styles.addedBanner}>
          <Icon name="checkmark-circle" size={16} color={C.emeraldLight} />
          <Text style={styles.addedText}>Added to your cart</Text>
          <TouchableOpacity onPress={() => router.push('/cart' as any)}>
            <Text style={styles.addedLink}>View cart →</Text>
          </TouchableOpacity>
        </View>
      )}

      {!soldOut && (
        <TouchableOpacity style={styles.secondaryBtn} onPress={buyNow}>
          <Text style={styles.secondaryBtnText}>Buy it now</Text>
        </TouchableOpacity>
      )}

      {/* Item details */}
      <TouchableOpacity style={styles.accordionHead} onPress={() => setOpen(o => ({ ...o, details: !o.details }))}>
        <Text style={styles.accordionTitle}>Item details</Text>
        <Icon name={open.details ? 'chevron-up' : 'chevron-down'} size={18} color={C.text2} />
      </TouchableOpacity>
      {open.details && (
        <View style={styles.accordionBody}>
          <View style={styles.detailTags}>
            {product.category && (
              <TouchableOpacity style={styles.detailTag} onPress={() => goToCategory(product.category!)}>
                <Icon name="pricetag-outline" size={13} color={C.text2} />
                <Text style={styles.detailTagText}>{product.category}</Text>
              </TouchableOpacity>
            )}
            <View style={styles.detailTag}>
              <Icon name={product.is_digital ? 'cloud-download-outline' : 'hand-left-outline'} size={13} color={C.text2} />
              <Text style={styles.detailTagText}>{product.is_digital ? 'Digital item' : 'Physical item'}</Text>
            </View>
          </View>
          {product.description ? (
            <Text style={styles.description}>{product.description}</Text>
          ) : (
            <Text style={styles.mutedText}>The seller hasn't added a description yet.</Text>
          )}
        </View>
      )}

      {/* Shipping & returns */}
      <TouchableOpacity style={styles.accordionHead} onPress={() => setOpen(o => ({ ...o, policies: !o.policies }))}>
        <Text style={styles.accordionTitle}>{product.is_digital ? 'Delivery and returns' : 'Shipping and return policies'}</Text>
        <Icon name={open.policies ? 'chevron-up' : 'chevron-down'} size={18} color={C.text2} />
      </TouchableOpacity>
      {open.policies && (
        <View style={styles.accordionBody}>
          <Text style={styles.policyLabel}>{product.is_digital ? 'Delivery' : 'Shipping'}</Text>
          <Text style={styles.policyText}>
            {product.is_digital
              ? 'Your file is available to download right after checkout.'
              : shippingText || 'The seller will confirm shipping details after you order. Message them with any questions.'}
          </Text>
          <Text style={[styles.policyLabel, { marginTop: 12 }]}>Returns & exchanges</Text>
          <Text style={styles.policyText}>{returnsText || 'Contact the seller about returns or exchanges.'}</Text>
        </View>
      )}

      {/* Meet your seller */}
      {seller && (
        <View style={styles.sellerCard}>
          <Text style={styles.sellerCardTitle}>Meet your seller</Text>
          <View style={styles.sellerRow}>
            <View style={styles.sellerAvatar}>
              {seller.avatar_url ? (
                <Image source={{ uri: seller.avatar_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <Text style={styles.sellerAvatarText}>{seller.shop_name.charAt(0).toUpperCase()}</Text>
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.sellerName} numberOfLines={1}>{seller.shop_name}</Text>
              <Text style={styles.sellerMeta}>
                {[sellerSince ? `On Siqa since ${sellerSince}` : null, `${shopStats.listings} listing${shopStats.listings === 1 ? '' : 's'}`]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          </View>
          {seller.bio ? <Text style={styles.sellerBio} numberOfLines={4}>{seller.bio}</Text> : null}
          {!isOwnListing && (
            <TouchableOpacity style={styles.messageBtn} onPress={messageSeller} disabled={messagingBusy}>
              {messagingBusy ? (
                <ActivityIndicator size="small" color={C.text} />
              ) : (
                <>
                  <Icon name="chatbubble-outline" size={15} color={C.text} />
                  <Text style={styles.messageBtnText}>Message seller</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );

  // ── Reviews ───────────────────────────────────────────────────────────
  const reviewsSection = (
    <View style={styles.section}>
      <View style={styles.sectionHeadRow}>
        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Reviews for this item</Text>
        {avgRating !== null && (
          <View style={styles.inlineRating}>
            {stars(avgRating)}
            <Text style={styles.ratingSummary}>{avgRating.toFixed(1)} · {reviews.length} review{reviews.length === 1 ? '' : 's'}</Text>
          </View>
        )}
      </View>
      {reviews.length === 0 ? (
        <View style={styles.emptyReviews}>
          <Icon name="chatbox-ellipses-outline" size={22} color={C.text3} />
          <Text style={[styles.mutedText, { flex: 1 }]}>No reviews yet. Buyers can leave a review once their order is completed.</Text>
        </View>
      ) : (
        <View style={{ gap: 18 }}>
          {reviews.slice(0, 6).map(r => (
            <View key={r.id} style={styles.reviewRow}>
              <View style={styles.reviewHead}>
                {stars(r.rating, 13)}
                <Text style={styles.reviewDate}>{shortDate(r.created_at)}</Text>
              </View>
              {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );

  // ── More from this shop ───────────────────────────────────────────────
  // Desktop shows whole rows only (up to two), so no single card dangles
  // on a row of its own; phones show up to four in a 2-up grid.
  const moreCount = isDesktopWeb
    ? (related.length >= gridCols * 2 ? gridCols * 2 : related.length >= gridCols ? gridCols : related.length)
    : Math.min(related.length, 4);
  const moreSection = related.length > 0 && seller ? (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>More from {seller.shop_name}</Text>
      <View style={[styles.grid, { gap: gridGap }]}>
        {related.slice(0, moreCount).map(item => (
          <TouchableOpacity
            key={item.id}
            style={{ width: cardWidth }}
            onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.id } } as any)}
          >
            <View style={styles.gridImage}>
              {item.images?.[0] ? (
                <Image source={{ uri: item.images[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <Text style={{ fontSize: 28, opacity: 0.4 }}>🛍️</Text>
              )}
            </View>
            <Text style={styles.gridTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.gridPrice}>{formatPrice(item.price_cents, item.currency)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  ) : null;

  return (
    <DesktopShell>
      <View style={styles.container}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll}>
          <View style={[styles.inner, isDesktopWeb && { maxWidth: contentWidth, paddingHorizontal: Theme.spacing.xxxl }]}>
            {/* Back + breadcrumb */}
            <View style={styles.topBar}>
              <TouchableOpacity style={styles.roundBtn} onPress={() => router.back()} accessibilityLabel="Back">
                <Icon name="arrow-back" size={20} color={C.text} />
              </TouchableOpacity>
              <View style={styles.breadcrumb}>
                <TouchableOpacity onPress={() => router.push('/(tabs)/marketplace' as any)}>
                  <Text style={styles.crumbLink}>Marketplace</Text>
                </TouchableOpacity>
                {product.category && (
                  <>
                    <Icon name="chevron-forward" size={12} color={C.text3} />
                    <TouchableOpacity onPress={() => goToCategory(product.category!)}>
                      <Text style={styles.crumbLink}>{product.category}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>

            {isDesktopWeb ? (
              <View style={styles.columns}>
                <View style={styles.leftCol}>
                  {gallery}
                  {reviewsSection}
                </View>
                <View style={styles.rightCol}>{purchasePanel}</View>
              </View>
            ) : (
              <>
                {gallery}
                {purchasePanel}
                {reviewsSection}
              </>
            )}

            {moreSection}
          </View>
        </ScrollView>
      </View>
    </DesktopShell>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
    emptyText: { color: C.text3, fontSize: 14 },
    scroll: { paddingBottom: 80 },
    inner: { width: '100%', alignSelf: 'center', paddingHorizontal: Theme.spacing.lg },

    topBar: {
      flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md,
      paddingTop: HEADER_TOP_PADDING, paddingBottom: Theme.spacing.lg,
    },
    roundBtn: {
      width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2,
    },
    breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
    crumbLink: { fontSize: 13, color: C.text2, textDecorationLine: 'underline' },

    columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 40 },
    leftCol: { flex: 3, minWidth: 0 },
    rightCol: { flex: 2, minWidth: 320, maxWidth: 440 },

    // Gallery
    galleryRow: { flexDirection: 'row', gap: 12 },
    thumbRail: { width: 64, gap: 8 },
    thumbRailImg: { width: 64, height: 64, borderRadius: 10, opacity: 0.6, backgroundColor: C.surface2 },
    thumbRow: { gap: 8, paddingTop: 10 },
    thumbRowImg: { width: 60, height: 60, borderRadius: 10, opacity: 0.6, backgroundColor: C.surface2 },
    thumbActive: { opacity: 1, borderWidth: 2, borderColor: C.text },
    mainImage: {
      width: '100%', aspectRatio: 1, borderRadius: Theme.radius.lg,
      backgroundColor: C.surface2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    },
    galleryEmoji: { fontSize: 56, opacity: 0.4 },
    favOverlay: {
      position: 'absolute', top: 12, right: 12, width: 40, height: 40, borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center',
    },
    navArrow: {
      position: 'absolute', top: '50%', marginTop: -20, width: 40, height: 40, borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center',
    },
    counterPill: {
      position: 'absolute', bottom: 12, right: 12, paddingHorizontal: 10, paddingVertical: 4,
      borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)',
    },
    counterText: { color: '#fff', fontSize: 12, fontWeight: '600' },

    // Purchase panel
    panel: { paddingTop: Theme.spacing.lg },
    stockNote: { fontSize: 13, fontWeight: '700', color: C.live, marginBottom: 6 },
    price: { fontSize: 28, fontWeight: '800', color: C.text, marginBottom: 6 },
    title: { fontSize: 18, fontWeight: '500', color: C.text, lineHeight: 26, marginBottom: 12 },
    shopLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
    shopName: { fontSize: 14, fontWeight: '700', color: C.text },
    verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    verifiedText: { fontSize: 12, color: C.emeraldLight, fontWeight: '600' },
    inlineRating: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    ratingCount: { fontSize: 12, color: C.text3 },
    ratingSummary: { fontSize: 13, color: C.text2, fontWeight: '600' },

    factList: { gap: 10, marginBottom: 18 },
    factRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    factText: { flex: 1, fontSize: 13, color: C.text2, lineHeight: 18 },

    qtyBlock: { marginBottom: 16 },
    fieldLabel: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 8 },
    qtyStepper: {
      flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
      borderWidth: 1, borderColor: C.border, borderRadius: Theme.radius.md, backgroundColor: C.surface,
    },
    qtyBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    qtyValue: { minWidth: 36, textAlign: 'center', fontSize: 15, fontWeight: '700', color: C.text },

    primaryBtn: {
      backgroundColor: C.gold, borderRadius: 999, paddingVertical: 15, alignItems: 'center', marginBottom: 10,
    },
    primaryBtnText: { color: C.black, fontSize: 16, fontWeight: '800' },
    secondaryBtn: {
      borderRadius: 999, paddingVertical: 14, alignItems: 'center', marginBottom: 20,
      borderWidth: 1.5, borderColor: C.text,
    },
    secondaryBtnText: { color: C.text, fontSize: 16, fontWeight: '700' },
    btnDisabled: { opacity: 0.5 },
    addedBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10,
      padding: 12, borderRadius: Theme.radius.md, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2,
    },
    addedText: { flex: 1, fontSize: 13, fontWeight: '600', color: C.text },
    addedLink: { fontSize: 13, fontWeight: '700', color: C.gold },

    accordionHead: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 16, borderTopWidth: 0.5, borderTopColor: C.border2,
    },
    accordionTitle: { fontSize: 16, fontWeight: '700', color: C.text },
    accordionBody: { paddingBottom: 18 },
    detailTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    detailTag: {
      flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5,
      borderRadius: 999, backgroundColor: C.surface2, borderWidth: 0.5, borderColor: C.border2,
    },
    detailTagText: { fontSize: 12, color: C.text2 },
    description: { fontSize: 14, color: C.text2, lineHeight: 22 },
    mutedText: { fontSize: 13, color: C.text3, lineHeight: 19 },
    policyLabel: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 4 },
    policyText: { fontSize: 13, color: C.text2, lineHeight: 20 },

    sellerCard: {
      marginTop: 8, padding: Theme.spacing.lg, borderRadius: Theme.radius.lg,
      backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2, gap: 12,
    },
    sellerCardTitle: { fontSize: 16, fontWeight: '700', color: C.text },
    sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    sellerAvatar: {
      width: 52, height: 52, borderRadius: 26, backgroundColor: C.goldBg,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    sellerAvatarText: { fontSize: 20, fontWeight: '800', color: C.gold },
    sellerName: { fontSize: 15, fontWeight: '700', color: C.text },
    sellerMeta: { fontSize: 12, color: C.text3, marginTop: 2 },
    sellerBio: { fontSize: 13, color: C.text2, lineHeight: 19 },
    messageBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      paddingVertical: 11, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg,
    },
    messageBtnText: { fontSize: 14, fontWeight: '700', color: C.text },

    // Lower sections
    section: { marginTop: 36 },
    sectionHeadRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: 8, marginBottom: 16,
    },
    sectionTitle: { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 16 },
    emptyReviews: {
      flexDirection: 'row', alignItems: 'center', gap: 10, padding: Theme.spacing.lg,
      borderRadius: Theme.radius.lg, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2,
    },
    reviewRow: { gap: 6, paddingBottom: 18, borderBottomWidth: 0.5, borderBottomColor: C.border2 },
    reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    reviewDate: { fontSize: 12, color: C.text3 },
    reviewComment: { fontSize: 14, color: C.text2, lineHeight: 21 },

    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    gridImage: {
      width: '100%', aspectRatio: 1, borderRadius: Theme.radius.md, backgroundColor: C.surface2,
      overflow: 'hidden', marginBottom: 8, alignItems: 'center', justifyContent: 'center',
    },
    gridTitle: { fontSize: 13, color: C.text, lineHeight: 18 },
    gridPrice: { fontSize: 14, fontWeight: '800', color: C.text, marginTop: 3 },
  });
}
