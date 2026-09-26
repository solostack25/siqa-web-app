import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  useWindowDimensions,
  FlatList,
  Alert,
} from 'react-native';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTheme, type AppColors } from '../../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../../constants/theme';
import { DesktopShell, useIsDesktopWeb } from '../../components/DesktopShell';
import { Icon } from '../../components/Icon';

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

type Seller = { id: string; shop_name: string; bio: string | null; avatar_url: string | null };
type Review = { id: string; rating: number; comment: string | null; created_at: string };
type RelatedProduct = { id: string; title: string; price_cents: number; images: string[] | null };

function formatPrice(cents: number, currency?: string | null) {
  const symbol = (currency || 'USD') === 'USD' ? '$' : (currency || '') + ' ';
  return symbol + (cents / 100).toFixed(2);
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: C } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = isDesktopWeb ? Math.min(windowWidth - 220, 760) : windowWidth;
  const styles = makeStyles(C);

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [related, setRelated] = useState<RelatedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  useEffect(() => {
    if (id) load(id);
  }, [id]);

  async function load(productId: string) {
    const { data: productData } = await supabase
      .from('marketplace_products')
      .select('id, seller_id, title, description, price_cents, currency, images, inventory_count, is_digital, category')
      .eq('id', productId)
      .single();
    if (!productData) { setLoading(false); return; }
    setProduct(productData as any);

    const [{ data: sellerData }, { data: reviewData }, { data: relatedData }, { data: { session } }] = await Promise.all([
      supabase.from('marketplace_sellers').select('id, shop_name, bio, avatar_url').eq('id', productData.seller_id).single(),
      supabase.from('marketplace_reviews').select('id, rating, comment, created_at').eq('product_id', productId).order('created_at', { ascending: false }),
      supabase.from('marketplace_products').select('id, title, price_cents, images').eq('seller_id', productData.seller_id).eq('status', 'active').neq('id', productId).limit(6),
      supabase.auth.getSession(),
    ]);
    if (sellerData) setSeller(sellerData as any);
    if (reviewData) setReviews(reviewData);
    if (relatedData) setRelated(relatedData as any);

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

  async function toggleFavorite() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      Alert.alert('Sign in required', 'Sign in to save favorites.');
      return;
    }
    if (!product) return;
    setFavBusy(true);
    if (isFavorited) {
      await supabase.from('marketplace_favorites').delete().eq('product_id', product.id).eq('user_id', session.user.id);
      setIsFavorited(false);
    } else {
      await supabase.from('marketplace_favorites').insert({ product_id: product.id, user_id: session.user.id });
      setIsFavorited(true);
    }
    setFavBusy(false);
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

  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;
  const images = product.images?.length ? product.images : [];

  return (
    <DesktopShell>
      <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll}>
        <View style={[styles.inner, { maxWidth: contentWidth }]}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.roundBtn} onPress={() => router.back()}>
              <Icon name="arrow-back" size={20} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.roundBtn} onPress={toggleFavorite} disabled={favBusy}>
              <Icon name={isFavorited ? 'heart' : 'heart-outline'} size={20} color={isFavorited ? C.live : C.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.gallery}>
            {images.length > 0 ? (
              <Image source={{ uri: images[activeImage] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <Text style={styles.galleryEmoji}>🛍️</Text>
            )}
          </View>
          {images.length > 1 && (
            <FlatList
              horizontal
              data={images}
              keyExtractor={(_, i) => String(i)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: Theme.spacing.lg, gap: 8, marginTop: 8 }}
              renderItem={({ item, index }) => (
                <TouchableOpacity onPress={() => setActiveImage(index)}>
                  <Image
                    source={{ uri: item }}
                    style={[styles.thumb, index === activeImage && styles.thumbActive]}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              )}
            />
          )}

          <View style={styles.body}>
            {seller && (
              <TouchableOpacity style={styles.sellerRow}>
                <View style={styles.sellerAvatar}>
                  {seller.avatar_url ? (
                    <Image source={{ uri: seller.avatar_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : (
                    <Text style={styles.sellerAvatarText}>{seller.shop_name.charAt(0).toUpperCase()}</Text>
                  )}
                </View>
                <Text style={styles.sellerName}>{seller.shop_name}</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.title}>{product.title}</Text>

            {avgRating !== null && (
              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5].map(n => (
                  <Text key={n} style={n <= Math.round(avgRating) ? styles.starOn : styles.starOff}>★</Text>
                ))}
                <Text style={styles.ratingText}>
                  {avgRating.toFixed(1)} ({reviews.length} review{reviews.length === 1 ? '' : 's'})
                </Text>
              </View>
            )}

            <Text style={styles.price}>{formatPrice(product.price_cents, product.currency)}</Text>

            {product.category && (
              <View style={styles.categoryChip}>
                <Text style={styles.categoryChipText}>{product.category}</Text>
              </View>
            )}

            {product.description ? <Text style={styles.description}>{product.description}</Text> : null}

            <Text style={product.inventory_count > 0 ? styles.inStock : styles.outStock}>
              {product.is_digital
                ? 'Digital product'
                : product.inventory_count > 0
                  ? `✓ ${product.inventory_count} in stock`
                  : 'Out of stock'}
            </Text>

            {/* Buying isn't wired up yet — cart/checkout is a separate
                phase (needs Stripe Connect flow, not just UI). Showing
                a disabled state rather than a button that goes nowhere. */}
            <View style={styles.buyBtnDisabled}>
              <Text style={styles.buyBtnDisabledText}>Purchasing coming soon</Text>
            </View>

            {reviews.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Reviews</Text>
                <View style={{ gap: 14 }}>
                  {reviews.map(r => (
                    <View key={r.id} style={styles.reviewRow}>
                      <View style={styles.ratingRow}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <Text key={n} style={n <= r.rating ? styles.starOn : styles.starOff}>★</Text>
                        ))}
                      </View>
                      {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
                    </View>
                  ))}
                </View>
              </View>
            )}

            {related.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>More from this shop</Text>
                <FlatList
                  horizontal
                  data={related}
                  keyExtractor={p => p.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 10 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.relatedCard}
                      onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.id } } as any)}
                    >
                      <View style={styles.relatedImage}>
                        {item.images?.[0] ? (
                          <Image source={{ uri: item.images[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        ) : null}
                      </View>
                      <Text style={styles.relatedTitle} numberOfLines={2}>{item.title}</Text>
                      <Text style={styles.relatedPrice}>{formatPrice(item.price_cents)}</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            )}
          </View>
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
    scroll: { paddingBottom: 60 },
    inner: { width: '100%', alignSelf: 'center' },

    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: Theme.spacing.lg, paddingTop: HEADER_TOP_PADDING, paddingBottom: Theme.spacing.md,
    },
    roundBtn: {
      width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2,
    },

    gallery: {
      marginHorizontal: Theme.spacing.lg, aspectRatio: 1, borderRadius: Theme.radius.xl,
      backgroundColor: C.surface2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    },
    galleryEmoji: { fontSize: 56, opacity: 0.4 },
    thumb: { width: 56, height: 56, borderRadius: 10, opacity: 0.5 },
    thumbActive: { opacity: 1, borderWidth: 2, borderColor: C.gold },

    body: { paddingHorizontal: Theme.spacing.lg, paddingTop: Theme.spacing.lg },
    sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    sellerAvatar: {
      width: 26, height: 26, borderRadius: 13, backgroundColor: C.goldBg,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    sellerAvatarText: { fontSize: 11, fontWeight: '700', color: C.gold },
    sellerName: { fontSize: 13, color: C.text2, fontWeight: '600' },

    title: { fontSize: 22, fontWeight: '800', color: C.text, lineHeight: 28, marginBottom: 8 },

    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 10 },
    starOn: { color: C.gold, fontSize: 14 },
    starOff: { color: C.border, fontSize: 14 },
    ratingText: { fontSize: 12, color: C.text3, marginLeft: 6 },

    price: { fontSize: 26, fontWeight: '800', color: C.text, marginBottom: 10 },

    categoryChip: {
      alignSelf: 'flex-start', backgroundColor: C.surface2, borderRadius: 999,
      paddingHorizontal: 12, paddingVertical: 5, marginBottom: 14,
      borderWidth: 0.5, borderColor: C.border2,
    },
    categoryChipText: { color: C.text2, fontSize: 12 },

    description: { fontSize: 14, color: C.text2, lineHeight: 21, marginBottom: 14 },

    inStock: { color: C.emeraldLight, fontSize: 13, fontWeight: '600', marginBottom: 18 },
    outStock: { color: C.live, fontSize: 13, fontWeight: '600', marginBottom: 18 },

    buyBtnDisabled: {
      backgroundColor: C.surface2, borderRadius: Theme.radius.md, paddingVertical: 15,
      alignItems: 'center', marginBottom: 28, borderWidth: 0.5, borderColor: C.border2,
    },
    buyBtnDisabledText: { color: C.text3, fontSize: 15, fontWeight: '700' },

    section: { marginBottom: 28 },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 12 },
    reviewRow: { gap: 4 },
    reviewComment: { fontSize: 13, color: C.text2, lineHeight: 19 },

    relatedCard: { width: 130 },
    relatedImage: {
      width: 130, height: 130, borderRadius: Theme.radius.lg, backgroundColor: C.surface2,
      overflow: 'hidden', marginBottom: 6,
    },
    relatedTitle: { fontSize: 11, fontWeight: '600', color: C.text, lineHeight: 15 },
    relatedPrice: { fontSize: 12, fontWeight: '800', color: C.gold, marginTop: 2 },
  });
}
