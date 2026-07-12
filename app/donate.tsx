import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import { useTheme, type AppColors } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { Theme } from '../constants/theme';

// Stripe's native module doesn't support web — only import on native platforms.
const useStripe =
  Platform.OS === 'web'
    ? () => ({ initPaymentSheet: async () => ({ error: null }), presentPaymentSheet: async () => ({ error: null }) })
    : require('@stripe/stripe-react-native').useStripe;

const AMOUNTS = [1000, 2500, 5000, 10000, 25000, 50000];
const SUPABASE_URL = 'https://eixlmylbqqrfazjlgxcz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hGOrpdHS1fwFYwXGI8tN2g_Yeuzchmj';

export default function DonateScreen() {
  const {
    fundraiserId,
    orgId,
    title,
    orgStripeAccountId,
    paymentMethodType,
    paymentMethodUrl,
    paymentMethodLabel,
  } = useLocalSearchParams<{
    fundraiserId: string;
    orgId: string;
    title: string;
    orgStripeAccountId?: string;
    paymentMethodType?: string;
    paymentMethodUrl?: string;
    paymentMethodLabel?: string;
  }>();

  const isAltPay = !!paymentMethodUrl && paymentMethodType !== 'stripe';
  const isNoPayment = !orgStripeAccountId && !paymentMethodUrl;

  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { colors: C, isDark } = useTheme();
  const styles = makeStyles(C);
  const [selectedAmount, setSelectedAmount] = useState<number>(2500);
  const [loading, setLoading] = useState(false);

  function formatAmount(cents: number) {
    return '$' + (cents / 100).toFixed(0);
  }

  function formatFee(cents: number) {
    const fee = Math.max(Math.round(cents * 0.01), 50);
    return '$' + (fee / 100).toFixed(2);
  }

  function formatOrgReceives(cents: number) {
    const fee = Math.max(Math.round(cents * 0.01), 50);
    const stripeFee = Math.round(cents * 0.029) + 30;
    return '$' + ((cents - fee - stripeFee) / 100).toFixed(2);
  }

  async function handleDonate() {
    if (Platform.OS === 'web') {
      Alert.alert('Not available on web', 'Donations require the Siqa mobile app. Please use your phone to complete this donation.');
      return;
    }

    setLoading(true);
    try {
      // 1. Get current user
      const { data: { session } } = await supabase.auth.getSession();

      // 2. Create payment intent via Edge Function
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/create-payment-intent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            amount: selectedAmount,
            fundraiserId,
            orgStripeAccountId: orgStripeAccountId || null,
            donorName: session?.user?.email ?? 'Anonymous',
            campaignTitle: title,
          }),
        }
      );

      const { clientSecret, paymentIntentId, error: fnError } = await res.json();
