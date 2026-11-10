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
  Switch,
} from 'react-native';
import { money, quoteDonation } from '../lib/donationFees';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTheme, type AppColors } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { Theme, HEADER_TOP_PADDING } from '../constants/theme';
import { DesktopShell } from '../components/DesktopShell';
import { Glyph } from '../components/Glyph';
import { Avatar } from '../components/SeedSocial';
import { DONATE_IN_BROWSER, donateUrl } from '../lib/donateLink';
import { brandStyles, font, radius, type, useDS, type DS } from '../lib/ds';
import { Button, IconButton, Switch as DSSwitch } from '../components/ui';
import { goBack } from '../lib/goBack';

// stripe-js touches browser globals (window/document) on use — only load it
// on web, same pattern as the native-only @stripe/stripe-react-native import below.
const WebDonateForm =
  Platform.OS === 'web' ? require('../components/WebDonateForm').default : () => null;

// Stripe's native module doesn't support web — only import on native platforms.
const useStripe =
  Platform.OS === 'web'
    ? () => ({ initPaymentSheet: async () => ({ error: null }), presentPaymentSheet: async () => ({ error: null }) })
    : require('@stripe/stripe-react-native').useStripe;

const AMOUNTS = [1000, 2500, 5000, 10000, 25000, 50000];
const SUPABASE_URL = 'https://eixlmylbqqrfazjlgxcz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hGOrpdHS1fwFYwXGI8tN2g_Yeuzchmj';

