import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Dimensions,
  PanResponder,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Video, ResizeMode } from 'expo-av';
import { Platform } from 'react-native';
// expo-video-thumbnails is native-only — not available on web
const VideoThumbnails = Platform.OS !== 'web' ? require('expo-video-thumbnails') : null;
import { supabase } from '../lib/supabase';
import {
  makeBunnyGemPath,
  makeBunnyThumbnailPath,
  uploadThumbnailToBunny,
  uploadVideoToBunny,
} from '../lib/bunnyUpload';
import { useTheme, type AppColors } from '../lib/theme';
import { Glyph } from '../components/Glyph';
import { DesktopShell, useIsDesktopWeb } from '../components/DesktopShell';
import { Icon } from '../components/Icon';
import { BottomSheet, Button, IconButton, ListRow, OptionRow, Switch as DSSwitch, TextField, Chip } from '../components/ui';
import { font, radius, space, type as T, useDS } from '../lib/ds';
import { brandStyles } from '../lib/ds';
import { goBack } from '../lib/goBack';
import { SeriesPicker, type SeriesRow } from '../components/SeriesPicker';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

const { width: SCREEN_W } = Dimensions.get('window');

// Web has no VideoThumbnails module, but browsers can draw a video frame to
// a <canvas> natively — this was previously unimplemented, so every gem
// uploaded from the web app silently ended up with thumbnail_url: null.
function captureVideoFrameWeb(uri: string, timeSec: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = uri;

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;
    };

    video.onloadedmetadata = () => {
      const duration = video.duration || 1;
      video.currentTime = Math.min(Math.max(timeSec, 0), Math.max(duration - 0.05, 0));
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 720;
        canvas.height = video.videoHeight || 1280;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context unavailable');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        cleanup();
        resolve(dataUrl);
      } catch (e) {
        cleanup();
        reject(e);
      }
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('Could not load video for frame capture'));
    };
  });
}

// Alert.alert does nothing on react-native-web, so on web use the browser's
// own alert/confirm (a button with an onPress becomes a confirm()).
function notify(
  title: string,
  message?: string,
  buttons?: { text: string; style?: string; onPress?: () => void }[],
) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons as any);
    return;
  }
  const text = message ? `${title}\n\n${message}` : title;
  const action = buttons?.find((b) => b.style !== 'cancel' && b.onPress);
  if (action) {
    if (window.confirm(text)) action.onPress!();
  } else {
    window.alert(text);
  }
}

/** Length of a local video file in seconds (web), or null if unknown. */
function readVideoDurationWeb(uri: string): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => resolve(null);
    v.src = uri;
  });
}

const TOPICS = ['Fundraising', 'Aqeedah', 'Quran', 'Youth', 'Seerah', 'Marriage', 'Mental Health', 'Family', 'Dawah', 'Reverts'];
const DRAFT_KEY = 'siqa:gems:upload-draft:v1';

type SpeakerOption = {
  id: string;
  display_name: string;
};

type SeedOption = {
  id: string;
  title: string;
  organization_name?: string | null;
  goal_amount?: number | null;
};

type PickedVideo = {
  uri: string;
  fileName: string;
  mimeType: string | null;
  duration?: number | null;
  size?: number | null;
};

type PickedImage = {
  uri: string;
  fileName: string;
  mimeType: string | null;
};

type DraftPayload = {
  caption: string;
  selectedTopics: string[];
  plantSeed: boolean;
  fundraiserId: string;
  visibility: 'public' | 'followers';
  selectedSpeakerId: string | null;
  video: PickedVideo | null;
  thumbnail: PickedImage | null;
};

// Every state of this screen (loading, locked, the form) gets the desktop
// sidebar/top bar from one wrapper instead of wrapping each return.
export default function GemUploadScreen() {
  return (
    <DesktopShell>
      <GemUploadScreenContent />
    </DesktopShell>
  );
}

