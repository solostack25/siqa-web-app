import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { makeBunnySeedThumbnailPath, makeBunnySeedVideoPath, uploadThumbnailToBunny, uploadVideoToBunny } from '../lib/bunnyUpload';
import { useTheme, type AppColors } from '../lib/theme';
import { Glyph } from '../components/Glyph';
import { Icon } from '../components/Icon';
import { showToast } from '../components/Toast';
import { DesktopShell } from '../components/DesktopShell';
import { BottomSheet, Button, Chip, IconButton, ListRow, OptionRow, SectionLabel, SegmentedControl, Switch as DSSwitch, TextField } from '../components/ui';
import { font, radius, space, type as T, useDS } from '../lib/ds';
import {
  Avatar,
  PrimaryButton,
  ProgressBar,
  SpeakerPicker,
  money,
  sendEndorsementRequests,
  useMeasuredWidth,
  type SpeakerLite,
} from '../components/SeedSocial';
import { brandStyles } from '../lib/ds';
import { goBack } from '../lib/goBack';
// expo-haptics is native-only — no-op on web
const Haptics = Platform.OS !== 'web' ? require('expo-haptics') : { notificationAsync: () => {} };

const DRAFT_KEY = 'siqa:seeds:create-draft:v1';
const CATEGORIES = ['Emergency', 'Water', 'Education', 'Medical', 'Masjid', 'Food', 'Zakat', 'Sadaqah', 'Refugees', 'Community'];
const STEPS = ['Basics', 'Story & media', 'Endorsements', 'Reviews & publish'] as const;

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
  allowReviews: true,
  allowAnonymousReviews: true,
  showEndorsementsOnDonate: true,
  reviewPrompt: 'What moved you to give today?',
  endorsementNote: '',
  invited: [] as SpeakerLite[],
};

type OrgOption = {
  id: string;
  org_name: string;
  is_verified?: boolean | null;
  approval_status?: string | null;
  stripe_onboarded?: boolean | null;
  logo_url?: string | null;
};

type PickedImage = { uri: string; fileName: string; mimeType: string | null };
type PickedVideo = { uri: string; fileName: string; mimeType: string | null; duration?: number | null };

type DraftPayload = typeof DEFAULT_FORM & {
  selectedOrgId: string | null;
  cover: PickedImage | null;
  video: PickedVideo | null;
};

