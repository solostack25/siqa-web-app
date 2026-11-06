import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Image, Platform, Switch,
} from 'react-native';
import { ORDER_CATEGORIES, ORDER_PLATFORMS, normalizeOrderUrl, orderUrlError } from '../../lib/orderLinks';
import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { useTheme, type AppColors } from '../../lib/theme';
import { HEADER_TOP_PADDING } from '../../constants/theme';
import { DesktopShell, useIsDesktopWeb } from '../../components/DesktopShell';
import { Icon } from '../../components/Icon';
import { uploadFileToBunny } from '../../lib/bunnyUpload';
import { confirmDialog, notifyDialog } from '../../lib/dialogs';
import { geocodePlace } from '../../lib/location';
import {
  BUSINESS_CATEGORIES, tintFor, initialsOf, type BusinessCategory, type BusinessListing, type BusinessService,
} from '../../lib/businessCategories';
import { brandStyles, buttonStyles, dsStatic } from '../../lib/ds';

type Form = {
  name: string; category: BusinessCategory | ''; tagline: string; description: string;
  city: string; state: string; zip: string; service_area: string; address: string;
  is_online: boolean; is_home_based: boolean; women_owned: boolean; sisters_only: boolean;
  phone: string; whatsapp: string; website: string; booking_url: string;
  ubereats_url: string; doordash_url: string; grubhub_url: string; order_url: string;
  price_text: string; hours_text: string; languages: string;
  services: BusinessService[]; logo_url: string | null; cover_url: string | null; publish: boolean;
};

const EMPTY: Form = {
  name: '', category: '', tagline: '', description: '', city: '', state: '', zip: '', service_area: '', address: '',
  is_online: false, is_home_based: false, women_owned: false, sisters_only: false,
  phone: '', whatsapp: '', website: '', booking_url: '',
  ubereats_url: '', doordash_url: '', grubhub_url: '', order_url: '', price_text: '', hours_text: '', languages: '',
  services: [], logo_url: null, cover_url: null, publish: true,
};

// Categories owners pick from (restaurants/grocery/shops are mostly seeded, but owners can choose them too).
const PICKABLE = BUSINESS_CATEGORIES;

