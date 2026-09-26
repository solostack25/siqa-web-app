import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useTheme, type AppColors } from '../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../constants/theme';
import { Icon } from '../components/Icon';

const SUPABASE_URL = 'https://eixlmylbqqrfazjlgxcz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hGOrpdHS1fwFYwXGI8tN2g_Yeuzchmj';

type SellerState = {
  id: string;
  shop_name: string;
  bio: string | null;
  approval_status: string;
  stripe_onboarded: boolean;
};

export default function SellScreen() {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [seller, setSeller] = useState<SellerState | null>(null);
  const [shopName, setShopName] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      router.replace('/(auth)/sign-in' as any);
      return;
    }
    setUserId(session.user.id);
    setUserEmail(session.user.email ?? null);

    const { data } = await supabase
      .from('marketplace_sellers')
      .select('id, shop_name, bio, approval_status, stripe_onboarded')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (data) {
      setSeller(data as any);
      setShopName(data.shop_name ?? '');
      setBio(data.bio ?? '');
    }
    setLoading(false);
  }

  async function saveShop() {
    if (!userId || !shopName.trim()) return;
    setSaving(true);

    if (seller) {
      await supabase.from('marketplace_sellers').update({ shop_name: shopName.trim(), bio: bio.trim() || null }).eq('id', seller.id);
      setSeller({ ...seller, shop_name: shopName.trim(), bio: bio.trim() || null });
    } else {
      const { data, error } = await supabase
        .from('marketplace_sellers')
        .insert({ user_id: userId, shop_name: shopName.trim(), bio: bio.trim() || null })
        .select('id, shop_name, bio, approval_status, stripe_onboarded')
        .single();
      if (error) {
        Alert.alert('Error', error.message);
        setSaving(false);
        return;
      }
      setSeller(data as any);
    }
    setSaving(false);
  }

  async function connectStripe() {
    if (!seller) return;
    setConnecting(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-marketplace-connect-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          sellerId: seller.id,
          shopName: seller.shop_name,
          email: userEmail,
          returnUrl: Platform.OS === 'web' ? window.location.href : undefined,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await Linking.openURL(data.url);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setConnecting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={C.gold} size="large" />
      </View>
    );
  }

  const step = !seller ? 1 : seller.approval_status !== 'approved' ? 2 : !seller.stripe_onboarded ? 3 : 4;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.roundBtn} onPress={() => router.back()}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sell on Siqa</Text>
      </View>

      <View style={styles.progressRow}>
        {['Shop', 'Approval', 'Payments', 'Done'].map((label, i) => (
          <View key={label} style={styles.progressItem}>
            <View style={[styles.progressDot, step > i + 1 && styles.progressDotDone, step === i + 1 && styles.progressDotActive]}>
              <Text style={[styles.progressDotText, (step > i + 1 || step === i + 1) && styles.progressDotTextActive]}>
                {step > i + 1 ? '✓' : i + 1}
              </Text>
            </View>
            <Text style={styles.progressLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {!seller || step === 1 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Set up your shop</Text>
          <Text style={styles.cardSub}>Tell buyers who you are and what you sell.</Text>

          <Text style={styles.label}>Shop name *</Text>
          <TextInput
            style={styles.input}
            value={shopName}
            onChangeText={setShopName}
            placeholder="e.g. Nour Handmade"
            placeholderTextColor={C.text3}
          />

          <Text style={styles.label}>About your shop</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={bio}
            onChangeText={setBio}
            placeholder="Tell buyers about your shop and what makes your products special..."
            placeholderTextColor={C.text3}
            multiline
            numberOfLines={4}
          />

          <TouchableOpacity
            style={[styles.primaryBtn, (!shopName.trim() || saving) && styles.btnDisabled]}
            onPress={saveShop}
            disabled={!shopName.trim() || saving}
          >
            {saving ? <ActivityIndicator color={C.black} /> : <Text style={styles.primaryBtnText}>Continue</Text>}
          </TouchableOpacity>
        </View>
      ) : step === 2 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Awaiting approval</Text>
          <Text style={styles.cardSub}>
            "{seller.shop_name}" is under review by the Siqa team. You'll be able to connect payments and list products once it's approved — usually within a day or two.
          </Text>
        </View>
      ) : step === 3 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Connect payments</Text>
          <Text style={styles.cardSub}>
            Powered by Stripe. When a buyer pays, the money goes straight to your bank account.
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, connecting && styles.btnDisabled]}
            onPress={connectStripe}
            disabled={connecting}
          >
            {connecting ? <ActivityIndicator color={C.black} /> : <Text style={styles.primaryBtnText}>Connect with Stripe</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>You're all set 🎉</Text>
          <Text style={styles.cardSub}>"{seller.shop_name}" is ready to sell on Siqa.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/seller-dashboard' as any)}>
            <Text style={styles.primaryBtnText}>Go to Seller Dashboard</Text>
          </TouchableOpacity>
        </View>
      )}
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

    progressRow: { flexDirection: 'row', paddingHorizontal: Theme.spacing.lg, marginBottom: Theme.spacing.xl, gap: 8 },
    progressItem: { flex: 1, alignItems: 'center' },
    progressDot: {
      width: 26, height: 26, borderRadius: 13, backgroundColor: C.surface2,
      alignItems: 'center', justifyContent: 'center', marginBottom: 4,
    },
    progressDotActive: { backgroundColor: C.gold },
    progressDotDone: { backgroundColor: C.emeraldLight },
    progressDotText: { fontSize: 11, fontWeight: '800', color: C.text3 },
    progressDotTextActive: { color: C.black },
    progressLabel: { fontSize: 9, color: C.text3, fontWeight: '600' },

    card: {
      marginHorizontal: Theme.spacing.lg, backgroundColor: C.surface, borderRadius: Theme.radius.xl,
      padding: Theme.spacing.xl, borderWidth: 0.5, borderColor: C.border2,
    },
    cardTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 6 },
    cardSub: { fontSize: 13, color: C.text2, lineHeight: 19, marginBottom: 18 },

    label: { fontSize: 12, fontWeight: '700', color: C.text2, marginBottom: 6, marginTop: 4 },
    input: {
      backgroundColor: C.bg2, borderRadius: Theme.radius.md, borderWidth: 0.5, borderColor: C.border,
      paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontSize: 14, marginBottom: 14,
    },
    textArea: { minHeight: 90, textAlignVertical: 'top' },

    primaryBtn: { backgroundColor: C.gold, borderRadius: Theme.radius.md, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
    btnDisabled: { opacity: 0.6 },
    primaryBtnText: { color: C.black, fontSize: 15, fontWeight: '800' },
  });
}
