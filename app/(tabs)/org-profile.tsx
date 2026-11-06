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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTheme, type AppColors } from '../../lib/theme';
import { DesktopShell } from '../../components/DesktopShell';
import { Glyph, type GlyphName } from '../../components/Glyph';
import { Icon } from '../../components/Icon';
import { showToast } from '../../components/Toast';
import { shareLink, getAppBaseUrl } from '../../lib/share';
import * as ImagePicker from 'expo-image-picker';
import { uploadFileToBunny } from '../../lib/bunnyUpload';
import ImageCropModal from '../../components/ImageCropModal';
import {
  Avatar,
  Card,
  CardTitle,
  ENDORSEMENT_SELECT,
  EndorsementCard,
  PrimaryButton,
  ProgressBar,
  ReviewCard,
  money,
  useMeasuredWidth,
  useReviewVotes,
  type PublicReview,
  type SeedEndorsement,
} from '../../components/SeedSocial';
import { brandStyles, font } from '../../lib/ds';
import { Button, IconButton } from '../../components/ui';
import { OrgVideos } from '../../components/OrgVideos';
import { OrgPosts } from '../../components/OrgPosts';
import { focusedOnly } from '../../components/FocusedOnly';
import { seedYouTubeId } from '../../components/SeedVideo';
// expo-haptics is native-only — no-op on web
const Haptics = Platform.OS !== 'web' ? require('expo-haptics') : { notificationAsync: () => {} };

// lib/bunnyUpload.ts has the working (region-correct) Bunny upload; this
// screen reuses it rather than keeping its own copy.
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

type Doc990 = { id: string; tax_year: number; file_url: string; file_name: string | null; file_size_kb: number | null; status: string; created_at: string };

type OrgEndorsement = {
  id: string;
  message: string | null;
  created_at: string;
  speaker_id: string;
  speakers: { id?: string; display_name: string; avatar_url: string | null; state?: string | null } | null;
};

type Project = { id: string; title: string; description: string | null; image_url: string | null; status: 'ongoing' | 'completed' };
type Service = { id: string; name: string; description: string | null; icon: string | null };

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
  video_url?: string | null;
  end_date: string | null;
  zakat_eligible: boolean | null;
};

type Tab = 'overview' | 'posts' | 'videos' | 'seeds' | 'endorsements' | 'reviews' | 'about';

function orgIcon(type: string | null): GlyphName {
  const map: Record<string, GlyphName> = {
    masjid: 'moon-outline', nonprofit: 'hand-left-outline', charity: 'heart-outline', school: 'school-outline', relief: 'earth-outline', community: 'people-outline',
  };
  return map[type?.toLowerCase() ?? ''] ?? 'business-outline';
}

function daysLeft(endDate: string | null): number | null {
  if (!endDate) return null;
  const d = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
  return d > 0 ? d : null;
}

// Alert.alert with buttons is a no-op on react-native-web, so confirmations
// silently did nothing there. window.confirm on web, Alert on native.
function confirmAction(title: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(title)) onYes();
    return;
  }
  Alert.alert(title, undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: onYes },
  ]);
}

