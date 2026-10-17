import { useEffect, useRef } from 'react';
import { Animated, Image, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useTheme, type AppColors } from '../lib/theme';
import { Theme } from '../constants/theme';
import { Icon } from './Icon';
import { useIsDesktopWeb } from './DesktopShell';
import { formatPrice } from '../lib/money';

export type AddedItem = {
  id: string;
  title: string;
  price_cents: number;
  currency?: string | null;
  image?: string | null;
  category?: string | null;
  quantity?: number;
};

// "Item added to cart" panel, modeled on Etsy's: slides in from the right
// on desktop (bottom sheet on phones) over a dimmed page, shows what was
// added, and offers "Find more like this" or "View cart & check out".
export function AddedToCartDrawer({ item, onClose }: { item: AddedItem | null; onClose: () => void }) {
  const { colors: C } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const { width, height } = useWindowDimensions();
  const styles = makeStyles(C);

  const panelWidth = isDesktopWeb ? Math.min(440, width) : width;
  const offscreen = isDesktopWeb ? panelWidth : height;
  const slide = useRef(new Animated.Value(offscreen)).current;
  const fade = useRef(new Animated.Value(0)).current;

  const visible = item !== null;

  useEffect(() => {
    if (!visible) return;
    slide.setValue(offscreen);
    fade.setValue(0);
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 260, useNativeDriver: false }),
      Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: false }),
    ]).start();
  }, [visible, offscreen]);

  function close(then?: () => void) {
    Animated.parallel([
      Animated.timing(slide, { toValue: offscreen, duration: 200, useNativeDriver: false }),
      Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: false }),
    ]).start(() => {
      onClose();
      then?.();
    });
  }

  const qty = item?.quantity ?? 1;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={() => close()}>
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityLabel="Close" />
      </Animated.View>

      {item && (
        <Animated.View
          style={[
            isDesktopWeb ? styles.sidePanel : styles.sheet,
            isDesktopWeb ? { width: panelWidth } : null,
            { transform: isDesktopWeb ? [{ translateX: slide }] : [{ translateY: slide }] },
          ]}
        >
          <View style={styles.headRow}>
            <View style={styles.checkCircle}>
              <Icon name="checkmark" size={20} color="#fff" />
            </View>
            <Text style={styles.headText}>
              {qty} {qty === 1 ? 'item' : 'items'} added to cart
            </Text>
            <TouchableOpacity onPress={() => close()} style={styles.closeBtn} accessibilityLabel="Close">
              <Icon name="close" size={22} color={C.text2} />
            </TouchableOpacity>
          </View>

          <View style={[styles.body, !isDesktopWeb && styles.bodyRow]}>
            <View style={[styles.image, !isDesktopWeb && styles.imageSmall]}>
              {item.image ? (
                <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <Text style={{ fontSize: 40, opacity: 0.4 }}>🛍️</Text>
              )}
            </View>
            <View style={isDesktopWeb ? undefined : { flex: 1, minWidth: 0 }}>
              <Text style={styles.title} numberOfLines={isDesktopWeb ? 3 : 2}>{item.title}</Text>
              <Text style={styles.price}>{formatPrice(item.price_cents, item.currency)}</Text>
            </View>
          </View>

          <View style={[styles.footer, isDesktopWeb && styles.footerDesktop]}>
            <TouchableOpacity
              style={styles.outlineBtn}
              onPress={() =>
                close(() =>
                  router.push(
                    (item.category
                      ? { pathname: '/(tabs)/marketplace', params: { category: item.category } }
                      : '/(tabs)/marketplace') as any,
                  ),
                )
              }
            >
              <Text style={styles.outlineBtnText}>Find more like this</Text>
              <Icon name="arrow-forward" size={18} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.solidBtn} onPress={() => close(() => router.push('/cart' as any))}>
              <Text style={styles.solidBtnText}>View cart & check out</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </Modal>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
    sidePanel: {
      position: 'absolute', top: 0, right: 0, bottom: 0,
      backgroundColor: C.bg, borderLeftWidth: 0.5, borderLeftColor: C.border2,
    },
    sheet: {
      position: 'absolute', left: 0, right: 0, bottom: 0,
      backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingBottom: 24,
    },
    headRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: Theme.spacing.xl, paddingTop: Theme.spacing.xl, paddingBottom: Theme.spacing.lg,
    },
    checkCircle: {
      width: 36, height: 36, borderRadius: 18, backgroundColor: C.emeraldLight,
      alignItems: 'center', justifyContent: 'center',
    },
    headText: { flex: 1, fontSize: 18, fontWeight: '700', color: C.text },
    closeBtn: { padding: 4 },

    body: { paddingHorizontal: Theme.spacing.xl, gap: 14 },
    bodyRow: { flexDirection: 'row', alignItems: 'center' },
    image: {
      width: '100%', aspectRatio: 1.4, borderRadius: Theme.radius.lg, backgroundColor: C.surface2,
      overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    },
    imageSmall: { width: 88, height: 88, aspectRatio: undefined },
    title: { fontSize: 17, fontWeight: '600', color: C.text, lineHeight: 24 },
    price: { fontSize: 19, fontWeight: '800', color: C.text, marginTop: 8 },

    footer: { paddingHorizontal: Theme.spacing.xl, paddingTop: Theme.spacing.xl, gap: 12 },
    footerDesktop: {
      position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: Theme.spacing.xxl,
      backgroundColor: C.surface, borderTopWidth: 0.5, borderTopColor: C.border2,
    },
    outlineBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      paddingVertical: 15, borderRadius: 999, borderWidth: 1.5, borderColor: C.text, backgroundColor: C.bg,
    },
    outlineBtnText: { fontSize: 16, fontWeight: '700', color: C.text },
    solidBtn: { paddingVertical: 16, borderRadius: 999, backgroundColor: C.gold, alignItems: 'center' },
    solidBtnText: { fontSize: 16, fontWeight: '800', color: C.black },
  });
}