export default function DonateScreen() {
  const params = useLocalSearchParams<{
    fundraiserId: string;
    orgId: string;
    title: string;
    orgStripeAccountId?: string;
    paymentMethodType?: string;
    paymentMethodUrl?: string;
    paymentMethodLabel?: string;
    via?: string;
  }>();
  const { fundraiserId, via } = params;

  // A link from Safari (the iOS app sends donors to siqa.us) or a shared URL
  // carries only fundraiserId — look up the title and the organization's
  // payment setup ourselves when they weren't passed in.
  const [loadedSeed, setLoadedSeed] = useState<{
    title: string; orgId: string; orgStripeAccountId: string;
    paymentMethodType: string; paymentMethodUrl: string; paymentMethodLabel: string;
  } | null>(null);
  const needsLookup = !!fundraiserId && !params.title;
  useEffect(() => {
    if (!needsLookup) return;
    (async () => {
      const { data } = await supabase
        .from('fundraisers')
        .select('title, org_id, organizations ( stripe_onboarded, payment_method_type, payment_method_url, payment_method_label )')
        .eq('id', fundraiserId)
        .maybeSingle();
      if (!data) return;
      const org: any = Array.isArray((data as any).organizations) ? (data as any).organizations[0] : (data as any).organizations;
      setLoadedSeed({
        title: (data as any).title ?? '',
        orgId: (data as any).org_id ?? '',
        orgStripeAccountId: org?.stripe_onboarded ? ((data as any).org_id ?? '') : '',
        paymentMethodType: org?.payment_method_type ?? '',
        paymentMethodUrl: org?.payment_method_url ?? '',
        paymentMethodLabel: org?.payment_method_label ?? '',
      });
    })();
  }, [needsLookup, fundraiserId]);
  // Donations only go to orgs whose 501(c)(3) status Siqa has confirmed
  // (the server enforces this too). null = still checking.
  const [taxOk, setTaxOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (!fundraiserId) return;
    (async () => {
      const { data } = await supabase
        .from('fundraisers')
        .select('organizations ( tax_exempt_status )')
        .eq('id', fundraiserId)
        .maybeSingle();
      const org: any = Array.isArray((data as any)?.organizations) ? (data as any).organizations[0] : (data as any)?.organizations;
      setTaxOk(org?.tax_exempt_status === 'verified');
    })();
  }, [fundraiserId]);
  const src = loadedSeed ?? params;
  const title = src.title ?? '';
  const orgStripeAccountId = src.orgStripeAccountId;
  const paymentMethodType = src.paymentMethodType;
  const paymentMethodUrl = src.paymentMethodUrl;
  const paymentMethodLabel = src.paymentMethodLabel;

  // iOS: donations can't be taken inside the app (App Store 3.2.2(iv)).
  // If anything routes here on iPhone, hand off to Safari and go back.
  useEffect(() => {
    if (!DONATE_IN_BROWSER || !fundraiserId) return;
    Linking.openURL(donateUrl(fundraiserId, via)).finally(() => {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    });
  }, [fundraiserId, via]);

  // A verified speaker's endorsement, shown above the amount picker when the
  // organizer left "show endorsements on the donate screen" on.
  const [quote_, setQuote] = useState<{ message: string; name: string; avatar: string | null } | null>(null);
  useEffect(() => {
    if (!fundraiserId) return;
    (async () => {
      const { data: seed } = await supabase.from('fundraisers').select('show_endorsements_on_donate').eq('id', fundraiserId).maybeSingle();
      if (seed && seed.show_endorsements_on_donate === false) return;
      const { data } = await supabase
        .from('seed_endorsements')
        .select('speaker_id, message, speakers(display_name, avatar_url)')
        .eq('fundraiser_id', fundraiserId)
        .eq('status', 'endorsed')
        .not('message', 'is', null)
        .order('responded_at', { ascending: false })
        .limit(10);
      const rows = (data || []) as any[];
      const pick = rows.find(r => via && r.speaker_id === via) || rows[0];
      if (pick?.message) setQuote({ message: pick.message, name: pick.speakers?.display_name || 'A Siqa speaker', avatar: pick.speakers?.avatar_url ?? null });
    })();
  }, [fundraiserId, via]);

  function successParams(paymentIntentId: string | null) {
    return {
      amount: money(quote.charge),
      title,
      fundraiserId: fundraiserId ?? '',
      paymentIntentId: paymentIntentId ?? '',
      via: via ?? '',
    };
  }

  const isAltPay = taxOk !== false && !!paymentMethodUrl && paymentMethodType !== 'stripe';
  const lookingUp = needsLookup && !loadedSeed;
  const notTaxExempt = taxOk === false;
  const isNoPayment = notTaxExempt || (!lookingUp && !orgStripeAccountId && !paymentMethodUrl);

  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { colors: C, isDark } = useTheme();
  const ds = useDS();
  const styles = makeStyles(C, ds);
  const [selectedAmount, setSelectedAmount] = useState<number>(2500);
  // Donor chooses to add the fees on top so the organization gets the full gift.
  const [coverFees, setCoverFees] = useState(false);
  const quote = quoteDonation(selectedAmount, coverFees);
  const [loading, setLoading] = useState(false);
  const [webClientSecret, setWebClientSecret] = useState<string | null>(null);
  const [webPaymentIntentId, setWebPaymentIntentId] = useState<string | null>(null);

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

  async function createWebPaymentIntent() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session?.access_token ?? SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          amount: selectedAmount,
          fundraiserId,
          orgStripeAccountId: orgStripeAccountId || null,
          donorName: (session?.user?.user_metadata?.full_name as string | undefined) || 'Anonymous',
          campaignTitle: title,
          coverFees,
        }),
      });

      const { clientSecret, paymentIntentId, error: fnError } = await res.json();
      if (fnError) throw new Error(fnError);

      setWebClientSecret(clientSecret);
      setWebPaymentIntentId(paymentIntentId);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleWebDonateSuccess(confirmedPaymentIntentId: string) {
    // Runs after Stripe.js confirmed the payment. The donation itself is
    // recorded by the stripe-webhook function once Stripe confirms it
    // server-side (clients can no longer write donation rows).

    setWebClientSecret(null);
    router.replace({
      pathname: '/donate-success',
      params: successParams(confirmedPaymentIntentId || webPaymentIntentId),
    });
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
            apikey: SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session?.access_token ?? SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            amount: selectedAmount,
            fundraiserId,
            orgStripeAccountId: orgStripeAccountId || null,
            donorName: (session?.user?.user_metadata?.full_name as string | undefined) || 'Anonymous',
            campaignTitle: title,
            coverFees,
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

      // The donation is recorded by the stripe-webhook function once Stripe
      // confirms the payment (clients can no longer write donation rows).

      // 6. Success
      router.replace({
        pathname: '/donate-success',
        params: successParams(paymentIntentId),
      });

    } catch (err: any) {
      Alert.alert('Error', err.message);
      setLoading(false);
    }
  }

  return (
    <DesktopShell>
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <IconButton icon="arrow-back" label="Back" onPress={() => goBack('/home')} />
          <Text style={styles.headerTitle}>Donate</Text>
        </View>

        {/* Campaign */}
        <View style={styles.campaignCard}>
          <Text style={styles.campaignLabel}>Giving to</Text>
          <Text style={styles.campaignTitle}>{title}</Text>
        </View>

        {quote_ && (
          <View style={styles.endorseQuote}>
            <Avatar name={quote_.name} url={quote_.avatar} size={36} />
            <Text style={styles.endorseQuoteText}>
              “{quote_.message}” <Text style={styles.endorseQuoteName}>— {quote_.name}</Text>
            </Text>
          </View>
        )}

        {/* Amount picker */}
        <Text style={styles.sectionLabel}>Choose an amount</Text>
        <View style={styles.amountGrid}>
          {AMOUNTS.map(amt => (
            <TouchableOpacity
              key={amt}
              style={[styles.amountBtn, selectedAmount === amt && styles.amountBtnActive]}
              onPress={() => setSelectedAmount(amt)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selectedAmount === amt }}
            >
              <Text style={[styles.amountText, selectedAmount === amt && styles.amountTextActive]}>
                {formatAmount(amt)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Cover the fees */}
        {!isAltPay && !isNoPayment && (
          <View style={styles.coverRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.coverTitle}>Cover the fees</Text>
              <Text style={styles.coverSub}>
                Add {money(quoteDonation(selectedAmount, true).charge - selectedAmount)} so the organization gets the full {formatAmount(selectedAmount)}.
              </Text>
            </View>
            <DSSwitch
              label="Cover the fees"
              value={coverFees}
              onValueChange={setCoverFees}
              // A web card form already made for one amount can't change.
              disabled={loading || Boolean(webClientSecret)}
            />
          </View>
        )}

        {/* Fee breakdown — only show for Stripe */}
        {!isAltPay && (
          <View style={styles.breakdown}>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Your gift</Text>
              <Text style={styles.breakdownVal}>{formatAmount(selectedAmount)}</Text>
            </View>
            {/* Fees are listed as plain amounts under a heading (not as
                negative numbers). Either they come out of the gift, or the
                donor adds them on top. */}
            <Text style={styles.breakdownSub}>
              {coverFees ? 'Fees you\'re covering' : 'Fees taken from your gift'}
            </Text>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Siqa platform fee (1%)</Text>
              <Text style={styles.breakdownVal}>{money(quote.platformFee)}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Card processing (2.9% + 30¢)</Text>
              <Text style={styles.breakdownVal}>{money(quote.cardFee)}</Text>
            </View>
            {coverFees && (
              <View style={[styles.breakdownRow, { marginTop: 6 }]}>
                <Text style={styles.breakdownLabel}>You're charged</Text>
                <Text style={styles.breakdownVal}>{money(quote.charge)}</Text>
              </View>
            )}
            <View style={[styles.breakdownRow, styles.breakdownTotal]}>
              <Text style={styles.breakdownTotalLabel}>Organization receives</Text>
              <Text style={styles.breakdownTotalVal}>{money(quote.orgReceives)}</Text>
            </View>
          </View>
        )}

        {/* Alt pay notice */}
        {isAltPay && (
          <View style={styles.altPayNotice}>
            <Text style={styles.altPayNoticeTitle}>
              <Glyph
                name={paymentMethodType === 'zeffy' ? 'heart-outline' : paymentMethodType === 'paypal' ? 'logo-paypal' : 'link-outline'}
                style={styles.altPayNoticeTitle}
              />
              {' '}
              {paymentMethodType === 'zeffy' ? 'Free for nonprofits via Zeffy' :
               paymentMethodType === 'paypal' ? 'Donate via PayPal' :
               'External donation page'}
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
              <Glyph name="warning-outline" style={styles.noPayNoticeText} />{' '}{notTaxExempt
                ? "This organization can't take donations on Siqa until its 501(c)(3) status is confirmed. Contact them directly to give."
                : "This organization hasn't set up payments yet. Contact them directly to donate."}
            </Text>
          </View>
        )}

        {/* Apple Pay notice — Stripe only */}
        {!isAltPay && !isNoPayment && (
          <View style={styles.payNotice}>
            <Text style={styles.payNoticeText}><Glyph name="logo-apple" style={styles.payNoticeText} />{' '}Apple Pay available at checkout</Text>
          </View>
        )}

        {/* Web card form — shown once a PaymentIntent has been created */}
        {Platform.OS === 'web' && !isAltPay && !isNoPayment && webClientSecret && (
          <WebDonateForm
            clientSecret={webClientSecret}
            colors={C}
            isDark={isDark}
            onSuccess={handleWebDonateSuccess}
            onCancel={() => setWebClientSecret(null)}
          />
        )}

      </ScrollView>

      {/* Footer button */}
      <View style={styles.footer}>
        <View style={styles.footerInner}>
        {isNoPayment ? (
          <Button label="Payment not set up" disabled />
        ) : isAltPay ? (
          <Button
            variant="gold"
            iconRight="open-outline"
            label={paymentMethodLabel || `Donate via ${paymentMethodType?.charAt(0).toUpperCase()}${paymentMethodType?.slice(1)}`}
            onPress={() => Linking.openURL(paymentMethodUrl!)}
          />
        ) : Platform.OS === 'web' && webClientSecret ? null : (
          <Button
            variant="gold"
            iconRight="arrow-forward"
            label={`Donate ${coverFees ? money(quote.charge) : formatAmount(selectedAmount)}`}
            onPress={Platform.OS === 'web' ? createWebPaymentIntent : handleDonate}
            loading={loading}
          />
        )}
        </View>
      </View>
    </View>
    </DesktopShell>
  );
}

function getPaymentSheetColors(isDark: boolean) {
  // Stripe PaymentSheet only accepts hex strings here, not rgba().
  // Brand kit colors (Night is navy, not brown).
  return isDark ? {
    primary: '#D4AC73',
    background: '#0A0F1C',
    componentBackground: '#141C30',
    componentBorder: '#222B40',
    componentDivider: '#222B40',
    primaryText: '#EDF1F7',
    secondaryText: '#9FACC4',
    componentText: '#EDF1F7',
    placeholderText: '#7E89A3',
    icon: '#9FACC4',
  } : {
    primary: '#A8843F',
    background: '#FFFFFF',
    componentBackground: '#FFFFFF',
    componentBorder: '#E4E4E1',
    componentDivider: '#ECECE9',
    primaryText: '#111111',
    secondaryText: '#5E5E5E',
    componentText: '#111111',
    placeholderText: '#767676',
    icon: '#5E5E5E',
  };
}

function makeStyles(C: AppColors, ds: DS) {
  const c = ds.c;
  const card = { backgroundColor: c.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: c.line, ...ds.shadow('card') };
  return StyleSheet.create(brandStyles({
  container: { flex: 1, backgroundColor: c.bg },
  // Capped so the form reads as a column on desktop instead of stretching
  // edge to edge; phones are narrower than the cap so nothing changes there.
  scroll: { paddingBottom: 130, maxWidth: 640, width: '100%', alignSelf: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingTop: HEADER_TOP_PADDING - 8, paddingBottom: 8,
  },
  headerTitle: { ...type.title1, color: c.ink },
  campaignCard: { ...card, marginHorizontal: 20, padding: 16, marginBottom: 20, gap: 4 },
  campaignLabel: { ...type.micro, color: c.ink2 },
  campaignTitle: { ...type.headline, color: c.ink },
  endorseQuote: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    marginHorizontal: 20, marginTop: -8, marginBottom: 20, padding: 14,
    borderRadius: radius.lg, backgroundColor: c.goldTint,
  },
  endorseQuoteText: { ...type.subhead, ...font(400), flex: 1, color: c.ink },
  endorseQuoteName: { ...font(700), color: c.goldInk },
  sectionLabel: { ...type.caption, ...font(600), color: c.ink2, marginHorizontal: 20, marginBottom: 10 },
  amountGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, marginBottom: 20 },
  amountBtn: {
    flexGrow: 1, flexBasis: '30%', height: 56, borderRadius: radius.lg,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center',
    ...ds.shadow('hairline'),
  },
  amountBtnActive: { backgroundColor: c.primary, borderColor: c.primary, ...ds.shadow('primary') },
  amountText: { ...type.title2, color: c.ink },
  amountTextActive: { color: c.onPrimary },
  coverRow: { ...card, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, marginHorizontal: 20, marginBottom: 12 },
  coverTitle: { ...type.body, ...font(600), color: c.ink },
  coverSub: { ...type.caption, ...font(400), color: c.ink2, marginTop: 2 },
  breakdown: { ...card, marginHorizontal: 20, padding: 16, gap: 8, marginBottom: 16 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  breakdownSub: { ...type.micro, color: c.ink2, marginTop: 4 },
  breakdownLabel: { ...type.subhead, ...font(400), color: c.ink2, flexShrink: 1 },
  breakdownVal: { ...type.subhead, color: c.ink },
  breakdownTotal: { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 10, marginTop: 4 },
  breakdownTotalLabel: { ...type.body, ...font(600), color: c.ink },
  breakdownTotalVal: { ...type.headline, ...font(700, 'display'), color: c.seed },
  payNotice: { marginHorizontal: 20, padding: 12, alignItems: 'center' },
  payNoticeText: { ...type.caption, ...font(400), color: c.ink2 },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    backgroundColor: c.bg, borderTopWidth: 1, borderTopColor: c.line,
  },
  footerInner: { width: '100%', maxWidth: 600, alignSelf: 'center' },
  altPayNotice: { marginHorizontal: 20, marginBottom: 12, padding: 14, backgroundColor: c.seedTint, borderRadius: radius.lg, gap: 4 },
  altPayNoticeTitle: { ...type.subhead, ...font(700), color: c.seed },
  altPayNoticeSub: { ...type.caption, ...font(400), color: c.ink2 },
  noPayNotice: { marginHorizontal: 20, marginBottom: 12, padding: 14, backgroundColor: c.surfaceSoft, borderRadius: radius.lg },
  noPayNoticeText: { ...type.caption, ...font(500), color: c.ink2, textAlign: 'center' },
  }));
}
