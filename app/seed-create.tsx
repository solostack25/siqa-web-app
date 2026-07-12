import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { makeBunnySeedThumbnailPath, makeBunnySeedVideoPath, uploadThumbnailToBunny, uploadVideoToBunny } from '../lib/bunnyUpload';
import { useTheme, type AppColors } from '../lib/theme';
// expo-haptics is native-only — no-op on web
const Haptics = Platform.OS !== 'web' ? require('expo-haptics') : { notificationAsync: () => {} };

const DRAFT_KEY = 'siqa:seeds:create-draft:v1';
const CATEGORIES = ['Emergency', 'Water', 'Education', 'Medical', 'Masjid', 'Food', 'Zakat', 'Sadaqah', 'Refugees', 'Community'];

const DEFAULT_FORM = {
  title: '',
  subtitle: '',
  story: '',
  goal: '',
  category: 'Emergency',
  endDate: '',
  zakatEligible: false,
  sadaqahJariyah: true,
  emergency: false,
  visibility: 'draft' as 'draft' | 'submit',
};

type OrgOption = {
  id: string;
  org_name: string;
  is_verified?: boolean | null;
  approval_status?: string | null;
  stripe_onboarded?: boolean | null;
};

type PickedImage = {
  uri: string;
  fileName: string;
  mimeType: string | null;
};

type PickedVideo = {
  uri: string;
  fileName: string;
  mimeType: string | null;
  duration?: number | null;
};

type DraftPayload = typeof DEFAULT_FORM & {
  selectedOrgId: string | null;
  cover: PickedImage | null;
  video: PickedVideo | null;
};