function OrgProfileScreen() {
  const { colors: C } = useTheme();
  const { id, tab: initialTab } = useLocalSearchParams<{ id: string; tab?: Tab }>();
  const { width, onLayout } = useMeasuredWidth();
  const cols = width >= 1080 ? 3 : width >= 760 ? 2 : 1;
  const styles = useMemo(() => makeStyles(C, cols), [C, cols]);

  const [org, setOrg] = useState<Org | null>(null);
  const [docs, setDocs] = useState<Doc990[]>([]);
  const [fundraisers, setFundraisers] = useState<Fundraiser[]>([]);
  const [seedEndorsements, setSeedEndorsements] = useState<SeedEndorsement[]>([]);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  // Admins can edit seeded/demo orgs whose placeholder profile_id never
  // matches a real account, same as the literal owner.
  const canEditOrg = isOwner || isAdmin;
  const [activeTab, setActiveTab] = useState<Tab>(initialTab || 'overview');
  const [videoCount, setVideoCount] = useState(0);
  const [postCount, setPostCount] = useState(0);

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

  // Org-level endorsements (a speaker vouching for the whole org), projects, services
  const [endorsements, setEndorsements] = useState<OrgEndorsement[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [mySpeakerId, setMySpeakerId] = useState<string | null>(null);
  const [mySpeakerVerified, setMySpeakerVerified] = useState(false);
  const [endorseFormOpen, setEndorseFormOpen] = useState(false);
  const [endorseMessage, setEndorseMessage] = useState('');
  const [submittingEndorsement, setSubmittingEndorsement] = useState(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [projectTitle, setProjectTitle] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectImageUri, setProjectImageUri] = useState<string | null>(null);
  const [projectStatus, setProjectStatus] = useState<'ongoing' | 'completed'>('ongoing');
  const [savingProject, setSavingProject] = useState(false);
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [serviceName, setServiceName] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [serviceIcon, setServiceIcon] = useState('');
  const [savingService, setSavingService] = useState(false);

  const { voted, toggle: toggleVote } = useReviewVotes(reviews.map(r => r.id));

  useFocusEffect(
    useCallback(() => {
      if (id) loadOrg(id);
    }, [id])
  );

  async function loadOrg(orgId: string) {
    const [orgRes, docsRes, frRes, sessionRes, endorsementsRes, projectsRes, servicesRes, reviewsRes] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', orgId).single(),
      supabase.from('org_990s').select('*').eq('org_id', orgId).order('tax_year', { ascending: false }),
      supabase.from('fundraisers').select('id,org_id,title,cause_category,goal_amount,raised_amount,donor_count,status,cover_image_url,image_url,video_url,end_date,zakat_eligible').eq('org_id', orgId).in('status', ['active', 'published', 'approved', 'live']).order('created_at', { ascending: false }).limit(20),
      supabase.auth.getSession(),
      supabase.from('org_endorsements').select('id,message,created_at,speaker_id,speakers(id,display_name,avatar_url,state)').eq('org_id', orgId).order('created_at', { ascending: false }),
      supabase.from('org_projects').select('id,title,description,image_url,status').eq('org_id', orgId).order('created_at', { ascending: false }),
      supabase.from('org_services').select('id,name,description,icon').eq('org_id', orgId).order('created_at', { ascending: true }),
      supabase.from('public_donation_reviews').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(40),
    ]);

    const frs = (frRes.data || []) as Fundraiser[];
    setFundraisers(frs);
    if (frs.length) {
      const { data: se } = await supabase
        .from('seed_endorsements')
        .select(ENDORSEMENT_SELECT)
        .in('fundraiser_id', frs.map(f => f.id))
        .eq('status', 'endorsed')
        .order('responded_at', { ascending: false });
      setSeedEndorsements((se || []) as any);
    } else {
      setSeedEndorsements([]);
    }

    if (orgRes.data) {
      setOrg(orgRes.data);
      const me = sessionRes.data?.session?.user?.id ?? null;
      setUid(me);
      setIsOwner(!!me && orgRes.data.profile_id === me);
      if (me) {
        const [{ data: profileData }, { data: speakerData }, followRes] = await Promise.all([
          supabase.from('profiles').select('role').eq('id', me).maybeSingle(),
          supabase.from('speakers').select('id,is_verified,approval_status').eq('profile_id', me).maybeSingle(),
          orgRes.data.profile_id
            ? supabase.from('follows').select('follower_id').eq('follower_id', me).eq('following_id', orgRes.data.profile_id).maybeSingle()
            : Promise.resolve({ data: null } as any),
        ]);
        const role = String(profileData?.role || '').toLowerCase();
        setIsAdmin(['admin', 'owner', 'moderator', 'super_admin'].includes(role));
        setMySpeakerId(speakerData?.id ?? null);
        setMySpeakerVerified(Boolean(speakerData?.is_verified && speakerData?.approval_status === 'approved'));
        setFollowing(Boolean(followRes?.data));
      } else {
        setIsAdmin(false);
        setMySpeakerId(null);
        setMySpeakerVerified(false);
      }
    }
    if (docsRes.data) setDocs(docsRes.data);
    if (endorsementsRes.data) setEndorsements(endorsementsRes.data as any);
    if (projectsRes.data) setProjects(projectsRes.data as any);
    if (servicesRes.data) setServices(servicesRes.data as any);
    setReviews((reviewsRes.data || []) as PublicReview[]);
    setLoading(false);
  }

  const hasEndorsed = Boolean(mySpeakerId && endorsements.some(e => e.speaker_id === mySpeakerId));

  // Follow uses the shared follows table (profile → profile), keyed on the
  // account that owns this org. Seeded orgs without a real owner can't be followed.
  async function toggleFollow() {
    if (!org) return;
    if (!uid) { router.push('/(auth)/login' as any); return; }
    if (!org.profile_id) { showToast("This organization can't be followed yet"); return; }
    const next = !following;
    setFollowing(next);
    const res = next
      ? await supabase.from('follows').insert({ follower_id: uid, following_id: org.profile_id })
      : await supabase.from('follows').delete().eq('follower_id', uid).eq('following_id', org.profile_id);
    if (res.error) { setFollowing(!next); showToast("Couldn't update follow"); }
  }

  async function submitEndorsement() {
    if (!mySpeakerId || !org) return;
    setSubmittingEndorsement(true);
    const { error } = await supabase.from('org_endorsements').insert({
      org_id: org.id,
      speaker_id: mySpeakerId,
      message: endorseMessage.trim() || null,
    });
    setSubmittingEndorsement(false);
    if (error) { showToast(error.message); return; }
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
    if (!perm.granted) { showToast('Allow Siqa to access your photos.'); return; }
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
      showToast(e.message);
    } finally {
      setSavingProject(false);
    }
  }

  function deleteProject(projectId: string) {
    if (!org) return;
    confirmAction('Remove this project?', async () => {
      await supabase.from('org_projects').delete().eq('id', projectId);
      loadOrg(org.id);
    });
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
    if (error) { showToast(error.message); return; }
    setAddServiceOpen(false);
    setServiceName('');
    setServiceDescription('');
    setServiceIcon('');
    loadOrg(org.id);
  }

  function deleteService(serviceId: string) {
    if (!org) return;
    confirmAction('Remove this service?', async () => {
      await supabase.from('org_services').delete().eq('id', serviceId);
      loadOrg(org.id);
    });
  }

  // allowsEditing/aspect only apply on native (the OS crop UI); on web
  // ImageCropModal is the reposition/zoom step.
  async function pickLogo() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { showToast('Allow Siqa to access your photos.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (Platform.OS === 'web') { setCropTarget('logo'); setCropImageUri(asset.uri); return; }
    await uploadLogo(asset.uri);
  }

  async function pickBanner() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { showToast('Allow Siqa to access your photos.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [3, 1], quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (Platform.OS === 'web') { setCropTarget('banner'); setCropImageUri(asset.uri); return; }
    await uploadBanner(asset.uri);
  }

  async function uploadLogo(uri: string) {
    setUploadingLogo(true);
    try {
      const ext = uri.split('.').pop()?.split('?')[0] ?? 'jpg';
      const url = await uploadImageToBunny(uri, `org-logos/${org!.id}_${Date.now()}.${ext}`);
      await supabase.from('organizations').update({ logo_url: url }).eq('id', org!.id);
      setOrg(prev => prev ? { ...prev, logo_url: url } : prev);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      showToast('Upload failed: ' + e.message);
    } finally {
      setUploadingLogo(false);
    }
  }

  async function uploadBanner(uri: string) {
    setUploadingBanner(true);
    try {
      const ext = uri.split('.').pop()?.split('?')[0] ?? 'jpg';
      const url = await uploadImageToBunny(uri, `org-banners/${org!.id}_${Date.now()}.${ext}`);
      await supabase.from('organizations').update({ banner_url: url }).eq('id', org!.id);
      setOrg(prev => prev ? { ...prev, banner_url: url } : prev);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      showToast('Upload failed: ' + e.message);
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
      showToast('Connection failed: ' + e.message);
    } finally {
      setConnectingStripe(false);
    }
  }

  async function saveAltPayment() {
    if (!org || !altPayUrl.trim()) { showToast('Enter your donation page URL.'); return; }
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
      showToast('Save failed: ' + e.message);
    } finally {
      setSavingAltPay(false);
    }
  }

  function share() {
    if (!org) return;
    shareLink({ url: `${getAppBaseUrl()}/org-profile?id=${org.id}`, title: org.org_name, text: org.tagline || undefined });
  }

  if (loading) {
    return (
      <DesktopShell>
        <View style={styles.centered}><ActivityIndicator color={C.gold} size="large" /></View>
      </DesktopShell>
    );
  }

  if (!org) {
    return (
      <DesktopShell>
        <View style={styles.centered}>
          <Text style={styles.muted}>Organization not found.</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 12 }}>
            <Text style={styles.link}>← Go back</Text>
          </TouchableOpacity>
        </View>
      </DesktopShell>
    );
  }

  const location = [org.city, org.state].filter(Boolean).join(', ') || 'USA';
  const totals = fundraisers.reduce(
    (acc, fr) => ({ raised: acc.raised + (fr.raised_amount || 0), donors: acc.donors + (fr.donor_count || 0) }),
    { raised: 0, donors: 0 }
  );
  const endorsedBySeed: Record<string, number> = {};
  seedEndorsements.forEach(e => { endorsedBySeed[e.fundraiser_id] = (endorsedBySeed[e.fundraiser_id] || 0) + 1; });
  const endorsingSpeakerIds = new Set([...endorsements.map(e => e.speaker_id), ...seedEndorsements.map(e => e.speaker_id)]);
  const paymentReady = org.stripe_onboarded || !!org.payment_method_url;
  const wide = cols > 1;
  const logoSize = wide ? 120 : 84;
  const coverHeight = Math.round(Math.max(140, Math.min(260, width * 0.26)));

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'posts', label: `Posts${postCount ? ` (${postCount})` : ''}` },
    { key: 'videos', label: `Videos${videoCount ? ` (${videoCount})` : ''}` },
    { key: 'seeds', label: `Seeds${fundraisers.length ? ` (${fundraisers.length})` : ''}` },
    { key: 'endorsements', label: `Endorsements${endorsingSpeakerIds.size ? ` (${endorsingSpeakerIds.size})` : ''}` },
    { key: 'reviews', label: `Donor reviews${reviews.length ? ` (${reviews.length})` : ''}` },
    { key: 'about', label: 'About' },
  ];

  function onReviewCount(rid: string, delta: number) {
    setReviews(rs => rs.map(r => r.id === rid ? { ...r, helpful_count: Math.max(0, r.helpful_count + delta) } : r));
  }

  // ── Section blocks (composed differently per tab / column count) ──────

  const seedsBlock = (limit?: number) => (
    <Card>
      <CardTitle right={limit && fundraisers.length > limit ? (
        <TouchableOpacity onPress={() => setActiveTab('seeds')} style={styles.textBtn}><Text style={styles.link}>See all</Text></TouchableOpacity>
      ) : undefined}>Active seeds</CardTitle>
      {fundraisers.length === 0 ? (
        <Text style={styles.muted}>No active seeds right now — check back soon.</Text>
      ) : (
        <View style={{ gap: 12 }}>
          {fundraisers.slice(0, limit ?? fundraisers.length).map(fr => (
            <SeedRow key={fr.id} fr={fr} endorsed={endorsedBySeed[fr.id] || 0} horizontal={width >= 560} />
          ))}
        </View>
      )}
    </Card>
  );

  const endorsementsBlock = (limit?: number) => {
    const seen = new Set<string>();
    const fromSeeds = seedEndorsements.filter(e => (seen.has(e.speaker_id) ? false : (seen.add(e.speaker_id), true)));
    const orgOnly = endorsements.filter(e => !seen.has(e.speaker_id));
    const items = [
      ...orgOnly.map(e => ({ key: 'o' + e.id, node: (
        <OrgEndorsementRow key={'o' + e.id} e={e} mine={mySpeakerId === e.speaker_id} onRemove={() => deleteEndorsement(e.id)} />
      ) })),
      ...fromSeeds.map(e => ({ key: 's' + e.id, node: (
        <View key={'s' + e.id} style={{ gap: 4 }}>
          <EndorsementCard e={e} compact />
          <TouchableOpacity onPress={() => router.push({ pathname: '/seed/[id]', params: { id: e.fundraiser_id } } as any)}>
            <Text style={styles.smallLink} numberOfLines={1}>On {fundraisers.find(f => f.id === e.fundraiser_id)?.title || 'a seed'}</Text>
          </TouchableOpacity>
        </View>
      ) })),
    ];
    return (
      <Card>
        <CardTitle icon="star-outline" right={mySpeakerId && mySpeakerVerified && !hasEndorsed && !isOwner ? (
          <TouchableOpacity onPress={() => setEndorseFormOpen(v => !v)} style={styles.textBtn}>
            <Text style={styles.link}>{endorseFormOpen ? 'Cancel' : 'Endorse'}</Text>
          </TouchableOpacity>
        ) : undefined}>Endorsed by speakers</CardTitle>
        <Text style={styles.muted}>Only speakers verified by Siqa can endorse.</Text>
        {endorseFormOpen && (
          <View style={{ gap: 10 }}>
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
              placeholder="Why do you vouch for this organization?"
              placeholderTextColor={C.text3}
              value={endorseMessage}
              onChangeText={setEndorseMessage}
              maxLength={200}
              multiline
            />
            <PrimaryButton label="Post endorsement" onPress={submitEndorsement} busy={submittingEndorsement} />
          </View>
        )}
        {items.length === 0 ? (
          <Text style={styles.muted}>No endorsements yet.</Text>
        ) : (
          <View style={{ gap: 16 }}>
            {items.slice(0, limit ?? items.length).map(i => i.node)}
            {limit && items.length > limit ? (
              <TouchableOpacity onPress={() => setActiveTab('endorsements')} style={styles.textBtn}><Text style={styles.link}>See all {items.length}</Text></TouchableOpacity>
            ) : null}
          </View>
        )}
      </Card>
    );
  };

  const reviewsBlock = (limit?: number) => (
    <Card>
      <CardTitle icon="chatbubble-ellipses-outline">Why donors give</CardTitle>
      {reviews.length === 0 ? (
        <Text style={styles.muted}>When donors leave a note about why they gave, it shows up here.</Text>
      ) : (
        <View style={{ gap: 16 }}>
          {reviews.slice(0, limit ?? reviews.length).map(r => (
            <ReviewCard key={r.id} r={r} showSeed voted={voted[r.id]} onVote={limit ? undefined : (rv) => toggleVote(rv, onReviewCount)} />
          ))}
          {limit && reviews.length > limit ? (
            <TouchableOpacity onPress={() => setActiveTab('reviews')} style={styles.textBtn}><Text style={styles.link}>Read all {reviews.length} reviews</Text></TouchableOpacity>
          ) : null}
        </View>
      )}
    </Card>
  );

  const aboutBlock = (
    <Card>
      <CardTitle>About</CardTitle>
      <Text style={styles.body}>{org.mission || org.tagline || 'This organization hasn’t added a mission statement yet.'}</Text>
      <View style={{ gap: 8 }}>
        {org.org_type ? <MetaLine icon={orgIcon(org.org_type)} text={org.org_type} /> : null}
        <MetaLine icon="location-outline" text={location} />
        {org.ein ? <MetaLine icon="document-text-outline" text={`EIN ${org.ein}`} /> : null}
        {org.website ? (
          <TouchableOpacity onPress={() => Linking.openURL(org.website!)}>
            <MetaLine icon="globe-outline" text={org.website.replace(/^https?:\/\//, '')} link />
          </TouchableOpacity>
        ) : null}
      </View>
    </Card>
  );

  const trustBlock = (
    <Card>
      <CardTitle icon="shield-checkmark-outline">Trust &amp; transparency</CardTitle>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.trustNum, { color: !org.trust_score ? C.text3 : org.trust_score >= 90 ? C.emerald : org.trust_score >= 75 ? C.goldDim : C.text2 }]}>
            {org.trust_score ?? '—'}
          </Text>
          <Text style={styles.trustLabel}>Trust</Text>
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          <TrustItem done={org.is_verified} label="Reviewed and verified by Siqa" />
          <TrustItem done={org.ein_verified} label="EIN verified" />
          <TrustItem done={docs.some(d => d.status === 'verified')} label="Form 990 on file" />
          <TrustItem done={!!org.propublica_url} label="ProPublica linked" />
        </View>
      </View>
    </Card>
  );

  const servicesBlock = (
    <Card>
      <CardTitle right={canEditOrg ? (
        <TouchableOpacity onPress={() => setAddServiceOpen(v => !v)} style={styles.textBtn}><Text style={styles.link}>{addServiceOpen ? 'Cancel' : 'Add'}</Text></TouchableOpacity>
      ) : undefined}>Services</CardTitle>
      {addServiceOpen && (
        <View style={{ gap: 10 }}>
          <TextInput style={styles.input} placeholder="Icon (optional emoji)" placeholderTextColor={C.text3} value={serviceIcon} onChangeText={setServiceIcon} maxLength={4} />
          <TextInput style={styles.input} placeholder="Service name, e.g. Food pantry" placeholderTextColor={C.text3} value={serviceName} onChangeText={setServiceName} />
          <TextInput style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]} placeholder="Brief description" placeholderTextColor={C.text3} value={serviceDescription} onChangeText={setServiceDescription} multiline />
          <PrimaryButton label="Save service" onPress={submitService} busy={savingService} disabled={!serviceName.trim()} />
        </View>
      )}
      {services.length === 0 ? (
        <Text style={styles.muted}>No services listed yet.</Text>
      ) : services.map(s => (
        <View key={s.id} style={styles.serviceRow}>
          <View style={styles.serviceIconBox}>
            {/* icon is either an app icon name (e.g. "medkit-outline") or an emoji. */}
            {s.icon && /^[a-z0-9-]+$/.test(s.icon)
              ? <Icon name={s.icon as any} size={18} color={C.emerald} />
              : s.icon ? <Text style={{ fontSize: 18 }}>{s.icon}</Text> : <Icon name="sparkles-outline" size={18} color={C.emerald} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{s.name}</Text>
            {s.description ? <Text style={styles.muted}>{s.description}</Text> : null}
          </View>
          {canEditOrg && (
            <TouchableOpacity onPress={() => deleteService(s.id)} style={styles.textBtn}><Text style={styles.danger}>Remove</Text></TouchableOpacity>
          )}
        </View>
      ))}
    </Card>
  );

  const projectsBlock = (
    <Card>
      <CardTitle right={canEditOrg ? (
        <TouchableOpacity onPress={() => setAddProjectOpen(v => !v)} style={styles.textBtn}><Text style={styles.link}>{addProjectOpen ? 'Cancel' : 'Add project'}</Text></TouchableOpacity>
      ) : undefined}>Projects</CardTitle>
      {addProjectOpen && (
        <View style={{ gap: 10 }}>
          <TouchableOpacity style={styles.photoPick} onPress={pickProjectImage}>
            {projectImageUri ? (
              <Image source={{ uri: projectImageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <Text style={styles.muted}><Glyph name="camera-outline" style={styles.muted} />{'  '}Add a photo</Text>
            )}
          </TouchableOpacity>
          <TextInput style={styles.input} placeholder="Project title" placeholderTextColor={C.text3} value={projectTitle} onChangeText={setProjectTitle} />
          <TextInput style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]} placeholder="What was this project?" placeholderTextColor={C.text3} value={projectDescription} onChangeText={setProjectDescription} multiline />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['ongoing', 'completed'] as const).map(st => (
              <TouchableOpacity key={st} style={[styles.segment, projectStatus === st && styles.segmentOn]} onPress={() => setProjectStatus(st)}>
                <Text style={[styles.segmentText, projectStatus === st && styles.segmentTextOn]}>{st === 'ongoing' ? 'Ongoing' : 'Completed'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <PrimaryButton label="Save project" onPress={submitProject} busy={savingProject} disabled={!projectTitle.trim()} />
        </View>
      )}
      {projects.length === 0 ? (
        <Text style={styles.muted}>No projects listed yet.</Text>
      ) : (
        <View style={styles.projectGrid}>
          {projects.map(p => (
            <View key={p.id} style={styles.projectCard}>
              {p.image_url ? <Image source={{ uri: p.image_url }} style={styles.projectImage} resizeMode="cover" /> : <View style={styles.projectImage} />}
              <View style={{ padding: 12, gap: 6 }}>
                <Text style={[styles.pill, p.status === 'completed' && { color: C.emerald, backgroundColor: C.emeraldBg }]}>{p.status === 'completed' ? 'Completed' : 'Ongoing'}</Text>
                <Text style={styles.rowTitle}>{p.title}</Text>
                {p.description ? <Text style={styles.muted} numberOfLines={3}>{p.description}</Text> : null}
                {canEditOrg && (
                  <TouchableOpacity onPress={() => deleteProject(p.id)} style={styles.textBtn}><Text style={styles.danger}>Remove</Text></TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </Card>
  );

  const docsBlock = (
    <Card>
      <CardTitle icon="document-text-outline">Financial transparency</CardTitle>
      {docs.length === 0 ? (
        <Text style={styles.muted}>No Form 990 documents uploaded yet.</Text>
      ) : docs.map(doc => (
        <TouchableOpacity key={doc.id} style={styles.docRow} onPress={() => Linking.openURL(doc.file_url)}>
          <Icon name="document-outline" size={20} color={C.goldDim} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Form 990 — Tax year {doc.tax_year}</Text>
            <Text style={styles.muted}>
              {doc.file_size_kb ? (doc.file_size_kb / 1024).toFixed(1) + ' MB · ' : ''}
              {doc.status === 'verified' ? 'Verified' : doc.status}
            </Text>
          </View>
          <Icon name="open-outline" size={16} color={C.text2} />
        </TouchableOpacity>
      ))}
      {org.propublica_url ? (
        <TouchableOpacity onPress={() => Linking.openURL(org.propublica_url!)} style={styles.textBtn}>
          <Text style={styles.link}>View on ProPublica Nonprofit Explorer ↗</Text>
        </TouchableOpacity>
      ) : null}
    </Card>
  );

  const paymentBlock = canEditOrg ? (
    <Card>
      <CardTitle icon="card-outline">Payment setup</CardTitle>
      <Text style={styles.muted}>Only you and Siqa admins see this.</Text>
      <View style={styles.payRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Stripe Connect</Text>
          <Text style={styles.muted}>
            {org.stripe_onboarded
              ? 'Connected — donations go directly to your account'
              : org.stripe_account_id
              ? 'Account created — finish onboarding to receive donations'
              : 'Connect Stripe to receive donations. Log in to an existing account or create one.'}
          </Text>
        </View>
        <PrimaryButton
          label={org.stripe_onboarded ? 'Connected' : org.stripe_account_id ? 'Resume' : 'Connect'}
          onPress={connectStripe}
          busy={connectingStripe}
          disabled={org.stripe_onboarded}
          tone={org.stripe_onboarded ? 'ghost' : 'gold'}
          style={{ minHeight: 44 }}
        />
      </View>
      <View style={styles.divider} />
      <View style={styles.payRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Can't use Stripe?</Text>
          <Text style={styles.muted}>
            {org.payment_method_type && org.payment_method_url
              ? `${org.payment_method_type.charAt(0).toUpperCase() + org.payment_method_type.slice(1)} linked — donors are sent to your page`
              : 'Use Zeffy, PayPal, or another platform. Donors are sent to your page.'}
          </Text>
        </View>
        <PrimaryButton
          label={org.payment_method_url ? 'Edit' : 'Set up'}
          tone="ghost"
          style={{ minHeight: 44 }}
          onPress={() => {
            setAltPayType((org.payment_method_type as any) || 'zeffy');
            setAltPayUrl(org.payment_method_url ?? '');
            setAltPayLabel(org.payment_method_label ?? '');
            setAltPayModalVisible(true);
          }}
        />
      </View>
    </Card>
  ) : null;

  // Org videos live only on this page (public.org_videos), never in Gems.
  const videosBlock = (limit?: number) => (
    <OrgVideos
      key={`videos-${org.id}-${limit ?? 'all'}`}
      orgId={org.id}
      canEdit={canEditOrg}
      limit={limit}
      onSeeAll={() => setActiveTab('videos')}
      onCount={setVideoCount}
    />
  );

  // Org posts live only on this page (public.org_posts), never in Gems.
  const postsBlock = (limit?: number) => (
    <OrgPosts
      key={`posts-${org.id}-${limit ?? 'all'}`}
      orgId={org.id}
      orgName={org.org_name}
      orgLogo={org.logo_url}
      canEdit={canEditOrg}
      limit={limit}
      onSeeAll={() => setActiveTab('posts')}
      onCount={setPostCount}
    />
  );

  // ── Layout per tab ───────────────────────────────────────────────────

  function renderTab() {
    if (activeTab === 'posts') return <View style={styles.stack}>{postsBlock()}</View>;
    if (activeTab === 'videos') return <View style={styles.stack}>{videosBlock()}</View>;
    if (activeTab === 'seeds') return <View style={styles.stack}>{seedsBlock()}</View>;
    if (activeTab === 'endorsements') return <View style={styles.stack}>{endorsementsBlock()}</View>;
    if (activeTab === 'reviews') return <View style={styles.stack}>{reviewsBlock()}</View>;
    if (activeTab === 'about') {
      const left = <>{aboutBlock}{trustBlock}{paymentBlock}{docsBlock}</>;
      const right = <>{servicesBlock}{projectsBlock}</>;
      return cols === 1 ? (
        <View style={styles.stack}>{left}{right}</View>
      ) : (
        <View style={styles.row}>
          <View style={[styles.stack, styles.colMain]}>{left}</View>
          <View style={[styles.stack, styles.colSide]}>{right}</View>
        </View>
      );
    }
    // Overview
    if (cols === 3) {
      return (
        <View style={styles.row}>
          <View style={[styles.stack, styles.colLeft]}>{aboutBlock}{trustBlock}{services.length ? servicesBlock : null}</View>
          <View style={[styles.stack, styles.colMain]}>{postsBlock(2)}{videosBlock(3)}{seedsBlock(4)}{reviewsBlock(3)}</View>
          <View style={[styles.stack, styles.colSide]}>{endorsementsBlock(4)}</View>
        </View>
      );
    }
    if (cols === 2) {
      return (
        <View style={styles.row}>
          <View style={[styles.stack, styles.colMain]}>{postsBlock(2)}{videosBlock(2)}{seedsBlock(4)}{reviewsBlock(3)}</View>
          <View style={[styles.stack, styles.colSide]}>{endorsementsBlock(3)}{aboutBlock}{trustBlock}</View>
        </View>
      );
    }
    return (
      <View style={styles.stack}>
        {postsBlock(2)}
        {videosBlock(2)}
        {seedsBlock(3)}
        {endorsementsBlock(3)}
        {reviewsBlock(3)}
        {aboutBlock}
        {trustBlock}
      </View>
    );
  }

  return (
    <DesktopShell>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} accessibilityLabel="Back">
            <Icon name="arrow-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.topTitle} numberOfLines={1}>{org.org_name}</Text>
          <TouchableOpacity onPress={share} style={styles.iconBtn} accessibilityLabel="Share">
            <Icon name="share-outline" size={19} color={C.text} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <View style={styles.page} onLayout={onLayout}>
            {/* Header card */}
            <View style={styles.headerCard}>
              <TouchableOpacity
                style={[styles.cover, { height: coverHeight }]}
                onPress={canEditOrg ? pickBanner : undefined}
                activeOpacity={canEditOrg ? 0.85 : 1}
                accessibilityLabel={canEditOrg ? 'Change cover photo' : undefined}
              >
                {org.banner_url ? (
                  <Image source={{ uri: org.banner_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: C.emerald }]} />
                )}
                {canEditOrg && (
                  <View style={styles.coverEdit}>
                    {uploadingBanner ? <ActivityIndicator color="#fff" size="small" /> : (
                      <><Icon name="camera-outline" size={14} color="#fff" /><Text style={styles.coverEditText}>Edit cover</Text></>
                    )}
                  </View>
                )}
              </TouchableOpacity>

              <View style={styles.headerBody}>
                <TouchableOpacity
                  onPress={canEditOrg ? pickLogo : undefined}
                  activeOpacity={canEditOrg ? 0.85 : 1}
                  style={[styles.logoWrap, { width: logoSize, height: logoSize, marginTop: -logoSize / 2 }]}
                  accessibilityLabel={canEditOrg ? 'Change logo' : undefined}
                >
                  <Avatar name={org.org_name} url={org.logo_url} size={logoSize - 8} tone="emerald" square />
                  {canEditOrg && (
                    <View style={styles.logoEdit}>
                      {uploadingLogo ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="camera-outline" size={14} color="#fff" />}
                    </View>
                  )}
                </TouchableOpacity>

                <View style={styles.headerRow}>
                  <View style={styles.headerInfo}>
                    <View style={styles.nameRow}>
                      <Text style={styles.orgName}>{org.org_name}</Text>
                      {org.is_verified && (
                        <View style={styles.verified}>
                          <Icon name="checkmark-circle" size={14} color={C.emerald} />
                          <Text style={styles.verifiedText}>Verified by Siqa</Text>
                        </View>
                      )}
                    </View>
                    {org.tagline || org.mission ? <Text style={styles.tagline} numberOfLines={3}>{org.tagline || org.mission}</Text> : null}
                    <Text style={styles.meta}>
                      {[location, org.org_type, org.ein_verified ? 'EIN verified' : null].filter(Boolean).join(' · ')}
                    </Text>
                    <Text style={styles.meta}>
                      <Text style={styles.metaStrong}>{money(totals.raised)}</Text> raised · <Text style={styles.metaStrong}>{totals.donors.toLocaleString()}</Text> donors · <Text style={styles.metaStrong}>{fundraisers.length}</Text> active seed{fundraisers.length === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <View style={[styles.actions, !wide && { width: '100%' }]}>
                    {/* One gold button per row: with a Seed to give to, Donate is the gold one. */}
                    {/* Phones: three labelled buttons don't fit one row (Android
                        Chrome renders text a bit larger and cut them to "We…" /
                        "Don…"), so Website becomes a round icon button there and
                        Follow/Donate drop their icons to keep full labels. */}
                    <Button size="md" variant={following || fundraisers[0] ? 'secondary' : 'gold'} icon={wide ? (following ? 'checkmark' : 'add') : undefined} label={following ? 'Following' : 'Follow'} onPress={toggleFollow} grow={!wide} />
                    {fundraisers[0] ? (
                      <Button size="md" variant="gold" icon={wide ? 'leaf-outline' : undefined} label="Donate" onPress={() => router.push({ pathname: '/seed/[id]', params: { id: fundraisers[0].id } } as any)} grow={!wide} />
                    ) : null}
                    {org.website ? (
                      wide ? (
                        <Button size="md" variant="secondary" label="Website" iconRight="open-outline" onPress={() => Linking.openURL(org.website!)} />
                      ) : (
                        <IconButton icon="globe-outline" label="Website" variant="raised" onPress={() => Linking.openURL(org.website!)} style={{ borderWidth: 1, borderColor: C.border }} />
                      )
                    ) : null}
                  </View>
                </View>
              </View>

              {canEditOrg && (
                <View style={styles.ownerBar}>
                  <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
                    <Text style={styles.ownerTitle}>You manage this page</Text>
                    <Text style={styles.ownerSub}>
                      {!org.is_verified
                        ? 'Seeds can be saved as drafts until Siqa verifies your organization.'
                        : !paymentReady
                        ? 'Set up payments so donors can give to your seeds.'
                        : 'Start a seed and invite verified speakers to endorse it.'}
                    </Text>
                  </View>
                  {!paymentReady && (
                    <TouchableOpacity onPress={() => setActiveTab('about')} style={[styles.actionBtn, styles.actionBtnGhost]}>
                      <Text style={[styles.actionText, { color: C.text }]}>Payment setup</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/seed-create', params: { orgId: org.id } } as any)}
                    style={[styles.actionBtn, styles.actionBtnGold]}
                  >
                    <Icon name="add" size={18} color={C.black} />
                    <Text style={[styles.actionText, { color: C.black }]}>Start a seed</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.tabsWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
                {tabs.map(t => (
                  <TouchableOpacity
                    key={t.key}
                    onPress={() => setActiveTab(t.key)}
                    style={[styles.tab, activeTab === t.key && styles.tabOn]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: activeTab === t.key }}
                  >
                    <Text style={[styles.tabText, activeTab === t.key && styles.tabTextOn]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              </View>
            </View>

            {renderTab()}
            <View style={{ height: 48 }} />
          </View>
        </ScrollView>

        {/* Alternative payment sheet */}
        <Modal visible={altPayModalVisible} transparent animationType="slide" onRequestClose={() => setAltPayModalVisible(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setAltPayModalVisible(false)}>
            <TouchableOpacity activeOpacity={1} style={styles.altPaySheet}>
              <Text style={styles.sheetTitle}>Alternative payment setup</Text>
              <Text style={styles.muted}>Donors see a "Donate externally" button that opens your page. No money flows through Siqa for these donations.</Text>
              <Text style={styles.label}>Platform</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['zeffy', 'paypal', 'other'] as const).map(p => (
                  <TouchableOpacity key={p} style={[styles.segment, altPayType === p && styles.segmentOn]} onPress={() => setAltPayType(p)}>
                    <Text style={[styles.segmentText, altPayType === p && styles.segmentTextOn]}>{p === 'zeffy' ? 'Zeffy' : p === 'paypal' ? 'PayPal' : 'Other'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>Donation page URL</Text>
              <TextInput style={styles.input} value={altPayUrl} onChangeText={setAltPayUrl} placeholder="https://www.zeffy.com/..." placeholderTextColor={C.text3} autoCapitalize="none" keyboardType="url" />
              <Text style={styles.label}>Button label (optional)</Text>
              <TextInput style={styles.input} value={altPayLabel} onChangeText={setAltPayLabel} placeholder="e.g. Donate via Zeffy" placeholderTextColor={C.text3} />
              <PrimaryButton label="Save payment setup" onPress={saveAltPayment} busy={savingAltPay} style={{ marginTop: 8 }} />
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

// ── Pieces ─────────────────────────────────────────────────────────────

function SeedRow({ fr, endorsed, horizontal }: { fr: Fundraiser; endorsed: number; horizontal: boolean }) {
  const { colors: C } = useTheme();
  const pct = fr.goal_amount ? Math.min(100, Math.round((fr.raised_amount / fr.goal_amount) * 100)) : 0;
  // No cover photo but a YouTube video → use the video's thumbnail.
  const ytId = seedYouTubeId(fr.video_url);
  const cover = fr.cover_image_url || fr.image_url || (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null);
  const left = daysLeft(fr.end_date);
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => router.push({ pathname: '/seed/[id]', params: { id: fr.id } } as any)}
      accessibilityRole="link"
      style={{
        flexDirection: horizontal ? 'row' : 'column', gap: horizontal ? 14 : 0, borderWidth: 1, borderColor: C.border2,
        borderRadius: 14, overflow: 'hidden', padding: horizontal ? 10 : 0, backgroundColor: C.bg,
      }}
    >
      <View style={{
        width: horizontal ? 168 : '100%', aspectRatio: horizontal ? 3 / 2 : 16 / 9, borderRadius: horizontal ? 10 : 0,
        overflow: 'hidden', backgroundColor: C.emeraldSoft, justifyContent: 'flex-end', padding: 8,
      }}>
        {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
        {fr.cause_category ? (
          <View style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: '#fff', fontSize: 11, ...font(700) }}>{fr.cause_category}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 8, padding: horizontal ? 2 : 14, minWidth: 0 }}>
        <Text style={{ color: C.text, fontSize: 16, ...font(700), lineHeight: 21 }} numberOfLines={2}>{fr.title}</Text>
        <ProgressBar pct={pct} />
        <Text style={{ color: C.text2, fontSize: 13 }}>
          <Text style={{ color: C.text, ...font(700) }}>{money(fr.raised_amount)}</Text> raised of {money(fr.goal_amount)}
          {left !== null ? ` · ${left} day${left === 1 ? '' : 's'} left` : ''}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {endorsed > 0 && (
            <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
              <Icon name="star" size={13} color={C.gold} />
              <Text style={{ color: C.goldDim, fontSize: 13, ...font(600) }}>Endorsed by {endorsed} speaker{endorsed === 1 ? '' : 's'}</Text>
            </View>
          )}
          {fr.zakat_eligible ? <Text style={{ color: C.emerald, fontSize: 13, ...font(600) }}>Zakat eligible</Text> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function OrgEndorsementRow({ e, mine, onRemove }: { e: OrgEndorsement; mine: boolean; onRemove: () => void }) {
  const { colors: C } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <TouchableOpacity onPress={() => router.push(`/speaker/${e.speaker_id}` as any)}>
        <Avatar name={e.speakers?.display_name} url={e.speakers?.avatar_url} size={40} />
      </TouchableOpacity>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ color: C.text, fontSize: 15, ...font(700), flexShrink: 1 }} numberOfLines={1}>{e.speakers?.display_name || 'A Siqa speaker'}</Text>
          <Icon name="checkmark-circle" size={14} color={C.emerald} />
        </View>
        <Text style={{ color: C.text2, fontSize: 12 }}>Endorses this organization</Text>
        {e.message ? <Text style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>“{e.message}”</Text> : null}
        {mine && (
          <TouchableOpacity onPress={onRemove} style={{ alignSelf: 'flex-start', paddingVertical: 6 }}>
            <Text style={{ color: C.danger, fontSize: 13, ...font(600) }}>Remove</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function MetaLine({ icon, text, link }: { icon: GlyphName; text: string; link?: boolean }) {
  const { colors: C } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Icon name={icon as any} size={16} color={C.text2} />
      <Text style={{ color: link ? C.emerald : C.text, fontSize: 14, flexShrink: 1, fontWeight: link ? '600' : '400' }}>{text}</Text>
    </View>
  );
}

function TrustItem({ done, label }: { done: boolean; label: string }) {
  const { colors: C } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Icon name={done ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={done ? C.emerald : C.text3} />
      <Text style={{ color: done ? C.text : C.text2, fontSize: 14, flexShrink: 1 }}>{label}</Text>
    </View>
  );
}

function makeStyles(C: AppColors, cols: number) {
  const wide = cols > 1;
  return StyleSheet.create(brandStyles({
    container: { flex: 1, backgroundColor: C.bg2 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, gap: 8 },

    topBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingTop: Platform.OS === 'web' ? 10 : 54, paddingBottom: 8, paddingHorizontal: 12,
      backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.border2,
    },
    iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    topTitle: { flex: 1, color: C.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },

    page: { width: '100%', maxWidth: 1200, alignSelf: 'center', paddingHorizontal: wide ? 20 : 0, paddingTop: wide ? 16 : 0, gap: 16 },
    stack: { gap: 16, paddingHorizontal: wide ? 0 : 12 },
    row: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
    colLeft: { width: 290 },
    colMain: { flex: 1, minWidth: 0 },
    colSide: { width: cols === 3 ? 320 : 330 },

    headerCard: { backgroundColor: C.surface, borderRadius: wide ? 18 : 0, borderWidth: wide ? 1 : 0, borderBottomWidth: 1, borderColor: C.border2, overflow: 'hidden' },
    cover: { width: '100%', backgroundColor: C.emerald, overflow: 'hidden' },
    coverEdit: { position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, minHeight: 36, borderRadius: 999 },
    coverEditText: { color: '#fff', fontSize: 13, fontWeight: '600' },
    headerBody: { paddingHorizontal: wide ? 28 : 16, paddingBottom: 18 },
    logoWrap: { borderRadius: 26, backgroundColor: C.surface, borderWidth: 4, borderColor: C.surface, alignItems: 'center', justifyContent: 'center' },
    logoEdit: { position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.surface },
    headerRow: { flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'flex-end' : 'stretch', gap: 16, marginTop: 12 },
    headerInfo: { flex: wide ? 1 : undefined, gap: 6, minWidth: 0 },
    nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
    orgName: { color: C.text, fontSize: wide ? 28 : 23, fontWeight: '800', letterSpacing: -0.4 },
    verified: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.emeraldBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    verifiedText: { color: C.emerald, fontSize: 12, fontWeight: '700' },
    tagline: { color: C.text, fontSize: 16, lineHeight: 23 },
    meta: { color: C.text2, fontSize: 14, lineHeight: 20 },
    metaStrong: { color: C.text, fontWeight: '700' },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    actionBtn: { minHeight: 44, paddingHorizontal: 18, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    actionBtnOutline: { borderWidth: 1, borderColor: C.emerald },
    actionBtnOn: { borderWidth: 1, borderColor: C.emerald, backgroundColor: C.emeraldBg },
    actionBtnGhost: { borderWidth: 1, borderColor: C.border },
    actionBtnGold: { backgroundColor: C.gold },
    actionText: { fontSize: 14, fontWeight: '700' },

    ownerBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginHorizontal: wide ? 28 : 16, marginBottom: 16, padding: 14, borderRadius: 12, backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.goldSoft },
    ownerTitle: { color: C.text, fontSize: 14, fontWeight: '800' },
    ownerSub: { color: C.text2, fontSize: 13, lineHeight: 18 },

    tabsWrap: { borderTopWidth: 1, borderTopColor: C.border2 },
    tabs: { paddingHorizontal: wide ? 20 : 8, gap: 2 },
    tab: { minHeight: 48, paddingHorizontal: 12, justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
    tabOn: { borderBottomColor: C.emerald },
    tabText: { color: C.text2, fontSize: 14, fontWeight: '600' },
    tabTextOn: { color: C.emerald },

    body: { color: C.text, fontSize: 15, lineHeight: 23 },
    muted: { color: C.text2, fontSize: 14, lineHeight: 20 },
    link: { color: C.emerald, fontSize: 14, fontWeight: '700' },
    smallLink: { color: C.emerald, fontSize: 13, fontWeight: '600', marginLeft: 50 },
    danger: { color: C.danger, fontSize: 13, fontWeight: '600' },
    textBtn: { minHeight: 36, justifyContent: 'center' },
    rowTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
    label: { color: C.text, fontSize: 14, fontWeight: '700', marginTop: 8 },
    input: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontSize: 15 },
    divider: { height: 1, backgroundColor: C.border2 },

    trustNum: { fontSize: 32, fontWeight: '800' },
    trustLabel: { color: C.text2, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },

    serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    serviceIconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.emeraldBg, alignItems: 'center', justifyContent: 'center' },
    photoPick: { height: 140, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: C.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    segment: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
    segmentOn: { borderColor: C.emerald, backgroundColor: C.emeraldBg },
    segmentText: { color: C.text2, fontWeight: '600', fontSize: 14 },
    segmentTextOn: { color: C.emerald },
    projectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    projectCard: { flexGrow: 1, flexBasis: 240, borderRadius: 12, borderWidth: 1, borderColor: C.border2, overflow: 'hidden', backgroundColor: C.bg },
    projectImage: { width: '100%', aspectRatio: 16 / 9, backgroundColor: C.surface2 },
    pill: { alignSelf: 'flex-start', color: C.goldDim, backgroundColor: C.goldBg, fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
    docRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border2 },
    payRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', alignItems: 'center' },
    altPaySheet: { width: '100%', maxWidth: 560, backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 10 },
    sheetTitle: { color: C.text, fontSize: 19, fontWeight: '800' },
  }));
}

export default focusedOnly(OrgProfileScreen);