console.log('Edge function response:', { clientSecret, paymentIntentId, fnError });
if (fnError) throw new Error(fnError);

      // 3. Init payment sheet
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'Siqa',
        paymentIntentClientSecret: clientSecret,
        applePay: {
          merchantCountryCode: 'US',
        },
        googlePay: {
          merchantCountryCode: 'US',
          testEnv: false,
        },
        style: isDark ? 'alwaysDark' : 'alwaysLight',
        appearance: {
          colors: getPaymentSheetColors(isDark),
        },
      });

      if (initError) throw new Error(initError.message);

      // 4. Present payment sheet
      const { error: payError } = await presentPaymentSheet();
      if (payError) {
        if (payError.code !== 'Canceled') {
          Alert.alert('Payment failed', payError.message);
        }
        setLoading(false);
        return;
      }

      // 5. Save donation to Supabase
      await supabase.from('donations').insert({
        fundraiser_id: fundraiserId,
        org_id: orgId,
        donor_profile_id: session?.user?.id ?? null,
        donor_name: session?.user?.email ?? 'Anonymous',
        donor_email: session?.user?.email ?? null,
        amount: selectedAmount,
        platform_fee: Math.max(Math.round(selectedAmount * 0.01), 50),
        stripe_payment_intent_id: paymentIntentId,
        campaign_title: title,
        status: 'completed',
        currency: 'USD',
      });

      // 6. Success
      router.replace({
        pathname: '/donate-success',
        params: {
          amount: formatAmount(selectedAmount),
          title,
        },
      });

    } catch (err: any) {
      Alert.alert('Error', err.message);
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Donate</Text>
        </View>

        {/* Campaign */}
        <View style={styles.campaignCard}>
          <Text style={styles.campaignLabel}>GIVING TO</Text>
          <Text style={styles.campaignTitle}>{title}</Text>
        </View>

        {/* Amount picker */}
        <Text style={styles.sectionLabel}>SELECT AMOUNT</Text>
        <View style={styles.amountGrid}>
          {AMOUNTS.map(amt => (
            <TouchableOpacity
              key={amt}
              style={[styles.amountBtn, selectedAmount === amt && styles.amountBtnActive]}
              onPress={() => setSelectedAmount(amt)}
            >
              <Text style={[styles.amountText, selectedAmount === amt && styles.amountTextActive]}>
                {formatAmount(amt)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Fee breakdown — only show for Stripe */}
        {!isAltPay && (
          <View style={styles.breakdown}>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Your donation</Text>
              <Text style={styles.breakdownVal}>{formatAmount(selectedAmount)}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Siqa platform fee (1%)</Text>
              <Text style={styles.breakdownVal}>−{formatFee(selectedAmount)}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Stripe processing (~3%)</Text>
              <Text style={styles.breakdownVal}>−${((Math.round(selectedAmount * 0.029) + 30) / 100).toFixed(2)}</Text>
            </View>
            <View style={[styles.breakdownRow, styles.breakdownTotal]}>
              <Text style={styles.breakdownTotalLabel}>Organization receives</Text>
              <Text style={styles.breakdownTotalVal}>{formatOrgReceives(selectedAmount)}</Text>
            </View>
          </View>
        )}

        {/* Alt pay notice */}
        {isAltPay && (
          <View style={styles.altPayNotice}>
            <Text style={styles.altPayNoticeTitle}>
              {paymentMethodType === 'zeffy' ? '💚 Free for nonprofits via Zeffy' :
               paymentMethodType === 'paypal' ? '💙 Donate via PayPal' :
               '🔗 External donation page'}
            </Text>
            <Text style={styles.altPayNoticeSub}>
              You'll be taken to the organization's donation page. Siqa does not process this payment.
            </Text>
          </View>
        )}

        {/* No payment setup notice */}
        {isNoPayment && (
          <View style={styles.noPayNotice}>
            <Text style={styles.noPayNoticeText}>
              ⚠️ This organization hasn't set up payments yet. Contact them directly to donate.
            </Text>
          </View>
        )}

        {/* Apple Pay notice — Stripe only */}
        {!isAltPay && !isNoPayment && (
          <View style={styles.payNotice}>
            <Text style={styles.payNoticeText}>🍎 Apple Pay available at checkout</Text>
          </View>
        )}

        {/* Web notice */}
        {Platform.OS === 'web' && !isAltPay && !isNoPayment && (
          <View style={styles.altPayNotice}>
            <Text style={styles.altPayNoticeTitle}>📱 Mobile app required</Text>
            <Text style={styles.altPayNoticeSub}>
              Donations are completed in the Siqa mobile app. Open this on your phone to donate.
            </Text>
          </View>
        )}

      </ScrollView>

      {/* Footer button */}
      <View style={styles.footer}>
        {isNoPayment ? (
          <TouchableOpacity style={[styles.donateBtn, styles.donateBtnDisabled]} disabled>
            <Text style={styles.donateBtnText}>Payment not configured</Text>
          </TouchableOpacity>
        ) : isAltPay ? (
          <TouchableOpacity
            style={styles.donateBtn}
            onPress={() => Linking.openURL(paymentMethodUrl!)}
          >
            <Text style={styles.donateBtnText}>
              {paymentMethodLabel || `Donate via ${paymentMethodType?.charAt(0).toUpperCase()}${paymentMethodType?.slice(1)}`} ↗
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.donateBtn, loading && styles.donateBtnDisabled]}
            onPress={handleDonate}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={C.black} />
            ) : (
              <Text style={styles.donateBtnText}>Donate {formatAmount(selectedAmount)} →</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function getPaymentSheetColors(isDark: boolean) {
  // Stripe PaymentSheet only accepts hex strings here, not rgba().
  return isDark ? {
    primary: '#D4AC73',
    background: '#0E0C09',
    componentBackground: '#1A1612',
    componentBorder: '#2F281F',
    componentDivider: '#241F18',
    primaryText: '#F2EFE8',
    secondaryText: '#A8A091',
    componentText: '#F2EFE8',
    placeholderText: '#6B6358',
    icon: '#A8A091',
  } : {
    primary: '#B8860B',
    background: '#F5F3EE',
    componentBackground: '#FFFFFF',
    componentBorder: '#D8CBB9',
    componentDivider: '#E5DED2',
    primaryText: '#1A1712',
    secondaryText: '#5C5240',
    componentText: '#1A1712',
    placeholderText: '#9C8E78',
    icon: '#5C5240',
  };
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scroll: {
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.lg,
    paddingTop: 60,
    paddingBottom: Theme.spacing.lg,
    gap: Theme.spacing.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    color: C.text,
    fontSize: 18,
  },
  headerTitle: {
    fontSize: Theme.fontSize.xl,
    fontWeight: Theme.fontWeight.bold,
    color: C.text,
  },
  campaignCard: {
    marginHorizontal: Theme.spacing.lg,
    backgroundColor: C.surface,
    borderRadius: Theme.radius.lg,
    padding: Theme.spacing.lg,
    borderWidth: 0.5,
    borderColor: C.border,
    marginBottom: Theme.spacing.xl,
  },
  campaignLabel: {
    fontSize: Theme.fontSize.xs,
    color: C.text3,
    letterSpacing: 1,
    marginBottom: 4,
  },
  campaignTitle: {
    fontSize: Theme.fontSize.base,
    fontWeight: Theme.fontWeight.semibold,
    color: C.text,
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: Theme.fontSize.xs,
    color: C.text3,
    letterSpacing: 1,
    marginHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
  },
  amountGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.lg,
    marginBottom: Theme.spacing.xl,
  },
  amountBtn: {
    width: '30.5%',
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.radius.md,
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.border2,
    alignItems: 'center',
  },
  amountBtnActive: {
    backgroundColor: C.goldBg,
    borderColor: C.gold,
  },
  amountText: {
    fontSize: Theme.fontSize.lg,
    fontWeight: Theme.fontWeight.semibold,
    color: C.text2,
  },
  amountTextActive: {
    color: C.gold,
  },
  breakdown: {
    marginHorizontal: Theme.spacing.lg,
    backgroundColor: C.surface,
    borderRadius: Theme.radius.lg,
    padding: Theme.spacing.lg,
    borderWidth: 0.5,
    borderColor: C.border2,
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.lg,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: Theme.fontSize.sm,
    color: C.text3,
  },
  breakdownVal: {
    fontSize: Theme.fontSize.sm,
    color: C.text2,
    fontWeight: Theme.fontWeight.medium,
  },
  breakdownTotal: {
    borderTopWidth: 0.5,
    borderTopColor: C.border2,
    paddingTop: Theme.spacing.sm,
    marginTop: Theme.spacing.sm,
  },
  breakdownTotalLabel: {
    fontSize: Theme.fontSize.base,
    color: C.text,
    fontWeight: Theme.fontWeight.semibold,
  },
  breakdownTotalVal: {
    fontSize: Theme.fontSize.base,
    color: C.gold,
    fontWeight: Theme.fontWeight.bold,
  },
  payNotice: {
    marginHorizontal: Theme.spacing.lg,
    padding: Theme.spacing.md,
    backgroundColor: C.surface,
    borderRadius: Theme.radius.md,
    borderWidth: 0.5,
    borderColor: C.border2,
    alignItems: 'center',
  },
  payNoticeText: {
    fontSize: Theme.fontSize.sm,
    color: C.text2,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Theme.spacing.lg,
    paddingBottom: 40,
    backgroundColor: C.bg,
    borderTopWidth: 0.5,
    borderTopColor: C.border2,
  },
  donateBtn: {
    backgroundColor: C.gold,
    borderRadius: Theme.radius.md,
    padding: Theme.spacing.lg,
    alignItems: 'center',
  },
  donateBtnDisabled: {
    opacity: 0.6,
  },
  donateBtnText: {
    color: C.black,
    fontSize: Theme.fontSize.lg,
    fontWeight: Theme.fontWeight.bold,
  },
  altPayNotice: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 14,
    backgroundColor: C.emeraldBg,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: C.emeraldLight,
  },
  altPayNoticeTitle: {
    color: C.emeraldLight,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  altPayNoticeSub: {
    color: C.text3,
    fontSize: 11,
    lineHeight: 16,
  },
  noPayNotice: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 14,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: C.border,
  },
  noPayNoticeText: {
    color: C.text2,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  });
}