function centsFromGoal(value: string) {
  const amount = Number(value.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

function isPrivilegedRole(role?: string | null) {
  return ['admin', 'owner', 'moderator', 'super_admin'].includes(String(role || '').toLowerCase());
}

function isOrgRole(role?: string | null) {
  return ['org', 'organization', 'nonprofit', 'masjid'].includes(String(role || '').toLowerCase());
}

function confirmWeb(title: string, onYes: () => void) {
  if (Platform.OS === 'web') { if (typeof window !== 'undefined' && window.confirm(title)) onYes(); return; }
  Alert.alert(title, undefined, [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: onYes }]);
}

export default function SeedCreateScreen() {
  return (
    <DesktopShell>
      <SeedCreateScreenContent />
    </DesktopShell>
  );
}

function SeedCreateScreenContent() {
  const { colors: C, isDark } = useTheme();
  const { orgId: orgParam } = useLocalSearchParams<{ orgId?: string }>();
  const { width, onLayout } = useMeasuredWidth();
  const wide = width >= 900;
  const styles = useMemo(() => makeStyles(C, isDark, wide), [C, isDark, wide]);
  const successScale = useRef(new Animated.Value(0.88)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [success, setSuccess] = useState<null | { live: boolean; id: string; requested: number }>(null);
  const [step, setStep] = useState(0);

  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [cover, setCover] = useState<PickedImage | null>(null);
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const ds = useDS();
  const [seedSheet, setSeedSheet] = useState<null | 'org' | 'cause' | 'ends'>(null);

  const selectedOrg = orgs.find(org => org.id === selectedOrgId) || null;
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  function update<K extends keyof typeof DEFAULT_FORM>(key: K, value: (typeof DEFAULT_FORM)[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function loadAccess() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      router.replace('/(auth)/login');
      return;
    }
    const { data: profile } = await supabase.from('profiles').select('id, role').eq('id', user.id).single();
    const role = profile?.role || null;
    setProfileRole(role);

    const base = supabase.from('organizations').select('id, org_name, is_verified, approval_status, stripe_onboarded, logo_url');
    const { data } = isPrivilegedRole(role)
      ? await base.order('org_name')
      : await base.eq('profile_id', user.id).order('created_at', { ascending: false });
    const list = (data || []) as OrgOption[];
    setOrgs(list);
    const fromParam = orgParam && list.some(o => o.id === orgParam) ? String(orgParam) : null;
    setSelectedOrgId(current => fromParam || current || list[0]?.id || null);
    setLoading(false);
  }

  async function restoreDraft() {
    try {
      const raw = await AsyncStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as DraftPayload;
        setForm({ ...DEFAULT_FORM, ...draft, invited: draft.invited || [] });
        if (!orgParam) setSelectedOrgId(draft.selectedOrgId || null);
        setCover(draft.cover || null);
        setVideo(draft.video || null);
      }
    } catch (error) {
      console.warn('[SeedCreate] Could not restore draft', error);
    } finally {
      setDraftLoaded(true);
    }
  }

  async function saveDraft(showFeedback = true) {
    try {
      const payload: DraftPayload = { ...form, selectedOrgId, cover, video };
      await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      if (showFeedback) showToast('Draft saved on this device');
    } catch {
      if (showFeedback) showToast("Draft couldn't be saved");
    }
  }

  function discardDraft() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    confirmWeb('Discard this Seed draft?', async () => {
      await AsyncStorage.removeItem(DRAFT_KEY);
      setForm(DEFAULT_FORM);
      setCover(null);
      setVideo(null);
      setStep(0);
    });
  }

  async function pickVideo() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { showToast('Allow Siqa to access your videos'); return; }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos, allowsEditing: false, quality: 1, videoMaxDuration: 600,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setVideo({
        uri: asset.uri,
        fileName: asset.fileName || `siqa-seed-appeal-${Date.now()}.mp4`,
        mimeType: asset.mimeType || 'video/mp4',
        duration: asset.duration || null,
      });
    } catch {
      showToast('Choose a video saved on this device');
    }
  }

  async function pickCover() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { showToast('Allow Siqa to access your photos'); return; }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [16, 9], quality: 0.88,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setCover({
        uri: asset.uri,
        fileName: asset.fileName || `siqa-seed-cover-${Date.now()}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
      });
    } catch {
      showToast('Choose a photo saved on this device');
    }
  }

  function stepError(s: number): string | null {
    if (s === 0) {
      if (!selectedOrgId) return 'Choose the nonprofit or masjid posting this Seed.';
      if (form.title.trim().length < 8) return 'Use a more descriptive Seed title (8+ characters).';
      if (!centsFromGoal(form.goal)) return 'Enter a valid fundraising goal.';
      if (form.endDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(form.endDate.trim())) return 'End date should look like 2026-12-31.';
    }
    if (s === 1) {
      if (!video?.uri) return 'Every Seed needs a short video appeal.';
      if (form.story.trim().length < 30) return 'Add a fuller story so donors understand the need.';
    }
    return null;
  }

  function validate() {
    for (let s = 0; s < STEPS.length; s++) {
      const err = stepError(s);
      if (err) return { err, step: s };
    }
    if (form.visibility === 'submit' && !canSubmitActive) {
      return { err: 'This organization must be verified before a Seed can go live. Save it as a draft for now.', step: 3 };
    }
    return null;
  }

  function next() {
    const err = stepError(step);
    if (err) { showToast(err); return; }
    setStep(s => Math.min(STEPS.length - 1, s + 1));
  }

  function animateSuccess() {
    successScale.setValue(0.88);
    successOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(successOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(successScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
    ]).start();
  }

  async function createSeed() {
    if (saving) return;
    const problem = validate();
    if (problem) { setStep(problem.step); showToast(problem.err); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/(auth)/login'); return; }

    setSaving(true);
    setProgressPct(5);
    setProgressLabel('Preparing Seed...');

    try {
      let videoUrl: string | null = null;
      let coverUrl: string | null = null;

      if (video) {
        videoUrl = await uploadVideoToBunny({
          uri: video.uri,
          fileName: makeBunnySeedVideoPath(user.id, video.fileName, video.mimeType),
          mimeType: video.mimeType,
          progressStart: 6,
          progressEnd: 72,
          label: 'Uploading Seed video appeal...',
          onProgress: ({ pct, label }) => { setProgressPct(pct); setProgressLabel(label); },
        });
      }
      if (cover) {
        coverUrl = await uploadThumbnailToBunny({
          uri: cover.uri,
          fileName: makeBunnySeedThumbnailPath(user.id, cover.fileName, cover.mimeType),
          mimeType: cover.mimeType,
          progressStart: 73,
          progressEnd: 86,
          onProgress: ({ pct, label }) => { setProgressPct(pct); setProgressLabel(label); },
        });
      }

      setProgressPct(90);
      setProgressLabel('Saving Seed...');

      const submitted = form.visibility === 'submit';
      const status = submitted && canSubmitActive ? 'active' : 'draft';
      const cleanStory = form.story.trim();

      const payload: Record<string, any> = {
        org_id: selectedOrgId,
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        description: cleanStory,
        story: cleanStory,
        goal_amount: centsFromGoal(form.goal),
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
        allow_reviews: form.allowReviews,
        allow_anonymous_reviews: form.allowAnonymousReviews,
        show_endorsements_on_donate: form.showEndorsementsOnDonate,
        review_prompt: form.reviewPrompt.trim() || null,
      };

      const { data: inserted, error } = await supabase.from('fundraisers').insert(payload as any).select('id').single();
      if (error) throw error;

      let requested = 0;
      if (form.invited.length) {
        setProgressPct(95);
        setProgressLabel('Sending endorsement requests...');
        const res = await sendEndorsementRequests(inserted.id, form.invited.map(s => s.id), form.endorsementNote);
        if (res.error) showToast("Seed saved, but endorsement requests didn't send. Try again from the Seed page.");
        else requested = form.invited.length;
      }

      await AsyncStorage.removeItem(DRAFT_KEY);
      setProgressPct(100);
      setProgressLabel(status === 'active' ? 'Seed published.' : 'Seed saved as draft.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccess({ live: status === 'active', id: inserted.id, requested });
      animateSuccess();
    } catch (error: any) {
      console.error('[SeedCreate] create failed:', error);
      showToast(error?.message || 'Something went wrong while creating this Seed.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color={C.gold} size="large" /></View>;
  }

  const allowed = isPrivilegedRole(profileRole) || isOrgRole(profileRole) || orgs.length > 0;

  if (!allowed) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => goBack('/seeds')} style={styles.headerBtn}><Text style={styles.headerLink}>Back</Text></TouchableOpacity>
          <Text style={styles.headerTitle}>Start a seed</Text>
          <View style={{ width: 64 }} />
        </View>
        <View style={styles.lockedWrap}>
          <Glyph name="leaf-outline" style={{ fontSize: 48, marginBottom: 12 }} color={C.gold} />
          <Text style={styles.lockedTitle}>Nonprofit access required</Text>
          <Text style={styles.lockedSub}>Seeds can be started by nonprofits and masajid registered on Siqa. Register yours and Siqa will review it.</Text>
          <PrimaryButton label="Register organization" onPress={() => router.push('/org-register' as any)} />
        </View>
      </View>
    );
  }

  if (success) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Animated.View style={[styles.successCard, { opacity: successOpacity, transform: [{ scale: successScale }] }]}>
          <View style={styles.successIcon}><Icon name="leaf" size={32} color={C.emerald} /></View>
          <Text style={styles.successTitle}>{success.live ? 'Your seed is live' : 'Seed saved as a draft'}</Text>
          <Text style={styles.successText}>
            {success.live
              ? 'It now appears on your profile and in the Seeds feed.'
              : canSubmitActive
              ? 'Publish it whenever you’re ready.'
              : 'It goes live once Siqa verifies your organization.'}
            {success.requested ? ` ${success.requested} speaker${success.requested === 1 ? ' has' : 's have'} been asked to endorse it.` : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <PrimaryButton label="View seed" onPress={() => router.replace({ pathname: '/seed/[id]', params: { id: success.id } } as any)} />
            {selectedOrgId ? (
              <PrimaryButton label="Back to profile" tone="ghost" onPress={() => router.replace({ pathname: '/org-profile', params: { id: selectedOrgId } } as any)} />
            ) : null}
          </View>
        </Animated.View>
      </View>
    );
  }

  const goalCents = centsFromGoal(form.goal);

  // ── Step bodies ────────────────────────────────────────────────────────

  const basics = (
    <>
      <StepHead title="The basics" sub="A seed is one focused campaign with a clear goal." />
      <Field label="Organization">
        {orgs.length === 0 ? (
          <View style={styles.notice}><Text style={styles.muted}>Register a nonprofit or masjid before starting a seed.</Text></View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {orgs.map(org => {
              const on = selectedOrgId === org.id;
              return (
                <TouchableOpacity key={org.id} style={[styles.orgPill, on && styles.orgPillOn]} onPress={() => setSelectedOrgId(org.id)} disabled={saving}>
                  <Avatar name={org.org_name} url={org.logo_url} size={32} tone="emerald" square />
                  <View>
                    <Text style={[styles.orgPillText, on && { color: C.emerald }]} numberOfLines={1}>{org.org_name}</Text>
                    <Text style={styles.orgPillMeta}>{org.is_verified ? 'Verified' : org.approval_status || 'Pending review'}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </Field>
      <Field label="Seed title" help="Donor-facing and specific — e.g. “Winter food boxes for 500 families”.">
        <TextInput style={styles.input} value={form.title} onChangeText={v => update('title', v)} placeholder="Winter food boxes for 500 families" placeholderTextColor={C.text3} maxLength={90} editable={!saving} />
      </Field>
      <Field label="Short subtitle (optional)">
        <TextInput style={styles.input} value={form.subtitle} onChangeText={v => update('subtitle', v)} placeholder="Help families get through the coldest months" placeholderTextColor={C.text3} maxLength={130} editable={!saving} />
      </Field>
      <View style={styles.twoCol}>
        <Field label="Goal (USD)" style={{ flex: 1, minWidth: 140 }}>
          <TextInput style={styles.input} value={form.goal} onChangeText={v => update('goal', v)} placeholder="25000" placeholderTextColor={C.text3} keyboardType="decimal-pad" editable={!saving} />
        </Field>
        <Field label="End date (optional)" style={{ flex: 1, minWidth: 140 }}>
          <TextInput style={styles.input} value={form.endDate} onChangeText={v => update('endDate', v)} placeholder="YYYY-MM-DD" placeholderTextColor={C.text3} editable={!saving} />
        </Field>
      </View>
      <Field label="Category">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity key={cat} style={[styles.chip, form.category === cat && styles.chipOn]} onPress={() => update('category', cat)} disabled={saving}>
              <Text style={[styles.chipText, form.category === cat && styles.chipTextOn]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Field>
      <View style={styles.box}>
        <ToggleRow title="Zakat eligible" sub="Only if your organization has confirmed the funds go to zakat-eligible recipients." value={form.zakatEligible} onChange={v => update('zakatEligible', v)} />
        <View style={styles.divider} />
        <ToggleRow title="Sadaqah jariyah" sub="For appeals with ongoing benefit." value={form.sadaqahJariyah} onChange={v => update('sadaqahJariyah', v)} />
        <View style={styles.divider} />
        <ToggleRow title="Emergency appeal" sub="Highlights this seed as urgent." value={form.emergency} onChange={v => update('emergency', v)} />
      </View>
    </>
  );

  const storyStep = (
    <>
      <StepHead title="Story & media" sub="Tell donors the need, what their money buys, and how you'll report back." />
      <TouchableOpacity style={styles.mediaBox} onPress={pickVideo} disabled={saving} activeOpacity={0.86}>
        <Icon name={video ? 'checkmark-circle' : 'videocam-outline'} size={32} color={video ? C.emerald : C.gold} />
        <Text style={styles.mediaTitle}>{video ? 'Video appeal selected' : 'Upload your video appeal'}</Text>
        <Text style={styles.mediaSub} numberOfLines={1}>{video ? video.fileName : 'Required — every Seed leads with a short video.'}</Text>
        {video ? <Text style={styles.link}>Change video</Text> : null}
      </TouchableOpacity>
      <TouchableOpacity style={[styles.mediaBox, { minHeight: 150 }]} onPress={pickCover} disabled={saving} activeOpacity={0.86}>
        {cover ? <Image source={{ uri: cover.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
        {cover ? <View style={styles.mediaScrim} /> : null}
        <Icon name="image-outline" size={28} color={cover ? '#fff' : C.gold} />
        <Text style={[styles.mediaTitle, cover && { color: '#fff' }]}>{cover ? 'Change cover photo' : 'Cover photo (optional)'}</Text>
        {!cover ? <Text style={styles.mediaSub}>Shown on the seed card. 16:9 works best.</Text> : null}
      </TouchableOpacity>
      <Field label="The story" help="Why this seed exists, who it helps, what the money buys, and how donors will hear back.">
        <TextInput
          style={[styles.input, { minHeight: 200, textAlignVertical: 'top', lineHeight: 22 }]}
          value={form.story}
          onChangeText={v => update('story', v)}
          placeholder="Explain the need, who benefits, how funds are used, and why this seed matters."
          placeholderTextColor={C.text3}
          multiline
          editable={!saving}
        />
      </Field>
    </>
  );

  const endorseStep = (
    <>
      <StepHead title="Request speaker endorsements" sub="Optional. Verified speakers get a request in Siqa and decide whether to endorse. You can't write or edit what they say." />
      {form.invited.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {form.invited.map(sp => (
            <TouchableOpacity key={sp.id} style={styles.invitedChip} onPress={() => update('invited', form.invited.filter(x => x.id !== sp.id))} accessibilityLabel={`Remove ${sp.display_name}`}>
              <Avatar name={sp.display_name} url={sp.avatar_url} size={26} />
              <Text style={styles.invitedText} numberOfLines={1}>{sp.display_name}</Text>
              <Icon name="close" size={14} color={C.text2} />
            </TouchableOpacity>
          ))}
        </View>
      )}
      <SpeakerPicker
        selected={Object.fromEntries(form.invited.map(s => [s.id, true]))}
        onToggle={sp => update('invited', form.invited.some(x => x.id === sp.id) ? form.invited.filter(x => x.id !== sp.id) : [...form.invited, sp])}
      />
      <Field label="Note to speakers (optional)">
        <TextInput
          style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
          value={form.endorsementNote}
          onChangeText={v => update('endorsementNote', v)}
          placeholder="Assalamu alaikum — we'd be honored if you'd look at this seed…"
          placeholderTextColor={C.text3}
          maxLength={500}
          multiline
        />
      </Field>
    </>
  );

  const publishStep = (
    <>
      <StepHead title="Donor reviews & publish" sub="After donating, donors can say why they gave. Reviews show on the seed and your profile." />
      <View style={styles.box}>
        <ToggleRow title="Let donors leave a review" sub="Shown right after checkout." value={form.allowReviews} onChange={v => update('allowReviews', v)} />
        <View style={styles.divider} />
        <ToggleRow title="Allow anonymous reviews" sub="Donor name hidden; amount never shown." value={form.allowAnonymousReviews} onChange={v => update('allowAnonymousReviews', v)} disabled={!form.allowReviews} />
        <View style={styles.divider} />
        <ToggleRow title="Show endorsements on the donate screen" sub="A speaker quote appears above the amount picker." value={form.showEndorsementsOnDonate} onChange={v => update('showEndorsementsOnDonate', v)} />
      </View>
      {form.allowReviews && (
        <Field label="Question donors see">
          <TextInput style={styles.input} value={form.reviewPrompt} onChangeText={v => update('reviewPrompt', v)} maxLength={120} placeholderTextColor={C.text3} />
        </Field>
      )}
      <Field label="Publishing">
        <View style={styles.segmentWrap}>
          {(['draft', 'submit'] as const).map(v => (
            <TouchableOpacity key={v} style={[styles.segment, form.visibility === v && styles.segmentOn]} onPress={() => update('visibility', v)}>
              <Text style={[styles.segmentText, form.visibility === v && styles.segmentTextOn]}>
                {v === 'draft' ? 'Save as draft' : canSubmitActive ? 'Publish now' : 'Submit'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Field>
      {!canSubmitActive ? (
        <View style={styles.goldNotice}>
          <Text style={styles.body}><Text style={{ ...font(800) }}>Before it goes live:</Text> Siqa verifies every organization. Until yours is verified, seeds are saved as drafts.</Text>
        </View>
      ) : null}
      {saving && (
        <View style={styles.box}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <Text style={[styles.body, { ...font(800), color: C.goldDim }]}>{progressPct}%</Text>
            <Text style={[styles.muted, { flex: 1, textAlign: 'right' }]}>{progressLabel}</Text>
          </View>
          <ProgressBar pct={progressPct} height={6} />
        </View>
      )}
    </>
  );

  const preview = (
    <View style={{ gap: 10 }}>
      <Text style={styles.previewLabel}>LIVE PREVIEW</Text>
      <View style={styles.previewCard}>
        <View style={styles.previewImage}>
          {cover ? <Image source={{ uri: cover.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          <View style={styles.previewCat}><Text style={{ color: '#fff', fontSize: 11, ...font(700) }}>{form.category}</Text></View>
        </View>
        <View style={{ padding: 14, gap: 8 }}>
          <Text style={styles.muted}>{selectedOrg?.org_name || 'Your organization'}</Text>
          <Text style={styles.previewTitle} numberOfLines={3}>{form.title.trim() || 'Your seed title'}</Text>
          <ProgressBar pct={0} />
          <Text style={styles.muted}><Text style={{ color: C.text, ...font(700) }}>$0</Text> raised of {goalCents ? money(goalCents) : '$—'}</Text>
          {form.invited.length > 0 ? (
            <Text style={{ color: C.goldDim, fontSize: 13, ...font(600) }}>{form.invited.length} endorsement request{form.invited.length === 1 ? '' : 's'} pending</Text>
          ) : null}
        </View>
      </View>
      <Text style={styles.muted}>This card appears on your profile and in the Seeds feed.</Text>
    </View>
  );

  // ── Phone layout (brand kit v2) ──────────────────────────────────────
  function renderPhone() {
    const { c, shadow } = ds;
    const SEED_BAND = '#14382A';
    const stepLabel = `Step ${step + 1} of ${STEPS.length} · ${['Basics', 'Story', 'Endorsements', 'Publish'][step]}`;
    const goalNum = form.goal.replace(/[^0-9.]/g, '');
    const goalDisplay = goalNum ? Number(goalNum.split('.')[0]).toLocaleString('en-US') + (goalNum.includes('.') ? '.' + goalNum.split('.')[1] : '') : '';
    const bottomPad = Platform.OS === 'ios' ? 34 : 24;

    const progress = (dark: boolean) => (
      <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 12 }} importantForAccessibility="no-hide-descendants">
        {STEPS.map((_, i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? (dark ? '#ffffff' : c.ink) : dark ? 'rgba(255,255,255,0.22)' : c.surfaceStrong }} />
        ))}
      </View>
    );

    const topBar = (dark: boolean, left: React.ReactNode) => (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 }}>
        {left}
        <Text style={[T.caption, font(600), { color: dark ? 'rgba(255,255,255,0.8)' : c.ink2 }]}>{stepLabel}</Text>
        <Pressable onPress={() => saveDraft(true)} disabled={saving} hitSlop={6} style={{ height: 44, paddingHorizontal: 12, justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel="Save draft">
          <Text style={[T.buttonMd, font(600), { color: dark ? 'rgba(255,255,255,0.75)' : c.ink2 }]}>Save</Text>
        </Pressable>
      </View>
    );

    const footer = (
      <View style={{ paddingHorizontal: space[5], paddingTop: 14, paddingBottom: bottomPad, gap: 12 }}>
        {saving && step === STEPS.length - 1 ? (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Text style={[T.caption, font(700), { color: c.ink }]}>{progressPct}%</Text>
              <Text style={[T.caption, { color: c.ink2, flex: 1, textAlign: 'right' }]} numberOfLines={1}>{progressLabel}</Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: c.surfaceStrong, overflow: 'hidden' }}>
              <View style={{ height: 6, width: `${progressPct}%`, backgroundColor: c.seed }} />
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {step > 0 ? <Button label="Back" variant="secondary" onPress={() => setStep((s) => s - 1)} disabled={saving} style={{ flex: 1 }} /> : null}
          {step < STEPS.length - 1 ? (
            <Button label={step === 2 && form.invited.length === 0 ? 'Skip for now' : 'Continue'} iconRight="arrow-forward" onPress={next} style={{ flex: 1.6 }} />
          ) : (
            <Button label={form.visibility === 'submit' && canSubmitActive ? 'Publish Seed' : 'Save Seed'} onPress={createSeed} loading={saving} style={{ flex: 1.6 }} />
          )}
        </View>
        {step === 0 ? (
          <Pressable onPress={discardDraft} hitSlop={6} style={{ alignSelf: 'center', paddingVertical: 4 }} accessibilityRole="button">
            <Text style={[T.caption, font(600), { color: c.danger }]}>Discard draft</Text>
          </Pressable>
        ) : null}
      </View>
    );

    const toggle = (title: string, sub: string, key: 'zakatEligible' | 'sadaqahJariyah' | 'emergency' | 'allowReviews' | 'allowAnonymousReviews' | 'showEndorsementsOnDonate', last?: boolean, disabled?: boolean) => (
      <ListRow
        label={title}
        sub={sub}
        last={last}
        right={<DSSwitch label={title} tone="seed" value={form[key] as boolean} disabled={disabled} onValueChange={(v) => update(key, v)} />}
      />
    );

    // Basics
    const basicsPhone = (
      <>
        <View style={{ backgroundColor: SEED_BAND, paddingTop: Platform.OS === 'web' ? 8 : 52, paddingBottom: 46, gap: 14 }}>
          {topBar(true, <IconButton icon="close" label="Close" color="#ffffff" onPress={() => goBack('/seeds')} disabled={saving} />)}
          {progress(true)}
          <View style={{ paddingHorizontal: space[5], paddingTop: 8, gap: 6 }}>
            <Text style={[T.display, { fontSize: 30, lineHeight: 34, color: '#ffffff' }]} accessibilityRole="header">Start a Seed</Text>
            <Text style={[T.callout, { color: 'rgba(255,255,255,0.72)' }]}>One focused campaign with a clear goal.</Text>
          </View>
        </View>

        <View style={[{ marginTop: -30, marginHorizontal: space[5], padding: 18, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, gap: 10 }, shadow('raised')]}>
          <Text style={[T.micro, { color: c.ink2 }]}>Goal</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: -6 }}>
            <Text style={[T.amount, { fontSize: 40, lineHeight: 46, color: goalNum ? c.ink3 : c.ghost }]}>$</Text>
            <TextInput
              value={goalDisplay}
              onChangeText={(v) => update('goal', v.replace(/[^0-9.]/g, ''))}
              placeholder="25,000"
              placeholderTextColor={c.ghost}
              keyboardType="decimal-pad"
              accessibilityLabel="Goal in dollars"
              editable={!saving}
              style={[T.amount, { fontSize: 40, lineHeight: 46, flex: 1, minWidth: 0, color: c.ink, padding: 0, outlineStyle: 'none' } as any]}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[5000, 10000, 25000, 50000].map((g) => (
              <Chip key={g} label={`$${g / 1000}k`} selected={goalNum === String(g)} onPress={() => update('goal', String(g))} style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 0 }} />
            ))}
          </View>
        </View>

        <View style={{ paddingHorizontal: space[5], paddingTop: 22, gap: 2 }}>
          <TextField variant="bare" textStyle="title2" value={form.title} onChangeText={(v) => update('title', v)} placeholder="Name your Seed" accessibilityLabel="Seed title" maxLength={90} editable={!saving} />
          <TextField variant="bare" textStyle="callout" value={form.subtitle} onChangeText={(v) => update('subtitle', v)} placeholder="Add a one-line subtitle (optional)" accessibilityLabel="Subtitle" maxLength={130} editable={!saving} />
        </View>

        <View style={{ paddingHorizontal: space[5], paddingTop: 8 }}>
          <ListRow icon="business-outline" label="Raising for" value={selectedOrg?.org_name || 'Choose'} onPress={() => setSeedSheet('org')} disabled={saving} />
          <ListRow icon="pricetag-outline" label="Cause" value={form.category} onPress={() => setSeedSheet('cause')} disabled={saving} />
          <ListRow icon="calendar-outline" label="Ends" value={form.endDate.trim() || 'No end date'} onPress={() => setSeedSheet('ends')} disabled={saving} last />
        </View>

        <View style={{ paddingHorizontal: space[5], paddingTop: 18 }}>
          <SectionLabel>Donation type</SectionLabel>
          {toggle('Zakat eligible', 'Only if the funds go to zakat-eligible recipients.', 'zakatEligible')}
          {toggle('Sadaqah jariyah', 'For appeals with ongoing benefit.', 'sadaqahJariyah')}
          {toggle('Emergency appeal', 'Shows this Seed as urgent.', 'emergency', true)}
        </View>
      </>
    );

    // Story
    const storyPrompts = [
      { label: 'The need', text: 'The need: ' },
      { label: 'Who benefits', text: 'Who benefits: ' },
      { label: 'Where it goes', text: 'Where the money goes: ' },
      { label: 'Reporting back', text: "How we'll report back: " },
    ];
    const storyPhone = (
      <>
        <View style={{ height: 300 + (Platform.OS === 'web' ? 0 : 44), backgroundColor: '#1E2A24' }}>
          {cover ? <Image source={{ uri: cover.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          {cover ? <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.25)' }]} /> : null}
          <View style={{ paddingTop: Platform.OS === 'web' ? 8 : 52 }}>
            {topBar(true, <IconButton icon="chevron-back" label="Back" variant="scrim" onPress={() => setStep(0)} />)}
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 30 }}>
            <Button label={cover ? 'Change cover photo' : 'Add cover photo'} icon="image-outline" variant="light" size="md" onPress={pickCover} disabled={saving} />
            {!cover ? <Text style={[T.caption, font(400), { color: 'rgba(255,255,255,0.7)' }]}>Optional · wide photos (16:9) look best</Text> : null}
          </View>
        </View>
        <View style={{ marginTop: -26, backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingTop: 24 }}>
          <View style={{ paddingHorizontal: space[5], gap: 6 }}>
            <Text style={[T.title1, { color: c.ink }]} accessibilityRole="header">Tell the story</Text>
            <Text style={[T.callout, { color: c.ink2 }]}>The need, what each gift buys, and how you'll report back.</Text>
          </View>

          <Pressable
            onPress={pickVideo}
            disabled={saving}
            accessibilityRole="button"
            style={({ pressed }) => [{ marginHorizontal: space[5], marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, opacity: pressed ? 0.8 : 1 }, shadow('card')]}
          >
            <View style={[{ width: 56, height: 56, borderRadius: 14, backgroundColor: video ? c.seed : c.primary, alignItems: 'center', justifyContent: 'center' }, shadow('primary')]}>
              <Icon name={video ? 'checkmark' : 'videocam'} size={24} color={video ? '#ffffff' : c.onPrimary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[T.callout, font(700), { color: c.ink }]}>{video ? 'Video appeal added' : 'Add your video appeal'}</Text>
              <Text style={[T.caption, font(400), { color: c.ink2 }]} numberOfLines={1}>{video ? video.fileName : 'Required · every Seed leads with a short video'}</Text>
            </View>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.surfaceSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={video ? 'swap-horizontal' : 'add'} size={18} color={c.ink} />
            </View>
          </Pressable>

          <View style={{ paddingHorizontal: space[5], paddingTop: 22, gap: 10 }}>
            <SectionLabel>The story</SectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {storyPrompts.map((p) => (
                <Chip
                  key={p.label}
                  label={`+ ${p.label}`}
                  disabled={saving}
                  onPress={() => update('story', (form.story.trim() ? form.story.replace(/\s+$/, '') + '\n\n' : '') + p.text)}
                />
              ))}
            </ScrollView>
            <TextField
              variant="bare"
              textStyle="story"
              value={form.story}
              onChangeText={(v) => update('story', v)}
              placeholder="Start with the people this helps…"
              accessibilityLabel="The story"
              multiline
              editable={!saving}
              style={{ minHeight: 260 }}
              help={form.story.trim().length < 30 ? 'A few short paragraphs is plenty.' : undefined}
            />
          </View>
        </View>
      </>
    );

    // Endorsements + Publish share a plain white header
    const plainHeader = (title: string, sub: string) => (
      <View style={{ paddingTop: Platform.OS === 'web' ? 8 : 52, gap: 14 }}>
        {topBar(false, <IconButton icon="chevron-back" label="Back" onPress={() => setStep((s) => s - 1)} />)}
        {progress(false)}
        <View style={{ paddingHorizontal: space[5], paddingTop: 10, gap: 6 }}>
          <Text style={[T.title1, { color: c.ink }]} accessibilityRole="header">{title}</Text>
          <Text style={[T.callout, { color: c.ink2 }]}>{sub}</Text>
        </View>
      </View>
    );

    const endorsePhone = (
      <>
        {plainHeader('Ask for endorsements', "Optional. Verified speakers get a request and decide whether to endorse. You can't write or edit what they say.")}
        <View style={{ paddingHorizontal: space[5], paddingTop: 18, gap: 16 }}>
          {form.invited.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {form.invited.map((sp) => (
                <Chip key={sp.id} label={sp.display_name} icon="close" selected onPress={() => update('invited', form.invited.filter((x) => x.id !== sp.id))} />
              ))}
            </View>
          ) : null}
          <SpeakerPicker
            selected={Object.fromEntries(form.invited.map((s) => [s.id, true]))}
            onToggle={(sp) => update('invited', form.invited.some((x) => x.id === sp.id) ? form.invited.filter((x) => x.id !== sp.id) : [...form.invited, sp])}
          />
          <TextField
            label="Note to speakers (optional)"
            value={form.endorsementNote}
            onChangeText={(v) => update('endorsementNote', v)}
            placeholder="Assalamu alaikum, we'd be honored if you'd look at this Seed…"
            maxLength={500}
            multiline
            style={{ minHeight: 96 }}
          />
        </View>
      </>
    );

    const publishPhone = (
      <>
        {plainHeader('Reviews & publish', 'After giving, donors can say why they gave. Reviews show on the Seed and your profile.')}
        <View style={{ paddingHorizontal: space[5], paddingTop: 14 }}>
          {toggle('Let donors leave a review', 'Asked right after checkout.', 'allowReviews')}
          {toggle('Allow anonymous reviews', 'Name hidden; the amount is never shown.', 'allowAnonymousReviews', false, !form.allowReviews)}
          {toggle('Show endorsements on the donate screen', 'A speaker quote appears above the amounts.', 'showEndorsementsOnDonate', true)}
        </View>
        <View style={{ paddingHorizontal: space[5], paddingTop: 16, gap: 18 }}>
          {form.allowReviews ? (
            <TextField label="Question donors see" value={form.reviewPrompt} onChangeText={(v) => update('reviewPrompt', v)} maxLength={120} />
          ) : null}
          <View style={{ gap: 8 }}>
            <SectionLabel>When you finish</SectionLabel>
            <SegmentedControl
              label="When you finish"
              value={form.visibility}
              onChange={(v) => update('visibility', v)}
              options={[{ value: 'draft', label: 'Save as draft' }, { value: 'submit', label: canSubmitActive ? 'Publish now' : 'Submit' }]}
            />
          </View>
          {!canSubmitActive ? (
            <View style={{ padding: 12, borderRadius: radius.md, backgroundColor: c.goldTint, flexDirection: 'row', gap: 10 }}>
              <Icon name="shield-checkmark-outline" size={18} color={c.goldInk} />
              <Text style={[T.caption, font(500), { color: c.goldInk, flex: 1 }]}>Siqa verifies every organization. Until yours is verified, Seeds are saved as drafts.</Text>
            </View>
          ) : null}
        </View>
      </>
    );

    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.surface }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} onLayout={onLayout}>
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {step === 0 && basicsPhone}
          {step === 1 && storyPhone}
          {step === 2 && endorsePhone}
          {step === 3 && publishPhone}
          <View style={{ flex: 1, minHeight: 12 }} />
          {footer}
        </ScrollView>

        <BottomSheet visible={seedSheet === 'org'} onClose={() => setSeedSheet(null)} title="Raising for">
          {orgs.length === 0 ? (
            <Text style={[T.callout, { color: c.ink2, paddingVertical: 8 }]}>Register a nonprofit or masjid before starting a Seed.</Text>
          ) : null}
          {orgs.map((org, i) => (
            <OptionRow
              key={org.id}
              label={org.org_name}
              sub={org.is_verified ? 'Verified' : org.approval_status === 'approved' ? 'Approved' : 'Waiting for review'}
              selected={selectedOrgId === org.id}
              onPress={() => { setSelectedOrgId(org.id); setSeedSheet(null); }}
              last={i === orgs.length - 1}
            />
          ))}
        </BottomSheet>

        <BottomSheet visible={seedSheet === 'cause'} onClose={() => setSeedSheet(null)} title="Cause">
          {CATEGORIES.map((cat, i) => (
            <OptionRow key={cat} label={cat} selected={form.category === cat} onPress={() => { update('category', cat); setSeedSheet(null); }} last={i === CATEGORIES.length - 1} />
          ))}
        </BottomSheet>

        <BottomSheet visible={seedSheet === 'ends'} onClose={() => setSeedSheet(null)} title="Ends" footer={<Button label="Done" onPress={() => setSeedSheet(null)} />}>
          <OptionRow label="No end date" selected={!form.endDate.trim()} onPress={() => update('endDate', '')} />
          <TextField
            label="End date"
            value={form.endDate}
            onChangeText={(v) => update('endDate', v)}
            placeholder="2026-12-31"
            help="Year-month-day"
            error={form.endDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(form.endDate.trim()) ? 'Use the format 2026-12-31' : null}
            containerStyle={{ marginTop: 14 }}
          />
        </BottomSheet>
      </KeyboardAvoidingView>
    );
  }

  if (!wide) return renderPhone();

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack('/seeds')} disabled={saving} style={styles.headerBtn}>
          <Text style={styles.headerLink}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Start a seed</Text>
        <TouchableOpacity onPress={() => saveDraft(true)} disabled={saving} style={[styles.headerBtn, { alignItems: 'flex-end' }]}>
          <Text style={styles.headerLink}>Save draft</Text>
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View style={styles.page} onLayout={onLayout}>
          <View style={styles.stepper}>
            {STEPS.map((label, i) => {
              const cur = i === step, done = i < step;
              return (
                <TouchableOpacity
                  key={label}
                  style={[styles.stepBtn, cur && styles.stepBtnOn]}
                  onPress={() => setStep(i)}
                  disabled={saving}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: cur }}
                >
                  <View style={[styles.stepDot, (cur || done) && styles.stepDotOn]}>
                    {done ? <Icon name="checkmark" size={14} color="#fff" /> : <Text style={[styles.stepNum, cur && { color: '#fff' }]}>{i + 1}</Text>}
                  </View>
                  {(wide || cur) && <Text style={styles.stepLabel} numberOfLines={1}>{label}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.columns}>
            <View style={styles.formCard}>
              {step === 0 && basics}
              {step === 1 && storyStep}
              {step === 2 && endorseStep}
              {step === 3 && publishStep}
              <View style={styles.navRow}>
                {step > 0 ? (
                  <PrimaryButton label="Back" tone="ghost" onPress={() => setStep(s => s - 1)} disabled={saving} style={{ minWidth: 100 }} />
                ) : (
                  <TouchableOpacity onPress={discardDraft} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={styles.danger}>Discard draft</Text></TouchableOpacity>
                )}
                {step < STEPS.length - 1 ? (
                  <PrimaryButton label={step === 2 && form.invited.length === 0 ? 'Skip for now' : 'Continue'} tone="emerald" onPress={next} style={{ minWidth: 140 }} />
                ) : (
                  <PrimaryButton
                    label={form.visibility === 'submit' && canSubmitActive ? 'Publish seed' : 'Save seed'}
                    onPress={createSeed}
                    busy={saving}
                    style={{ minWidth: 160 }}
                  />
                )}
              </View>
            </View>
            {wide && <View style={styles.aside}>{preview}</View>}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function StepHead({ title, sub }: { title: string; sub: string }) {
  const { colors: C } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: C.text, fontSize: 24, ...font(800) }}>{title}</Text>
      <Text style={{ color: C.text2, fontSize: 15, lineHeight: 22 }}>{sub}</Text>
    </View>
  );
}

function Field({ label, help, children, style }: { label: string; help?: string; children: React.ReactNode; style?: any }) {
  const { colors: C } = useTheme();
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={{ color: C.text, fontSize: 14, ...font(700) }}>{label}</Text>
      {children}
      {help ? <Text style={{ color: C.text2, fontSize: 13, lineHeight: 18 }}>{help}</Text> : null}
    </View>
  );
}

function ToggleRow({ title, sub, value, onChange, disabled }: { title: string; sub: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { colors: C } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: C.text, fontSize: 15, ...font(700) }}>{title}</Text>
        <Text style={{ color: C.text2, fontSize: 13, lineHeight: 18 }}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: C.surface3, true: C.emerald }}
        thumbColor="#fff"
        {...({ activeThumbColor: '#fff' } as any)}
        accessibilityLabel={title}
      />
    </View>
  );
}

function makeStyles(C: AppColors, isDark: boolean, wide: boolean) {
  return StyleSheet.create(brandStyles({
    screen: { flex: 1, backgroundColor: C.bg2 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, padding: 24 },
    header: {
      paddingTop: Platform.OS === 'web' ? 10 : 54, paddingHorizontal: 12, paddingBottom: 8,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      borderBottomWidth: 1, borderBottomColor: C.border2, backgroundColor: C.bg,
    },
    headerBtn: { minWidth: 88, minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
    headerLink: { color: C.text2, fontSize: 15, fontWeight: '600' },
    headerTitle: { color: C.text, fontSize: 16, fontWeight: '800' },

    page: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: wide ? 24 : 12, gap: 16 },
    stepper: { flexDirection: 'row', gap: 8 },
    stepBtn: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: wide ? 'flex-start' : 'center', gap: 10, paddingHorizontal: wide ? 14 : 6, borderRadius: 12, borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface },
    stepBtnOn: { borderColor: C.emerald, backgroundColor: C.emeraldBg, flex: wide ? 1 : 2.4 },
    stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.surface3, alignItems: 'center', justifyContent: 'center' },
    stepDotOn: { backgroundColor: C.emerald },
    stepNum: { color: C.text2, fontSize: 13, fontWeight: '700' },
    stepLabel: { color: C.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },

    columns: { flexDirection: wide ? 'row' : 'column', gap: 24, alignItems: 'flex-start' },
    formCard: { flex: wide ? 1 : undefined, width: wide ? undefined : '100%', minWidth: 0, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border2, padding: wide ? 28 : 18, gap: 20 },
    aside: { width: 320 },
    navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: C.border2, paddingTop: 18 },

    input: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontSize: 16, minHeight: 48 },
    twoCol: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    box: { borderWidth: 1, borderColor: C.border2, borderRadius: 14, padding: 16, gap: 14, backgroundColor: C.bg },
    divider: { height: 1, backgroundColor: C.border2 },
    notice: { padding: 14, borderRadius: 12, backgroundColor: C.surface2 },
    goldNotice: { padding: 14, borderRadius: 12, backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.goldSoft },

    orgPill: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 180, maxWidth: 280, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg },
    orgPillOn: { borderColor: C.emerald, backgroundColor: C.emeraldBg },
    orgPillText: { color: C.text, fontSize: 14, fontWeight: '700' },
    orgPillMeta: { color: C.text2, fontSize: 12, marginTop: 1, textTransform: 'capitalize' },
    chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.border, justifyContent: 'center' },
    chipOn: { backgroundColor: C.emerald, borderColor: C.emerald },
    chipText: { color: C.text2, fontSize: 14, fontWeight: '600' },
    chipTextOn: { color: '#fff' },

    mediaBox: { minHeight: 190, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: C.border, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 20, overflow: 'hidden' },
    mediaScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
    mediaTitle: { color: C.text, fontSize: 16, fontWeight: '800' },
    mediaSub: { color: C.text2, fontSize: 13, textAlign: 'center' },

    invitedChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4, paddingRight: 10, minHeight: 36, borderRadius: 999, backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.goldSoft, maxWidth: 240 },
    invitedText: { color: C.text, fontSize: 13, fontWeight: '600', flexShrink: 1 },

    segmentWrap: { flexDirection: 'row', gap: 8 },
    segment: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
    segmentOn: { borderColor: C.emerald, backgroundColor: C.emeraldBg },
    segmentText: { color: C.text2, fontWeight: '700', fontSize: 14 },
    segmentTextOn: { color: C.emerald },

    previewLabel: { color: C.text2, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
    previewCard: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border2, overflow: 'hidden' },
    previewImage: { aspectRatio: 16 / 9, backgroundColor: C.emeraldSoft, justifyContent: 'flex-end', padding: 10 },
    previewCat: { alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
    previewTitle: { color: C.text, fontSize: 17, fontWeight: '700', lineHeight: 22 },

    lockedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34, gap: 8 },
    lockedTitle: { color: C.text, fontSize: 22, fontWeight: '900', textAlign: 'center' },
    lockedSub: { color: C.text2, fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 14, maxWidth: 420 },

    successCard: { width: '100%', maxWidth: 460, backgroundColor: C.surface, borderRadius: 24, borderWidth: 1, borderColor: C.border2, padding: 28, alignItems: 'center', gap: 12 },
    successIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: C.emeraldBg, alignItems: 'center', justifyContent: 'center' },
    successTitle: { color: C.text, fontSize: 22, fontWeight: '900', textAlign: 'center' },
    successText: { color: C.text2, fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 6 },

    body: { color: C.text, fontSize: 15, lineHeight: 22 },
    muted: { color: C.text2, fontSize: 14, lineHeight: 20 },
    link: { color: C.emerald, fontSize: 14, fontWeight: '700' },
    danger: { color: C.danger, fontSize: 14, fontWeight: '600' },
  }));
}
