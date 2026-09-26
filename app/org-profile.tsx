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
import { useTheme, type AppColors } from '../lib/theme';
import { DesktopShell, useIsDesktopWeb } from '../components/DesktopShell';
import { Theme } from '../constants/theme';
import * as ImagePicker from 'expo-image-picker';
import { uploadFileToBunny } from '../lib/bunnyUpload';
import ImageCropModal from '../components/ImageCropModal';
// expo-haptics is native-only — no-op on web
const Haptics = Platform.OS !== 'web' ? require('expo-haptics') : { notificationAsync: () => {} };

// This file used to have its own copy of the Bunny upload call, hitting
// https://storage.bunnycdn.com with no region prefix — the wrong
// endpoint for a zone that actually lives in the 'ny' region, which is
// why picking a photo here silently failed. lib/bunnyUpload.ts already
// has the correct, working version (used successfully by Gems/Seeds
// uploads), so this just reuses that instead of maintaining a second,
// drifted copy of the same logic.
async function uploadImageToBunny(uri: string, path: string): Promise<string> {
  return uploadFileToBunny({ uri, fileName: path, mimeType: 'image/jpeg' });
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

type Endorsement = {
  id: string;
  message: string | null;
  created_at: string;
  speaker_id: string;
  speakers: { display_name: string; avatar_url: string | null } | null;
};

type Project = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  status: 'ongoing' | 'completed';
};

type Service = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
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
  cover_image_url: string | null;
  image_url: string | null;
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

function trustColor(score: number | null, C: AppColors) {
  if (!score) return C.text3;
  if (score >= 90) return C.emeraldLight;
  if (score >= 75) return C.gold;
  return C.text3;
}

