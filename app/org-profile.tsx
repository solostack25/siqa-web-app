import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Image,
  Alert,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/colors';
import { Theme } from '../constants/theme';
import * as ImagePicker from 'expo-image-picker';
// expo-haptics is native-only — no-op on web
const Haptics = Platform.OS !== 'web' ? require('expo-haptics') : { notificationAsync: () => {} };

const BUNNY_STORAGE_ZONE = process.env.EXPO_PUBLIC_BUNNY_STORAGE_ZONE ?? 'siqa-videos';
const BUNNY_STORAGE_KEY  = process.env.EXPO_PUBLIC_BUNNY_STORAGE_KEY ?? '';
const BUNNY_STORAGE_URL  = `https://storage.bunnycdn.com`;
const BUNNY_CDN_URL      = process.env.EXPO_PUBLIC_BUNNY_CDN_URL ?? 'https://siqa-videos.b-cdn.net';

async function uploadImageToBunny(uri: string, path: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const uploadRes = await fetch(`${BUNNY_STORAGE_URL}/${BUNNY_STORAGE_ZONE}/${path}`, {
    method: 'PUT',
    headers: {
      AccessKey: BUNNY_STORAGE_KEY,
      'Content-Type': 'image/jpeg',
    },
    body: blob,
  });
  if (!uploadRes.ok) throw new Error(`Bunny upload failed: ${uploadRes.status}`);
  return `${BUNNY_CDN_URL}/${path}`;
}

const SUPABASE_URL = 'https://eixlmylbqqrfazjlgxcz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hGOrpdHS1fwFYwXGI8tN2g_Yeuzchmj';

type PaymentMethodType = 'stripe' | 'zeffy' | 'paypal' | 'other' | null;

type Org = {
  id: string;
  org_name: string;
  org_type: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  website: string | null;
  ein: string | null;
  mission: string | null;
  tagline: string | null;
  propublica_url: string | null;
  is_verified: boolean;
  ein_verified: boolean;
  trust_score: number | null;
  approval_status: string;
  stripe_onboarded: boolean;
  stripe_account_id: string | null;
  logo_url: string | null;
  banner_url: string | null;
  profile_id: string | null;
  payment_method_type: PaymentMethodType;
  payment_method_url: string | null;
  payment_method_label: string | null;
};

type Doc990 = {
  id: string;
  tax_year: number;
  file_url: string;
  file_name: string | null;
  file_size_kb: number | null;
  status: string;
  created_at: string;
};

type Fundraiser = {
  id: string;
  title: string;
  cause_category: string | null;
  goal_amount: number;
  raised_amount: number;
  donor_count: number;
  status: string;
  org_id: string | null;
};

function orgEmoji(type: string | null) {
  const map: Record<string, string> = {
    masjid: '🕌', nonprofit: '🤝', charity: '❤️', school: '🎓', relief: '🌍', community: '👥',
  };
  return map[type?.toLowerCase() ?? ''] ?? '🏢';
}

function fmtMoney(cents: number) {
  if (!cents) return '$0';
  const d = cents / 100;
  if (d >= 1000000) return '$' + (d / 1000000).toFixed(1) + 'M';
  if (d >= 1000) return '$' + (d / 1000).toFixed(0) + 'k';
  return '$' + d.toFixed(0);
}

function trustColor(score: number | null) {
  if (!score) return Colors.text3;
  if (score >= 90) return Colors.emeraldLight;
  if (score >= 75) return Colors.gold;
  return Colors.text3;
}