function centsFromGoal(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

function isPrivilegedRole(role?: string | null) {
  return ['admin', 'owner', 'moderator', 'super_admin'].includes(String(role || '').toLowerCase());
}

function isOrgRole(role?: string | null) {
  return ['org', 'organization', 'nonprofit', 'masjid'].includes(String(role || '').toLowerCase());
}

export default function SeedCreateScreen() {
  const { colors: C, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const successScale = useRef(new Animated.Value(0.88)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [success, setSuccess] = useState(false);

  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [cover, setCover] = useState<PickedImage | null>(null);
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);

  const selectedOrg = orgs.find((org) => org.id === selectedOrgId) || null;
  const canSubmitActive = Boolean(selectedOrg?.is_verified || isPrivilegedRole(profileRole));

  useEffect(() => {
    loadAccess();
    restoreDraft();
  }, []);

  useEffect(() => {
    if (!draftLoaded || saving || success) return;
    const timeout = setTimeout(() => saveDraft(false), 700);
    return () => clearTimeout(timeout);
  }, [form, selectedOrgId, cover, video, draftLoaded, saving, success]);

  function update<K extends keyof typeof DEFAULT_FORM>(key: K, value: (typeof DEFAULT_FORM)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function loadAccess() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      router.replace('/(auth)/login');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .single();

    const role = profile?.role || null;
    setProfileRole(role);

    if (isPrivilegedRole(role)) {
      const { data } = await supabase
        .from('organizations')
        .select('id, org_name, is_verified, approval_status, stripe_onboarded')
        .order('org_name');
      const list = (data || []) as OrgOption[];
      setOrgs(list);
      setSelectedOrgId((current) => current || list[0]?.id || null);
    } else {
      const { data } = await supabase
        .from('organizations')
        .select('id, org_name, is_verified, approval_status, stripe_onboarded')
        .eq('profile_id', user.id)
        .order('created_at', { ascending: false });
      const list = (data || []) as OrgOption[];
      setOrgs(list);
      setSelectedOrgId((current) => current || list[0]?.id || null);
    }

    setLoading(false);
  }

  async function restoreDraft() {
    try {
      const raw = await AsyncStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as DraftPayload;
        setForm({ ...DEFAULT_FORM, ...draft });
        setSelectedOrgId(draft.selectedOrgId || null);
        setCover(draft.cover || null);
        setVideo(draft.video || null);
      }
    } catch (error) {
      console.warn('[SeedCreate] Could not restore draft', error);
    } finally {
      setDraftLoaded(true);
    }
  }

  async function saveDraft(showToast = true) {
    try {
      setSavingDraft(true);
      const payload: DraftPayload = { ...form, selectedOrgId, cover, video };
      await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      if (showToast) Alert.alert('Seed draft saved', 'Your Seed appeal is saved on this device.');
    } catch (error) {
      if (showToast) Alert.alert('Draft not saved', 'Something went wrong while saving this Seed draft.');
    } finally {
      setSavingDraft(false);
    }
  }

  async function discardDraft() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert('Discard Seed draft?', 'This clears the saved Seed draft on this device.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem(DRAFT_KEY);
          setForm(DEFAULT_FORM);
          setCover(null);
          setVideo(null);
        },
      },
    ]);
  }

  async function pickVideo() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow Siqa to access your videos to upload a Seed appeal.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 1,
        videoMaxDuration: 600,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setVideo({
        uri: asset.uri,
        fileName: asset.fileName || `siqa-seed-appeal-${Date.now()}.mp4`,
        mimeType: asset.mimeType || 'video/mp4',
        duration: asset.duration || null,
      });
    } catch (error) {
      Alert.alert('Could not open video', 'Choose a video downloaded to this device and make sure Siqa has full Photos access.');
    }
  }

  async function pickCover() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow Siqa to access your photos to choose a Seed cover.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.88,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setCover({
        uri: asset.uri,
        fileName: asset.fileName || `siqa-seed-cover-${Date.now()}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
      });
    } catch (error) {
      Alert.alert('Could not open photo', 'Choose a photo downloaded to this device and make sure Siqa has full Photos access.');
    }
  }

  function validate() {
    if (!selectedOrgId) return 'Choose the nonprofit/masjid posting this Seed.';
    if (!video?.uri) return 'Every Seed needs a video appeal. Choose a short appeal video before publishing.';
    if (!form.title.trim()) return 'Seed title is required.';
    if (form.title.trim().length < 8) return 'Use a more descriptive Seed title.';
    if (!form.story.trim() || form.story.trim().length < 30) return 'Add a stronger appeal story so donors understand the need.';
    if (!centsFromGoal(form.goal)) return 'Enter a valid fundraising goal.';
    if (form.visibility === 'submit' && !canSubmitActive) {
      return 'This organization must be verified before publishing active Seeds. Save as draft for now.';
    }
    return null;
  }

  function animateSuccess() {
    setSuccess(true);
    successScale.setValue(0.88);
    successOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(successOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(successScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
    ]).start();
  }

  async function createSeed() {
    if (saving) return;
    const error = validate();
    if (error) {
      Alert.alert('Review Seed', error);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace('/(auth)/login');
      return;
    }

    setSaving(true);
    setProgressPct(5);
    setProgressLabel('Preparing Seed...');

    try {
      let videoUrl: string | null = null;
      let coverUrl: string | null = null;

      if (video) {
        const videoPath = makeBunnySeedVideoPath(user.id, video.fileName, video.mimeType);
        videoUrl = await uploadVideoToBunny({
          uri: video.uri,
          fileName: videoPath,
          mimeType: video.mimeType,
          progressStart: 6,
          progressEnd: 72,
          label: 'Uploading Seed video appeal...',
          onProgress: ({ pct, label }) => {
            setProgressPct(pct);
            setProgressLabel(label);
          },
        });
      }

      if (cover) {
        const coverPath = makeBunnySeedThumbnailPath(user.id, cover.fileName, cover.mimeType);
        coverUrl = await uploadThumbnailToBunny({
          uri: cover.uri,
          fileName: coverPath,
          mimeType: cover.mimeType,
          progressStart: 73,
          progressEnd: 86,
          onProgress: ({ pct, label }) => {
            setProgressPct(pct);
            setProgressLabel(label);
          },
        });
      }

      setProgressPct(90);
      setProgressLabel('Saving Seed appeal...');

      const submitted = form.visibility === 'submit';
      const status = submitted && canSubmitActive ? 'active' : 'draft';
      const cleanStory = form.story.trim();
      const goalAmount = centsFromGoal(form.goal);

      const payload: Record<string, any> = {
        org_id: selectedOrgId,
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        description: cleanStory,
        story: cleanStory,
        goal_amount: goalAmount,
        raised_amount: 0,
        donor_count: 0,
        cause_category: form.category,
        status,
        cover_image_url: coverUrl,
        image_url: coverUrl,
        video_url: videoUrl,
        bunny_video_url: videoUrl,
        media_url: videoUrl,
        media_type: 'video',
        end_date: form.endDate.trim() || null,
        zakat_eligible: form.zakatEligible,
        sadaqah_jariyah: form.sadaqahJariyah,
        is_emergency: form.emergency,
        created_by: user.id,
        submitted_at: submitted ? new Date().toISOString() : null,
      };

      let insert = await supabase.from('fundraisers').insert(payload as any).select('id').single();

      if (insert.error && /subtitle|story|cover_image_url|image_url|video_url|bunny_video_url|media_url|media_type|zakat_eligible|sadaqah_jariyah|is_emergency|created_by|submitted_at/i.test(insert.error.message)) {
        const {
          subtitle,
          story,
          cover_image_url,
          image_url,
          video_url,
          bunny_video_url,
          media_url,
          media_type,
          zakat_eligible,
          sadaqah_jariyah,
          is_emergency,
          created_by,
          submitted_at,
          ...fallbackPayload
        } = payload;
        insert = await supabase.from('fundraisers').insert(fallbackPayload as any).select('id').single();
      }

      if (insert.error) throw insert.error;

      await AsyncStorage.removeItem(DRAFT_KEY);
      setProgressPct(100);
      setProgressLabel(status === 'active' ? 'Seed published.' : 'Seed saved as draft.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      animateSuccess();
      setTimeout(() => router.replace('/(tabs)/seeds'), 950);
    } catch (error: any) {
      console.error('[SeedCreate] create failed:', error);
      Alert.alert('Seed not created', error?.message || 'Something went wrong while creating this Seed.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={C.gold} size="large" />
      </View>
    );
  }

  const allowed = isPrivilegedRole(profileRole) || isOrgRole(profileRole) || orgs.length > 0;

  if (!allowed) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.cancel}>Back</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Create Seed</Text>
            <Text style={styles.headerArabic}>صِقا</Text>
          </View>
          <View style={{ width: 56 }} />
        </View>
        <View style={styles.lockedWrap}>
          <Text style={styles.lockedIcon}>🌱</Text>
          <Text style={styles.lockedTitle}>Nonprofit access required</Text>
          <Text style={styles.lockedSub}>Seeds can only be created by verified or pending nonprofits, masajid, and admins.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/org-register' as any)}>
            <Text style={styles.primaryBtnText}>Register Organization</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} disabled={saving}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>New Seed</Text>
          <Text style={styles.headerArabic}>صِقا</Text>
        </View>
        <TouchableOpacity onPress={createSeed} disabled={saving} style={[styles.postBtn, saving && styles.postBtnDisabled]}>
          <Text style={styles.postBtnText}>{saving ? 'Saving' : form.visibility === 'submit' ? 'Publish' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.draftRow}>
          <TouchableOpacity style={styles.draftBtn} onPress={() => saveDraft(true)} disabled={saving || savingDraft}>
            <Text style={styles.draftBtnText}>{savingDraft ? 'Saving...' : 'Save Draft'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.draftBtnGhost} onPress={discardDraft} disabled={saving}>
            <Text style={styles.draftBtnGhostText}>Discard</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.coverBox} onPress={pickVideo} disabled={saving} activeOpacity={0.86}>
          <View style={styles.coverScrim} />
          <Text style={styles.coverIcon}>{video ? '▶' : '＋'}</Text>
          <Text style={styles.coverTitle}>{video ? 'Seed video selected' : 'Upload Seed video appeal'}</Text>
          <Text style={styles.coverSub}>{video ? video.fileName : 'Every Seed is a video-first appeal with a donation layer.'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.coverBox, styles.thumbnailBox]} onPress={pickCover} disabled={saving} activeOpacity={0.86}>
          {cover ? <Image source={{ uri: cover.uri }} style={styles.coverImage} /> : null}
          <View style={styles.coverScrim} />
          <Text style={styles.coverIcon}>{cover ? '✓' : '＋'}</Text>
          <Text style={styles.coverTitle}>{cover ? 'Thumbnail selected' : 'Optional thumbnail'}</Text>
          <Text style={styles.coverSub}>Choose a calm cover image for the Seed card, or let the video lead.</Text>
        </TouchableOpacity>

        {saving && (
          <View style={styles.progressBox}>
            <View style={styles.progressTop}>
              <Text style={styles.progressPct}>{progressPct}%</Text>
              <Text style={styles.progressLabel}>{progressLabel}</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
            </View>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.label}>Organization</Text>
          {orgs.length === 0 ? (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeTitle}>No organization connected</Text>
              <Text style={styles.noticeText}>Register a nonprofit or masjid before creating Seeds.</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
              {orgs.map((org) => (
                <TouchableOpacity
                  key={org.id}
                  style={[styles.pill, selectedOrgId === org.id && styles.pillActive]}
                  onPress={() => setSelectedOrgId(org.id)}
                  disabled={saving}
                >
                  <Text style={[styles.pillText, selectedOrgId === org.id && styles.pillTextActive]}>{org.org_name}</Text>
                  <Text style={styles.pillMeta}>{org.is_verified ? 'Verified' : org.approval_status || 'Pending'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Seed title</Text>
          <TextInput
            style={styles.input}
            value={form.title}
            onChangeText={(value) => update('title', value)}
            placeholder="Emergency rent support for families"
            placeholderTextColor={C.text3}
            maxLength={90}
            editable={!saving}
          />
          <Text style={styles.helper}>Make this donor-facing and specific.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Short subtitle</Text>
          <TextInput
            style={styles.input}
            value={form.subtitle}
            onChangeText={(value) => update('subtitle', value)}
            placeholder="Help plant lasting relief for local families"
            placeholderTextColor={C.text3}
            maxLength={130}
            editable={!saving}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Appeal story</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={form.story}
            onChangeText={(value) => update('story', value)}
            placeholder="Explain the need, who benefits, how funds are used, and why this Seed matters."
            placeholderTextColor={C.text3}
            multiline
            textAlignVertical="top"
            editable={!saving}
          />
        </View>

        <View style={styles.twoCol}>
          <View style={[styles.card, styles.halfCard]}>
            <Text style={styles.label}>Goal</Text>
            <TextInput
              style={styles.input}
              value={form.goal}
              onChangeText={(value) => update('goal', value)}
              placeholder="5000"
              placeholderTextColor={C.text3}
              keyboardType="decimal-pad"
              editable={!saving}
            />
          </View>
          <View style={[styles.card, styles.halfCard]}>
            <Text style={styles.label}>End date</Text>
            <TextInput
              style={styles.input}
              value={form.endDate}
              onChangeText={(value) => update('endDate', value)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={C.text3}
              editable={!saving}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.topicPill, form.category === cat && styles.topicPillActive]}
                onPress={() => update('category', cat)}
                disabled={saving}
              >
                <Text style={[styles.topicText, form.category === cat && styles.topicTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.switchTitle}>Sadaqah Jariyah Seed</Text>
              <Text style={styles.switchSub}>Use this for appeals with ongoing benefit.</Text>
            </View>
            <Switch value={form.sadaqahJariyah} onValueChange={(value) => update('sadaqahJariyah', value)} disabled={saving} />
          </View>
          <View style={styles.divider} />
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.switchTitle}>Zakat eligible</Text>
              <Text style={styles.switchSub}>Only enable if your organization has reviewed eligibility.</Text>
            </View>
            <Switch value={form.zakatEligible} onValueChange={(value) => update('zakatEligible', value)} disabled={saving} />
          </View>
          <View style={styles.divider} />
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.switchTitle}>Emergency appeal</Text>
              <Text style={styles.switchSub}>Highlights this Seed as urgent.</Text>
            </View>
            <Switch value={form.emergency} onValueChange={(value) => update('emergency', value)} disabled={saving} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Publishing</Text>
          <View style={styles.segment}>
            <TouchableOpacity style={[styles.segmentBtn, form.visibility === 'draft' && styles.segmentBtnActive]} onPress={() => update('visibility', 'draft')}>
              <Text style={[styles.segmentText, form.visibility === 'draft' && styles.segmentTextActive]}>Draft</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.segmentBtn, form.visibility === 'submit' && styles.segmentBtnActive]} onPress={() => update('visibility', 'submit')}>
              <Text style={[styles.segmentText, form.visibility === 'submit' && styles.segmentTextActive]}>{canSubmitActive ? 'Publish' : 'Submit'}</Text>
            </TouchableOpacity>
          </View>
          {!canSubmitActive && (
            <Text style={styles.helper}>Unverified organizations can save drafts now. Admin approval should publish Seeds later.</Text>
          )}
        </View>
      </ScrollView>

      {success && (
        <View style={styles.successOverlay} pointerEvents="none">
          <Animated.View style={[styles.successCard, { opacity: successOpacity, transform: [{ scale: successScale }] }]}>
            <Text style={styles.successIcon}>🌱</Text>
            <Text style={styles.successTitle}>{form.visibility === 'submit' && canSubmitActive ? 'Seed published' : 'Seed saved'}</Text>
            <Text style={styles.successText}>Your appeal is ready in Siqa.</Text>
          </Animated.View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function makeStyles(C: AppColors, isDark: boolean) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
    header: {
      paddingTop: 54,
      paddingHorizontal: 18,
      paddingBottom: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 0.5,
      borderBottomColor: C.border2,
      backgroundColor: C.bg,
    },
    cancel: { color: C.text2, fontSize: 14, fontWeight: '600', minWidth: 56 },
    headerTitleWrap: { alignItems: 'center' },
    headerTitle: { color: C.text, fontSize: 16, fontWeight: '800' },
    headerArabic: { color: C.gold, fontSize: 14, marginTop: 1 },
    postBtn: { backgroundColor: C.gold, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 },
    postBtnDisabled: { opacity: 0.62 },
    postBtnText: { color: C.black, fontSize: 13, fontWeight: '900' },
    content: { padding: 18, paddingBottom: 120, gap: 14 },
    draftRow: { flexDirection: 'row', gap: 10 },
    draftBtn: { flex: 1, backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.goldDim, borderRadius: 14, padding: 12, alignItems: 'center' },
    draftBtnText: { color: C.gold, fontWeight: '800' },
    draftBtnGhost: { flex: 1, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2, borderRadius: 14, padding: 12, alignItems: 'center' },
    draftBtnGhostText: { color: C.text2, fontWeight: '700' },
    coverBox: { height: 210, borderRadius: 24, overflow: 'hidden', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border2, alignItems: 'center', justifyContent: 'center' },
    thumbnailBox: { height: 160 },
    coverImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
    coverScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: isDark ? 'rgba(0,0,0,0.42)' : 'rgba(255,255,255,0.16)' },
    coverIcon: { color: C.gold, fontSize: 42, fontWeight: '200' },
    coverTitle: { color: C.text, fontSize: 18, fontWeight: '900', marginTop: 4 },
    coverSub: { color: C.text2, fontSize: 12, marginTop: 5, textAlign: 'center', paddingHorizontal: 28 },
    progressBox: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 0.5, borderColor: C.border2, padding: 14 },
    progressTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, gap: 12 },
    progressPct: { color: C.gold, fontWeight: '900' },
    progressLabel: { color: C.text2, fontSize: 12, flex: 1, textAlign: 'right' },
    progressTrack: { height: 6, borderRadius: 999, backgroundColor: C.surface2, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 999, backgroundColor: C.gold },
    card: { backgroundColor: C.surface, borderRadius: 20, borderWidth: 0.5, borderColor: C.border2, padding: 15 },
    label: { color: C.text3, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 },
    input: { backgroundColor: C.bg, borderWidth: 0.5, borderColor: C.border2, borderRadius: 14, padding: 13, color: C.text, fontSize: 14 },
    textArea: { minHeight: 136, lineHeight: 20 },
    helper: { color: C.text3, fontSize: 11, marginTop: 8, lineHeight: 16 },
    twoCol: { flexDirection: 'row', gap: 10 },
    halfCard: { flex: 1 },
    pillRow: { gap: 8, paddingRight: 6 },
    pill: { minWidth: 150, backgroundColor: C.bg, borderRadius: 16, borderWidth: 0.5, borderColor: C.border2, paddingHorizontal: 13, paddingVertical: 11 },
    pillActive: { borderColor: C.goldDim, backgroundColor: C.goldBg },
    pillText: { color: C.text2, fontSize: 13, fontWeight: '800' },
    pillTextActive: { color: C.gold },
    pillMeta: { color: C.text3, fontSize: 10, marginTop: 3, textTransform: 'uppercase' },
    topicPill: { backgroundColor: C.bg, borderWidth: 0.5, borderColor: C.border2, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
    topicPillActive: { backgroundColor: C.gold, borderColor: C.gold },
    topicText: { color: C.text2, fontSize: 12, fontWeight: '800' },
    topicTextActive: { color: C.black },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
    switchCopy: { flex: 1 },
    switchTitle: { color: C.text, fontSize: 14, fontWeight: '800' },
    switchSub: { color: C.text3, fontSize: 11, marginTop: 3, lineHeight: 16 },
    divider: { height: 0.5, backgroundColor: C.border2, marginVertical: 13 },
    segment: { flexDirection: 'row', backgroundColor: C.bg, borderRadius: 14, borderWidth: 0.5, borderColor: C.border2, padding: 4 },
    segmentBtn: { flex: 1, borderRadius: 11, paddingVertical: 10, alignItems: 'center' },
    segmentBtnActive: { backgroundColor: C.gold },
    segmentText: { color: C.text3, fontWeight: '800', fontSize: 12 },
    segmentTextActive: { color: C.black },
    noticeBox: { backgroundColor: C.bg, borderRadius: 14, borderWidth: 0.5, borderColor: C.border2, padding: 14 },
    noticeTitle: { color: C.text, fontWeight: '800', marginBottom: 4 },
    noticeText: { color: C.text3, fontSize: 12, lineHeight: 18 },
    lockedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 },
    lockedIcon: { fontSize: 50, marginBottom: 12 },
    lockedTitle: { color: C.text, fontSize: 22, fontWeight: '900', marginBottom: 8, textAlign: 'center' },
    lockedSub: { color: C.text2, fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 22 },
    primaryBtn: { backgroundColor: C.gold, borderRadius: 16, paddingHorizontal: 24, paddingVertical: 14 },
    primaryBtnText: { color: C.black, fontWeight: '900' },
    successOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 28 },
    successCard: { width: '100%', backgroundColor: C.surface, borderRadius: 28, borderWidth: 1, borderColor: C.goldDim, padding: 28, alignItems: 'center' },
    successIcon: { fontSize: 48, marginBottom: 8 },
    successTitle: { color: C.text, fontSize: 21, fontWeight: '900', marginBottom: 5 },
    successText: { color: C.text2, fontSize: 13 },
  });
}