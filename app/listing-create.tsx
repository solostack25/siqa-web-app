import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { uploadMarketplaceImage } from '../lib/supabaseStorage';
import { useTheme, type AppColors } from '../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../constants/theme';
import { Icon } from '../components/Icon';

const CATEGORIES = [
  'Home Decor', 'Books & Media', 'Clothing & Accessories', 'Art & Prints',
  'Jewelry', 'Digital Downloads', 'Gifts', 'Other',
];

export default function ListingCreateScreen() {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);

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
      Alert.alert('Set up your shop first', 'You need a shop before you can list a product.', [
        { text: 'OK', onPress: () => router.replace('/sell' as any) },
      ]);
      return;
    }
    setSellerId(seller.id);
    setSellerApproved(seller.approval_status === 'approved');
    setLoading(false);
  }

  async function pickImages() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow Siqa to access your photos.');
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
      Alert.alert('Upload failed', err.message);
    } finally {
      setUploading(false);
    }
  }

  function removeImage(url: string) {
    setImages(prev => prev.filter(u => u !== url));
  }

  async function submit() {
    if (!sellerId || !title.trim() || !price.trim()) return;
    const priceCents = Math.round(parseFloat(price) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 1) {
      Alert.alert('Invalid price', 'Enter a valid price.');
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
      Alert.alert('Error', error.message);
      return;
    }
    Alert.alert(
      'Listing created',
      sellerApproved
        ? 'Your product is live on the Marketplace.'
        : "Your product is saved and will go live once your shop is approved.",
      [{ text: 'OK', onPress: () => router.replace('/seller-dashboard' as any) }]
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={C.gold} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.roundBtn} onPress={() => router.back()}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Listing</Text>
      </View>

      {!sellerApproved && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Your shop is still pending approval. You can create listings now — they'll go live automatically once approved.
          </Text>
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.label}>Photos</Text>
        <View style={styles.imagesRow}>
          {images.map(url => (
            <View key={url} style={styles.imageThumb}>
              <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              <TouchableOpacity style={styles.imageRemove} onPress={() => removeImage(url)}>
                <Icon name="close" size={12} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.addImageBtn} onPress={pickImages} disabled={uploading}>
            {uploading ? <ActivityIndicator color={C.text3} size="small" /> : <Icon name="add" size={22} color={C.text3} />}
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Title *</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Product name" placeholderTextColor={C.text3} />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe your product..."
          placeholderTextColor={C.text3}
          multiline
          numberOfLines={4}
        />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Price (USD) *</Text>
            <TextInput style={styles.input} value={price} onChangeText={setPrice} placeholder="0.00" placeholderTextColor={C.text3} keyboardType="decimal-pad" />
          </View>
          {!isDigital && (
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Inventory</Text>
              <TextInput style={styles.input} value={inventory} onChangeText={setInventory} placeholder="1" placeholderTextColor={C.text3} keyboardType="number-pad" />
            </View>
          )}
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.label}>Digital product</Text>
          <Switch value={isDigital} onValueChange={setIsDigital} trackColor={{ false: C.border, true: C.gold }} />
        </View>

        <Text style={styles.label}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity key={cat} style={[styles.catPill, category === cat && styles.catPillActive]} onPress={() => setCategory(cat)}>
                <Text style={[styles.catText, category === cat && styles.catTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <TouchableOpacity
          style={[styles.submitBtn, (!title.trim() || !price.trim() || saving) && styles.btnDisabled]}
          onPress={submit}
          disabled={!title.trim() || !price.trim() || saving}
        >
          {saving ? <ActivityIndicator color={C.black} /> : <Text style={styles.submitBtnText}>Publish Listing</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
    scroll: { paddingBottom: 60, maxWidth: 480, width: '100%', alignSelf: 'center' },

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