export default function LocalEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors: C } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const styles = makeStyles(C, isDesktopWeb);

  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [notAllowed, setNotAllowed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'logo' | 'cover' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const me = session?.user?.id ?? null;
    setUid(me);
    if (me && id) {
      const { data } = await supabase.from('business_listings').select('*').eq('id', id).maybeSingle();
      const l = data as BusinessListing | null;
      if (!l || l.owner_id !== me) { setNotAllowed(true); setLoading(false); return; }
      setF({
        name: l.name, category: l.category, tagline: l.tagline ?? '', description: l.description ?? '',
        city: l.city ?? '', state: l.state ?? '', zip: (l as any).zip ?? '', service_area: l.service_area ?? '', address: l.address ?? '',
        is_online: l.is_online, is_home_based: l.is_home_based, women_owned: l.women_owned, sisters_only: l.sisters_only,
        phone: l.phone ?? '', whatsapp: l.whatsapp ?? '', website: l.website ?? '', booking_url: l.booking_url ?? '',
        ubereats_url: l.ubereats_url ?? '', doordash_url: l.doordash_url ?? '', grubhub_url: l.grubhub_url ?? '', order_url: l.order_url ?? '',
        price_text: l.price_text ?? '', hours_text: l.hours_text ?? '', languages: (l.languages ?? []).join(', '),
        services: Array.isArray(l.services) ? l.services : [], logo_url: l.logo_url, cover_url: l.cover_url,
        publish: l.status !== 'draft',
      });
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(prev => ({ ...prev, [k]: v }));

  async function pickImage(kind: 'logo' | 'cover') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return notifyDialog('Permission needed', 'Allow Siqa to access your photos.');
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true,
      aspect: kind === 'logo' ? [1, 1] : [3, 1], quality: 0.85,
    });
    if (res.canceled || !res.assets[0] || !uid) return;
    setUploading(kind);
    try {
      const asset = res.assets[0];
      const ext = (asset.uri.split('.').pop()?.split('?')[0] ?? 'jpg').slice(0, 5);
      const url = await uploadFileToBunny({
        uri: asset.uri, fileName: `business-${kind}s/${uid}_${Date.now()}.${/^[a-z0-9]+$/i.test(ext) ? ext : 'jpg'}`,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      set(kind === 'logo' ? 'logo_url' : 'cover_url', url);
    } catch (e: any) {
      notifyDialog('Upload failed', e?.message ?? 'Please try again.');
    } finally {
      setUploading(null);
    }
  }

  const nameOk = f.name.trim().length >= 2;
  const placeOk = f.is_online || f.city.trim().length > 0 || f.service_area.trim().length > 0 || /^\d{5}$/.test(f.zip.trim());
  const showOrder = ORDER_CATEGORIES.has(f.category);
  const orderErrors = showOrder
    ? ORDER_PLATFORMS.map(p => ({ key: p.key, err: orderUrlError(p.key, f[p.column]) })).filter(x => x.err)
    : [];
  const canSave = nameOk && f.category !== '' && placeOk && orderErrors.length === 0 && !saving && !uploading;

  async function save() {
    if (!uid || !canSave) return;
    setSaving(true); setError(null);
    // Put the listing on the map so it shows up in "near me" searches.
    const zip = f.zip.trim().slice(0, 5);
    const placeText = [f.address.trim(), f.city.trim(), f.state.trim(), zip].filter(Boolean).join(', ');
    const geo = placeText && (f.city.trim() || zip) ? await geocodePlace(placeText).catch(() => null) ?? (zip ? await geocodePlace(zip).catch(() => null) : null) : null;
    const payload = {
      name: f.name.trim(), category: f.category, tagline: f.tagline.trim() || null, description: f.description.trim() || null,
      city: f.city.trim() || geo?.city || null, state: f.state.trim().toUpperCase().slice(0, 2) || geo?.state || null,
      zip: zip || geo?.zip || null, lat: geo?.lat ?? null, lon: geo?.lon ?? null,
      service_area: f.service_area.trim() || null, address: f.address.trim() || null,
      is_online: f.is_online, is_home_based: f.is_home_based, women_owned: f.women_owned, sisters_only: f.sisters_only,
      phone: f.phone.trim() || null, whatsapp: f.whatsapp.trim() || null, website: f.website.trim() || null,
      booking_url: f.booking_url.trim() || null,
      ubereats_url: showOrder ? normalizeOrderUrl(f.ubereats_url) || null : null,
      doordash_url: showOrder ? normalizeOrderUrl(f.doordash_url) || null : null,
      grubhub_url: showOrder ? normalizeOrderUrl(f.grubhub_url) || null : null,
      order_url: showOrder ? normalizeOrderUrl(f.order_url) || null : null,
      price_text: f.price_text.trim() || null, hours_text: f.hours_text.trim() || null,
      languages: f.languages.split(',').map(s => s.trim()).filter(Boolean).slice(0, 10),
      services: f.services.filter(s => s.name.trim()).map(s => ({
        name: s.name.trim(), ...(s.description?.trim() ? { description: s.description.trim() } : {}), ...(s.price?.trim() ? { price: s.price.trim() } : {}),
      })).slice(0, 20),
      logo_url: f.logo_url, cover_url: f.cover_url,
      status: f.publish ? 'published' : 'draft',
    };
    const res = id
      ? await supabase.from('business_listings').update(payload).eq('id', id).select('id').single()
      : await supabase.from('business_listings').insert({ ...payload, owner_id: uid }).select('id').single();
    setSaving(false);
    if (res.error) { setError(res.error.message); return; }
    router.replace(`/local/${(res.data as any).id}` as any);
  }

  async function remove() {
    if (!id) return;
    if (!(await confirmDialog('Delete this listing?', 'It will be removed from the directory along with its messages. This can’t be undone.', 'Delete'))) return;
    const { error: err } = await supabase.from('business_listings').delete().eq('id', id);
    if (err) return notifyDialog('Could not delete', err.message);
    router.replace('/local' as any);
  }

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace((id ? `/local/${id}` : '/local') as any);
  }

  const shell = (children: React.ReactNode) => (
    <DesktopShell>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
          <View style={styles.page}>
            <TouchableOpacity onPress={back} style={styles.back} accessibilityLabel="Back">
              <Icon name="chevron-back" size={20} color={C.text} />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
            {children}
          </View>
        </ScrollView>
      </View>
    </DesktopShell>
  );

  if (loading) return shell(<View style={{ paddingVertical: 80, alignItems: 'center' }}><ActivityIndicator color={C.gold} /></View>);

  if (!uid) {
    return shell(
      <View style={styles.card}>
        <Text style={styles.h1}>List your business</Text>
        <Text style={styles.body}>Sign in to create a listing. Customers can message you on Siqa, call you, or visit your website. There's nothing to sell or ship through Siqa.</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/(auth)/sign-in' as any)}><Text style={styles.primaryBtnText}>Sign in</Text></TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={() => router.push('/(auth)/sign-up' as any)}><Text style={styles.ghostBtnText}>Create an account</Text></TouchableOpacity>
        </View>
      </View>,
    );
  }

  if (notAllowed) {
    return shell(<View style={styles.card}><Text style={styles.h2}>You can only edit your own listing.</Text></View>);
  }

  const tint = tintFor(id ?? f.name ?? 'new');

  return shell(
    <>
      <View style={{ gap: 6 }}>
        <Text style={styles.eyebrow}>LOCAL & SERVICES</Text>
        <Text style={styles.h1}>{id ? 'Edit your listing' : 'List your business'}</Text>
        <Text style={styles.body}>People find you in Shop › Local & services and contact you directly. No checkout or shipping.</Text>
      </View>

      {/* Images */}
      <View style={styles.card}>
        <Text style={styles.h2}>Photos</Text>
        <TouchableOpacity style={[styles.coverPick, { backgroundColor: tint }]} onPress={() => pickImage('cover')} disabled={!!uploading} accessibilityLabel="Choose cover photo">
          {f.cover_url ? <Image source={{ uri: f.cover_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          <View style={styles.pickPill}>
            {uploading === 'cover' ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="camera-outline" size={15} color="#fff" />}
            <Text style={styles.pickPillText}>{f.cover_url ? 'Change cover' : 'Add a cover photo'}</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.row}>
          <TouchableOpacity style={styles.logoPick} onPress={() => pickImage('logo')} disabled={!!uploading} accessibilityLabel="Choose logo">
            {f.logo_url ? <Image source={{ uri: f.logo_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : (
              uploading === 'logo' ? <ActivityIndicator color={C.text2} /> : <Text style={[styles.logoText, { color: tint }]}>{f.name ? initialsOf(f.name) : '+'}</Text>
            )}
          </TouchableOpacity>
          <Text style={[styles.small, { flex: 1 }]}>Logo or a photo of you. Square works best.</Text>
        </View>
      </View>

      {/* Basics */}
      <View style={styles.card}>
        <Text style={styles.h2}>About your business</Text>
        <Field label="Business name" placeholder="e.g. Noor Quran Academy" max={140} value={f.name} onChange={t => set('name', t)} styles={styles} C={C} />
        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Category</Text>
          <View style={styles.row}>
            {PICKABLE.map(c => (
              <TouchableOpacity key={c.key} style={[styles.chip, f.category === c.key && styles.chipOn]} onPress={() => set('category', c.key)}
                accessibilityRole="radio" accessibilityState={{ selected: f.category === c.key }}>
                <Text style={[styles.chipText, f.category === c.key && styles.chipTextOn]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <Field label="One-line pitch" placeholder="What you do, in one sentence" max={160} value={f.tagline} onChange={t => set('tagline', t)} styles={styles} C={C} />
        <Field label="Description" placeholder="Who you are, what you offer, who it's for" multiline max={4000} value={f.description} onChange={t => set('description', t)} styles={styles} C={C} />
        <Toggle label="Women-owned" value={f.women_owned} onChange={v => set('women_owned', v)} styles={styles} C={C} />
        <Toggle label="Sisters-only service" hint="You serve women only, or offer a women-only option" value={f.sisters_only} onChange={v => set('sisters_only', v)} styles={styles} C={C} />
        <Toggle label="Home-based" value={f.is_home_based} onChange={v => set('is_home_based', v)} styles={styles} C={C} />
      </View>

      {/* Where */}
      <View style={styles.card}>
        <Text style={styles.h2}>Where you work</Text>
        <Toggle label="Online or remote" hint="Classes, consultations or work done over video or phone" value={f.is_online} onChange={v => set('is_online', v)} styles={styles} C={C} />
        <View style={styles.twoCol}>
          <View style={{ flex: 2, minWidth: 180 }}><Field label="City" placeholder="Houston" value={f.city} onChange={t => set('city', t)} styles={styles} C={C} /></View>
          <View style={{ flex: 1, minWidth: 90 }}><Field label="State" placeholder="TX" max={2} value={f.state} onChange={t => set('state', t)} styles={styles} C={C} /></View>
          <View style={{ flex: 1, minWidth: 110 }}><Field label="ZIP" placeholder="77494" max={5} keyboardType="number-pad" value={f.zip} onChange={t => set('zip', t.replace(/\D/g, ''))} styles={styles} C={C} /></View>
        </View>
        <Field label="Service area (optional)" placeholder="e.g. Katy, Sugar Land and Richmond" value={f.service_area} onChange={t => set('service_area', t)} styles={styles} C={C} />
        <Field label="Street address (optional)" placeholder="Only if customers come to you" hint="Leave blank if you work from home." value={f.address} onChange={t => set('address', t)} styles={styles} C={C} />
        {!placeOk && <Text style={styles.error}>Add a city, ZIP or service area, or turn on Online.</Text>}
        <Text style={styles.small}>Your city and ZIP are used to show your listing to people nearby.</Text>
      </View>

      {/* Services */}
      <View style={styles.card}>
        <Text style={styles.h2}>Services & pricing</Text>
        <Text style={styles.small}>Optional. Shown as information only; customers arrange and pay you directly.</Text>
        {f.services.map((s, i) => (
          <View key={i} style={styles.serviceEdit}>
            <TextInput value={s.name} onChangeText={t => set('services', f.services.map((x, j) => j === i ? { ...x, name: t } : x))}
              placeholder="Service" placeholderTextColor={C.text3} style={[styles.input, { flexGrow: 2, flexBasis: 180 }]} accessibilityLabel={`Service ${i + 1} name`} />
            <TextInput value={s.price ?? ''} onChangeText={t => set('services', f.services.map((x, j) => j === i ? { ...x, price: t } : x))}
              placeholder="Price (e.g. $25 / class)" placeholderTextColor={C.text3} style={[styles.input, { flexGrow: 1, flexBasis: 140 }]} accessibilityLabel={`Service ${i + 1} price`} />
            <TextInput value={s.description ?? ''} onChangeText={t => set('services', f.services.map((x, j) => j === i ? { ...x, description: t } : x))}
              placeholder="Short description (optional)" placeholderTextColor={C.text3} style={[styles.input, { flexBasis: '100%' as any }]} accessibilityLabel={`Service ${i + 1} description`} />
            <TouchableOpacity onPress={() => set('services', f.services.filter((_, j) => j !== i))} style={{ minHeight: 40, justifyContent: 'center' }}>
              <Text style={[styles.link, { color: C.danger }]}>Remove</Text>
            </TouchableOpacity>
          </View>
        ))}
        {f.services.length < 20 && (
          <TouchableOpacity style={[styles.ghostBtn, { alignSelf: 'flex-start' }]} onPress={() => set('services', [...f.services, { name: '', price: '', description: '' }])}>
            <Text style={styles.ghostBtnText}>+ Add a service</Text>
          </TouchableOpacity>
        )}
        <Field label="General pricing (optional)" placeholder="e.g. From $25 per class" max={80} value={f.price_text} onChange={t => set('price_text', t)} styles={styles} C={C} />
        <Field label="Hours (optional)" placeholder={'Mon–Thu 4–9 PM\nSat–Sun 9 AM–1 PM'} multiline max={400} value={f.hours_text} onChange={t => set('hours_text', t)} styles={styles} C={C} />
        <Field label="Languages (optional)" placeholder="English, Arabic, Urdu" value={f.languages} onChange={t => set('languages', t)} styles={styles} C={C} />
      </View>

      {/* Contact */}
      <View style={styles.card}>
        <Text style={styles.h2}>How people reach you</Text>
        <Text style={styles.small}>Siqa members can always message you here. Add any other ways you want to be contacted.</Text>
        <Field label="Phone" placeholder="(713) 555-0100" keyboardType="phone-pad" value={f.phone} onChange={t => set('phone', t)} styles={styles} C={C} />
        <Field label="WhatsApp" placeholder="Number with country code, e.g. 17135550100" keyboardType="phone-pad" value={f.whatsapp} onChange={t => set('whatsapp', t)} styles={styles} C={C} />
        <Field label="Website" placeholder="https://" keyboardType="url" value={f.website} onChange={t => set('website', t)} styles={styles} C={C} />
        <Field label="Booking link" placeholder="Calendly, Square, etc." keyboardType="url" value={f.booking_url} onChange={t => set('booking_url', t)} styles={styles} C={C} />
      </View>

      {showOrder && (
        <View style={styles.card}>
          <Text style={styles.h2}>Order delivery (optional)</Text>
          <Text style={styles.small}>
            On Uber Eats, DoorDash or Grubhub? Open your store page there, copy the link, and paste it here. Customers get an Order button that opens your menu in that app.
          </Text>
          {ORDER_PLATFORMS.map(p => (
            <View key={p.key} style={{ gap: 4 }}>
              <Field label={p.label} placeholder={p.placeholder} keyboardType="url" value={f[p.column]} onChange={t => set(p.column, t)} styles={styles} C={C} />
              {orderUrlError(p.key, f[p.column]) ? <Text style={styles.error}>{orderUrlError(p.key, f[p.column])}</Text> : null}
            </View>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <Toggle label="Publish now" hint="Turn off to save a draft only you can see" value={f.publish} onChange={v => set('publish', v)} styles={styles} C={C} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity style={[styles.primaryBtn, { minHeight: 50 }, !canSave && { opacity: 0.45 }]} onPress={save} disabled={!canSave}>
          {saving ? <ActivityIndicator color={dsStatic().c.onPrimary} /> : <Text style={styles.primaryBtnText}>{id ? 'Save changes' : f.publish ? 'Publish listing' : 'Save draft'}</Text>}
        </TouchableOpacity>
        {!nameOk || f.category === '' ? <Text style={styles.small}>Add a name and pick a category to continue.</Text> : null}
        {id ? (
          <TouchableOpacity onPress={remove} style={{ alignSelf: 'center', minHeight: 40, justifyContent: 'center' }}>
            <Text style={[styles.link, { color: C.danger }]}>Delete listing</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </>,
  );
}

function Field({ label, value, onChange, placeholder, multiline, keyboardType, max, hint, styles, C }: {
  label: string; value: string; onChange: (t: string) => void; placeholder?: string; multiline?: boolean;
  keyboardType?: any; max?: number; hint?: string; styles: any; C: AppColors;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.text3}
        multiline={multiline}
        keyboardType={keyboardType}
        maxLength={max}
        autoCapitalize={keyboardType === 'url' || keyboardType === 'email-address' ? 'none' : 'sentences'}
        style={[styles.input, multiline && { minHeight: 110, textAlignVertical: 'top', paddingTop: 12 }]}
        accessibilityLabel={label}
      />
      {hint ? <Text style={styles.small}>{hint}</Text> : null}
    </View>
  );
}

function Toggle({ label, value, onChange, hint, styles, C }: {
  label: string; value: boolean; onChange: (v: boolean) => void; hint?: string; styles: any; C: AppColors;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint ? <Text style={styles.small}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: C.gold, false: C.surface3 }}
        thumbColor="#FFFFFF"
        accessibilityLabel={label}
      />
    </View>
  );
}

function makeStyles(C: AppColors, desktop: boolean) {
  return StyleSheet.create(brandStyles({
    page: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 16, paddingHorizontal: desktop ? 24 : 16, paddingTop: desktop ? 24 : HEADER_TOP_PADDING },
    back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', minHeight: 40 },
    backText: { fontSize: 14, fontWeight: '600', color: C.text },
    eyebrow: { fontSize: 12, fontWeight: '700', color: C.gold, letterSpacing: 1 },
    h1: { fontSize: desktop ? 28 : 24, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
    h2: { fontSize: 17, fontWeight: '700', color: C.text },
    body: { fontSize: 15, lineHeight: 22, color: C.text2 },
    small: { fontSize: 12, lineHeight: 17, color: C.text2 },
    link: { fontSize: 14, fontWeight: '600', color: C.gold },
    error: { fontSize: 13, color: C.danger },
    card: { gap: 14, padding: desktop ? 20 : 16, borderRadius: 18, borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    twoCol: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    label: { fontSize: 13, fontWeight: '700', color: C.text },
    input: {
      minHeight: 46, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12,
      fontSize: 15, color: C.text, backgroundColor: C.bg, ...(Platform.OS === 'web' ? { outlineColor: C.gold } as any : {}),
    },
    chip: { minHeight: 38, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: C.border, justifyContent: 'center' },
    chipOn: { backgroundColor: C.text, borderColor: C.text },
    chipText: { fontSize: 13, color: C.text },
    chipTextOn: { color: C.bg, fontWeight: '700' },
    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
    toggleLabel: { fontSize: 15, color: C.text, fontWeight: '500' },
    coverPick: { height: desktop ? 160 : 120, borderRadius: 14, overflow: 'hidden', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 10 },
    pickPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
    pickPillText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    logoPick: { width: 72, height: 72, borderRadius: 18, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    logoText: { fontSize: 22, fontWeight: '800' },
    serviceEdit: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border2 },
    primaryBtn: buttonStyles('primary', 'lg').box,
    primaryBtnText: buttonStyles('primary', 'lg').text,
    ghostBtn: buttonStyles('secondary', 'md').box,
    ghostBtnText: buttonStyles('secondary', 'md').text,
  }));
}
