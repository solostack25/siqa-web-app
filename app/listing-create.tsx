import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  Pressable,
  Animated,
  Platform,
} from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { GestureDetector } from 'react-native-gesture-handler';
import { supabase } from '../lib/supabase';
import { uploadMarketplaceImage } from '../lib/supabaseStorage';
import { useTheme } from '../lib/theme';
import { HEADER_TOP_PADDING } from '../constants/theme';
import { Icon } from '../components/Icon';
import { PLANS_PURCHASABLE_HERE } from '../lib/sellerPlans';
import { showToast } from '../components/Toast';
import { DesktopShell } from '../components/DesktopShell';
import { BottomSheet, Button, Chip, IconButton, ListRow, OptionRow, SegmentedControl, Stepper, Switch as DSSwitch, TextField } from '../components/ui';
import { font, radius, space, type as T, useDS } from '../lib/ds';
import { goBack } from '../lib/goBack';
import { useStageDrawer } from '../components/useStageDrawer';
import {
  PRODUCT_CATEGORIES,
  DETAIL_FIELDS,
  MAX_VARIATIONS,
  buildVariants,
  categoryPath,
  topCategory,
  variationTypesFor,
  type Variant,
  type VariationAttr,
  type Variations,
} from '../lib/productTaxonomy';

type SheetKind = null | 'category' | 'variations' | { detail: string };

const dollars = (cents: number) => (cents / 100).toFixed(2);
const toCents = (v: string) => Math.round(parseFloat(v || '0') * 100);

