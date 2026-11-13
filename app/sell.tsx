import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { showToast } from '../components/Toast';
import { useTheme, type AppColors } from '../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../constants/theme';
import { Icon } from '../components/Icon';
import { DesktopShell } from '../components/DesktopShell';
import { brandStyles, buttonStyles, dsStatic } from '../lib/ds';
import { goBack } from '../lib/goBack';
import {
  SELLER_PLANS,
  SELLER_PLAN_COLUMNS,
  hasLivePlan,
  planLabel,
  PLANS_PURCHASABLE_HERE,
  sellerPlanRequest,
  type PlanTier,
  type SellerPlanFields,
} from '../lib/sellerPlans';

const SUPABASE_URL = 'https://eixlmylbqqrfazjlgxcz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hGOrpdHS1fwFYwXGI8tN2g_Yeuzchmj';

type SellerState = {
  id: string;
  shop_name: string;
  bio: string | null;
  approval_status: string;
  stripe_onboarded: boolean;
} & SellerPlanFields;

const SELLER_COLUMNS = `id, shop_name, bio, approval_status, stripe_onboarded, ${SELLER_PLAN_COLUMNS}`;

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
  const [pickedTier, setPickedTier] = useState<PlanTier>('starter');
  const [planBusy, setPlanBusy] = useState(false);
  const [waitingForPlan, setWaitingForPlan] = useState(false);
  // ?change=1 (from the seller dashboard) opens the plan picker for an
  // existing shop; ?plan=success is Stripe Checkout sending the seller back.
  const params = useLocalSearchParams<{ change?: string; plan?: string }>();
  const changingPlan = params.change === '1';

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
      .select(SELLER_COLUMNS)
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (data) {
      setSeller(data as any);
      setShopName(data.shop_name ?? '');
      setBio(data.bio ?? '');
      if (data.plan_tier) setPickedTier(data.plan_tier as PlanTier);
      if (params.plan === 'success' && !hasLivePlan(data as any)) waitForPlan(data.id);
      if (params.plan === 'cancelled') showToast('Checkout cancelled — no charge was made.');
    }
    setLoading(false);
  }

  // Stripe confirms the subscription by webhook a few seconds after checkout.
  async function waitForPlan(sellerId: string) {
    setWaitingForPlan(true);
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const { data } = await supabase.from('marketplace_sellers').select(SELLER_COLUMNS).eq('id', sellerId).maybeSingle();
      if (data && hasLivePlan(data as any)) {
        setSeller(data as any);
        setWaitingForPlan(false);
        showToast('Your plan is active');
        return;
      }
    }
    setWaitingForPlan(false);
    showToast('Payment received — your plan will show up in a minute. Refresh if it doesn\u2019t.');
  }

  async function openUrl(url: string) {
    if (Platform.OS === 'web') window.location.href = url;
    else await Linking.openURL(url);
  }

  async function choosePlan() {
    if (!seller) return;
    setPlanBusy(true);
    try {
      const live = hasLivePlan(seller) && !seller.plan_exempt;
      const data = await sellerPlanRequest({ action: live ? 'change' : 'checkout', sellerId: seller.id, tier: pickedTier });
      if (data.error) throw new Error(data.error);
      if (data.url) return openUrl(data.url);
      showToast('Plan updated');
      // The webhook applies the new limit; give it a moment, then refresh.
      setTimeout(load, 2500);
      if (changingPlan) router.replace('/seller-dashboard' as any);
    } catch (err: any) {
      showToast(err?.message || 'Could not start checkout. Please try again.');
    } finally {
      setPlanBusy(false);
    }
  }

  async function manageBilling() {
    if (!seller) return;
    setPlanBusy(true);
    try {
      const data = await sellerPlanRequest({ action: 'portal', sellerId: seller.id });
      if (data.error) throw new Error(data.error);
      if (data.url) await openUrl(data.url);
    } catch (err: any) {
      showToast(err?.message || 'Could not open billing.');
    } finally {
      setPlanBusy(false);
    }
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
        .select(SELLER_COLUMNS)
        .single();
      if (error) {
        showToast(`Couldn't create your shop: ${error.message}`);
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
        // The function checks this login token and that the shop is yours.
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          sellerId: seller.id,
          shopName: seller.shop_name,
          returnUrl: Platform.OS === 'web' ? window.location.href : undefined,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (Platform.OS === 'web') {
        // Same-tab navigation: window.open after an await is blocked by
        // Safari's popup blocker, so "Connect with Stripe" did nothing.
        window.location.href = data.url;
      } else {
        await Linking.openURL(data.url);
      }
    } catch (err: any) {
      showToast(err?.message || 'Could not open Stripe. Please try again.');
    } finally {
      setConnecting(false);
    }
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

  const step = !seller ? 1
    : seller.approval_status !== 'approved' ? 2
    : !hasLivePlan(seller) || changingPlan ? 3
    : !seller.stripe_onboarded ? 4
    : 5;

  return (
    <DesktopShell>
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.roundBtn} onPress={() => goBack('/marketplace')}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sell on Siqa</Text>
      </View>

      <View style={styles.progressRow}>
        {['Shop', 'Approval', 'Plan', 'Payments', 'Done'].map((label, i) => (
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
            {saving ? <ActivityIndicator color={dsStatic().c.onPrimary} /> : <Text style={styles.primaryBtnText}>Continue</Text>}
          </TouchableOpacity>
        </View>
      ) : step === 2 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Awaiting approval</Text>
          <Text style={styles.cardSub}>
            "{seller.shop_name}" is under review by the Siqa team. You'll be able to connect payments and list products once it's approved — usually within a day or two.
          </Text>
        </View>
      ) : step === 3 && !PLANS_PURCHASABLE_HERE ? (
        // Native apps: no prices, no purchase button, no link (store rules).
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Seller plan</Text>
          <Text style={styles.cardSub}>
            {hasLivePlan(seller)
              ? `Your shop is on the ${planLabel(seller)} plan. Seller plans are managed on the Siqa website.`
              : 'Your shop needs an active seller plan before products go live. Seller plans are set up on the Siqa website, not in the app. Once it\u2019s active, come back and tap Refresh.'}
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.primaryBtnText}>Refresh</Text>
          </TouchableOpacity>
          {hasLivePlan(seller) ? (
            <TouchableOpacity style={styles.linkBtn} onPress={() => router.replace('/seller-dashboard' as any)}>
              <Text style={styles.linkBtnText}>Back to my store</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : step === 3 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{changingPlan && hasLivePlan(seller) ? 'Change your plan' : 'Choose your plan'}</Text>
          <Text style={styles.cardSub}>
            {changingPlan && hasLivePlan(seller)
              ? `You're on ${planLabel(seller)}. Changes take effect now and are prorated on your next bill.`
              : 'A monthly plan based on how many products you have live. Change or cancel any time.'}
          </Text>

          {waitingForPlan ? (
            <View style={styles.waiting}>
              <ActivityIndicator color={C.gold} />
              <Text style={styles.cardSub}>Confirming your payment with Stripe…</Text>
            </View>
          ) : (
            <>
              {SELLER_PLANS.map(p => {
                const on = pickedTier === p.tier;
                const current = hasLivePlan(seller) && seller.plan_tier === p.tier;
                return (
                  <TouchableOpacity
                    key={p.tier}
                    style={[styles.planCard, on && styles.planCardOn]}
                    onPress={() => setPickedTier(p.tier)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planTitle}>{p.title}{current ? '  · Current' : ''}</Text>
                      <Text style={styles.planBlurb}>{p.blurb}</Text>
                    </View>
                    <Text style={styles.planPrice}>${p.price}<Text style={styles.planPer}>/mo</Text></Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={[styles.primaryBtn, { marginTop: 8 }, (planBusy || (hasLivePlan(seller) && seller.plan_tier === pickedTier)) && styles.btnDisabled]}
                onPress={choosePlan}
                disabled={planBusy || (hasLivePlan(seller) && seller.plan_tier === pickedTier)}
              >
                {planBusy ? <ActivityIndicator color={dsStatic().c.onPrimary} /> : (
                  <Text style={styles.primaryBtnText}>
                    {hasLivePlan(seller) && !seller.plan_exempt
                      ? `Switch to $${SELLER_PLANS.find(p => p.tier === pickedTier)!.price}/month`
                      : `Continue to payment · $${SELLER_PLANS.find(p => p.tier === pickedTier)!.price}/month`}
                  </Text>
                )}
              </TouchableOpacity>
              {hasLivePlan(seller) && !seller.plan_exempt ? (
                <TouchableOpacity style={styles.linkBtn} onPress={manageBilling} disabled={planBusy}>
                  <Text style={styles.linkBtnText}>Update card, see invoices or cancel</Text>
                </TouchableOpacity>
              ) : null}
              <Text style={styles.fineprint}>Billed monthly by Stripe. Products over your plan's limit stay saved but hidden until you upgrade.</Text>
            </>
          )}
        </View>
      ) : step === 4 ? (
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
            {connecting ? <ActivityIndicator color={dsStatic().c.onPrimary} /> : <Text style={styles.primaryBtnText}>Connect with Stripe</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>You're all set</Text>
          <Text style={styles.cardSub}>"{seller.shop_name}" is ready to sell on Siqa.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/seller-dashboard' as any)}>
            <Text style={styles.primaryBtnText}>Go to my store</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
    </DesktopShell>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create(brandStyles({
    container: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
    scroll: { paddingBottom: 60, maxWidth: 560, width: '100%', alignSelf: 'center' },

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

    waiting: { alignItems: 'center', gap: 10, paddingVertical: 16 },
    planCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 10,
      borderRadius: Theme.radius.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg2,
    },
    planCardOn: { borderColor: C.gold, backgroundColor: C.surface2 },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: C.border2, alignItems: 'center', justifyContent: 'center' },
    radioOn: { borderColor: C.gold },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.gold },
    planTitle: { fontSize: 15, fontWeight: '700', color: C.text },
    planBlurb: { fontSize: 12, color: C.text2, marginTop: 2 },
    planPrice: { fontSize: 20, fontWeight: '800', color: C.text },
    planPer: { fontSize: 12, fontWeight: '600', color: C.text3 },
    linkBtn: { alignItems: 'center', paddingVertical: 12 },
    linkBtnText: { fontSize: 13, fontWeight: '700', color: C.gold },
    fineprint: { fontSize: 11, color: C.text3, textAlign: 'center', marginTop: 8, lineHeight: 16 },

    primaryBtn: buttonStyles('primary', 'lg').box,
    btnDisabled: { opacity: 0.6 },
    primaryBtnText: buttonStyles('primary', 'lg').text,
  }));
}