export default function OrgProfileScreen() {
  const { colors: C } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const styles = makeStyles(C);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [org, setOrg] = useState<Org | null>(null);
  const [docs, setDocs] = useState<Doc990[]>([]);
  const [fundraisers, setFundraisers] = useState<Fundraiser[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  // Editing (logo, banner, payment setup) was gated on strict ownership
  // (organizations.profile_id === you) alone. That's correct for the
  // org you registered yourself, but seeded/demo orgs have a placeholder
  // profile_id that will never match any real account — an admin
  // couldn't fix those profiles at all otherwise, which is the actual
  // ask here. Admins get the same edit access as the literal owner.
  const canEditOrg = isOwner || isAdmin;
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [cropImageUri, setCropImageUri] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<'logo' | 'banner' | null>(null);

  // Payment setup
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [altPayModalVisible, setAltPayModalVisible] = useState(false);
  const [altPayType, setAltPayType] = useState<'zeffy' | 'paypal' | 'other'>('zeffy');
  const [altPayUrl, setAltPayUrl] = useState('');
  const [altPayLabel, setAltPayLabel] = useState('');
  const [savingAltPay, setSavingAltPay] = useState(false);

  // Endorsements, Projects, Services — the LinkedIn-style additions:
  // speakers can endorse an org (a short note, like a recommendation),
  // and the org can showcase a portfolio of work and a list of
  // services it offers, distinct from active fundraising campaigns.
  const [endorsements, setEndorsements] = useState<Endorsement[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [mySpeakerId, setMySpeakerId] = useState<string | null>(null);
  const [endorseFormOpen, setEndorseFormOpen] = useState(false);
  const [endorseMessage, setEndorseMessage] = useState('');
  const [submittingEndorsement, setSubmittingEndorsement] = useState(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [projectTitle, setProjectTitle] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectImageUri, setProjectImageUri] = useState<string | null>(null);
  const [projectStatus, setProjectStatus] = useState<'ongoing' | 'completed'>('ongoing');
  const [savingProject, setSavingProject] = useState(false);
  // Everything below the header used to be one long vertical stack —
  // Details, Trust, Payment, Mission, 990s, Campaigns, Endorsements,
  // Projects, Services all competing for the same scroll, which reads
  // as a form rather than a profile no matter how the sections are
  // ordered. Real tabs (matching LinkedIn's Home/About/Posts split)
  // group them into digestible views instead.
  const [activeTab, setActiveTab] = useState<'about' | 'seeds' | 'community'>('about');
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [serviceName, setServiceName] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [serviceIcon, setServiceIcon] = useState('');
  const [savingService, setSavingService] = useState(false);

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
    const [orgRes, docsRes, frRes, sessionRes, endorsementsRes, projectsRes, servicesRes] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', orgId).single(),
      supabase.from('org_990s').select('*').eq('org_id', orgId).order('tax_year', { ascending: false }),
      supabase.from('fundraisers').select('id,org_id,title,cause_category,goal_amount,raised_amount,donor_count,status,cover_image_url,image_url').eq('org_id', orgId).in('status', ['active', 'published', 'approved', 'live']).order('created_at', { ascending: false }).limit(10),
      supabase.auth.getSession(),
      supabase.from('org_endorsements').select('id,message,created_at,speaker_id,speakers(display_name,avatar_url)').eq('org_id', orgId).order('created_at', { ascending: false }),
      supabase.from('org_projects').select('id,title,description,image_url,status').eq('org_id', orgId).order('created_at', { ascending: false }),
      supabase.from('org_services').select('id,name,description,icon').eq('org_id', orgId).order('created_at', { ascending: true }),
    ]);
    if (orgRes.data) {
      setOrg(orgRes.data);
      const uid = sessionRes.data?.session?.user?.id;
      setIsOwner(!!uid && orgRes.data.profile_id === uid);

      if (uid) {
        const { data: profileData } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
        const role = String(profileData?.role || '').toLowerCase();
        setIsAdmin(['admin', 'owner', 'moderator', 'super_admin'].includes(role));

        const { data: speakerData } = await supabase.from('speakers').select('id').eq('profile_id', uid).maybeSingle();
        setMySpeakerId(speakerData?.id ?? null);
      } else {
        setIsAdmin(false);
        setMySpeakerId(null);
      }
    }
    if (docsRes.data) setDocs(docsRes.data);
    if (frRes.data) setFundraisers(frRes.data);
    if (endorsementsRes.data) setEndorsements(endorsementsRes.data as any);
    if (projectsRes.data) setProjects(projectsRes.data as any);
    if (servicesRes.data) setServices(servicesRes.data as any);
    setLoading(false);
  }

  const hasEndorsed = Boolean(mySpeakerId && endorsements.some(e => e.speaker_id === mySpeakerId));

  async function submitEndorsement() {
    if (!mySpeakerId || !org) return;
    setSubmittingEndorsement(true);
    const { error } = await supabase.from('org_endorsements').insert({
      org_id: org.id,
      speaker_id: mySpeakerId,
      message: endorseMessage.trim() || null,
    });
    setSubmittingEndorsement(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setEndorseFormOpen(false);
    setEndorseMessage('');
    loadOrg(org.id);
  }

  async function deleteEndorsement(endorsementId: string) {
    if (!org) return;
    await supabase.from('org_endorsements').delete().eq('id', endorsementId);
    loadOrg(org.id);
  }

  async function pickProjectImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow Siqa to access your photos.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [16, 9], quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    setProjectImageUri(result.assets[0].uri);
  }

  async function submitProject() {
    if (!org || !projectTitle.trim()) return;
    setSavingProject(true);
    try {
      let imageUrl: string | null = null;
      if (projectImageUri) {
        const ext = projectImageUri.split('.').pop()?.split('?')[0] ?? 'jpg';
        imageUrl = await uploadImageToBunny(projectImageUri, `org-projects/${org.id}_${Date.now()}.${ext}`);
      }
      const { error } = await supabase.from('org_projects').insert({
        org_id: org.id,
        title: projectTitle.trim(),
        description: projectDescription.trim() || null,
        image_url: imageUrl,
        status: projectStatus,
      });
      if (error) throw error;
      setAddProjectOpen(false);
      setProjectTitle('');
      setProjectDescription('');
      setProjectImageUri(null);
      setProjectStatus('ongoing');
      loadOrg(org.id);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingProject(false);
    }
  }

  function deleteProject(projectId: string) {
    if (!org) return;
    Alert.alert('Remove project?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await supabase.from('org_projects').delete().eq('id', projectId); loadOrg(org.id); } },
    ]);
  }

  async function submitService() {
    if (!org || !serviceName.trim()) return;
    setSavingService(true);
    const { error } = await supabase.from('org_services').insert({
      org_id: org.id,
      name: serviceName.trim(),
      description: serviceDescription.trim() || null,
      icon: serviceIcon.trim() || null,
    });
    setSavingService(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setAddServiceOpen(false);
    setServiceName('');
    setServiceDescription('');
    setServiceIcon('');
    loadOrg(org.id);
  }

  function deleteService(serviceId: string) {
    if (!org) return;
    Alert.alert('Remove service?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await supabase.from('org_services').delete().eq('id', serviceId); loadOrg(org.id); } },
    ]);
  }

  // allowsEditing/aspect below only do anything on native — that's the
  // OS's own crop UI. On web expo-image-picker silently ignores both,
  // so the picker just hands back the raw file; ImageCropModal (web
  // only) is the actual reposition/zoom step for that platform.
  async function pickLogo() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow Siqa to access your photos.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];

    if (Platform.OS === 'web') {
      setCropTarget('logo');
      setCropImageUri(asset.uri);
      return;
    }
    await uploadLogo(asset.uri);
  }

  async function pickBanner() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow Siqa to access your photos.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [3, 1], quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];

    if (Platform.OS === 'web') {
      setCropTarget('banner');
      setCropImageUri(asset.uri);
      return;
    }
    await uploadBanner(asset.uri);
  }

  async function uploadLogo(uri: string) {
    setUploadingLogo(true);
    try {
      const ext = uri.split('.').pop()?.split('?')[0] ?? 'jpg';
      const path = `org-logos/${org!.id}_${Date.now()}.${ext}`;
      const url = await uploadImageToBunny(uri, path);
      await supabase.from('organizations').update({ logo_url: url }).eq('id', org!.id);
      setOrg(prev => prev ? { ...prev, logo_url: url } : prev);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploadingLogo(false);
    }
  }

  async function uploadBanner(uri: string) {
    setUploadingBanner(true);
    try {
      const ext = uri.split('.').pop()?.split('?')[0] ?? 'jpg';
      const path = `org-banners/${org!.id}_${Date.now()}.${ext}`;
      const url = await uploadImageToBunny(uri, path);
      await supabase.from('organizations').update({ banner_url: url }).eq('id', org!.id);
      setOrg(prev => prev ? { ...prev, banner_url: url } : prev);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploadingBanner(false);
    }
  }

  function handleCropped(blob: Blob) {
    const target = cropTarget;
    const blobUrl = URL.createObjectURL(blob);
    setCropImageUri(null);
    setCropTarget(null);
    if (target === 'logo') uploadLogo(blobUrl);
    else if (target === 'banner') uploadBanner(blobUrl);
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
      <DesktopShell>
        <View style={styles.centered}>
          <ActivityIndicator color={C.gold} size="large" />
        </View>
      </DesktopShell>
    );
  }

  if (!org) {
    return (
      <DesktopShell>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Organization not found.</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtnCenter}>
            <Text style={styles.backBtnText}>← Go Back</Text>
          </TouchableOpacity>
        </View>
      </DesktopShell>
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
  const campaignTotals = fundraisers.reduce(
    (acc, fr) => ({ raised: acc.raised + (fr.raised_amount || 0), donors: acc.donors + (fr.donor_count || 0) }),
    { raised: 0, donors: 0 }
  );

  return (
    <DesktopShell>
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
          onPress={canEditOrg ? pickBanner : undefined}
          activeOpacity={canEditOrg ? 0.85 : 1}
        >
          {org.banner_url ? (
            <Image source={{ uri: org.banner_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={styles.coverPattern} />
          )}
          {canEditOrg && (
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
            onPress={canEditOrg ? pickLogo : undefined}
            activeOpacity={canEditOrg ? 0.85 : 1}
            style={styles.orgLogoWrap}
          >
            {org.logo_url ? (
              <Image source={{ uri: org.logo_url }} style={styles.orgLogoImg} resizeMode="cover" />
            ) : (
              <View style={styles.orgLogo}>
                <Text style={styles.orgLogoText}>{initials}</Text>
              </View>
            )}
            {canEditOrg && (
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

        <View style={styles.orgTabs}>
          {([
            { key: 'about', label: 'About' },
            { key: 'seeds', label: `Seeds${fundraisers.length ? ` (${fundraisers.length})` : ''}` },
            { key: 'community', label: 'Community' },
          ] as const).map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.orgTab, activeTab === t.key && styles.orgTabActive]}
              onPress={() => setActiveTab(t.key)}
            >
              <Text style={[styles.orgTabText, activeTab === t.key && styles.orgTabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'about' && (
        <>
        {/* Details section removed — EIN, type, location, and website
            were already shown compactly in the header under the
            banner, and the Website button is already one of the top
            action buttons. This was a second copy of the same facts. */}
        {/* Trust score strip */}
        <View style={styles.trustStrip}>
          <View style={styles.trustScoreBox}>
            <Text style={[styles.trustScoreNum, { color: trustColor(org.trust_score, C) }]}>
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
        {canEditOrg && (
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
        </>
        )}

        {activeTab === 'seeds' && (
        <>
        {/* Active Fundraisers */}
        {fundraisers.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Active Seeds</Text>
              <View style={styles.campaignStatsRow}>
                <View style={styles.campaignStat}>
                  <Text style={styles.campaignStatVal}>{fmtMoney(campaignTotals.raised)}</Text>
                  <Text style={styles.campaignStatLabel}>RAISED</Text>
                </View>
                <View style={styles.campaignStat}>
                  <Text style={styles.campaignStatVal}>{fundraisers.length}</Text>
                  <Text style={styles.campaignStatLabel}>ACTIVE</Text>
                </View>
                <View style={styles.campaignStat}>
                  <Text style={styles.campaignStatVal}>{campaignTotals.donors.toLocaleString()}</Text>
                  <Text style={styles.campaignStatLabel}>DONORS</Text>
                </View>
              </View>
            </View>
            {fundraisers.map(fr => {
              const pct = fr.goal_amount ? Math.min(100, Math.round((fr.raised_amount / fr.goal_amount) * 100)) : 0;
              const coverUrl = fr.cover_image_url || fr.image_url || null;
              return (
                <View key={fr.id} style={styles.fundraiserCard}>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => router.push({ pathname: '/seed/[id]', params: { id: fr.id } } as any)}
                  >
                    {coverUrl ? (
                      <Image source={{ uri: coverUrl }} style={styles.frCover} resizeMode="cover" />
                    ) : null}
                    <View style={styles.frBody}>
                      <Text style={styles.frCategory}>{fr.cause_category || 'Fundraiser'}</Text>
                      <Text style={styles.frTitle}>{fr.title}</Text>
                    </View>
                  </TouchableOpacity>
                  <View style={[styles.frBody, { paddingTop: 0 }]}>
                    <View style={styles.frProgressTrack}>
                      <View style={[styles.frProgressFill, { width: `${pct}%` as any }]} />
                    </View>
                    <View style={styles.frStats}>
                      <Text style={styles.frRaised}>{fmtMoney(fr.raised_amount)}</Text>
                      <Text style={styles.frGoal}>of {fmtMoney(fr.goal_amount)} · {pct}%</Text>
                      <Text style={styles.frDonors}>{fr.donor_count} donors</Text>
                    </View>
                    {/* Was navigating straight to a bare /donate form —
                        the actual Seeds feed's "Plant a Seed" button
                        goes to the full /seed/[id] detail page (story,
                        donor feed, Zakat badges) first. Matching that
                        so a seed looks and behaves the same everywhere
                        it appears in the app. */}
                    <TouchableOpacity
                      style={styles.donateBtn}
                      onPress={() => router.push({ pathname: '/seed/[id]', params: { id: fr.id } } as any)}
                    >
                      <Text style={styles.donateBtnText}>🌱 Plant a Seed</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.emptySectionText}>No active seeds right now — check back soon.</Text>
        )}
        </>
        )}

        {activeTab === 'community' && (
        <>
        {/* Endorsements — speakers vouching for this org, like a LinkedIn
            recommendation. Anyone with a speaker profile can endorse an
            org they haven't already endorsed; they can also remove
            their own. */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Endorsements {endorsements.length > 0 ? `(${endorsements.length})` : ''}</Text>
            {mySpeakerId && !hasEndorsed && !isOwner && (
              <TouchableOpacity onPress={() => setEndorseFormOpen(v => !v)}>
                <Text style={styles.sectionAction}>{endorseFormOpen ? 'Cancel' : '+ Endorse'}</Text>
              </TouchableOpacity>
            )}
          </View>

          {endorseFormOpen && (
            <View style={styles.endorseForm}>
              <TextInput
                style={styles.endorseInput}
                placeholder="Optional — why do you vouch for this org?"
                placeholderTextColor={C.text3}
                value={endorseMessage}
                onChangeText={setEndorseMessage}
                multiline
              />
              <TouchableOpacity style={styles.smallPrimaryBtn} onPress={submitEndorsement} disabled={submittingEndorsement}>
                {submittingEndorsement ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.smallPrimaryBtnText}>Post Endorsement</Text>}
              </TouchableOpacity>
            </View>
          )}

          {endorsements.length === 0 ? (
            <Text style={styles.emptySectionText}>No endorsements yet.</Text>
          ) : (
            endorsements.map(e => (
              <View key={e.id} style={styles.endorsementCard}>
                <View style={styles.endorsementAvatar}>
                  {e.speakers?.avatar_url ? (
                    <Image source={{ uri: e.speakers.avatar_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : (
                    <Text style={styles.endorsementAvatarText}>{(e.speakers?.display_name || '?').charAt(0).toUpperCase()}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.endorsementName}>{e.speakers?.display_name || 'A Siqa speaker'}</Text>
                  {e.message ? <Text style={styles.endorsementMessage}>{e.message}</Text> : null}
                </View>
                {mySpeakerId === e.speaker_id && (
                  <TouchableOpacity onPress={() => deleteEndorsement(e.id)}>
                    <Text style={styles.endorsementRemove}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </View>

        {/* Projects — a portfolio of work, distinct from active donation
            campaigns; things the org has done or is doing. */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Projects {projects.length > 0 ? `(${projects.length})` : ''}</Text>
            {canEditOrg && (
              <TouchableOpacity onPress={() => setAddProjectOpen(v => !v)}>
                <Text style={styles.sectionAction}>{addProjectOpen ? 'Cancel' : '+ Add Project'}</Text>
              </TouchableOpacity>
            )}
          </View>

          {addProjectOpen && (
            <View style={styles.addForm}>
              <TouchableOpacity style={styles.addFormImage} onPress={pickProjectImage}>
                {projectImageUri ? (
                  <Image source={{ uri: projectImageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <Text style={styles.addFormImageText}>📷 Add a photo</Text>
                )}
              </TouchableOpacity>
              <TextInput style={styles.addFormInput} placeholder="Project title" placeholderTextColor={C.text3} value={projectTitle} onChangeText={setProjectTitle} />
              <TextInput style={[styles.addFormInput, styles.addFormTextarea]} placeholder="What was this project?" placeholderTextColor={C.text3} value={projectDescription} onChangeText={setProjectDescription} multiline />
              <View style={styles.statusToggleRow}>
                {(['ongoing', 'completed'] as const).map(s => (
                  <TouchableOpacity key={s} style={[styles.statusToggle, projectStatus === s && styles.statusToggleActive]} onPress={() => setProjectStatus(s)}>
                    <Text style={[styles.statusToggleText, projectStatus === s && styles.statusToggleTextActive]}>{s === 'ongoing' ? 'Ongoing' : 'Completed'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.smallPrimaryBtn} onPress={submitProject} disabled={savingProject || !projectTitle.trim()}>
                {savingProject ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.smallPrimaryBtnText}>Save Project</Text>}
              </TouchableOpacity>
            </View>
          )}

          {projects.length === 0 ? (
            <Text style={styles.emptySectionText}>No projects listed yet.</Text>
          ) : (
            <View style={styles.projectsGrid}>
              {projects.map(p => (
                <View key={p.id} style={styles.projectCard}>
                  {p.image_url ? <Image source={{ uri: p.image_url }} style={styles.projectImage} resizeMode="cover" /> : <View style={[styles.projectImage, styles.projectImagePlaceholder]} />}
                  <View style={styles.projectBody}>
                    <View style={[styles.statusBadge, p.status === 'completed' && styles.statusBadgeCompleted]}>
                      <Text style={styles.statusBadgeText}>{p.status === 'completed' ? 'Completed' : 'Ongoing'}</Text>
                    </View>
                    <Text style={styles.projectTitle}>{p.title}</Text>
                    {p.description ? <Text style={styles.projectDescription} numberOfLines={3}>{p.description}</Text> : null}
                    {canEditOrg && (
                      <TouchableOpacity onPress={() => deleteProject(p.id)}>
                        <Text style={styles.endorsementRemove}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Services — things the org offers (janazah, nikah, food pantry,
            counseling...), separate from fundraising and projects. */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Services {services.length > 0 ? `(${services.length})` : ''}</Text>
            {canEditOrg && (
              <TouchableOpacity onPress={() => setAddServiceOpen(v => !v)}>
                <Text style={styles.sectionAction}>{addServiceOpen ? 'Cancel' : '+ Add Service'}</Text>
              </TouchableOpacity>
            )}
          </View>

          {addServiceOpen && (
            <View style={styles.addForm}>
              <TextInput style={styles.addFormInput} placeholder="Emoji (optional), e.g. 🕌" placeholderTextColor={C.text3} value={serviceIcon} onChangeText={setServiceIcon} maxLength={4} />
              <TextInput style={styles.addFormInput} placeholder="Service name" placeholderTextColor={C.text3} value={serviceName} onChangeText={setServiceName} />
              <TextInput style={[styles.addFormInput, styles.addFormTextarea]} placeholder="Brief description" placeholderTextColor={C.text3} value={serviceDescription} onChangeText={setServiceDescription} multiline />
              <TouchableOpacity style={styles.smallPrimaryBtn} onPress={submitService} disabled={savingService || !serviceName.trim()}>
                {savingService ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.smallPrimaryBtnText}>Save Service</Text>}
              </TouchableOpacity>
            </View>
          )}

          {services.length === 0 ? (
            <Text style={styles.emptySectionText}>No services listed yet.</Text>
          ) : (
            services.map(s => (
              <View key={s.id} style={styles.serviceRow}>
                <Text style={styles.serviceIcon}>{s.icon || '✦'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.serviceName}>{s.name}</Text>
                  {s.description ? <Text style={styles.serviceDescription}>{s.description}</Text> : null}
                </View>
                {canEditOrg && (
                  <TouchableOpacity onPress={() => deleteService(s.id)}>
                    <Text style={styles.endorsementRemove}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </View>
        </>
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
              placeholderTextColor={C.text3}
              autoCapitalize="none"
              keyboardType="url"
            />
            <Text style={styles.sheetLabel}>Button label (optional)</Text>
            <TextInput
              style={styles.sheetInput}
              value={altPayLabel}
              onChangeText={setAltPayLabel}
              placeholder="e.g. Donate via Zeffy"
              placeholderTextColor={C.text3}
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

      {Platform.OS === 'web' && (
        <ImageCropModal
          visible={!!cropImageUri}
          imageUri={cropImageUri}
          aspectRatio={cropTarget === 'banner' ? 3 : 1}
          outputWidth={cropTarget === 'banner' ? 1200 : 600}
          onCancel={() => { setCropImageUri(null); setCropTarget(null); }}
          onCropped={handleCropped}
        />
      )}
    </View>
    </DesktopShell>
  );
}

function TrustItem({ done, label }: { done: boolean; label: string }) {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
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
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, link && { color: C.gold }]}>{value}</Text>
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  emptyText: { color: C.text3, fontSize: 14, marginBottom: 16 },
  backBtnCenter: { padding: 12 },
  backBtnText: { color: C.gold, fontSize: 14 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 10,
    paddingHorizontal: 16,
    backgroundColor: C.bg,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 22, color: C.text2 },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: C.text, marginHorizontal: 8 },
  shareBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  shareBtnText: { fontSize: 20, color: C.text2 },

  scroll: { flex: 1 },
  // isDesktopWeb was imported here but never actually applied to
  // anything — this page has genuinely been the unmodified mobile
  // layout stretched full-width this whole time, not just narrower
  // sections within an otherwise-adapted page.
  scrollContent: { paddingBottom: 20, maxWidth: 900, width: '100%', alignSelf: 'center' },
  scrollContentDesktop: { maxWidth: 760, width: '100%', alignSelf: 'center' },

  cover: {
    height: 140,
    backgroundColor: C.surface,
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
    backgroundColor: C.emerald,
    borderWidth: 3,
    borderColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgLogoImg: {
    width: 68,
    height: 68,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: C.bg,
  },
  orgLogoText: { fontSize: 20, fontWeight: '700', color: C.gold },
  logoEditOverlay: {
    position: 'absolute',
    bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: C.bg,
  },
  logoEditIcon: { fontSize: 11 },
  profileBtns: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  followBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 100,
    borderWidth: 0.5,
    borderColor: C.goldDim ?? '#8a6f2e',
    backgroundColor: 'transparent',
  },
  followBtnActive: { backgroundColor: C.goldBg },
  followBtnText: { fontSize: 12, fontWeight: '600', color: C.gold },
  followBtnTextActive: { color: C.gold },
  visitBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 100,
    backgroundColor: C.emeraldBg,
    borderWidth: 0.5,
    borderColor: C.emerald,
  },
  visitBtnText: { fontSize: 12, fontWeight: '600', color: C.emeraldLight },

  info: { paddingHorizontal: 16, paddingBottom: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 },
  orgName: { fontSize: 18, fontWeight: '700', color: C.text },
  verifiedBadge: {
    backgroundColor: C.gold,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  verifiedText: { fontSize: 9, fontWeight: '800', color: '#000' },
  ein: { fontSize: 11, color: C.text3, marginBottom: 4 },
  tagline: { fontSize: 13, color: C.text2, lineHeight: 20, marginBottom: 10 },
  metaRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  metaItem: {},
  metaText: { fontSize: 12, color: C.text3 },

  trustStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: C.surface,
    borderRadius: Theme.radius.xl,
    borderWidth: 0.5,
    borderColor: C.border2,
    padding: 14,
  },
  trustScoreBox: { alignItems: 'center', flexShrink: 0 },
  trustScoreNum: { fontSize: 28, fontWeight: '800', lineHeight: 32 },
  trustScoreLabel: { fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5 },
  trustChecks: { flex: 1, gap: 4 },
  trustItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trustItemDot: { fontSize: 11, fontWeight: '700', width: 14 },
  trustItemDotDone: { color: C.emeraldLight },
  trustItemDotPending: { color: C.text3 },
  trustItemLabel: { fontSize: 11 },
  trustItemLabelDone: { color: C.emeraldLight },
  trustItemLabelPending: { color: C.text3 },

  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: C.text3,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  missionText: { fontSize: 13, color: C.text2, lineHeight: 21 },

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
    backgroundColor: C.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transparencyIcon: { fontSize: 18 },
  transparencyTitle: { fontSize: 13, fontWeight: '600', color: C.text },
  transparencySub: { fontSize: 11, color: C.emeraldLight, marginTop: 1 },

  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: Theme.radius.md,
    padding: 10,
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: C.border2,
  },
  docIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: C.goldBg,
    borderWidth: 0.5,
    borderColor: C.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docIcon: { fontSize: 16 },
  docName: { fontSize: 12, fontWeight: '600', color: C.text },
  docMeta: { fontSize: 10, color: C.text3, marginTop: 2 },
  docArrow: { fontSize: 14, color: C.gold },
  noDocsText: { fontSize: 12, color: C.text3, paddingVertical: 6 },
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
  propublicaBtnText: { fontSize: 12, fontWeight: '600', color: C.emeraldLight },

  // Was plain text on a flat card — every campaign shown on the actual
  // Seeds tab has a real cover image, so campaigns on the org's own
  // profile looked noticeably flatter than the same content everywhere
  // else in the app.
  fundraiserCard: {
    backgroundColor: C.surface,
    borderRadius: Theme.radius.xl,
    borderWidth: 0.5,
    borderColor: C.border2,
    marginBottom: 10,
    overflow: 'hidden',
  },
  frCover: { width: '100%', aspectRatio: 16 / 9, backgroundColor: C.surface2 },
  frBody: { padding: 14 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  campaignStatsRow: { flexDirection: 'row', gap: 16 },
  campaignStat: { alignItems: 'flex-end' },
  campaignStatVal: { fontSize: 14, fontWeight: '700', color: C.gold },
  campaignStatLabel: { fontSize: 8, color: C.text3, letterSpacing: 0.5 },
  frCategory: { fontSize: 10, color: C.gold, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  frTitle: { fontSize: 14, fontWeight: '600', color: C.text, lineHeight: 20, marginBottom: 10 },
  frProgressTrack: { height: 5, backgroundColor: C.surface2, borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  frProgressFill: { height: '100%', backgroundColor: C.emerald, borderRadius: 3 },
  frStats: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  frRaised: { fontSize: 15, fontWeight: '700', color: C.gold },
  frGoal: { fontSize: 11, color: C.text3, flex: 1 },
  frDonors: { fontSize: 11, color: C.text3 },
  donateBtn: {
    backgroundColor: C.gold,
    borderRadius: Theme.radius.md,
    padding: 10,
    alignItems: 'center',
  },
  donateBtnText: { fontSize: 13, fontWeight: '700', color: '#000' },

  detailsCard: {
    backgroundColor: C.surface,
    borderRadius: Theme.radius.xl,
    borderWidth: 0.5,
    borderColor: C.border2,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border2,
  },
  detailLabel: { fontSize: 12, color: C.text3 },
  detailValue: { fontSize: 12, fontWeight: '500', color: C.text },

  // Payment setup
  payCard: {
    backgroundColor: C.surface,
    borderRadius: Theme.radius.xl,
    borderWidth: 0.5,
    borderColor: C.border2,
    overflow: 'hidden',
    padding: 14,
  },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  payIconBox: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: C.surface2,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  payIcon: { fontSize: 18 },
  payInfo: { flex: 1 },
  payTitle: { color: C.text, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  paySub: { color: C.text3, fontSize: 11, lineHeight: 15 },
  payBtn: {
    backgroundColor: C.gold,
    borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    minWidth: 72, alignItems: 'center',
    flexShrink: 0,
  },
  payBtnDone: { backgroundColor: C.emeraldBg, borderWidth: 1, borderColor: C.emeraldLight },
  payBtnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.border },
  payBtnText: { color: C.black, fontSize: 12, fontWeight: '800' },
  payBtnGhostText: { color: C.text2, fontSize: 12, fontWeight: '700' },
  paySeparator: { height: 0.5, backgroundColor: C.border2, marginVertical: 14 },

  // Alt pay modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  altPaySheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 44,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border2, alignSelf: 'center', marginBottom: 18 },
  sheetTitle: { color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  sheetSub: { color: C.text3, fontSize: 12, lineHeight: 18, marginBottom: 18 },
  sheetLabel: { color: C.text3, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  platformRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  platformPill: {
    flex: 1, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: C.border2,
    alignItems: 'center', backgroundColor: C.surface2,
  },
  platformPillActive: { backgroundColor: C.goldBg, borderColor: C.gold },
  platformPillText: { color: C.text2, fontSize: 13, fontWeight: '700' },
  platformPillTextActive: { color: C.gold },
  sheetInput: {
    borderWidth: 1, borderColor: C.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    color: C.text, fontSize: 14, marginBottom: 16,
    backgroundColor: C.bg,
  },
  sheetSaveBtn: {
    backgroundColor: C.gold, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginTop: 4,
  },
  sheetSaveBtnText: { color: C.black, fontSize: 15, fontWeight: '900' },

  // Tab bar — same pill-tab convention as the dashboard's Gems/Seeds/
  // Saved/Donations tabs, for visual consistency across the app.
  orgTabs: {
    flexDirection: 'row', gap: 6, marginHorizontal: 16, marginBottom: 16,
    backgroundColor: C.surface2, borderRadius: Theme.radius.full, padding: 4,
  },
  orgTab: { flex: 1, paddingVertical: 9, borderRadius: Theme.radius.full, alignItems: 'center' },
  orgTabActive: { backgroundColor: C.gold },
  orgTabText: { color: C.text3, fontWeight: '600', fontSize: 12 },
  orgTabTextActive: { color: C.bg },

  // Endorsements / Projects / Services (LinkedIn-style profile additions)
  sectionAction: { fontSize: 12, fontWeight: '700', color: C.gold },
  emptySectionText: { fontSize: 13, color: C.text3, fontStyle: 'italic' },

  endorseForm: {
    backgroundColor: C.surface, borderRadius: Theme.radius.lg, borderWidth: 0.5, borderColor: C.border2,
    padding: 12, marginBottom: 12, gap: 10,
  },
  endorseInput: {
    backgroundColor: C.bg, borderRadius: Theme.radius.md, borderWidth: 0.5, borderColor: C.border,
    padding: 10, color: C.text, fontSize: 13, minHeight: 60, textAlignVertical: 'top',
  },
  smallPrimaryBtn: { backgroundColor: C.gold, borderRadius: Theme.radius.md, paddingVertical: 11, alignItems: 'center' },
  smallPrimaryBtnText: { color: '#000', fontSize: 13, fontWeight: '700' },

  endorsementCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: C.surface, borderRadius: Theme.radius.lg, borderWidth: 0.5, borderColor: C.border2,
    padding: 12, marginBottom: 8,
  },
  endorsementAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: C.emerald,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
  },
  endorsementAvatarText: { color: C.gold, fontSize: 14, fontWeight: '700' },
  endorsementName: { fontSize: 13, fontWeight: '700', color: C.text },
  endorsementMessage: { fontSize: 12, color: C.text2, marginTop: 3, lineHeight: 17 },
  endorsementRemove: { fontSize: 11, color: '#e84545', fontWeight: '600', marginTop: 4 },

  addForm: {
    backgroundColor: C.surface, borderRadius: Theme.radius.lg, borderWidth: 0.5, borderColor: C.border2,
    padding: 12, marginBottom: 12, gap: 10,
  },
  addFormImage: {
    height: 120, borderRadius: Theme.radius.md, backgroundColor: C.bg,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    borderWidth: 1, borderColor: C.border, borderStyle: 'dashed',
  },
  addFormImageText: { color: C.text3, fontSize: 12 },
  addFormInput: {
    backgroundColor: C.bg, borderRadius: Theme.radius.md, borderWidth: 0.5, borderColor: C.border,
    paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 13,
  },
  addFormTextarea: { minHeight: 60, textAlignVertical: 'top' },
  statusToggleRow: { flexDirection: 'row', gap: 8 },
  statusToggle: {
    flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: 'center',
    borderWidth: 0.5, borderColor: C.border2, backgroundColor: C.bg,
  },
  statusToggleActive: { backgroundColor: C.goldBg, borderColor: C.gold },
  statusToggleText: { fontSize: 12, color: C.text3, fontWeight: '600' },
  statusToggleTextActive: { color: C.gold },

  projectsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  projectCard: {
    width: '100%', backgroundColor: C.surface, borderRadius: Theme.radius.lg,
    borderWidth: 0.5, borderColor: C.border2, overflow: 'hidden', marginBottom: 8,
  },
  projectImage: { width: '100%', aspectRatio: 16 / 9, backgroundColor: C.surface2 },
  projectImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  projectBody: { padding: 12 },
  statusBadge: {
    alignSelf: 'flex-start', backgroundColor: C.goldBg, borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 3, marginBottom: 6,
  },
  statusBadgeCompleted: { backgroundColor: C.emeraldBg },
  statusBadgeText: { fontSize: 9, fontWeight: '700', color: C.gold, textTransform: 'uppercase' },
  projectTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 4 },
  projectDescription: { fontSize: 12, color: C.text2, lineHeight: 17, marginBottom: 6 },

  serviceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, borderRadius: Theme.radius.lg, borderWidth: 0.5, borderColor: C.border2,
    padding: 12, marginBottom: 8,
  },
  serviceIcon: { fontSize: 22 },
  serviceName: { fontSize: 13, fontWeight: '700', color: C.text },
  serviceDescription: { fontSize: 12, color: C.text2, marginTop: 2, lineHeight: 16 },
});
}
