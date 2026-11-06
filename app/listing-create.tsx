import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { uploadMarketplaceImage } from '../lib/supabaseStorage';
import { useTheme, type AppColors } from '../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../constants/theme';
import { Icon } from '../components/Icon';
import { showToast } from '../components/Toast';
import { DesktopShell } from '../components/DesktopShell';
import { BottomSheet, Button, IconButton, ListRow, OptionRow, SegmentedControl, Stepper, TextField } from '../components/ui';
import { font, radius, space, type as T, useDS } from '../lib/ds';

const CATEGORIES = [
  'Home Decor', 'Books & Media', 'Clothing & Accessories', 'Art & Prints',
  'Jewelry', 'Digital Downloads', 'Gifts', 'Other',
];

export default function ListingCreateScreen() {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  const ds = useDS();
  const [catOpen, setCatOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [sellerApproved, setSellerApproved] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [inventory, setInventory] = useState('1');
  const [isDigital, setIsDigital] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { router.replace('/(auth)/sign-in' as any); return; }
    setUserId(session.user.id);

    const { data: seller } = await supabase
      .from('marketplace_sellers')
      .select('id, approval_status')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (!seller) {
      // A native alert does nothing on web, which left the spinner running forever.
      showToast('Set up your shop first');
      router.replace('/sell' as any);
      return;
    }
    setSellerId(seller.id);
    setSellerApproved(seller.approval_status === 'approved');
    setLoading(false);
  }

  async function pickImages() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showToast('Allow Siqa to access your photos to add images');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.length || !userId) return;

    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const asset of result.assets) {
        const url = await uploadMarketplaceImage('marketplace-product-images', userId, asset.uri, asset.mimeType);
        uploaded.push(url);
      }
      setImages(prev => [...prev, ...uploaded]);
    } catch (err: any) {
      showToast(`Upload failed: ${err?.message ?? 'please try again'}`);
    } finally {
      setUploading(false);
    }
  }

  function removeImage(url: string) {
    setImages(prev => prev.filter(u => u !== url));
  }

  async function submit() {
    if (saving) return; // guard against double-taps creating duplicate listings
    if (!sellerId || !title.trim() || !price.trim()) {
      showToast('Add a title and a price');
      return;
    }
    const priceCents = Math.round(parseFloat(price) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 1) {
      showToast('Enter a valid price');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('marketplace_products').insert({
      seller_id: sellerId,
      title: title.trim(),
      description: description.trim() || null,
      price_cents: priceCents,
      inventory_count: isDigital ? 999999 : parseInt(inventory, 10) || 0,
      is_digital: isDigital,
      status: 'active',
      category,
      images,
    });
    setSaving(false);

    if (error) {
      showToast(`Couldn't save: ${error.message}`);
      return;
    }
    // Navigate straight away — on web the old confirmation dialog never
    // showed, so sellers stayed on the filled-in form and published twice.
    showToast(
      sellerApproved
        ? 'Listing created — it’s live on the Marketplace'
        : 'Listing saved — it goes live once your shop is approved',
    );
    router.replace('/seller-dashboard' as any);
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

  const { c, shadow } = ds;
  const canPublish = !!title.trim() && !!price.trim() && !saving && !uploading;
  const stock = parseInt(inventory, 10) || 0;

  return (
    <DesktopShell>
    <View style={{ flex: 1, backgroundColor: c.surfaceSoft }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, width: '100%', maxWidth: 560, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      {/* Photo stage */}
      <View style={{ paddingTop: HEADER_TOP_PADDING - 12, paddingBottom: 26 + 30 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 }}>
          <IconButton icon="close" label="Close" variant="raised" onPress={() => router.back()} />
          <Text style={[T.headline, { color: c.ink }]} accessibilityRole="header">New product</Text>
          <View style={{ width: 44 }} />
        </View>

        {images.length === 0 ? (
          <View style={{ alignItems: 'center', gap: 16, paddingTop: 28 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }} importantForAccessibility="no-hide-descendants">
              <View style={[{ width: 86, height: 110, borderRadius: 16, backgroundColor: c.surfaceStrong, transform: [{ rotate: '-8deg' }] }, shadow('hairline')]} />
              <View style={[{ width: 120, height: 150, borderRadius: 18, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }, shadow('raised')]}>
                <Icon name="image-outline" size={34} color={c.ink3} />
              </View>
              <View style={[{ width: 86, height: 110, borderRadius: 16, backgroundColor: c.surfaceStrong, transform: [{ rotate: '8deg' }] }, shadow('hairline')]} />
            </View>
            <Button label="Add photos" icon="camera-outline" size="md" onPress={pickImages} loading={uploading} />
            <Text style={[T.caption, font(400), { color: c.ink2 }]}>The first photo is the cover</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 }}>
            {images.map((url, i) => (
              <View key={url} style={[{ width: 120, height: 150, borderRadius: 18, backgroundColor: c.surface, overflow: 'hidden' }, shadow('card')]}>
                <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                {i === 0 ? (
                  <View style={{ position: 'absolute', left: 8, bottom: 8, backgroundColor: c.scrim, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={[T.micro, { color: '#fff' }]}>Cover</Text>
                  </View>
                ) : null}
                <IconButton icon="close" label="Remove photo" variant="scrim" size="sm" onPress={() => removeImage(url)} style={{ position: 'absolute', top: 6, right: 6 }} />
              </View>
            ))}
            <Pressable
              onPress={pickImages}
              disabled={uploading}
              accessibilityRole="button"
              accessibilityLabel="Add more photos"
              style={({ pressed }) => ({ width: 120, height: 150, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.lineControl, alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}
            >
              {uploading ? <ActivityIndicator color={c.ink2} /> : <Icon name="add" size={26} color={c.ink2} />}
              <Text style={[T.caption, { color: c.ink2 }]}>{uploading ? 'Uploading' : 'Add'}</Text>
            </Pressable>
          </ScrollView>
        )}
      </View>

      {/* Sheet */}
      <View style={[{ flexGrow: 1, marginTop: -26, backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet }, shadow('sheet')]}>
        <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: c.surfaceStrong, marginTop: 8 }} />

        {!sellerApproved ? (
          <View style={{ marginHorizontal: space[5], marginTop: 14, padding: 12, borderRadius: radius.md, backgroundColor: c.goldTint, flexDirection: 'row', gap: 10 }}>
            <Icon name="time-outline" size={18} color={c.goldInk} />
            <Text style={[T.caption, font(500), { color: c.goldInk, flex: 1 }]}>Your shop is waiting for approval. Products you add now go live once it's approved.</Text>
          </View>
        ) : null}

        <View style={{ paddingHorizontal: space[5], paddingTop: 16, gap: 2 }}>
          <TextField variant="bare" textStyle="title2" value={title} onChangeText={setTitle} placeholder="Product name" accessibilityLabel="Product name" maxLength={120} />
          <TextField variant="bare" textStyle="callout" value={description} onChangeText={setDescription} placeholder="Add a description: materials, size, what's included" accessibilityLabel="Description" multiline style={{ minHeight: 64 }} />
        </View>

        {/* Price card */}
        <View style={[{ marginHorizontal: space[5], marginTop: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }, shadow('card')]}>
          <View style={{ flex: 1, minWidth: 130 }}>
            <Text style={[T.micro, { color: c.ink2 }]}>Price</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text style={[T.title1, font(700), { color: price ? c.ink3 : c.ghost }]}>$</Text>
              <TextInput
                value={price}
                onChangeText={(v) => setPrice(v.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                placeholderTextColor={c.ghost}
                keyboardType="decimal-pad"
                accessibilityLabel="Price in dollars"
                style={[T.title1, font(700), { flex: 1, color: c.ink, padding: 0, minWidth: 80, outlineStyle: 'none' } as any]}
              />
            </View>
          </View>
          <SegmentedControl
            label="Product type"
            value={isDigital ? 'digital' : 'physical'}
            onChange={(v) => setIsDigital(v === 'digital')}
            options={[{ value: 'physical', label: 'Physical' }, { value: 'digital', label: 'Digital' }]}
          />
        </View>

        <View style={{ paddingHorizontal: space[5], paddingTop: 8 }}>
          {!isDigital ? (
            <ListRow icon="cube-outline" label="In stock" right={<Stepper label="in stock" value={stock} min={0} max={99999} onChange={(n) => setInventory(String(n))} />} />
          ) : (
            <ListRow icon="cloud-download-outline" label="Delivery" value="Download after purchase" />
          )}
          <ListRow icon="grid-outline" label="Category" value={category} onPress={() => setCatOpen(true)} last />
        </View>

        <View style={{ flex: 1 }} />
        <View style={{ paddingHorizontal: space[5], paddingTop: 14, paddingBottom: 28 }}>
          <Button label="Publish product" onPress={submit} loading={saving} disabled={!canPublish} />
        </View>
      </View>
    </ScrollView>

    <BottomSheet visible={catOpen} onClose={() => setCatOpen(false)} title="Category">
      {CATEGORIES.map((cat, i) => (
        <OptionRow key={cat} label={cat} selected={category === cat} onPress={() => { setCategory(cat); setCatOpen(false); }} last={i === CATEGORIES.length - 1} />
      ))}
    </BottomSheet>
    </View>
    </DesktopShell>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
    scroll: { paddingBottom: 60, maxWidth: 640, width: '100%', alignSelf: 'center' },

    header: {
      flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md,
      paddingHorizontal: Theme.spacing.lg, paddingTop: HEADER_TOP_PADDING, paddingBottom: Theme.spacing.lg,
    },
    roundBtn: {
      width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2,
    },
    headerTitle: { fontSize: Theme.fontSize.xl, fontWeight: '700', color: C.text },

    notice: {
      marginHorizontal: Theme.spacing.lg, marginBottom: Theme.spacing.md,
      backgroundColor: C.goldBg, borderRadius: Theme.radius.md, padding: 12,
      borderWidth: 0.5, borderColor: C.goldDim,
    },
    noticeText: { fontSize: 12, color: C.gold, lineHeight: 17 },

    body: { paddingHorizontal: Theme.spacing.lg },
    label: { fontSize: 12, fontWeight: '700', color: C.text2, marginBottom: 6, marginTop: 4 },
    input: {
      backgroundColor: C.surface, borderRadius: Theme.radius.md, borderWidth: 0.5, borderColor: C.border,
      paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontSize: 14, marginBottom: 14,
    },
    textArea: { minHeight: 90, textAlignVertical: 'top' },
    row: { flexDirection: 'row', gap: 12 },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },

    imagesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
    imageThumb: { width: 72, height: 72, borderRadius: Theme.radius.md, backgroundColor: C.surface2, overflow: 'hidden' },
    imageRemove: {
      position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9,
      backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
    },
    addImageBtn: {
      width: 72, height: 72, borderRadius: Theme.radius.md, backgroundColor: C.surface2,
      borderWidth: 1, borderColor: C.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center',
    },

    catPill: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
      backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2,
    },
    catPillActive: { backgroundColor: C.gold, borderColor: C.gold },
    catText: { fontSize: 12, color: C.text2 },
    catTextActive: { color: C.black, fontWeight: '700' },

    submitBtn: { backgroundColor: C.gold, borderRadius: Theme.radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
    btnDisabled: { opacity: 0.6 },
    submitBtnText: { color: C.black, fontSize: 15, fontWeight: '800' },
  });
}