export default function ListingCreateScreen() {
  // ?id=… edits an existing product; no id creates a new one.
  const { id: editId } = useLocalSearchParams<{ id?: string }>();
  const isEdit = typeof editId === 'string' && editId.length > 0;
  const { colors: C } = useTheme();
  const ds = useDS();
  const { c, shadow } = ds;
  const drawer = useStageDrawer();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [sellerApproved, setSellerApproved] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [inventory, setInventory] = useState('1');
  const [isDigital, setIsDigital] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [itemType, setItemType] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Variations (up to two, like Etsy)
  const [varAttrs, setVarAttrs] = useState<VariationAttr[]>([]);
  const [priceVaries, setPriceVaries] = useState(false);
  const [qtyVaries, setQtyVaries] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [newOption, setNewOption] = useState<Record<number, string>>({});
  const [customVarName, setCustomVarName] = useState('');
  // Photo per option (Etsy "link photos"): one variation's options -> a product photo.
  const [photoAttr, setPhotoAttr] = useState<string | null>(null);
  const [optionImages, setOptionImages] = useState<Record<string, string>>({});

  // Sheets
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [catStep, setCatStep] = useState<{ top?: string; sub?: string }>({});
  const [catQuery, setCatQuery] = useState('');

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

    if (isEdit) {
      const { data: p } = await supabase
        .from('marketplace_products')
        .select('id, seller_id, title, description, price_cents, inventory_count, is_digital, category, subcategory, item_type, attributes, variations, images')
        .eq('id', editId)
        .maybeSingle();
      if (!p || p.seller_id !== seller.id) {
        showToast("You can only edit your own products");
        router.replace('/seller-dashboard' as any);
        return;
      }
      setTitle(p.title ?? '');
      setDescription(p.description ?? '');
      setPrice(p.price_cents ? (p.price_cents / 100).toFixed(2) : '');
      setInventory(String(p.is_digital ? 1 : p.inventory_count ?? 0));
      setIsDigital(Boolean(p.is_digital));
      setCategory(p.category ?? null);
      setSubcategory(p.subcategory ?? null);
      setItemType(p.item_type ?? null);
      setDetails((p.attributes as Record<string, string>) ?? {});
      setImages(p.images ?? []);
      const v = p.variations as Variations | null;
      if (v?.attributes?.length) {
        setVarAttrs(v.attributes);
        setPriceVaries(Boolean(v.price_varies));
        setQtyVaries(Boolean(v.quantity_varies));
        setVariants(v.variants ?? []);
        if (v.option_images) {
          setPhotoAttr(v.option_images.attribute);
          setOptionImages(v.option_images.images ?? {});
        }
      }
    }
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
    setOptionImages(prev => Object.fromEntries(Object.entries(prev).filter(([, u]) => u !== url)));
  }

  // ── Variations ──────────────────────────────────────────────────────
  const basePriceCents = toCents(price);
  const baseStock = parseInt(inventory, 10) || 0;

  function setAttrs(next: VariationAttr[]) {
    setVarAttrs(next);
    setVariants((prev) => buildVariants(next, prev, basePriceCents, baseStock));
  }
  function addVariation(name: string) {
    const n = name.trim();
    if (!n || varAttrs.length >= MAX_VARIATIONS || varAttrs.some((a) => a.name.toLowerCase() === n.toLowerCase())) return;
    setAttrs([...varAttrs, { name: n, options: [] }]);
    setCustomVarName('');
  }
  function removeVariation(i: number) {
    setAttrs(varAttrs.filter((_, k) => k !== i));
  }
  function toggleOption(i: number, opt: string) {
    setAttrs(varAttrs.map((a, k) => (k !== i ? a : {
      ...a,
      options: a.options.includes(opt) ? a.options.filter((o) => o !== opt) : [...a.options, opt],
    })));
  }
  function addOption(i: number) {
    const o = (newOption[i] ?? '').trim();
    if (!o || varAttrs[i].options.includes(o)) return;
    toggleOption(i, o);
    setNewOption((m) => ({ ...m, [i]: '' }));
  }
  function updateVariant(key: string, patch: Partial<Variant>) {
    setVariants((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  }

  const hasVariations = varAttrs.some((a) => a.options.length > 0);
  // Which variation's options get their own photo: the seller's pick, else
  // Color if there is one, else the first.
  const linkedAttr = varAttrs.find((a) => a.name === photoAttr)?.name
    ?? varAttrs.find((a) => /colou?r/i.test(a.name))?.name
    ?? varAttrs[0]?.name
    ?? null;
  const variationSummary = varAttrs.filter((a) => a.options.length).map((a) => `${a.name}: ${a.options.join(', ')}`);

  // ── Submit ──────────────────────────────────────────────────────────
  async function submit() {
    if (saving) return; // guard against double-taps creating duplicate listings
    if (!sellerId || !title.trim()) { showToast('Add a product name'); return; }
    if (!category) { showToast('Choose a category'); return; }
    if (hasVariations && priceVaries) {
      if (variants.some((v) => !(v.price_cents >= 1))) { showToast('Add a price for every option'); return; }
    } else if (!(basePriceCents >= 1)) {
      showToast('Enter a valid price');
      return;
    }

    let variations: Variations | null = null;
    let priceCents = basePriceCents;
    let stockCount = isDigital ? 999999 : baseStock;
    if (hasVariations) {
      const live = varAttrs.filter((a) => a.options.length > 0);
      const vs = variants.map((v) => ({
        ...v,
        price_cents: priceVaries ? v.price_cents : basePriceCents,
        inventory: isDigital ? 999999 : qtyVaries ? v.inventory : baseStock,
      }));
      const linkAttr = live.find((a) => a.name === linkedAttr);
      const linked = linkAttr
        ? Object.fromEntries(Object.entries(optionImages).filter(([o, u]) => linkAttr.options.includes(o) && images.includes(u)))
        : {};
      variations = {
        attributes: live,
        price_varies: priceVaries,
        quantity_varies: qtyVaries && !isDigital,
        variants: vs,
        option_images: linkAttr && Object.keys(linked).length ? { attribute: linkAttr.name, images: linked } : null,
      };
      if (priceVaries) priceCents = Math.min(...vs.map((v) => v.price_cents));
      if (qtyVaries && !isDigital) stockCount = vs.reduce((n, v) => n + Math.max(0, v.inventory), 0);
    }

    const cleanDetails = Object.fromEntries(Object.entries(details).filter(([, v]) => v && v.trim()));

    setSaving(true);
    const row = {
      title: title.trim(),
      description: description.trim() || null,
      price_cents: priceCents,
      inventory_count: stockCount,
      is_digital: isDigital,
      ...(isEdit ? {} : { status: 'active' }),
      category,
      subcategory,
      item_type: itemType,
      attributes: cleanDetails,
      variations,
      images,
    };
    // New products over the shop's plan limit (or with no plan yet) are
    // saved as 'paused' by the database and go live when the plan allows.
    let savedStatus: string | null = null;
    let error: { message: string } | null = null;
    if (isEdit) {
      ({ error } = await supabase.from('marketplace_products').update(row).eq('id', editId).eq('seller_id', sellerId));
    } else {
      const res = await supabase.from('marketplace_products').insert({ ...row, seller_id: sellerId }).select('status').single();
      error = res.error;
      savedStatus = (res.data as { status: string } | null)?.status ?? null;
    }
    setSaving(false);

    if (error) {
      showToast(`Couldn't save: ${error.message}`);
      return;
    }
    if (savedStatus === 'paused' && sellerApproved) {
      showToast(PLANS_PURCHASABLE_HERE
        ? 'Listing saved but hidden — your seller plan is full or not active. Upgrade to put it live.'
        : 'Listing saved but hidden — your seller plan is full or not active.');
      router.replace({ pathname: '/sell', params: { change: '1' } } as any);
      return;
    }
    // Navigate straight away — on web the old confirmation dialog never
    // showed, so sellers stayed on the filled-in form and published twice.
    showToast(
      isEdit
        ? 'Changes saved'
        : sellerApproved
          ? 'Listing created — it’s live on the Marketplace'
          : 'Listing saved — it goes live once your shop is approved',
    );
    router.replace('/seller-dashboard' as any);
  }

  // ── Category search ─────────────────────────────────────────────────
  const allPaths = useMemo(() => {
    const out: { top: string; sub?: string; type?: string; label: string }[] = [];
    for (const t of PRODUCT_CATEGORIES) {
      out.push({ top: t.name, label: t.name });
      for (const s of t.subs) {
        out.push({ top: t.name, sub: s.name, label: categoryPath(t.name, s.name) });
        for (const ty of s.types ?? []) out.push({ top: t.name, sub: s.name, type: ty, label: categoryPath(t.name, s.name, ty) });
      }
    }
    return out;
  }, []);

  function chooseCategory(top: string, sub?: string, type?: string) {
    if (top !== category) {
      setDetails({});
      if (varAttrs.length) setAttrs([]);
    }
    setCategory(top);
    setSubcategory(sub ?? null);
    setItemType(type ?? null);
    if (top === 'Digital Downloads') setIsDigital(true);
    setSheet(null);
    setCatStep({});
    setCatQuery('');
  }

  if (loading) {
    return (
      <DesktopShell>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
          <ActivityIndicator color={C.gold} size="large" />
        </View>
      </DesktopShell>
    );
  }

  const canPublish = !!title.trim() && !!category && (hasVariations && priceVaries ? true : !!price.trim()) && !saving && !uploading;
  const fields = category ? DETAIL_FIELDS[category] ?? [] : [];
  const detailSheet = sheet && typeof sheet === 'object' ? fields.find((f) => f.name === sheet.detail) : null;
  const varTypes = variationTypesFor(category, subcategory);
  const catTop = catStep.top ? topCategory(catStep.top) : null;
  const catSub = catTop && catStep.sub ? catTop.subs.find((s) => s.name === catStep.sub) : null;
  const q = catQuery.trim().toLowerCase();

  return (
    <DesktopShell>
    <View style={{ flex: 1, backgroundColor: c.surfaceSoft, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
      {/* Photo stage */}
      <View style={{ paddingTop: HEADER_TOP_PADDING - 12, paddingBottom: 26 + 24 }} onLayout={drawer.onStageLayout}>
        <View onLayout={drawer.onHeaderLayout} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 }}>
          <IconButton icon="close" label="Close" variant="raised" onPress={() => goBack('/seller-dashboard')} />
          <Text style={[T.headline, { color: c.ink }]} accessibilityRole="header">{isEdit ? 'Edit product' : 'New product'}</Text>
          <View style={{ width: 44 }} />
        </View>

        {images.length === 0 ? (
          <View style={{ alignItems: 'center', gap: 16, paddingTop: 24 }}>
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

      {/* Details drawer: drag the handle up for room, down to see the photos */}
      <Animated.View
        style={[
          { position: 'absolute', left: 0, right: 0, bottom: 0, top: drawer.top, opacity: drawer.ready ? 1 : 0, backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet },
          shadow('sheet'),
        ]}
      >
        <GestureDetector gesture={drawer.gesture}>
          <View
            collapsable={false}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={drawer.open ? 'Details expanded. Swipe down to show photos' : 'Details. Swipe up for more room'}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => drawer.setOpen(e.nativeEvent.actionName === 'increment')}
            style={{ height: 28, alignItems: 'center', justifyContent: 'center', cursor: 'grab' } as any}
          >
            <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: c.surfaceStrong }} />
          </View>
        </GestureDetector>

        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 16 }}>
          {!sellerApproved ? (
            <View style={{ marginHorizontal: space[5], marginTop: 6, padding: 12, borderRadius: radius.md, backgroundColor: c.goldTint, flexDirection: 'row', gap: 10 }}>
              <Icon name="time-outline" size={18} color={c.goldInk} />
              <Text style={[T.caption, font(500), { color: c.goldInk, flex: 1 }]}>Your shop is waiting for approval. Products you add now go live once it's approved.</Text>
            </View>
          ) : null}

          <View style={{ paddingHorizontal: space[5], paddingTop: 10, gap: 2 }}>
            <TextField variant="bare" textStyle="title2" value={title} onChangeText={setTitle} onFocus={() => drawer.setOpen(true)} placeholder="Product name" accessibilityLabel="Product name" maxLength={140} />
            <TextField variant="bare" textStyle="callout" value={description} onChangeText={setDescription} onFocus={() => drawer.setOpen(true)} placeholder="Describe it: materials, fit, size, what's included" accessibilityLabel="Description" multiline style={{ minHeight: 64 }} />
          </View>

          {/* Category */}
          <View style={{ paddingHorizontal: space[5], paddingTop: 6 }}>
            <ListRow
              icon="grid-outline"
              label="Category"
              sub={category ? categoryPath(category, subcategory, itemType) : 'Helps buyers find it'}
              value={category ? undefined : 'Choose'}
              onPress={() => { setCatStep({}); setSheet('category'); }}
              last={!fields.length}
            />
          </View>

          {/* Item details for the category */}
          {fields.length ? (
            <View style={{ paddingHorizontal: space[5] }}>
              <Text style={[T.caption, font(700), { color: c.ink2, marginTop: 14, marginBottom: 2 }]}>ITEM DETAILS</Text>
              {fields.map((f, i) =>
                f.options ? (
                  <ListRow
                    key={f.name}
                    label={f.name}
                    value={details[f.name] || 'Add'}
                    onPress={() => setSheet({ detail: f.name })}
                    last={i === fields.length - 1}
                  />
                ) : (
                  <View key={f.name} style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: i === fields.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                    <Text style={[T.body, font(500), { color: c.ink, flex: 1 }]}>{f.name}</Text>
                    <TextInput
                      value={details[f.name] ?? ''}
                      onChangeText={(v) => setDetails((d) => ({ ...d, [f.name]: v }))}
                      placeholder={f.placeholder}
                      placeholderTextColor={c.ink3}
                      accessibilityLabel={f.name}
                      style={[T.body, { color: c.ink, textAlign: 'right', minWidth: 140, padding: 0, outlineStyle: 'none' } as any]}
                    />
                  </View>
                ),
              )}
            </View>
          ) : null}

          {/* Price + type */}
          <View style={[{ marginHorizontal: space[5], marginTop: 16, paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }, shadow('card')]}>
            <View style={{ flex: 1, minWidth: 130 }}>
              <Text style={[T.micro, { color: c.ink2 }]}>{hasVariations && priceVaries ? 'Starting price (set per option below)' : 'Price'}</Text>
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
              hasVariations && qtyVaries ? (
                <ListRow icon="cube-outline" label="In stock" value="Set per option below" />
              ) : (
                <ListRow icon="cube-outline" label="In stock" right={<Stepper label="in stock" value={baseStock} min={0} max={99999} onChange={(n) => setInventory(String(n))} />} />
              )
            ) : (
              <ListRow icon="cloud-download-outline" label="Delivery" value="Download after purchase" />
            )}
            <ListRow
              icon="options-outline"
              label="Variations"
              sub={hasVariations ? variationSummary.join(' · ') : 'Sizes, colors and more'}
              value={hasVariations ? 'Edit' : 'Add'}
              onPress={() => setSheet('variations')}
              last
            />
          </View>

          {/* Per-option price / stock */}
          {hasVariations && (priceVaries || (qtyVaries && !isDigital)) ? (
            <View style={{ marginHorizontal: space[5], marginTop: 6, borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: c.bgSunk, gap: 10 }}>
                <Text style={[T.micro, { color: c.ink2, flex: 1 }]}>Option</Text>
                {priceVaries ? <Text style={[T.micro, { color: c.ink2, width: 84, textAlign: 'right' }]}>Price</Text> : null}
                {qtyVaries && !isDigital ? <Text style={[T.micro, { color: c.ink2, width: 64, textAlign: 'right' }]}>Stock</Text> : null}
              </View>
              {variants.map((v, i) => (
                <View key={v.key} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, minHeight: 50, gap: 10, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                  <Text style={[T.subhead, { color: c.ink, flex: 1 }]} numberOfLines={1}>{v.key}</Text>
                  {priceVaries ? (
                    <View style={{ width: 84, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                      <Text style={[T.subhead, { color: c.ink3 }]}>$</Text>
                      <TextInput
                        defaultValue={v.price_cents ? dollars(v.price_cents) : ''}
                        onChangeText={(t) => updateVariant(v.key, { price_cents: toCents(t.replace(/[^0-9.]/g, '')) })}
                        placeholder="0.00"
                        placeholderTextColor={c.ghost}
                        keyboardType="decimal-pad"
                        accessibilityLabel={`Price for ${v.key}`}
                        style={[T.body, font(600), { color: c.ink, width: 64, textAlign: 'right', padding: 0, outlineStyle: 'none' } as any]}
                      />
                    </View>
                  ) : null}
                  {qtyVaries && !isDigital ? (
                    <TextInput
                      defaultValue={String(v.inventory)}
                      onChangeText={(t) => updateVariant(v.key, { inventory: parseInt(t.replace(/\D/g, ''), 10) || 0 })}
                      keyboardType="number-pad"
                      accessibilityLabel={`Stock for ${v.key}`}
                      style={[T.body, font(600), { color: c.ink, width: 64, textAlign: 'right', padding: 0, outlineStyle: 'none' } as any]}
                    />
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View style={{ paddingHorizontal: space[5], paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 30 : 20, borderTopWidth: 1, borderTopColor: c.line }}>
          <Button label={isEdit ? 'Save changes' : 'Publish product'} onPress={submit} loading={saving} disabled={!canPublish} />
        </View>
      </Animated.View>

      {/* Category picker: search, or drill down Category › Subcategory › Type */}
      <BottomSheet
        visible={sheet === 'category'}
        onClose={() => { setSheet(null); setCatStep({}); setCatQuery(''); }}
        title={catSub ? catSub.name : catTop ? catTop.name : 'Category'}
      >
        {!catTop ? (
          <TextField value={catQuery} onChangeText={setCatQuery} placeholder="Search: abaya, prayer rug, attar…" accessibilityLabel="Search categories" containerStyle={{ marginBottom: 8 }} />
        ) : (
          <OptionRow label="Back" icon="chevron-back" action onPress={() => setCatStep(catSub ? { top: catStep.top } : {})} />
        )}
        {q && !catTop ? (
          allPaths.filter((p) => p.label.toLowerCase().includes(q)).slice(0, 40).map((p, i, arr) => (
            <OptionRow key={p.label} label={p.type ?? p.sub ?? p.top} sub={p.label} action onPress={() => chooseCategory(p.top, p.sub, p.type)} last={i === arr.length - 1} />
          ))
        ) : catSub ? (
          <>
            <OptionRow label={`All ${catSub.name.toLowerCase()}`} selected={category === catTop!.name && subcategory === catSub.name && !itemType} onPress={() => chooseCategory(catTop!.name, catSub.name)} />
            {(catSub.types ?? []).map((ty, i, arr) => (
              <OptionRow key={ty} label={ty} selected={itemType === ty && subcategory === catSub.name} onPress={() => chooseCategory(catTop!.name, catSub.name, ty)} last={i === arr.length - 1} />
            ))}
          </>
        ) : catTop ? (
          <>
            <OptionRow label={`All of ${catTop.name}`} selected={category === catTop.name && !subcategory} onPress={() => chooseCategory(catTop.name)} />
            {catTop.subs.map((s, i) => (
              s.types?.length ? (
                <OptionRow key={s.name} label={s.name} action onPress={() => setCatStep({ top: catTop.name, sub: s.name })} last={i === catTop.subs.length - 1} />
              ) : (
                <OptionRow key={s.name} label={s.name} selected={subcategory === s.name && category === catTop.name} onPress={() => chooseCategory(catTop.name, s.name)} last={i === catTop.subs.length - 1} />
              )
            ))}
          </>
        ) : (
          PRODUCT_CATEGORIES.map((t, i) => (
            t.subs.length ? (
              <OptionRow key={t.name} label={t.name} icon={t.icon as any} action onPress={() => setCatStep({ top: t.name })} last={i === PRODUCT_CATEGORIES.length - 1} />
            ) : (
              <OptionRow key={t.name} label={t.name} icon={t.icon as any} selected={category === t.name} onPress={() => chooseCategory(t.name)} last={i === PRODUCT_CATEGORIES.length - 1} />
            )
          ))
        )}
      </BottomSheet>

      {/* One item detail */}
      <BottomSheet visible={!!detailSheet} onClose={() => setSheet(null)} title={detailSheet?.name ?? ''}>
        {detailSheet?.options?.map((o, i, arr) => (
          <OptionRow
            key={o}
            label={o}
            selected={details[detailSheet.name] === o}
            onPress={() => { setDetails((d) => ({ ...d, [detailSheet.name]: d[detailSheet.name] === o ? '' : o })); setSheet(null); }}
            last={i === arr.length - 1}
          />
        ))}
      </BottomSheet>

      {/* Variations editor */}
      <BottomSheet visible={sheet === 'variations'} onClose={() => setSheet(null)} title="Variations" footer={<Button label="Done" onPress={() => setSheet(null)} />}>
        <Text style={[T.caption, { color: c.ink2, marginBottom: 12 }]}>
          Add up to two, like Size and Color. Buyers pick one of each before adding to cart.
        </Text>

        {varAttrs.map((a, i) => {
          const presets = varTypes.find((t) => t.name === a.name)?.presets ?? [];
          const custom = a.options.filter((o) => !presets.includes(o));
          return (
            <View key={a.name} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[T.headline, { color: c.ink, flex: 1 }]}>{a.name}</Text>
                <Pressable onPress={() => removeVariation(i)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${a.name}`}>
                  <Text style={[T.subhead, font(600), { color: c.danger }]}>Remove</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[...presets, ...custom].map((o) => (
                  <Chip key={o} label={o} selected={a.options.includes(o)} onPress={() => toggleOption(i, o)} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextField
                  value={newOption[i] ?? ''}
                  onChangeText={(t) => setNewOption((m) => ({ ...m, [i]: t }))}
                  onSubmitEditing={() => addOption(i)}
                  placeholder={`Add a ${a.name.toLowerCase()} option`}
                  accessibilityLabel={`New ${a.name} option`}
                  containerStyle={{ flex: 1 }}
                  returnKeyType="done"
                />
                <Button label="Add" variant="soft" size="md" onPress={() => addOption(i)} />
              </View>
            </View>
          );
        })}

        {varAttrs.length < MAX_VARIATIONS ? (
          <View style={{ paddingVertical: 12, gap: 10 }}>
            <Text style={[T.subhead, font(600), { color: c.ink }]}>{varAttrs.length ? 'Add a second variation' : 'Add a variation'}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {varTypes.filter((t) => !varAttrs.some((a) => a.name === t.name)).map((t) => (
                <Chip key={t.name} label={t.name} icon="add" onPress={() => addVariation(t.name)} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TextField value={customVarName} onChangeText={setCustomVarName} onSubmitEditing={() => addVariation(customVarName)} placeholder="Or name your own (e.g. Fabric)" accessibilityLabel="Custom variation name" containerStyle={{ flex: 1 }} returnKeyType="done" />
              <Button label="Add" variant="soft" size="md" onPress={() => addVariation(customVarName)} />
            </View>
          </View>
        ) : null}

        {hasVariations ? (
          <View style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.line, gap: 10 }}>
            <Text style={[T.headline, { color: c.ink }]}>Photo for each option</Text>
            {images.length === 0 ? (
              <Text style={[T.caption, { color: c.ink2 }]}>Add product photos first, then link one to each option so buyers see the right one when they pick it.</Text>
            ) : (
              <>
                <Text style={[T.caption, { color: c.ink2 }]}>Tap a photo to show it when a buyer picks that option.</Text>
                {varAttrs.filter((a) => a.options.length).length > 1 ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {varAttrs.filter((a) => a.options.length).map((a) => (
                      <Chip key={a.name} label={a.name} selected={linkedAttr === a.name} onPress={() => { setPhotoAttr(a.name); setOptionImages({}); }} />
                    ))}
                  </View>
                ) : null}
                {(varAttrs.find((a) => a.name === linkedAttr)?.options ?? []).map((o) => (
                  <View key={o} style={{ gap: 6 }}>
                    <Text style={[T.subhead, font(600), { color: c.ink }]}>{o}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {images.map((url, k) => {
                        const on = optionImages[o] === url;
                        return (
                          <Pressable
                            key={url}
                            onPress={() => setOptionImages((m) => ({ ...m, [o]: on ? '' : url }))}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: on }}
                            accessibilityLabel={`Photo ${k + 1} for ${o}`}
                            style={{ width: 56, height: 70, borderRadius: 10, overflow: 'hidden', borderWidth: on ? 3 : 1, borderColor: on ? c.ink : c.line }}
                          >
                            <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                ))}
              </>
            )}
          </View>
        ) : null}

        {varAttrs.length ? (
          <View style={{ paddingTop: 4 }}>
            <ListRow label="Prices vary by option" sub="e.g. 2XL costs more" right={<DSSwitch label="Prices vary by option" value={priceVaries} onValueChange={setPriceVaries} />} />
            {!isDigital ? (
              <ListRow label="Stock varies by option" sub="Track how many of each you have" right={<DSSwitch label="Stock varies by option" value={qtyVaries} onValueChange={setQtyVaries} />} last />
            ) : null}
          </View>
        ) : null}
      </BottomSheet>
    </View>
    </DesktopShell>
  );
}