function GemUploadScreenContent() {
  const { colors: C, isDark } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const styles = useMemo(() => makeStyles(C, isDark, isDesktopWeb), [C, isDark, isDesktopWeb]);
  const successScale = useRef(new Animated.Value(0.86)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [speakerId, setSpeakerId] = useState<string | null>(null);
  const [speakerApproved, setSpeakerApproved] = useState(false);
  const [speakers, setSpeakers] = useState<SpeakerOption[]>([]);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null);
  const [seeds, setSeeds] = useState<SeedOption[]>([]);
  // Content orgs this speaker is a confirmed scholar of. Posting under one
  // makes the org the video's owner (videos.org_id); null = own channel.
  const [postOrgs, setPostOrgs] = useState<{ id: string; org_name: string }[]>([]);
  const [postOrgId, setPostOrgId] = useState<string | null>(null);

  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [thumbnail, setThumbnail] = useState<PickedImage | null>(null);
  const [caption, setCaption] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<string[]>(['Fundraising']);
  const [plantSeed, setPlantSeed] = useState(false);
  const [fundraiserId, setFundraiserId] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'followers'>('public');
  const [contentFormat, setContentFormat] = useState<'auto' | 'short' | 'long'>('auto');
  const [uploading, setUploading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [success, setSuccess] = useState(false);

  // Desktop drag-and-drop upload
  const dropRef = useRef<any>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

  // Frame picker
  const [framePickerVisible, setFramePickerVisible] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0); // 0–1
  const [frameUri, setFrameUri] = useState<string | null>(null);
  const [capturingFrame, setCapturingFrame] = useState(false);
  // Phone layout (brand kit v2): which bottom sheet is open, and preview playback.
  const ds = useDS();
  const [sheet, setSheet] = useState<null | 'speaker' | 'topics' | 'visibility' | 'format' | 'seed' | 'cover' | 'owner'>(null);

  const effectiveSpeakerId = isAdmin ? selectedSpeakerId : speakerId;
  useEffect(() => {
    let live = true;
    setPostOrgId(null);
    if (!effectiveSpeakerId) { setPostOrgs([]); return; }
    (async () => {
      const { data } = await supabase
        .from('speaker_affiliations')
        .select('org_id, organizations(id, org_name, org_kind, approval_status)')
        .eq('speaker_id', effectiveSpeakerId)
        .eq('status', 'confirmed');
      if (!live) return;
      const list = ((data as any[]) || [])
        .map(r => r.organizations)
        .filter((o: any) => o && o.org_kind === 'content' && o.approval_status === 'approved')
        .map((o: any) => ({ id: o.id as string, org_name: o.org_name as string }));
      setPostOrgs(list);
    })();
    return () => { live = false; };
  }, [effectiveSpeakerId]);
  const postOrgName = postOrgs.find(o => o.id === postOrgId)?.org_name;

  // ── Series ─────────────────────────────────────────────────────────
  const [seriesList, setSeriesList] = useState<SeriesRow[]>([]);
  const [seriesId, setSeriesId] = useState<string | null>(null);
  const [episode, setEpisode] = useState('');
  const [description, setDescription] = useState('');
  const [creatingSeries, setCreatingSeries] = useState(false);
  const selectedSeries = seriesList.find(x => x.id === seriesId) ?? null;
  const orgNames = useMemo(() => Object.fromEntries(postOrgs.map(o => [o.id, o.org_name])), [postOrgs]);

  async function loadSeries() {
    if (!effectiveSpeakerId) { setSeriesList([]); return; }
    const orgIds = postOrgs.map(o => o.id);
    const filter = `and(speaker_id.eq.${effectiveSpeakerId},org_id.is.null)` + (orgIds.length ? `,org_id.in.(${orgIds.join(',')})` : '');
    const { data } = await supabase
      .from('series')
      .select('id,title,description,cover_url,default_topics,default_format,default_visibility,default_fundraiser_id,speaker_id,org_id')
      .or(filter)
      .order('updated_at', { ascending: false });
    setSeriesList((data as SeriesRow[]) ?? []);
  }
  useEffect(() => { setSeriesId(null); loadSeries(); }, [effectiveSpeakerId, postOrgs]);

  // A series that belongs to an organization only takes videos posted under it.
  useEffect(() => {
    if (selectedSeries?.org_id && selectedSeries.org_id !== postOrgId) setSeriesId(null);
    if (selectedSeries && !selectedSeries.org_id && postOrgId) setSeriesId(null);
  }, [postOrgId]);

  async function applySeries(sr: SeriesRow | null) {
    if (!sr) { setSeriesId(null); return; }
    setSeriesId(sr.id);
    if (sr.org_id) setPostOrgId(sr.org_id);
    setDescription(sr.description ?? '');
    if (sr.default_topics?.length) setSelectedTopics(sr.default_topics);
    if (sr.default_format) setContentFormat(sr.default_format);
    if (sr.default_visibility) setVisibility(sr.default_visibility);
    if (sr.default_fundraiser_id) { setPlantSeed(true); setFundraiserId(sr.default_fundraiser_id); }
    const { data: last, count } = await supabase
      .from('videos')
      .select('episode_number', { count: 'exact' })
      .eq('series_id', sr.id)
      .order('episode_number', { ascending: false, nullsFirst: false })
      .limit(1);
    const next = Math.max((last?.[0] as any)?.episode_number ?? 0, count ?? 0) + 1;
    setEpisode(String(next));
    setSeriesList(prev => prev.map(x => x.id === sr.id ? { ...x, episodes: count ?? 0 } : x));
    setCaption(cur => cur.trim() ? cur : `${sr.title}, Episode ${next}`);
  }

  async function createSeries(title: string, desc: string) {
    if (!effectiveSpeakerId) return;
    setCreatingSeries(true);
    const { data, error } = await supabase
      .from('series')
      .insert({
        speaker_id: effectiveSpeakerId,
        org_id: postOrgId,
        title,
        description: desc || null,
        default_topics: selectedTopics,
        default_format: contentFormat === 'auto' ? null : contentFormat,
        default_visibility: visibility,
        default_fundraiser_id: plantSeed && fundraiserId.trim() ? fundraiserId.trim() : null,
      })
      .select('id,title,description,cover_url,default_topics,default_format,default_visibility,default_fundraiser_id,speaker_id,org_id')
      .single();
    setCreatingSeries(false);
    if (error || !data) { notify('Could not create series', error?.message || 'Try again.'); return; }
    const row = { ...(data as SeriesRow), episodes: 0 };
    setSeriesList(prev => [row, ...prev]);
    setSeriesId(row.id);
    setEpisode('1');
    setDescription(row.description ?? '');
    setCaption(cur => cur.trim() ? cur : `${row.title}, Episode 1`);
  }

  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [speakerQuery, setSpeakerQuery] = useState('');
  const scrubBarWidth = useRef(0);
  const videoDuration = useRef(0);

  // Short (vertical Gem) or long (horizontal video). "Auto" decides by length
  // once a video is picked (over 3 minutes = long); before that it's short.
  const { width: winW } = useWindowDimensions();
  const isLongVideo = video?.duration != null && video.duration > 180;
  const effFormat: 'short' | 'long' = contentFormat === 'auto' ? (isLongVideo ? 'long' : 'short') : contentFormat;

  // Phone layout: the white details sheet is a real drawer. Drag its handle up
  // to cover the preview (more room to type), down to see the preview again.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [stageBottom, setStageBottom] = useState(0); // y where the preview area ends
  const [headerBottom, setHeaderBottom] = useState(0); // y where the top bar ends
  const sheetTop = useRef(new Animated.Value(0)).current;
  const sheetTopNow = useRef(0);
  const dragStartTop = useRef(0);
  const sheetPlaced = useRef(false);
  const collapsedTop = Math.max(stageBottom - 26, headerBottom + 120);
  const expandedTop = headerBottom + 4;

  useEffect(() => {
    const id = sheetTop.addListener(({ value }) => { sheetTopNow.current = value; });
    return () => sheetTop.removeListener(id);
  }, [sheetTop]);

  function animateSheet(open: boolean) {
    Animated.spring(sheetTop, {
      toValue: open ? expandedTop : collapsedTop,
      useNativeDriver: false,
      bounciness: 0,
      speed: 18,
    }).start();
  }

  useEffect(() => {
    if (!stageBottom || !headerBottom) return;
    if (!sheetPlaced.current) {
      sheetTop.setValue(sheetOpen ? expandedTop : collapsedTop);
      sheetPlaced.current = true;
      return;
    }
    animateSheet(sheetOpen);
  }, [sheetOpen, collapsedTop, expandedTop]);

  const sheetGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetY([-6, 6])
      .onStart(() => { dragStartTop.current = sheetTopNow.current; })
      .onUpdate((e) => {
        const next = Math.min(Math.max(dragStartTop.current + e.translationY, expandedTop), collapsedTop);
        sheetTop.setValue(next);
      })
      .onEnd((e) => {
        const now = Math.min(Math.max(dragStartTop.current + e.translationY, expandedTop), collapsedTop);
        const open = e.velocityY < -400 ? true : e.velocityY > 400 ? false : now < (expandedTop + collapsedTop) / 2;
        setSheetOpen(open);
        animateSheet(open); // in case the state didn't change
      });
    const tap = Gesture.Tap().runOnJS(true).onEnd(() => setSheetOpen((o) => !o));
    return Gesture.Exclusive(pan, tap);
  }, [expandedTop, collapsedTop]);

  useEffect(() => {
    loadProfile();
    restoreDraft();
  }, []);

  useEffect(() => {
    if (!draftLoaded || uploading || success) return;
    const timeout = setTimeout(() => saveDraft(false), 700);
    return () => clearTimeout(timeout);
  }, [caption, selectedTopics, plantSeed, fundraiserId, visibility, selectedSpeakerId, video, thumbnail, draftLoaded, uploading, success]);

  // Desktop: drop a video anywhere on the drop area. Dropping elsewhere on
  // the page shouldn't make the browser open the file instead.
  useEffect(() => {
    if (Platform.OS !== 'web' || !isDesktopWeb) return;
    const el = dropRef.current as HTMLElement | null;
    const block = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    if (!el?.addEventListener) {
      return () => { window.removeEventListener('dragover', block); window.removeEventListener('drop', block); };
    }
    const over = (e: DragEvent) => { e.preventDefault(); setDragOver(true); };
    const leave = () => setDragOver(false);
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) handleWebFile(file);
    };
    el.addEventListener('dragenter', over);
    el.addEventListener('dragover', over);
    el.addEventListener('dragleave', leave);
    el.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
      el.removeEventListener('dragenter', over);
      el.removeEventListener('dragover', over);
      el.removeEventListener('dragleave', leave);
      el.removeEventListener('drop', drop);
    };
  }, [isDesktopWeb, loadingProfile, video]);

  async function handleWebFile(file: File) {
    const looksLikeVideo = file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(file.name);
    if (!looksLikeVideo) {
      setDropError(`"${file.name}" isn't a video. Use an MP4, MOV or WebM file.`);
      return;
    }
    setDropError(null);
    const uri = URL.createObjectURL(file);
    const duration = await readVideoDurationWeb(uri);
    setVideo({ uri, fileName: file.name, mimeType: file.type || 'video/mp4', duration, size: file.size });
    // Like YouTube: start the title from the file name.
    setCaption((c) => c.trim() ? c : file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
    await generateAutoThumbnail(uri);
  }

  function selectWebFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) handleWebFile(file);
    };
    input.click();
  }

  async function loadProfile() {
    setLoadingProfile(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoadingProfile(false);
      router.replace('/(auth)/login');
      return;
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const admin = profile?.role === 'admin';
    setIsAdmin(admin);

    if (admin) {
      const { data } = await supabase.from('speakers').select('id, display_name').order('display_name');
      const list = (data || []) as SpeakerOption[];
      setSpeakers(list);
      setSelectedSpeakerId((current) => current || list[0]?.id || null);
    } else {
      const { data: speaker } = await supabase
        .from('speakers')
        .select('id, approval_status, is_verified')
        .eq('profile_id', user.id)
        .maybeSingle();
      setSpeakerId(speaker?.id || null);
      setSpeakerApproved(Boolean(speaker && speaker.approval_status === 'approved' && speaker.is_verified));
    }

    await loadSeeds();
    setLoadingProfile(false);
  }

  async function loadSeeds() {
    const { data, error } = await supabase
      .from('fundraisers')
      .select('id, title, organization_name, goal_amount')
      .order('created_at', { ascending: false })
      .limit(30);

    if (!error && data) {
      setSeeds(data as SeedOption[]);
      return;
    }

    const fallback = await supabase
      .from('fundraisers')
      .select('id, title')
      .order('created_at', { ascending: false })
      .limit(30);

    if (!fallback.error && fallback.data) setSeeds(fallback.data as SeedOption[]);
  }

  async function restoreDraft() {
    try {
      const raw = await AsyncStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as DraftPayload;
        setCaption(draft.caption || '');
        setSelectedTopics(draft.selectedTopics?.length ? draft.selectedTopics : ['Fundraising']);
        setPlantSeed(Boolean(draft.plantSeed));
        setFundraiserId(draft.fundraiserId || '');
        setVisibility(draft.visibility || 'public');
        setSelectedSpeakerId(draft.selectedSpeakerId || null);
        // On web a picked file is a blob: link that dies on reload, so the
        // draft keeps the text but not the file.
        const dead = (uri?: string) => Platform.OS === 'web' && Boolean(uri?.startsWith('blob:'));
        setVideo(draft.video && !dead(draft.video.uri) ? draft.video : null);
        setThumbnail(draft.thumbnail && !dead(draft.thumbnail.uri) ? draft.thumbnail : null);
      }
    } catch (error) {
      console.warn('[GemUpload] Could not restore draft', error);
    } finally {
      setDraftLoaded(true);
    }
  }

  async function saveDraft(showToast = true) {
    try {
      setSavingDraft(true);
      const payload: DraftPayload = {
        caption,
        selectedTopics,
        plantSeed,
        fundraiserId,
        visibility,
        selectedSpeakerId,
        video,
        thumbnail,
      };
      await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      if (showToast) notify('Draft saved', 'Your Gem draft is saved on this device.');
    } catch (error) {
      if (showToast) notify('Draft not saved', 'Something went wrong while saving this draft.');
    } finally {
      setSavingDraft(false);
    }
  }

  async function discardDraft() {
    notify('Discard draft?', 'This clears the saved draft on this device.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem(DRAFT_KEY);
          setCaption('');
          setSelectedTopics(['Fundraising']);
          setPlantSeed(false);
          setFundraiserId('');
          setVisibility('public');
          setVideo(null);
          setThumbnail(null);
          setSeriesId(null);
          setDescription('');
          setEpisode('');
        },
      },
    ]);
  }

  async function pickVideo() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify('Permission needed', 'Allow Siqa to access your video library to upload Gems.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 1,
        // 3600s (1hr) ceiling for library picks — auto-detect / manual override
        // below decides short vs long based on this. Camera recording (below)
        // stays capped at 180s since live in-app recording isn't the long-form path.
        videoMaxDuration: 3600,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setVideo({
        uri: asset.uri,
        fileName: asset.fileName || `siqa-gem-${Date.now()}.mp4`,
        mimeType: asset.mimeType || 'video/mp4',
        duration: asset.duration,
        size: asset.fileSize,
      });

      // Auto-generate a default thumbnail from the first frame so every
      // Gem has a thumbnail even if the speaker skips the manual picker.
      await generateAutoThumbnail(asset.uri);
    } catch (error) {
      notify('Could not open video', 'Choose a video downloaded to this device and make sure Siqa has full Photos access.');
    }
  }

  async function generateAutoThumbnail(uri: string) {
    try {
      if (Platform.OS === 'web') {
        const dataUrl = await captureVideoFrameWeb(uri, 0);
        setThumbnail({
          uri: dataUrl,
          fileName: `siqa-autothumb-${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
        });
        return;
      }
      if (!VideoThumbnails) return;
      const { uri: autoThumbUri } = await VideoThumbnails.getThumbnailAsync(uri, {
        time: 0,
        quality: 0.9,
      });
      setThumbnail({
        uri: autoThumbUri,
        fileName: `siqa-autothumb-${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
      });
    } catch (thumbErr) {
      // If auto-generation fails, the speaker can still pick one manually.
    }
  }

  async function recordVideo() {
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
    if (!cameraPermission.granted) {
      notify('Camera access needed', 'Allow Siqa to access your camera to record a Gem.');
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        videoMaxDuration: 180,
        quality: ImagePicker.UIImagePickerControllerQualityType?.High ?? undefined,
        cameraType: ImagePicker.CameraType.back,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setVideo({
        uri: asset.uri,
        fileName: asset.fileName || `siqa-recorded-${Date.now()}.mp4`,
        mimeType: asset.mimeType || 'video/mp4',
        duration: asset.duration,
        size: asset.fileSize,
      });

      await generateAutoThumbnail(asset.uri);
    } catch (error) {
      notify('Could not start camera', 'Make sure Siqa has camera and microphone access in Settings.');
    }
  }

  async function pickThumbnail() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify('Permission needed', 'Allow Siqa to access your photos to choose a thumbnail.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: effFormat === 'long' ? [16, 9] : [9, 16],
        quality: 0.85,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setThumbnail({
        uri: asset.uri,
        fileName: asset.fileName || `siqa-thumbnail-${Date.now()}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
      });
    } catch (error) {
      notify('Could not open photo', 'Choose a photo downloaded to this device and make sure Siqa has full Photos access.');
    }
  }

  function openFramePicker() {
    if (!video) return;
    videoDuration.current = video.duration ? video.duration * 1000 : 30000;
    setScrubPosition(0);
    setFrameUri(null);
    setFramePickerVisible(true);
    // Capture first frame immediately
    captureFrameAt(0);
  }

  const scrubPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const x = e.nativeEvent.locationX;
        const pos = Math.min(1, Math.max(0, x / (scrubBarWidth.current || 1)));
        setScrubPosition(pos);
        captureFrameAt(pos);
      },
      onPanResponderMove: (e) => {
        const x = e.nativeEvent.locationX;
        const pos = Math.min(1, Math.max(0, x / (scrubBarWidth.current || 1)));
        setScrubPosition(pos);
      },
      onPanResponderRelease: (e) => {
        const x = e.nativeEvent.locationX;
        const pos = Math.min(1, Math.max(0, x / (scrubBarWidth.current || 1)));
        setScrubPosition(pos);
        captureFrameAt(pos);
      },
    })
  ).current;

  async function captureFrameAt(position: number) {
    if (!video) return;
    setCapturingFrame(true);
    try {
      if (Platform.OS === 'web') {
        const timeSec = (position * videoDuration.current) / 1000;
        const dataUrl = await captureVideoFrameWeb(video.uri, timeSec);
        setFrameUri(dataUrl);
        return;
      }
      if (!VideoThumbnails) return;
      const timeMs = Math.round(position * videoDuration.current);
      const { uri } = await VideoThumbnails.getThumbnailAsync(video.uri, {
        time: timeMs,
        quality: 0.9,
      });
      setFrameUri(uri);
    } catch (e) {
      // silently fail — frame not available at this position
    } finally {
      setCapturingFrame(false);
    }
  }

  function useThisFrame() {
    if (!frameUri) return;
    setThumbnail({
      uri: frameUri,
      fileName: `siqa-frame-${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
    });
    setFramePickerVisible(false);
  }

  function toggleTopic(topic: string) {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic],
    );
  }

  function selectSeed(seedId: string) {
    if (fundraiserId === seedId) {
      setFundraiserId('');
      return;
    }
    setFundraiserId(seedId);
    setPlantSeed(true);
  }

  function animateSuccess() {
    setSuccess(true);
    successScale.setValue(0.86);
    successOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(successOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(successScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
    ]).start();
  }

  async function postGem() {
    if (uploading) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace('/(auth)/login');
      return;
    }

    const finalSpeakerId = isAdmin ? selectedSpeakerId : speakerId;
    if (!finalSpeakerId) {
      // Speaker accounts are approved by Siqa; send them to apply.
      notify('Apply to become a speaker', 'Only verified speakers can post Gems. Apply and the Siqa team will review it.');
      router.push('/apply-speaker' as any);
      return;
    }
    if (!isAdmin && !speakerApproved) {
      // Check before uploading the video, not after (the database would
      // reject the post anyway, and the upload would be wasted).
      notify('Awaiting approval', 'Your speaker account is still being reviewed. You can post Gems once it’s approved.');
      return;
    }

    if (!video) {
      notify('Select a video', 'Choose a video before posting your Gem.');
      return;
    }

    const cleanCaption = caption.trim();
    if (!cleanCaption) {
      notify('Caption required', 'Add a short caption so people know what this Gem is about.');
      return;
    }

    if (plantSeed && !fundraiserId.trim()) {
      notify('Choose a Seed', 'Select the fundraiser this Gem should point to, or turn off Plant a Seed.');
      return;
    }

    setUploading(true);
    setProgressPct(0);
    setProgressLabel('Starting upload...');

    try {
      let thumbnailUrl: string | null = null;
      if (thumbnail) {
        const thumbPath = makeBunnyThumbnailPath(user.id, thumbnail.fileName, thumbnail.mimeType);
        thumbnailUrl = await uploadThumbnailToBunny({
          uri: thumbnail.uri,
          fileName: thumbPath,
          mimeType: thumbnail.mimeType,
          onProgress: ({ pct, label }) => {
            setProgressPct(pct);
            setProgressLabel(label);
          },
        });
      }

      const bunnyPath = makeBunnyGemPath(user.id, video.fileName, video.mimeType);
      const videoUrl = await uploadVideoToBunny({
        uri: video.uri,
        fileName: bunnyPath,
        mimeType: video.mimeType,
        progressStart: thumbnail ? 20 : 8,
        progressEnd: 88,
        onProgress: ({ pct, label }) => {
          setProgressPct(pct);
          setProgressLabel(label);
        },
      });

      setProgressPct(94);
      setProgressLabel('Saving Gem...');

      const detectedDurationSecs = video.duration != null ? Math.round(video.duration) : null;
      const finalFormat: 'short' | 'long' =
        contentFormat === 'auto'
          ? detectedDurationSecs != null && detectedDurationSecs > 180
            ? 'long'
            : 'short'
          : contentFormat;

      const basePayload: Record<string, any> = {
        speaker_id: finalSpeakerId,
        ...(postOrgId ? { org_id: postOrgId } : null),
        ...(seriesId ? { series_id: seriesId, episode_number: episode ? parseInt(episode, 10) : null } : null),
        title: cleanCaption,
        description: description.trim() || cleanCaption,
        video_url: videoUrl,
        platform: 'bunny',
        thumbnail_url: thumbnailUrl,
        category: plantSeed ? 'fundraiser-demo' : 'lecture',
        topics: selectedTopics,
        visibility,
        is_published: true,
        status: 'published',
        published_at: new Date().toISOString(),
        format: finalFormat,
        duration_secs: detectedDurationSecs,
      };

      const ctaPayload = plantSeed
        ? {
            ...basePayload,
            cta_type: 'plant_seed',
            fundraiser_id: fundraiserId.trim(),
          }
        : { ...basePayload, cta_type: 'none', fundraiser_id: null };

      let insert = await supabase.from('videos').insert(ctaPayload as any).select().single();

      // Older Siqa schemas may not have these fields yet. Keep upload working and let Claude add schema later.
      if (insert.error && /cta_type|fundraiser_id|visibility|status/i.test(insert.error.message)) {
        const { cta_type, fundraiser_id, visibility: _visibility, status, ...fallbackPayload } = ctaPayload as any;
        insert = await supabase.from('videos').insert(fallbackPayload as any).select().single();
      }

      if (insert.error) throw insert.error;

      // The next episode starts from what was used this time.
      if (seriesId) {
        await supabase.from('series').update({
          description: description.trim() || selectedSeries?.description || null,
          default_topics: selectedTopics,
          default_format: finalFormat,
          default_visibility: visibility,
          default_fundraiser_id: plantSeed && fundraiserId.trim() ? fundraiserId.trim() : null,
          ...(!selectedSeries?.cover_url && thumbnailUrl ? { cover_url: thumbnailUrl } : null),
        }).eq('id', seriesId);
      }

      await AsyncStorage.removeItem(DRAFT_KEY);
      setProgressPct(100);
      setProgressLabel('Posted!');
      animateSuccess();
      setTimeout(() => router.replace('/(tabs)/gems'), 950);
    } catch (error: any) {
      console.error('[GemUpload] Upload failed:', error);
      notify('Upload failed', error?.message || 'Something went wrong while uploading the Gem.');
    } finally {
      setUploading(false);
    }
  }

  if (loadingProfile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={C.gold} size="large" />
      </View>
    );
  }

  // Form sections, shared by the phone layout and the desktop (YouTube-style) layout.
  const thumbnailCard = (
    <>
        <View style={styles.card}>
          <Text style={styles.label}>Thumbnail</Text>
          <View style={styles.thumbnailRow}>
            <TouchableOpacity
              style={styles.thumbnailBox}
              onPress={video ? openFramePicker : pickThumbnail}
              disabled={uploading}
            >
              {thumbnail ? (
                <Image source={{ uri: thumbnail.uri }} style={styles.thumbnailImage} />
              ) : (
                <View style={styles.thumbnailEmpty}>
                  <Glyph name="film-outline" style={styles.thumbnailPlus} />
                  <Text style={styles.thumbnailText}>{video ? 'Pick frame' : 'Pick cover'}</Text>
                </View>
              )}
            </TouchableOpacity>
            <View style={styles.thumbnailCopy}>
              <Text style={styles.thumbnailTitle}>
                {thumbnail ? 'Frame selected ✓' : 'Choose the frame people see first.'}
              </Text>
              <Text style={styles.thumbnailSub}>
                {video
                  ? 'Scrub through your clip to pick the perfect frame, or choose any image from your library.'
                  : 'Upload a video first, then pick a frame from the clip.'}
              </Text>
              {video && (
                <View style={styles.thumbBtnRow}>
                  <TouchableOpacity
                    style={styles.thumbActionBtn}
                    onPress={openFramePicker}
                    disabled={uploading}
                  >
                    <Text style={styles.thumbActionBtnText}><Glyph name="film-outline" style={styles.thumbActionBtnText} />{'  '}From clip</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.thumbActionBtn, styles.thumbActionBtnGhost]}
                    onPress={pickThumbnail}
                    disabled={uploading}
                  >
                    <Text style={styles.thumbActionBtnGhostText}><Glyph name="image-outline" style={styles.thumbActionBtnGhostText} />{'  '}From library</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
    </>
  );
  const framePickerModal = (
    <>
        {/* Frame Picker Modal */}
        <Modal
          visible={framePickerVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setFramePickerVisible(false)}
        >
          <View style={styles.fpContainer}>
            <View style={styles.fpHeader}>
              <TouchableOpacity onPress={() => setFramePickerVisible(false)}>
                <Text style={styles.fpCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.fpTitle}>Pick a Frame</Text>
              <TouchableOpacity onPress={useThisFrame} disabled={!frameUri || capturingFrame}>
                <Text style={[styles.fpUse, (!frameUri || capturingFrame) && { opacity: 0.35 }]}>
                  Use this
                </Text>
              </TouchableOpacity>
            </View>

            {/* Frame preview */}
            <View style={styles.fpPreview}>
              {capturingFrame ? (
                <View style={styles.fpPreviewLoading}>
                  <ActivityIndicator color={C.gold} size="large" />
                  <Text style={styles.fpPreviewLoadingText}>Capturing frame…</Text>
                </View>
              ) : frameUri ? (
                <Image
                  source={{ uri: frameUri }}
                  style={styles.fpPreviewImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.fpPreviewLoading}>
                  <Text style={styles.fpPreviewLoadingText}>Drag the scrubber below</Text>
                </View>
              )}
            </View>

            {/* Scrubber */}
            <View style={styles.fpScrubWrap}>
              <Text style={styles.fpScrubLabel}>
                {video?.duration
                  ? `${formatTime(scrubPosition * (video.duration ?? 0))} / ${formatTime(video.duration ?? 0)}`
                  : 'Drag to scrub'}
              </Text>
              <View
                style={styles.fpScrubTrack}
                onLayout={(e) => { scrubBarWidth.current = e.nativeEvent.layout.width; }}
                {...scrubPanResponder.panHandlers}
              >
                <View style={[styles.fpScrubFill, { width: `${scrubPosition * 100}%` }]} />
                <View style={[styles.fpScrubThumb, { left: `${scrubPosition * 100}%` }]} />
              </View>
              <Text style={styles.fpScrubHint}>Drag left or right to scrub through your clip</Text>
            </View>
          </View>
        </Modal>
    </>
  );
  const progressBox = uploading ? (
          <View style={styles.progressBox}>
            <View style={styles.progressTop}>
              <Text style={styles.progressPct}>{progressPct}%</Text>
              <Text style={styles.progressLabel}>{progressLabel}</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
            </View>
          </View>
  ) : null;
  const speakerCard = isAdmin ? (
          <View style={styles.card}>
            <Text style={styles.label}>Post as speaker</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.speakerRow}>
              {speakers.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.speakerPill, selectedSpeakerId === s.id && styles.speakerPillActive]}
                  onPress={() => setSelectedSpeakerId(s.id)}
                  disabled={uploading}
                >
                  <Text style={[styles.speakerPillText, selectedSpeakerId === s.id && styles.speakerPillTextActive]}>
                    {s.display_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
  ) : null;
  const captionCard = (
    <>
        <View style={styles.card}>
          <Text style={styles.label}>Caption</Text>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Share what this clip is about..."
            placeholderTextColor={C.text3}
            multiline
            style={styles.captionInput}
            editable={!uploading}
          />
        </View>
    </>
  );
  const topicsCard = (
    <>
        <View style={styles.card}>
          <Text style={styles.label}>Topics</Text>
          <View style={styles.topicWrap}>
            {TOPICS.map((topic) => {
              const active = selectedTopics.includes(topic);
              return (
                <TouchableOpacity
                  key={topic}
                  style={[styles.topic, active && styles.topicActive]}
                  onPress={() => toggleTopic(topic)}
                  disabled={uploading}
                >
                  <Text style={[styles.topicText, active && styles.topicTextActive]}>{topic}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
    </>
  );
  const seedCard = (
    <>
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchTextWrap}>
              <Text style={styles.switchTitle}>Plant a Seed CTA</Text>
              <Text style={styles.switchSub}>Optional sadaqah jariyah link for this Gem.</Text>
            </View>
            <Switch
              value={plantSeed}
              onValueChange={setPlantSeed}
              disabled={uploading}
              trackColor={{ false: C.surface3, true: C.emerald }}
              thumbColor={plantSeed ? C.gold : C.text3}
            />
          </View>
          {plantSeed && (
            <View style={styles.seedSelectorWrap}>
              {seeds.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seedRow}>
                  {seeds.map((seed) => {
                    const active = fundraiserId === seed.id;
                    return (
                      <TouchableOpacity
                        key={seed.id}
                        style={[styles.seedCard, active && styles.seedCardActive]}
                        onPress={() => selectSeed(seed.id)}
                        disabled={uploading}
                      >
                        <Text style={[styles.seedTitle, active && styles.seedTitleActive]} numberOfLines={2}>{seed.title}</Text>
                        {!!seed.organization_name && <Text style={styles.seedOrg} numberOfLines={1}>{seed.organization_name}</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : (
                <Text style={styles.emptySeeds}>No Seeds were found yet. You can paste a fundraiser ID below.</Text>
              )}
              <TextInput
                value={fundraiserId}
                onChangeText={setFundraiserId}
                placeholder="Fundraiser ID"
                placeholderTextColor={C.text3}
                style={styles.input}
                autoCapitalize="none"
                editable={!uploading}
              />
            </View>
          )}
        </View>
    </>
  );
  const visibilityCard = (
    <>
        <View style={styles.card}>
          <Text style={styles.label}>Visibility</Text>
          <View style={styles.visibilityRow}>
            {(['public', 'followers'] as const).map((v) => (
              <TouchableOpacity
                key={v}
                style={[styles.visCard, visibility === v && styles.visCardActive]}
                onPress={() => setVisibility(v)}
                disabled={uploading}
              >
                <Text style={[styles.visTitle, visibility === v && styles.visTitleActive]}>
                  {v === 'public' ? 'Public' : 'Followers only'}
                </Text>
                <Text style={styles.visSub}>{v === 'public' ? 'Anyone can watch' : 'Your followers'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
    </>
  );
  const formatCard = (
    <>
        <View style={styles.card}>
          <Text style={styles.label}>Content format</Text>
          <View style={styles.visibilityRow}>
            {(['auto', 'short', 'long'] as const).map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.visCard, contentFormat === f && styles.visCardActive]}
                onPress={() => setContentFormat(f)}
                disabled={uploading}
              >
                <Text style={[styles.visTitle, contentFormat === f && styles.visTitleActive]}>
                  {f === 'auto' ? 'Auto detect' : f === 'short' ? 'Short (Gem)' : 'Long (Video)'}
                </Text>
                <Text style={styles.visSub}>
                  {f === 'auto' ? 'Based on length' : f === 'short' ? 'Gems feed' : 'Browse & channel'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {video?.duration != null ? (
            <Text style={styles.formatHint}>
              {contentFormat === 'auto'
                ? `Detected as ${video.duration > 180 ? 'Long' : 'Short'} (${formatTime(video.duration)})`
                : `Duration: ${formatTime(video.duration)} — posting as ${contentFormat === 'long' ? 'Long' : 'Short'} regardless of length`}
            </Text>
          ) : null}
        </View>
    </>
  );
  const successOverlay = success ? (
        <Animated.View style={[styles.successOverlay, { opacity: successOpacity }]}> 
          <Animated.View style={[styles.successCard, { transform: [{ scale: successScale }] }]}> 
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>Gem planted</Text>
            <Text style={styles.successSub}>Your video is live in Gems.</Text>
          </Animated.View>
        </Animated.View>
  ) : null;

  function renderDesktop() {
    if (!video) {
      return (
        <View style={styles.dtScreen}>
          <View style={styles.dtDialog}>
            <View style={styles.dtHeader}>
              <Text style={styles.dtTitle}>Upload video</Text>
              <TouchableOpacity style={styles.dtIconBtn} onPress={() => goBack('/home')}>
                <Icon name="close" size={24} color={C.text} />
              </TouchableOpacity>
            </View>
            <View ref={dropRef} style={[styles.dtDrop, dragOver && styles.dtDropActive]}>
              <TouchableOpacity style={[styles.dtDropCircle, dragOver && styles.dtDropCircleActive]} onPress={selectWebFile}>
                <Icon name="arrow-up" size={58} color={dragOver ? C.gold : C.text3} />
              </TouchableOpacity>
              <Text style={styles.dtDropTitle}>{dragOver ? 'Drop to upload' : 'Drag and drop a video file to upload'}</Text>
              <Text style={styles.dtDropSub}>Nothing is posted until you hit Publish.</Text>
              {dropError ? <Text style={styles.dtDropError}>{dropError}</Text> : null}
              <TouchableOpacity style={styles.dtSelectBtn} onPress={selectWebFile}>
                <Text style={styles.dtSelectBtnText}>Select file</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.dtTerms}>
              By posting to Siqa, you agree to Siqa's Terms of Service and Community Guidelines.{'\n'}
              Please make sure your video doesn't violate anyone else's privacy or copyright.
            </Text>
          </View>
        </View>
      );
    }

    const title = caption.trim() || video.fileName;
    return (
      <View style={styles.dtScreen}>
        <View style={styles.dtDialog}>
          <View style={styles.dtHeader}>
            <Text style={styles.dtTitle} numberOfLines={1}>{title}</Text>
            <View style={styles.dtHeaderActions}>
              <TouchableOpacity onPress={() => saveDraft(true)} disabled={uploading || savingDraft}>
                <Text style={styles.dtHeaderLink}>{savingDraft ? 'Saving…' : 'Save draft'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dtIconBtn} onPress={() => goBack('/home')} disabled={uploading}>
                <Icon name="close" size={24} color={C.text} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.dtBody}>
            <ScrollView style={styles.dtLeft} contentContainerStyle={styles.dtLeftContent} keyboardShouldPersistTaps="handled">
              <Text style={styles.dtSection}>Details</Text>
              {progressBox}
              {captionCard}
              <View style={styles.card}>
                <SeriesPicker
                  series={seriesList}
                  selectedId={seriesId}
                  onPick={applySeries}
                  onCreate={createSeries}
                  creating={creatingSeries}
                  episode={episode}
                  onEpisode={setEpisode}
                  description={description}
                  onDescription={setDescription}
                  disabled={uploading}
                  orgNames={orgNames}
                />
              </View>
              {thumbnailCard}
              {speakerCard}
              {topicsCard}
              {seedCard}
            </ScrollView>

            <ScrollView style={styles.dtRight} contentContainerStyle={styles.dtRightContent}>
              <View style={styles.dtPreview}>
                <View style={styles.dtPlayer}>
                  <Video videoStyle={{ width: '100%', height: '100%' }}
                    source={{ uri: video.uri }}
                    style={StyleSheet.absoluteFill}
                    resizeMode={ResizeMode.CONTAIN}
                    useNativeControls
                    shouldPlay={false}
                  />
                </View>
                <View style={styles.dtPreviewMeta}>
                  <Text style={styles.dtMetaLabel}>Filename</Text>
                  <Text style={styles.dtMetaValue} numberOfLines={1}>{video.fileName}</Text>
                  {video.duration != null && (
                    <>
                      <Text style={[styles.dtMetaLabel, { marginTop: 10 }]}>Length</Text>
                      <Text style={styles.dtMetaValue}>{formatTime(video.duration)}</Text>
                    </>
                  )}
                  <TouchableOpacity onPress={selectWebFile} disabled={uploading} style={{ marginTop: 12 }}>
                    <Text style={styles.dtHeaderLink}>Change video</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {postOrgs.length ? (
                <View style={styles.card}>
                  <Text style={styles.label}>Post under</Text>
                  <View style={styles.visibilityRow}>
                    {[{ id: null as string | null, org_name: 'My channel' }, ...postOrgs].map((o) => (
                      <TouchableOpacity
                        key={o.id ?? 'own'}
                        style={[styles.visCard, postOrgId === o.id && styles.visCardActive]}
                        onPress={() => setPostOrgId(o.id)}
                        disabled={uploading}
                      >
                        <Text style={[styles.visTitle, postOrgId === o.id && styles.visTitleActive]}>{o.org_name}</Text>
                        <Text style={styles.visSub}>{o.id ? 'Owned by the organization' : 'Yours'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}
              {visibilityCard}
              {formatCard}
            </ScrollView>
          </View>

          <View style={styles.dtFooter}>
            <View style={styles.dtFooterStatus}>
              <Icon name={uploading ? 'cloud-upload-outline' : 'checkmark-circle-outline'} size={18} color={uploading ? C.gold : C.text3} />
              <Text style={styles.dtFooterText} numberOfLines={1}>
                {uploading ? `${progressPct}% · ${progressLabel}` : 'Ready to publish'}
              </Text>
            </View>
            <View style={styles.dtHeaderActions}>
              <TouchableOpacity style={styles.dtGhostBtn} onPress={discardDraft} disabled={uploading}>
                <Text style={styles.dtGhostBtnText}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dtPublishBtn, uploading && styles.postBtnDisabled]} onPress={postGem} disabled={uploading}>
                <Text style={styles.dtPublishBtnText}>{uploading ? 'Publishing…' : 'Publish'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        {framePickerModal}
        {successOverlay}
      </View>
    );
  }

  // ── Phone layout: dark stage with the clip, white sheet with the details ──
  function renderPhone() {
    const { c, shadow } = ds;
    const speakerName = isAdmin
      ? speakers.find((s) => s.id === selectedSpeakerId)?.display_name || 'Choose speaker'
      : 'You';
    const chosenSeed = seeds.find((s) => s.id === fundraiserId);
    const detected = video?.duration != null ? (video.duration > 180 ? 'Long' : 'Short') : null;
    const formatValue =
      contentFormat === 'auto' ? (detected ? `Auto · ${detected}` : 'Auto') : contentFormat === 'short' ? 'Short' : 'Long';
    const fileTitle = video?.fileName?.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
    const filteredSpeakers = speakerQuery.trim()
      ? speakers.filter((s) => s.display_name.toLowerCase().includes(speakerQuery.trim().toLowerCase()))
      : speakers;

    // Short = tall 9:16 frame; long = full-width 16:9 frame.
    const frameW = effFormat === 'long' ? Math.min(winW - 40, 560) : 206;
    const frameH = effFormat === 'long' ? Math.round(frameW * 9 / 16) : 366;
    const lengthHint =
      video?.duration != null && contentFormat !== 'auto' && (contentFormat === 'short') === isLongVideo
        ? isLongVideo
          ? `This video is ${formatTime(video.duration)}. Videos over 3 minutes usually go in Long.`
          : `This video is ${formatTime(video.duration)}. Clips 3 minutes or less usually go in Short.`
        : contentFormat === 'auto' && video?.duration != null
          ? `Picked ${isLongVideo ? 'Long' : 'Short'} from the length (${formatTime(video.duration)})`
          : null;

    return (
      <View style={{ flex: 1, backgroundColor: c.stage }}>
        {/* Stage: top bar, format switch, preview */}
        <View
          style={{ paddingTop: Platform.OS === 'web' ? 8 : 52, paddingBottom: 26 + 20 }}
          onLayout={(e) => setStageBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
        >
          <View onLayout={(e) => setHeaderBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 }}>
              <IconButton icon="close" label="Close" color="#ffffff" onPress={() => goBack('/home')} disabled={uploading} />
              <Text style={[T.headline, { color: '#ffffff' }]} accessibilityRole="header">{effFormat === 'long' ? 'New video' : 'New Gem'}</Text>
              <Pressable onPress={discardDraft} disabled={uploading} hitSlop={6} style={{ height: 44, paddingHorizontal: 12, justifyContent: 'center' }} accessibilityRole="button">
                <Text style={[T.buttonMd, font(600), { color: 'rgba(255,255,255,0.72)' }]}>Clear</Text>
              </Pressable>
            </View>

          </View>

          <View style={{ alignItems: 'center', marginTop: 4, gap: 14 }}>
            <View accessibilityRole="radiogroup" accessibilityLabel="Format" style={{ flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' }}>
              {([['short', 'Short · Gem'], ['long', 'Long video']] as const).map(([v, label]) => {
                const on = effFormat === v;
                return (
                  <Pressable
                    key={v}
                    onPress={() => { setContentFormat(v); setPreviewPlaying(false); }}
                    disabled={uploading}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    style={{ height: 34, minWidth: 124, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? '#ffffff' : 'transparent' }}
                  >
                    <Text style={[T.buttonSm, font(on ? 700 : 600), { color: on ? '#0a0f1c' : 'rgba(255,255,255,0.78)' }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
              {video ? (
                <View style={[{ width: frameW, height: frameH, borderRadius: 22, overflow: 'hidden', backgroundColor: '#48525C' }, { boxShadow: '0px 24px 60px rgba(0,0,0,0.55), 0px 0px 0px 1px rgba(255,255,255,0.08)' } as any]}>
                  {previewPlaying || !thumbnail ? (
                    <Video videoStyle={{ width: '100%', height: '100%' }}
                      source={{ uri: video.uri }}
                      style={StyleSheet.absoluteFill}
                      resizeMode={ResizeMode.COVER}
                      shouldPlay={previewPlaying}
                      isLooping
                      isMuted={!previewPlaying}
                    />
                  ) : (
                    <Image source={{ uri: thumbnail.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  )}
                  <Pressable
                    onPress={() => setPreviewPlaying((p) => !p)}
                    accessibilityRole="button"
                    accessibilityLabel={previewPlaying ? 'Pause preview' : 'Play preview'}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 56, alignItems: 'center', justifyContent: 'center' }}
                  >
                    {!previewPlaying ? (
                      <View style={[{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }, { boxShadow: 'inset 0px 0px 0px 1px rgba(255,255,255,0.35)' } as any]}>
                        <Icon name="play" size={24} color="#ffffff" />
                      </View>
                    ) : null}
                  </Pressable>
                  {video.duration != null ? (
                    <View style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
                      <Text style={[T.micro, { color: '#ffffff' }]}>{formatTime(video.duration)}</Text>
                    </View>
                  ) : null}
                  <View style={{ position: 'absolute', left: 10, right: 10, bottom: 10, flexDirection: 'row', gap: 6 }}>
                    <Button label="Edit cover" icon="image-outline" variant="light" size="sm" grow onPress={() => setSheet('cover')} disabled={uploading} />
                    <IconButton icon="swap-horizontal" label="Replace video" variant="scrim" size="sm" onPress={pickVideo} disabled={uploading} />
                  </View>
                </View>
              ) : (
                <View style={{ width: frameW, minHeight: frameH, borderRadius: 22, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 }}>
                  <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="film-outline" size={26} color="#ffffff" />
                  </View>
                  <Text style={[T.callout, { color: 'rgba(255,255,255,0.8)', textAlign: 'center' }]}>{effFormat === 'long' ? 'Horizontal (16:9) videos work best' : 'Vertical clips work best'}</Text>
                  <Button label="Choose video" icon="add" variant="light" size="md" onPress={pickVideo} disabled={uploading} />
                  {Platform.OS !== 'web' ? (
                    <Button label="Record" icon="radio-button-on" variant="ghost" size="sm" onPress={recordVideo} disabled={uploading} style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
                  ) : null}
                </View>
              )}
            {lengthHint ? (
              <Text style={[T.caption, { color: 'rgba(255,255,255,0.7)', textAlign: 'center', paddingHorizontal: 24 }]}>{lengthHint}</Text>
            ) : null}
          </View>
        </View>

        {/* Details drawer: drag the handle up to cover the preview, down to see it */}
        <Animated.View
          style={[
            { position: 'absolute', left: 0, right: 0, bottom: 0, top: sheetTop, opacity: stageBottom ? 1 : 0, backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet },
            shadow('sheet'),
          ]}
        >
          <GestureDetector gesture={sheetGesture}>
            <View
              collapsable={false}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={sheetOpen ? 'Details expanded. Swipe down to show the video' : 'Details. Swipe up for more room'}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) => setSheetOpen(e.nativeEvent.actionName === 'increment')}
              style={{ height: 28, alignItems: 'center', justifyContent: 'center', cursor: 'grab' } as any}
            >
              <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: c.surfaceStrong }} />
            </View>
          </GestureDetector>

          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12 }}>
            <View style={{ paddingHorizontal: space[5], paddingTop: space[4], gap: 10 }}>
              <TextField
                variant="bare"
                value={caption}
                onChangeText={setCaption}
                placeholder={effFormat === 'long' ? 'Describe your video…' : 'Describe your Gem…'}
                onFocus={() => setSheetOpen(true)}
                accessibilityLabel="Caption"
                multiline
                editable={!uploading}
                style={{ minHeight: 84, fontSize: 18, lineHeight: 26 }}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Chip label="# Topic" onPress={() => setSheet('topics')} disabled={uploading} />
                {video && fileTitle && !caption.trim() ? (
                  <Chip label="Use file name" onPress={() => setCaption(fileTitle)} disabled={uploading} />
                ) : null}
              </View>
              <View style={{ paddingVertical: 8 }}>
                <SeriesPicker
                  series={seriesList}
                  selectedId={seriesId}
                  onPick={(sr) => { applySeries(sr); if (sr) setSheetOpen(true); }}
                  onCreate={createSeries}
                  creating={creatingSeries}
                  episode={episode}
                  onEpisode={setEpisode}
                  description={description}
                  onDescription={setDescription}
                  disabled={uploading}
                  orgNames={orgNames}
                />
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: c.line, marginHorizontal: space[5], marginTop: 14 }} />

            <View style={{ paddingHorizontal: space[5] }}>
              {isAdmin ? (
                <ListRow icon="person-outline" label="Posting as" value={speakerName} onPress={() => setSheet('speaker')} disabled={uploading} />
              ) : null}
              {postOrgs.length ? (
                <ListRow icon="business-outline" label="Post under" value={postOrgName ?? 'My channel'} onPress={() => setSheet('owner')} disabled={uploading} />
              ) : null}
              <ListRow icon="pricetag-outline" label="Topics" value={selectedTopics.join(', ') || 'None'} onPress={() => setSheet('topics')} disabled={uploading} />
              <ListRow icon="eye-outline" label="Who can see" value={visibility === 'public' ? 'Everyone' : 'Followers'} onPress={() => setSheet('visibility')} disabled={uploading} />
              <ListRow
                icon="leaf-outline"
                label="Plant a Seed button"
                sub={effFormat === 'long' ? 'Let viewers donate from this video' : 'Let viewers donate from this Gem'}
                last={!plantSeed}
                right={
                  <DSSwitch
                    label="Plant a Seed button"
                    value={plantSeed}
                    disabled={uploading}
                    onValueChange={(v) => { setPlantSeed(v); if (v && !fundraiserId) setSheet('seed'); }}
                  />
                }
              />
              {plantSeed ? (
                <Pressable
                  onPress={() => setSheet('seed')}
                  disabled={uploading}
                  accessibilityRole="button"
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 38, marginBottom: 8, padding: 10, paddingRight: 12, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.goldTint, opacity: pressed ? 0.7 : 1 })}
                >
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c.seedTint, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="leaf" size={17} color={c.seed} />
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={[T.subhead, font(600), { color: c.ink }]} numberOfLines={1}>
                      {chosenSeed?.title || (fundraiserId ? 'Seed selected' : 'Choose a Seed')}
                    </Text>
                    <Text style={[T.micro, font(500), { color: c.ink2 }]}>
                      {fundraiserId ? 'Tap to choose a different Seed' : 'Pick the Seed this Gem supports'}
                    </Text>
                  </View>
                  <Icon name="chevron-forward" size={16} color={c.ink3} />
                </Pressable>
              ) : null}
            </View>

          </ScrollView>

            <View style={{ paddingHorizontal: space[5], paddingTop: 14, paddingBottom: Platform.OS === 'ios' ? 34 : 24, gap: 12 }}>
              {uploading ? (
                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[T.caption, font(700), { color: c.ink }]}>{progressPct}%</Text>
                    <Text style={[T.caption, { color: c.ink2 }]} numberOfLines={1}>{progressLabel}</Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: c.surfaceStrong, overflow: 'hidden' }}>
                    <View style={{ height: 6, width: `${progressPct}%`, backgroundColor: c.gold }} />
                  </View>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button label={savingDraft ? 'Saving…' : 'Save draft'} variant="secondary" onPress={() => saveDraft(true)} disabled={uploading || savingDraft} style={{ flex: 1 }} />
                <Button label={uploading ? 'Posting' : effFormat === 'long' ? 'Post video' : 'Post Gem'} iconRight={uploading ? undefined : 'arrow-forward'} onPress={postGem} loading={uploading} style={{ flex: 1.6 }} />
              </View>
            </View>
        </Animated.View>

        {/* Sheets */}
        <BottomSheet visible={sheet === 'topics'} onClose={() => setSheet(null)} title="Topics" footer={<Button label="Done" onPress={() => setSheet(null)} />}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 6 }}>
            {TOPICS.map((topic) => (
              <Chip key={topic} label={topic} selected={selectedTopics.includes(topic)} onPress={() => toggleTopic(topic)} />
            ))}
          </View>
        </BottomSheet>

        <BottomSheet visible={sheet === 'owner'} onClose={() => setSheet(null)} title="Post under">
          <OptionRow label="My channel" sub="This video is yours" icon="person-outline" selected={!postOrgId} onPress={() => { setPostOrgId(null); setSheet(null); }} last={!postOrgs.length} />
          {postOrgs.map((o, i) => (
            <OptionRow key={o.id} label={o.org_name} sub="Owned by the organization, shown on its page" icon="business-outline" selected={postOrgId === o.id} onPress={() => { setPostOrgId(o.id); setSheet(null); }} last={i === postOrgs.length - 1} />
          ))}
        </BottomSheet>

        <BottomSheet visible={sheet === 'visibility'} onClose={() => setSheet(null)} title="Who can see">
          <OptionRow label="Everyone" sub="Anyone on Siqa can watch" icon="globe-outline" selected={visibility === 'public'} onPress={() => { setVisibility('public'); setSheet(null); }} />
          <OptionRow label="Followers" sub="Only people who follow you" icon="people-outline" selected={visibility === 'followers'} onPress={() => { setVisibility('followers'); setSheet(null); }} last />
        </BottomSheet>

        <BottomSheet visible={sheet === 'format'} onClose={() => setSheet(null)} title="Format">
          <OptionRow label="Auto" sub={detected ? `Detected as ${detected} (${formatTime(video!.duration!)})` : 'Short if 3 minutes or less'} selected={contentFormat === 'auto'} onPress={() => { setContentFormat('auto'); setSheet(null); }} />
          <OptionRow label="Short" sub="Shows in the Gems feed" selected={contentFormat === 'short'} onPress={() => { setContentFormat('short'); setSheet(null); }} />
          <OptionRow label="Long" sub="Shows in Browse and on your channel" selected={contentFormat === 'long'} onPress={() => { setContentFormat('long'); setSheet(null); }} last />
        </BottomSheet>

        <BottomSheet visible={sheet === 'speaker'} onClose={() => setSheet(null)} title="Posting as">
          <TextField placeholder="Search speakers" value={speakerQuery} onChangeText={setSpeakerQuery} autoCapitalize="none" containerStyle={{ marginBottom: 6 }} />
          {filteredSpeakers.slice(0, 60).map((s, i, arr) => (
            <OptionRow key={s.id} label={s.display_name} selected={selectedSpeakerId === s.id} onPress={() => { setSelectedSpeakerId(s.id); setSheet(null); }} last={i === arr.length - 1} />
          ))}
        </BottomSheet>

        <BottomSheet visible={sheet === 'seed'} onClose={() => setSheet(null)} title="Choose a Seed">
          {seeds.length === 0 ? (
            <Text style={[T.callout, { color: c.ink2, paddingVertical: 8 }]}>No Seeds yet. Paste a Seed ID below.</Text>
          ) : null}
          {seeds.map((seed) => (
            <OptionRow
              key={seed.id}
              label={seed.title}
              sub={seed.organization_name || undefined}
              icon="leaf-outline"
              selected={fundraiserId === seed.id}
              onPress={() => { setFundraiserId(seed.id); setPlantSeed(true); setSheet(null); }}
            />
          ))}
          <TextField label="Or paste a Seed ID" value={fundraiserId} onChangeText={setFundraiserId} autoCapitalize="none" containerStyle={{ marginTop: 14 }} />
        </BottomSheet>

        <BottomSheet visible={sheet === 'cover'} onClose={() => setSheet(null)} title="Cover">
          <OptionRow label="Pick a frame from the clip" icon="film-outline" action onPress={() => { setSheet(null); openFramePicker(); }} />
          <OptionRow label="Choose a photo" icon="image-outline" action onPress={() => { setSheet(null); pickThumbnail(); }} last />
        </BottomSheet>

        {framePickerModal}
        {successOverlay}
      </View>
    );
  }

  if (isDesktopWeb) return renderDesktop();
  return renderPhone();
}

function formatTime(seconds: number) {
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function makeStyles(C: AppColors, isDark: boolean, isDesktopWeb = false) {
  // On desktop the header and form sit in one centered column instead of
  // stretching across the window; the tall top padding only exists to
  // clear a phone's status bar, so it's dropped there too.
  const desktopColumn = isDesktopWeb
    ? { maxWidth: 760, width: '100%' as const, alignSelf: 'center' as const }
    : {};
  return StyleSheet.create(brandStyles({
    screen: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
    header: {
      paddingTop: isDesktopWeb ? 20 : 58,
      paddingHorizontal: 18,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: C.bg,
      ...desktopColumn,
    },
    cancel: { color: C.text2, fontSize: 14, fontWeight: '600' },
    headerTitleWrap: { alignItems: 'center' },
    headerTitle: { color: C.text, fontSize: 17, fontWeight: '800' },
    headerArabic: { color: C.gold, fontSize: 18, marginTop: -2 },
    postBtn: { backgroundColor: C.gold, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
    postBtnDisabled: { opacity: 0.55 },
    postBtnText: { color: C.black, fontSize: 13, fontWeight: '800' },
    content: { padding: 16, paddingBottom: 40, ...desktopColumn },
    draftRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    draftBtn: { flex: 1, backgroundColor: C.goldBg, borderColor: C.goldDim, borderWidth: 1, borderRadius: 14, paddingVertical: 11, alignItems: 'center' },
    draftBtnText: { color: C.gold, fontSize: 13, fontWeight: '800' },
    draftBtnGhost: { flex: 1, backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 14, paddingVertical: 11, alignItems: 'center' },
    draftBtnGhostText: { color: C.text2, fontSize: 13, fontWeight: '800' },
    uploadZone: {
      height: 230,
      borderRadius: 22,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: C.goldDim,
      backgroundColor: C.surface,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      marginBottom: 14,
    },
    recordBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 10,
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.goldDim,
      backgroundColor: 'rgba(201,168,76,0.06)',
    },
    recordDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#e84545',
    },
    recordBtnText: {
      color: C.gold,
      fontSize: 14,
      fontWeight: '700',
    },
    uploadZoneLoaded: { borderStyle: 'solid', borderColor: C.emeraldLight },
    videoScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: isDark ? 'rgba(0,0,0,0.38)' : 'rgba(0,0,0,0.18)' },
    uploadIcon: { color: C.gold, fontSize: 36, fontWeight: '900', zIndex: 2 },
    uploadTitle: { color: C.text, fontSize: 16, fontWeight: '800', marginTop: 8, zIndex: 2, maxWidth: '84%' },
    uploadSub: { color: C.text3, fontSize: 12, marginTop: 5, zIndex: 2 },
    thumbnailRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    thumbnailBox: { width: 92, height: 132, borderRadius: 16, overflow: 'hidden', backgroundColor: C.bg2, borderColor: C.border, borderWidth: 1 },
    thumbnailImage: { width: '100%', height: '100%' },
    thumbnailEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
    thumbnailPlus: { color: C.gold, fontSize: 24, fontWeight: '900' },
    thumbnailText: { color: C.text2, fontSize: 11, fontWeight: '800', marginTop: 4, textAlign: 'center' },
    thumbnailCopy: { flex: 1 },
    thumbnailTitle: { color: C.text, fontSize: 14, fontWeight: '800', lineHeight: 19 },
    thumbnailSub: { color: C.text3, fontSize: 12, lineHeight: 17, marginTop: 4 },
    progressBox: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 14 },
    progressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    progressPct: { color: C.gold, fontSize: 18, fontWeight: '900' },
    progressLabel: { color: C.text2, fontSize: 12, fontWeight: '600', flex: 1, textAlign: 'right', marginLeft: 12 },
    progressTrack: { height: 5, borderRadius: 999, backgroundColor: C.surface2, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 999, backgroundColor: C.gold },
    card: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 14 },
    label: { color: C.text3, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
    captionInput: { minHeight: 92, color: C.text, fontSize: 15, lineHeight: 22, textAlignVertical: 'top' },
    topicWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    topic: { borderColor: C.border, borderWidth: 1, backgroundColor: C.surface2, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999 },
    topicActive: { backgroundColor: C.gold, borderColor: C.gold },
    topicText: { color: C.text2, fontSize: 12, fontWeight: '700' },
    topicTextActive: { color: C.black },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    switchTextWrap: { flex: 1 },
    switchTitle: { color: C.text, fontSize: 15, fontWeight: '800' },
    switchSub: { color: C.text3, fontSize: 12, marginTop: 3, lineHeight: 17 },
    seedSelectorWrap: { marginTop: 12 },
    seedRow: { gap: 10, paddingRight: 6 },
    seedCard: { width: 160, minHeight: 84, backgroundColor: C.bg2, borderColor: C.border, borderWidth: 1, borderRadius: 14, padding: 12, justifyContent: 'space-between' },
    seedCardActive: { borderColor: C.emeraldLight, backgroundColor: C.emeraldBg },
    seedTitle: { color: C.text, fontSize: 12, fontWeight: '800', lineHeight: 17 },
    seedTitleActive: { color: C.emeraldLight },
    seedOrg: { color: C.text3, fontSize: 10, fontWeight: '700', marginTop: 8 },
    emptySeeds: { color: C.text3, fontSize: 12, lineHeight: 17, marginBottom: 8 },
    input: { marginTop: 12, borderColor: C.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, color: C.text, backgroundColor: C.bg2 },
    visibilityRow: { flexDirection: 'row', gap: 10 },
    visCard: { flex: 1, borderColor: C.border, borderWidth: 1, borderRadius: 14, padding: 12, backgroundColor: C.bg2 },
    visCardActive: { borderColor: C.gold, backgroundColor: C.goldBg },
    visTitle: { color: C.text, fontSize: 13, fontWeight: '800' },
    visTitleActive: { color: C.gold },
    visSub: { color: C.text3, fontSize: 11, marginTop: 4 },
    formatHint: { color: C.text3, fontSize: 12, marginTop: 10 },
    speakerRow: { gap: 8 },
    speakerPill: { borderColor: C.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.bg2 },
    speakerPillActive: { backgroundColor: C.gold, borderColor: C.gold },
    speakerPillText: { color: C.text2, fontSize: 12, fontWeight: '700' },
    speakerPillTextActive: { color: C.black },
    securityNote: { color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 12, marginTop: 4 },
    successOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: isDark ? 'rgba(0,0,0,0.68)' : 'rgba(255,255,255,0.72)', alignItems: 'center', justifyContent: 'center', padding: 28 },
    successCard: { width: '100%', maxWidth: 320, backgroundColor: C.surface, borderColor: C.goldDim, borderWidth: 1, borderRadius: 28, padding: 28, alignItems: 'center' },
    successIcon: { width: 70, height: 70, borderRadius: 35, backgroundColor: C.gold, color: C.black, textAlign: 'center', lineHeight: 70, fontSize: 42, fontWeight: '900', overflow: 'hidden' },
    successTitle: { color: C.text, fontSize: 22, fontWeight: '900', marginTop: 16 },
    successSub: { color: C.text2, fontSize: 13, marginTop: 6, textAlign: 'center' },

    // Desktop (YouTube-style) layout
    dtScreen: { flex: 1, backgroundColor: C.bg, padding: 24 },
    dtDialog: {
      flex: 1, width: '100%', maxWidth: 1180, alignSelf: 'center', backgroundColor: C.surface,
      borderRadius: 22, borderWidth: 0.5, borderColor: C.border2, overflow: 'hidden',
    },
    dtHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      paddingHorizontal: 28, paddingVertical: 18, borderBottomWidth: 0.5, borderBottomColor: C.border2,
    },
    dtTitle: { color: C.text, fontSize: 22, fontWeight: '800', flexShrink: 1 },
    dtHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    dtHeaderLink: { color: C.gold, fontSize: 13, fontWeight: '700' },
    dtIconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    dtDrop: {
      flex: 1, alignItems: 'center', justifyContent: 'center', margin: 20, borderRadius: 18,
      borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'transparent',
    },
    dtDropActive: { borderColor: C.gold, backgroundColor: C.goldBg },
    dtDropCircle: {
      width: 136, height: 136, borderRadius: 68, backgroundColor: C.surface2,
      alignItems: 'center', justifyContent: 'center', marginBottom: 26,
    },
    dtDropCircleActive: { backgroundColor: C.bg2 },
    dtDropTitle: { color: C.text, fontSize: 16, fontWeight: '600' },
    dtDropSub: { color: C.text3, fontSize: 13, marginTop: 6 },
    dtDropError: { color: '#e84545', fontSize: 13, marginTop: 12, fontWeight: '600' },
    dtSelectBtn: { backgroundColor: C.gold, borderRadius: 999, paddingHorizontal: 26, paddingVertical: 12, marginTop: 26 },
    dtSelectBtnText: { color: C.black, fontSize: 14, fontWeight: '800' },
    dtTerms: { color: C.text3, fontSize: 12, lineHeight: 19, textAlign: 'center', paddingHorizontal: 32, paddingBottom: 26 },
    dtBody: { flex: 1, flexDirection: 'row', minHeight: 0 },
    dtLeft: { flex: 1 },
    dtLeftContent: { paddingHorizontal: 28, paddingTop: 22, paddingBottom: 32 },
    dtRight: { width: 380, flexGrow: 0, borderLeftWidth: 0.5, borderLeftColor: C.border2 },
    dtRightContent: { padding: 22, paddingBottom: 32 },
    dtSection: { color: C.text, fontSize: 20, fontWeight: '800', marginBottom: 16 },
    dtPreview: { backgroundColor: C.bg2, borderRadius: 14, overflow: 'hidden', marginBottom: 14, borderWidth: 0.5, borderColor: C.border2 },
    dtPlayer: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
    dtPreviewMeta: { padding: 14 },
    dtMetaLabel: { color: C.text3, fontSize: 11, fontWeight: '700' },
    dtMetaValue: { color: C.text, fontSize: 13, marginTop: 3 },
    dtFooter: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      paddingHorizontal: 28, paddingVertical: 14, borderTopWidth: 0.5, borderTopColor: C.border2,
    },
    dtFooterStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    dtFooterText: { color: C.text2, fontSize: 13, flexShrink: 1 },
    dtGhostBtn: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10, borderWidth: 1, borderColor: C.border },
    dtGhostBtnText: { color: C.text2, fontSize: 13, fontWeight: '700' },
    dtPublishBtn: { backgroundColor: C.gold, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 10 },
    dtPublishBtnText: { color: C.black, fontSize: 14, fontWeight: '800' },

    // Thumb action buttons
    thumbBtnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    thumbActionBtn: {
      backgroundColor: C.gold, borderRadius: 10,
      paddingHorizontal: 10, paddingVertical: 7,
    },
    thumbActionBtnText: { color: C.black, fontSize: 11, fontWeight: '800' },
    thumbActionBtnGhost: {
      backgroundColor: 'transparent', borderWidth: 1, borderColor: C.border,
    },
    thumbActionBtnGhostText: { color: C.text2, fontSize: 11, fontWeight: '700' },

    // Frame picker modal
    fpContainer: { flex: 1, backgroundColor: C.bg },
    fpHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14,
      borderBottomWidth: 0.5, borderBottomColor: C.border,
    },
    fpCancel: { color: C.text2, fontSize: 15, fontWeight: '500' },
    fpTitle: { color: C.text, fontSize: 16, fontWeight: '800' },
    fpUse: { color: C.gold, fontSize: 15, fontWeight: '800' },
    fpPreview: {
      flex: 1,
      backgroundColor: '#000',
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: 0,
    },
    fpPreviewImage: {
      width: '100%',
      height: '100%',
    },
    fpPreviewLoading: {
      alignItems: 'center', gap: 12,
    },
    fpPreviewLoadingText: { color: C.text3, fontSize: 13 },
    fpScrubWrap: {
      padding: 24,
      paddingBottom: 44,
      backgroundColor: C.surface,
      borderTopWidth: 0.5,
      borderTopColor: C.border,
    },
    fpScrubLabel: {
      color: C.gold, fontSize: 13, fontWeight: '700',
      textAlign: 'center', marginBottom: 14,
    },
    fpScrubTrack: {
      height: 6, borderRadius: 3,
      backgroundColor: C.surface2,
      position: 'relative',
      justifyContent: 'center',
      marginBottom: 10,
    },
    fpScrubFill: {
      position: 'absolute', left: 0, top: 0,
      height: '100%', borderRadius: 3,
      backgroundColor: C.gold,
    },
    fpScrubThumb: {
      position: 'absolute',
      width: 22, height: 22, borderRadius: 11,
      backgroundColor: C.gold,
      marginLeft: -11,
      top: -8,
      shadowColor: '#000', shadowOpacity: 0.3,
      shadowOffset: { width: 0, height: 2 }, shadowRadius: 4,
    },
    fpScrubHint: { color: C.text3, fontSize: 11, textAlign: 'center' },
  }));
}