export default function OrgProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [org, setOrg] = useState<Org | null>(null);
  const [docs, setDocs] = useState<Doc990[]>([]);
  const [fundraisers, setFundraisers] = useState<Fundraiser[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  // Payment setup
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [altPayModalVisible, setAltPayModalVisible] = useState(false);
  const [altPayType, setAltPayType] = useState<'zeffy' | 'paypal' | 'other'>('zeffy');
  const [altPayUrl, setAltPayUrl] = useState('');
  const [altPayLabel, setAltPayLabel] = useState('');
  const [savingAltPay, setSavingAltPay] = useState(false);

  useEffect(() => {
    if (id) loadOrg(id);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      if (id) loadOrg(id);
    }, [id])
  );

  async function loadOrg(orgId: string) {
    setLoading(true);
    const [orgRes, docsRes, frRes, sessionRes] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', orgId).single(),
      supabase.from('org_990s').select('*').eq('org_id', orgId).order('tax_year', { ascending: false }),
      supabase.from('fundraisers').select('id,org_id,title,cause_category,goal_amount,raised_amount,donor_count,status').eq('org_id', orgId).in('status', ['active', 'published', 'approved', 'live']).order('created_at', { ascending: false }).limit(10),
      supabase.auth.getSession(),
    ]);
    if (orgRes.data) {
      setOrg(orgRes.data);
      const uid = sessionRes.data?.session?.user?.id;
      setIsOwner(!!uid && orgRes.data.profile_id === uid);
    }
    if (docsRes.data) setDocs(docsRes.data);
    if (frRes.data) setFundraisers(frRes.data);
    setLoading(false);
  }

  async function pickLogo() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow Siqa to access your photos.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploadingLogo(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      const path = `org-logos/${org!.id}_${Date.now()}.${ext}`;
      const url = await uploadImageToBunny(asset.uri, path);
      await supabase.from('organizations').update({ logo_url: url }).eq('id', org!.id);
      setOrg(prev => prev ? { ...prev, logo_url: url } : prev);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploadingLogo(false);
    }
  }

  async function pickBanner() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow Siqa to access your photos.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [3, 1], quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploadingBanner(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      const path = `org-banners/${org!.id}_${Date.now()}.${ext}`;
      const url = await uploadImageToBunny(asset.uri, path);
      await supabase.from('organizations').update({ banner_url: url }).eq('id', org!.id);
      setOrg(prev => prev ? { ...prev, banner_url: url } : prev);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploadingBanner(false);
    }
  }

  async function connectStripe() {
    if (!org) return;
    setConnectingStripe(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-connect-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          orgId: org.id,
          orgName: org.org_name,
          email: session?.user?.email ?? '',
          returnUrl: 'https://siqa.us/connect/return',
        }),
      });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      await Linking.openURL(url);
    } catch (e: any) {
      Alert.alert('Connection failed', e.message);
    } finally {
      setConnectingStripe(false);
    }
  }

  async function saveAltPayment() {
    if (!org || !altPayUrl.trim()) {
      Alert.alert('URL required', 'Please enter your donation page URL.');
      return;
    }
    setSavingAltPay(true);
    try {
      const { error } = await supabase.from('organizations').update({
        payment_method_type: altPayType,
        payment_method_url: altPayUrl.trim(),
        payment_method_label: altPayLabel.trim() || null,
      }).eq('id', org.id);
      if (error) throw error;
      setOrg(prev => prev ? {
        ...prev,
        payment_method_type: altPayType,
        payment_method_url: altPayUrl.trim(),
        payment_method_label: altPayLabel.trim() || null,
      } : prev);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAltPayModalVisible(false);
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
    } finally {
      setSavingAltPay(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.gold} size="large" />
      </View>
    );
  }

  if (!org) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Organization not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnCenter}>
          <Text style={styles.backBtnText}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const initials = org.org_name
    .split(' ')
    .filter(w => w.length > 2)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase() || org.org_name.substring(0, 2).toUpperCase();

  const location = [org.city, org.state].filter(Boolean).join(', ') || 'USA';
  const emoji = orgEmoji(org.org_type);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{org.org_name}</Text>
        <TouchableOpacity
          style={styles.shareBtn}
          onPress={() => {}}
        >
          <Text style={styles.shareBtnText}>⋯</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Cover / Banner */}
        <TouchableOpacity
          style={styles.cover}
          onPress={isOwner ? pickBanner : undefined}
          activeOpacity={isOwner ? 0.85 : 1}
        >
          {org.banner_url ? (
            <Image source={{ uri: org.banner_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={styles.coverPattern} />
          )}
          {isOwner && (
            <View style={styles.bannerEditOverlay}>
              {uploadingBanner
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.editOverlayText}>📷  Edit Banner</Text>
              }
            </View>
          )}
        </TouchableOpacity>

        {/* Profile row */}
        <View style={styles.profileRow}>
          <TouchableOpacity
            onPress={isOwner ? pickLogo : undefined}
            activeOpacity={isOwner ? 0.85 : 1}
            style={styles.orgLogoWrap}
          >
            {org.logo_url ? (
              <Image source={{ uri: org.logo_url }} style={styles.orgLogoImg} resizeMode="cover" />
            ) : (
              <View style={styles.orgLogo}>
                <Text style={styles.orgLogoText}>{initials}</Text>
              </View>
            )}
            {isOwner && (
              <View style={styles.logoEditOverlay}>
                {uploadingLogo
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.logoEditIcon}>📷</Text>
                }
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.profileBtns}>
            <TouchableOpacity
              style={[styles.followBtn, following && styles.followBtnActive]}
              onPress={() => setFollowing(!following)}
            >
              <Text style={[styles.followBtnText, following && styles.followBtnTextActive]}>
                {following ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
            {org.website ? (
              <TouchableOpacity
                style={styles.visitBtn}
                onPress={() => Linking.openURL(org.website!)}
              >
                <Text style={styles.visitBtnText}>Website ↗</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Info */}
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.orgName}>{org.org_name}</Text>
            {org.is_verified && (
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedText}>✓ VERIFIED</Text>
              </View>
            )}
          </View>
          {org.ein && <Text style={styles.ein}>EIN: {org.ein}</Text>}
          {(org.tagline || org.mission) ? (
            <Text style={styles.tagline}>{org.tagline || org.mission}</Text>
          ) : null}
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Text style={styles.metaText}>📍 {location}</Text>
            </View>
            {org.org_type ? (
              <View style={styles.metaItem}>
                <Text style={styles.metaText}>{emoji} {org.org_type}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Trust score strip */}
        <View style={styles.trustStrip}>
          <View style={styles.trustScoreBox}>
            <Text style={[styles.trustScoreNum, { color: trustColor(org.trust_score) }]}>
              {org.trust_score ?? '—'}
            </Text>
            <Text style={styles.trustScoreLabel}>Trust</Text>
          </View>
          <View style={styles.trustChecks}>
            <TrustItem done={org.is_verified} label="Organization verified" />
            <TrustItem done={docs.some(d => d.status === 'verified')} label="990 on file" />
            <TrustItem done={!!org.propublica_url} label="ProPublica linked" />
            <TrustItem done={org.ein_verified} label="EIN verified" />
          </View>
        </View>

        {/* Payment Setup — owner only */}
        {isOwner && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Setup</Text>
            <View style={styles.payCard}>
              {/* Stripe Connect */}
              <View style={styles.payRow}>
                <View style={styles.payIconBox}>
                  <Text style={styles.payIcon}>💳</Text>
                </View>
                <View style={styles.payInfo}>
                  <Text style={styles.payTitle}>Stripe Connect</Text>
                  <Text style={styles.paySub}>
                    {org.stripe_onboarded
                      ? 'Connected — donations go directly to your account'
                      : org.stripe_account_id
                      ? 'Account created — finish onboarding to receive donations'
                      : 'Connect your Stripe account to receive donations. Log in to an existing account or create a new one.'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.payBtn, org.stripe_onboarded && styles.payBtnDone]}
                  onPress={connectStripe}
                  disabled={connectingStripe || org.stripe_onboarded}
                >
                  {connectingStripe
                    ? <ActivityIndicator color="#000" size="small" />
                    : <Text style={styles.payBtnText}>
                        {org.stripe_onboarded ? '✓ Done' : org.stripe_account_id ? 'Resume' : 'Connect'}
                      </Text>
                  }
                </TouchableOpacity>
              </View>

              <View style={styles.paySeparator} />

              {/* Alt payment */}
              <View style={styles.payRow}>
                <View style={styles.payIconBox}>
                  <Text style={styles.payIcon}>🔗</Text>
                </View>
                <View style={styles.payInfo}>
                  <Text style={styles.payTitle}>Can't use Stripe?</Text>
                  <Text style={styles.paySub}>
                    {org.payment_method_type && org.payment_method_url
                      ? `${org.payment_method_type.charAt(0).toUpperCase() + org.payment_method_type.slice(1)} linked — donors will be sent to your page`
                      : 'Use Zeffy, PayPal, or another platform. Donors will be redirected to your page.'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.payBtn, styles.payBtnGhost]}
                  onPress={() => {
                    setAltPayType((org.payment_method_type as any) || 'zeffy');
                    setAltPayUrl(org.payment_method_url ?? '');
                    setAltPayLabel(org.payment_method_label ?? '');
                    setAltPayModalVisible(true);
                  }}
                >
                  <Text style={styles.payBtnGhostText}>
                    {org.payment_method_url ? 'Edit' : 'Set up'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Mission */}
        {org.mission && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Mission</Text>
            <Text style={styles.missionText}>{org.mission}</Text>
          </View>
        )}

        {/* 990 Transparency */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Financial Transparency</Text>
          <View style={styles.transparencyCard}>
            <View style={styles.transparencyHeader}>
              <View style={styles.transparencyIconBox}>
                <Text style={styles.transparencyIcon}>🛡</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.transparencyTitle}>Form 990 Documents</Text>
                <Text style={styles.transparencySub}>
                  {docs.length > 0 ? `${docs.length} document${docs.length !== 1 ? 's' : ''} on file` : 'No documents yet'}
                </Text>
              </View>
            </View>

            {docs.length > 0 ? (
              docs.map(doc => (
                <TouchableOpacity
                  key={doc.id}
                  style={styles.docRow}
                  onPress={() => Linking.openURL(doc.file_url)}
                >
                  <View style={styles.docIconBox}>
                    <Text style={styles.docIcon}>📄</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docName}>Form 990 — Tax Year {doc.tax_year}</Text>
                    <Text style={styles.docMeta}>
                      {doc.file_size_kb ? (doc.file_size_kb / 1024).toFixed(1) + ' MB · ' : ''}
                      {doc.status === 'verified' ? '✓ Verified' : doc.status}
                    </Text>
                  </View>
                  <Text style={styles.docArrow}>↗</Text>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.noDocsText}>No 990 documents uploaded yet.</Text>
            )}

            {org.propublica_url ? (
              <TouchableOpacity
                style={styles.propublicaBtn}
                onPress={() => Linking.openURL(org.propublica_url!)}
              >
                <Text style={styles.propublicaBtnText}>🔗 View on ProPublica Nonprofit Explorer ↗</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Active Fundraisers */}
        {fundraisers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Active Campaigns</Text>
            {fundraisers.map(fr => {
              const pct = fr.goal_amount ? Math.min(100, Math.round((fr.raised_amount / fr.goal_amount) * 100)) : 0;
              return (
                <View key={fr.id} style={styles.fundraiserCard}>
                  <Text style={styles.frCategory}>{fr.cause_category || 'Fundraiser'}</Text>
                  <Text style={styles.frTitle}>{fr.title}</Text>
                  <View style={styles.frProgressTrack}>
                    <View style={[styles.frProgressFill, { width: `${pct}%` as any }]} />
                  </View>
                  <View style={styles.frStats}>
                    <Text style={styles.frRaised}>{fmtMoney(fr.raised_amount)}</Text>
                    <Text style={styles.frGoal}>of {fmtMoney(fr.goal_amount)} · {pct}%</Text>
                    <Text style={styles.frDonors}>{fr.donor_count} donors</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.donateBtn}
                    onPress={() => router.push({
                      pathname: '/donate',
                      params: {
                        fundraiserId: fr.id,
                        orgId: fr.org_id ?? org.id,
                        title: fr.title,
                        orgStripeAccountId: org.stripe_account_id ?? '',
                        paymentMethodType: org.payment_method_type ?? '',
                        paymentMethodUrl: org.payment_method_url ?? '',
                        paymentMethodLabel: org.payment_method_label ?? '',
                      },
                    } as any)}
                  >
                    <Text style={styles.donateBtnText}>🌱 Plant a Seed</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* EIN + legal */}
        {(org.ein || org.website) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Details</Text>
            <View style={styles.detailsCard}>
              {org.ein && <DetailRow label="EIN / Tax ID" value={org.ein} />}
              {org.org_type && <DetailRow label="Type" value={org.org_type.charAt(0).toUpperCase() + org.org_type.slice(1)} />}
              {location !== 'USA' && <DetailRow label="Location" value={location} />}
              {org.website && (
                <TouchableOpacity onPress={() => Linking.openURL(org.website!)}>
                  <DetailRow label="Website" value={org.website.replace('https://', '').replace('http://', '')} link />
                </TouchableOpacity>
              )}
              <DetailRow label="Status" value={org.is_verified ? 'Verified ✓' : 'Pending Review'} />
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Alt Payment Modal */}
      <Modal
        visible={altPayModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAltPayModalVisible(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setAltPayModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.altPaySheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Alternative Payment Setup</Text>
            <Text style={styles.sheetSub}>
              Donors will see a "Donate Externally" button that opens your page. No money flows through Siqa for these donations.
            </Text>
            <Text style={styles.sheetLabel}>Platform</Text>
            <View style={styles.platformRow}>
              {(['zeffy', 'paypal', 'other'] as const).map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.platformPill, altPayType === p && styles.platformPillActive]}
                  onPress={() => setAltPayType(p)}
                >
                  <Text style={[styles.platformPillText, altPayType === p && styles.platformPillTextActive]}>
                    {p === 'zeffy' ? 'Zeffy' : p === 'paypal' ? 'PayPal' : 'Other'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.sheetLabel}>Donation page URL</Text>
            <TextInput
              style={styles.sheetInput}
              value={altPayUrl}
              onChangeText={setAltPayUrl}
              placeholder="https://www.zeffy.com/..."
              placeholderTextColor={Colors.text3}
              autoCapitalize="none"
              keyboardType="url"
            />
            <Text style={styles.sheetLabel}>Button label (optional)</Text>
            <TextInput
              style={styles.sheetInput}
              value={altPayLabel}
              onChangeText={setAltPayLabel}
              placeholder="e.g. Donate via Zeffy"
              placeholderTextColor={Colors.text3}
            />
            <TouchableOpacity
              style={[styles.sheetSaveBtn, savingAltPay && { opacity: 0.55 }]}
              onPress={saveAltPayment}
              disabled={savingAltPay}
            >
              {savingAltPay
                ? <ActivityIndicator color="#000" size="small" />
                : <Text style={styles.sheetSaveBtnText}>Save Payment Setup</Text>
              }
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function TrustItem({ done, label }: { done: boolean; label: string }) {
  return (
    <View style={styles.trustItem}>
      <Text style={[styles.trustItemDot, done ? styles.trustItemDotDone : styles.trustItemDotPending]}>
        {done ? '✓' : '○'}
      </Text>
      <Text style={[styles.trustItemLabel, done ? styles.trustItemLabelDone : styles.trustItemLabelPending]}>
        {label}
      </Text>
    </View>
  );
}

function DetailRow({ label, value, link }: { label: string; value: string; link?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, link && { color: Colors.gold }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
  emptyText: { color: Colors.text3, fontSize: 14, marginBottom: 16 },
  backBtnCenter: { padding: 12 },
  backBtnText: { color: Colors.gold, fontSize: 14 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 10,
    paddingHorizontal: 16,
    backgroundColor: Colors.bg,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 22, color: Colors.text2 },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.text, marginHorizontal: 8 },
  shareBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  shareBtnText: { fontSize: 20, color: Colors.text2 },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 20 },

  cover: {
    height: 140,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  coverPattern: {
    position: 'absolute',
    inset: 0,
    backgroundColor: '#071410',
    opacity: 0.95,
  },
  bannerEditOverlay: {
    position: 'absolute',
    bottom: 8, right: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editOverlayText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: -34,
    marginBottom: 12,
  },
  orgLogoWrap: { position: 'relative' },
  orgLogo: {
    width: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: Colors.emerald,
    borderWidth: 3,
    borderColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgLogoImg: {
    width: 68,
    height: 68,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: Colors.bg,
  },
  orgLogoText: { fontSize: 20, fontWeight: '700', color: Colors.gold },
  logoEditOverlay: {
    position: 'absolute',
    bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.bg,
  },
  logoEditIcon: { fontSize: 11 },
  profileBtns: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  followBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 100,
    borderWidth: 0.5,
    borderColor: Colors.goldDim ?? '#8a6f2e',
    backgroundColor: 'transparent',
  },
  followBtnActive: { backgroundColor: Colors.goldBg },
  followBtnText: { fontSize: 12, fontWeight: '600', color: Colors.gold },
  followBtnTextActive: { color: Colors.gold },
  visitBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 100,
    backgroundColor: Colors.emeraldBg,
    borderWidth: 0.5,
    borderColor: Colors.emerald,
  },
  visitBtnText: { fontSize: 12, fontWeight: '600', color: Colors.emeraldLight },

  info: { paddingHorizontal: 16, paddingBottom: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 },
  orgName: { fontSize: 18, fontWeight: '700', color: Colors.text },
  verifiedBadge: {
    backgroundColor: Colors.gold,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  verifiedText: { fontSize: 9, fontWeight: '800', color: '#000' },
  ein: { fontSize: 11, color: Colors.text3, marginBottom: 4 },
  tagline: { fontSize: 13, color: Colors.text2, lineHeight: 20, marginBottom: 10 },
  metaRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  metaItem: {},
  metaText: { fontSize: 12, color: Colors.text3 },

  trustStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.xl,
    borderWidth: 0.5,
    borderColor: Colors.border2,
    padding: 14,
  },
  trustScoreBox: { alignItems: 'center', flexShrink: 0 },
  trustScoreNum: { fontSize: 28, fontWeight: '800', lineHeight: 32 },
  trustScoreLabel: { fontSize: 9, color: Colors.text3, textTransform: 'uppercase', letterSpacing: 0.5 },
  trustChecks: { flex: 1, gap: 4 },
  trustItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trustItemDot: { fontSize: 11, fontWeight: '700', width: 14 },
  trustItemDotDone: { color: Colors.emeraldLight },
  trustItemDotPending: { color: Colors.text3 },
  trustItemLabel: { fontSize: 11 },
  trustItemLabelDone: { color: Colors.emeraldLight },
  trustItemLabelPending: { color: Colors.text3 },

  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  missionText: { fontSize: 13, color: Colors.text2, lineHeight: 21 },

  transparencyCard: {
    backgroundColor: 'rgba(27,107,74,0.1)',
    borderWidth: 0.5,
    borderColor: 'rgba(27,107,74,0.3)',
    borderRadius: Theme.radius.xl,
    padding: 14,
  },
  transparencyHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  transparencyIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transparencyIcon: { fontSize: 18 },
  transparencyTitle: { fontSize: 13, fontWeight: '600', color: Colors.text },
  transparencySub: { fontSize: 11, color: Colors.emeraldLight, marginTop: 1 },

  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.md,
    padding: 10,
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: Colors.border2,
  },
  docIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.goldBg,
    borderWidth: 0.5,
    borderColor: Colors.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docIcon: { fontSize: 16 },
  docName: { fontSize: 12, fontWeight: '600', color: Colors.text },
  docMeta: { fontSize: 10, color: Colors.text3, marginTop: 2 },
  docArrow: { fontSize: 14, color: Colors.gold },
  noDocsText: { fontSize: 12, color: Colors.text3, paddingVertical: 6 },
  propublicaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(27,107,74,0.12)',
    borderRadius: Theme.radius.md,
    padding: 10,
    marginTop: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(27,107,74,0.25)',
  },
  propublicaBtnText: { fontSize: 12, fontWeight: '600', color: Colors.emeraldLight },

  fundraiserCard: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.xl,
    borderWidth: 0.5,
    borderColor: Colors.border2,
    padding: 14,
    marginBottom: 10,
  },
  frCategory: { fontSize: 10, color: Colors.gold, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  frTitle: { fontSize: 14, fontWeight: '600', color: Colors.text, lineHeight: 20, marginBottom: 10 },
  frProgressTrack: { height: 5, backgroundColor: Colors.surface2, borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  frProgressFill: { height: '100%', backgroundColor: Colors.emerald, borderRadius: 3 },
  frStats: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  frRaised: { fontSize: 15, fontWeight: '700', color: Colors.gold },
  frGoal: { fontSize: 11, color: Colors.text3, flex: 1 },
  frDonors: { fontSize: 11, color: Colors.text3 },
  donateBtn: {
    backgroundColor: Colors.gold,
    borderRadius: Theme.radius.md,
    padding: 10,
    alignItems: 'center',
  },
  donateBtnText: { fontSize: 13, fontWeight: '700', color: '#000' },

  detailsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.xl,
    borderWidth: 0.5,
    borderColor: Colors.border2,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border2,
  },
  detailLabel: { fontSize: 12, color: Colors.text3 },
  detailValue: { fontSize: 12, fontWeight: '500', color: Colors.text },

  // Payment setup
  payCard: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.xl,
    borderWidth: 0.5,
    borderColor: Colors.border2,
    overflow: 'hidden',
    padding: 14,
  },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  payIconBox: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: Colors.surface2,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  payIcon: { fontSize: 18 },
  payInfo: { flex: 1 },
  payTitle: { color: Colors.text, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  paySub: { color: Colors.text3, fontSize: 11, lineHeight: 15 },
  payBtn: {
    backgroundColor: Colors.gold,
    borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    minWidth: 72, alignItems: 'center',
    flexShrink: 0,
  },
  payBtnDone: { backgroundColor: Colors.emeraldBg, borderWidth: 1, borderColor: Colors.emeraldLight },
  payBtnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.border },
  payBtnText: { color: Colors.black, fontSize: 12, fontWeight: '800' },
  payBtnGhostText: { color: Colors.text2, fontSize: 12, fontWeight: '700' },
  paySeparator: { height: 0.5, backgroundColor: Colors.border2, marginVertical: 14 },

  // Alt pay modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  altPaySheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 44,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border2, alignSelf: 'center', marginBottom: 18 },
  sheetTitle: { color: Colors.text, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  sheetSub: { color: Colors.text3, fontSize: 12, lineHeight: 18, marginBottom: 18 },
  sheetLabel: { color: Colors.text3, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  platformRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  platformPill: {
    flex: 1, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border2,
    alignItems: 'center', backgroundColor: Colors.surface2,
  },
  platformPillActive: { backgroundColor: Colors.goldBg, borderColor: Colors.gold },
  platformPillText: { color: Colors.text2, fontSize: 13, fontWeight: '700' },
  platformPillTextActive: { color: Colors.gold },
  sheetInput: {
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    color: Colors.text, fontSize: 14, marginBottom: 16,
    backgroundColor: Colors.bg,
  },
  sheetSaveBtn: {
    backgroundColor: Colors.gold, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginTop: 4,
  },
  sheetSaveBtnText: { color: Colors.black, fontSize: 15, fontWeight: '900' },
});