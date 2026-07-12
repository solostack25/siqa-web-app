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

const { width: SCREEN_W } = Dimensions.get('window');

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

export default function GemUploadScreen() {
  const { colors: C, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const successScale = useRef(new Animated.Value(0.86)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [speakerId, setSpeakerId] = useState<string | null>(null);
  const [speakers, setSpeakers] = useState<SpeakerOption[]>([]);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null);
  const [seeds, setSeeds] = useState<SeedOption[]>([]);

  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [thumbnail, setThumbnail] = useState<PickedImage | null>(null);
  const [caption, setCaption] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<string[]>(['Fundraising']);
  const [plantSeed, setPlantSeed] = useState(false);
  const [fundraiserId, setFundraiserId] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'followers'>('public');
  const [uploading, setUploading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [success, setSuccess] = useState(false);

  // Frame picker
  const [framePickerVisible, setFramePickerVisible] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0); // 0–1
  const [frameUri, setFrameUri] = useState<string | null>(null);
  const [capturingFrame, setCapturingFrame] = useState(false);
  const scrubBarWidth = useRef(0);
  const videoDuration = useRef(0);

  useEffect(() => {
    loadProfile();
    restoreDraft();
  }, []);

  useEffect(() => {
    if (!draftLoaded || uploading || success) return;
    const timeout = setTimeout(() => saveDraft(false), 700);
    return () => clearTimeout(timeout);
  }, [caption, selectedTopics, plantSeed, fundraiserId, visibility, selectedSpeakerId, video, thumbnail, draftLoaded, uploading, success]);

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
      const { data: speaker } = await supabase.from('speakers').select('id').eq('profile_id', user.id).single();
      setSpeakerId(speaker?.id || null);
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
        setVideo(draft.video || null);
        setThumbnail(draft.thumbnail || null);
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
      if (showToast) Alert.alert('Draft saved', 'Your Gem draft is saved on this device.');
    } catch (error) {
      if (showToast) Alert.alert('Draft not saved', 'Something went wrong while saving this draft.');
    } finally {
      setSavingDraft(false);
    }
  }

  async function discardDraft() {
    Alert.alert('Discard draft?', 'This clears the saved draft on this device.', [
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
        },
      },
    ]);
  }

  async function pickVideo() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow Siqa to access your video library to upload Gems.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 1,
        videoMaxDuration: 180,
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
      // expo-video-thumbnails is native-only — skip on web.
      if (VideoThumbnails) {
        try {
          const { uri: autoThumbUri } = await VideoThumbnails.getThumbnailAsync(asset.uri, {
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
    } catch (error) {
      Alert.alert('Could not open video', 'Choose a video downloaded to this device and make sure Siqa has full Photos access.');
    }
  }

  async function generateAutoThumbnail(uri: string) {
    if (!VideoThumbnails) return; // native-only — skip on web
    try {
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
      Alert.alert('Camera access needed', 'Allow Siqa to access your camera to record a Gem.');
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
      Alert.alert('Could not start camera', 'Make sure Siqa has camera and microphone access in Settings.');
    }
  }

  async function pickThumbnail() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow Siqa to access your photos to choose a thumbnail.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [9, 16],
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
      Alert.alert('Could not open photo', 'Choose a photo downloaded to this device and make sure Siqa has full Photos access.');
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
    if (!video || !VideoThumbnails) return; // VideoThumbnails is native-only
    setCapturingFrame(true);
    try {
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
      Alert.alert('Speaker profile required', 'This account is not linked to a speaker profile yet.');
      return;
    }

    if (!video) {
      Alert.alert('Select a video', 'Choose a video before posting your Gem.');
      return;
    }

    const cleanCaption = caption.trim();
    if (!cleanCaption) {
      Alert.alert('Caption required', 'Add a short caption so people know what this Gem is about.');
      return;
    }

    if (plantSeed && !fundraiserId.trim()) {
      Alert.alert('Choose a Seed', 'Select the fundraiser this Gem should point to, or turn off Plant a Seed.');
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

      const basePayload: Record<string, any> = {
        speaker_id: finalSpeakerId,
        title: cleanCaption,
        description: cleanCaption,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        category: plantSeed ? 'fundraiser-demo' : 'lecture',
        topics: selectedTopics,
        visibility,
        is_published: true,
        status: 'published',
        published_at: new Date().toISOString(),
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

      await AsyncStorage.removeItem(DRAFT_KEY);
      setProgressPct(100);
      setProgressLabel('Posted!');
      animateSuccess();
      setTimeout(() => router.replace('/(tabs)/gems'), 950);
    } catch (error: any) {
      console.error('[GemUpload] Upload failed:', error);
      Alert.alert('Upload failed', error?.message || 'Something went wrong while uploading the Gem.');
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

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} disabled={uploading}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>New Gem</Text>
          <Text style={styles.headerArabic}>صِقا</Text>
        </View>
        <TouchableOpacity onPress={postGem} disabled={uploading} style={[styles.postBtn, uploading && styles.postBtnDisabled]}>
          <Text style={styles.postBtnText}>{uploading ? 'Posting' : 'Post'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.draftRow}>
          <TouchableOpacity style={styles.draftBtn} onPress={() => saveDraft(true)} disabled={uploading || savingDraft}>
            <Text style={styles.draftBtnText}>{savingDraft ? 'Saving...' : 'Save Draft'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.draftBtnGhost} onPress={discardDraft} disabled={uploading}>
            <Text style={styles.draftBtnGhostText}>Discard</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.uploadZone, video && styles.uploadZoneLoaded]} onPress={pickVideo} disabled={uploading}>
          {video ? (
            <>
              <Video
                source={{ uri: video.uri }}
                style={StyleSheet.absoluteFill}
                resizeMode={ResizeMode.COVER}
                isMuted
                shouldPlay={false}
              />
              <View style={styles.videoScrim} />
              <Text style={styles.uploadIcon}>✓</Text>
              <Text style={styles.uploadTitle} numberOfLines={1}>{video.fileName}</Text>
              <Text style={styles.uploadSub}>Tap to choose a different video</Text>
            </>
          ) : (
            <>
              <Text style={styles.uploadIcon}>＋</Text>
              <Text style={styles.uploadTitle}>Select video</Text>
              <Text style={styles.uploadSub}>MP4/MOV · short vertical clips work best</Text>
            </>
          )}
        </TouchableOpacity>

        {!video && (
          <TouchableOpacity style={styles.recordBtn} onPress={recordVideo} disabled={uploading}>
            <View style={styles.recordDot} />
            <Text style={styles.recordBtnText}>Record a new Gem now</Text>
          </TouchableOpacity>
        )}

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
                  <Text style={styles.thumbnailPlus}>🎞</Text>
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
                    <Text style={styles.thumbActionBtnText}>🎬  From clip</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.thumbActionBtn, styles.thumbActionBtnGhost]}
                    onPress={pickThumbnail}
                    disabled={uploading}
                  >
                    <Text style={styles.thumbActionBtnGhostText}>🖼  From library</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>

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

        {uploading && (
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

        {isAdmin && (
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
        )}

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

        <Text style={styles.securityNote}>
          Uploads go to Bunny.net and the Gem record is saved in Supabase. Move the Bunny key server-side before public beta.
        </Text>
      </ScrollView>

      {success && (
        <Animated.View style={[styles.successOverlay, { opacity: successOpacity }]}> 
          <Animated.View style={[styles.successCard, { transform: [{ scale: successScale }] }]}> 
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>Gem planted</Text>
            <Text style={styles.successSub}>Your video is live in Gems.</Text>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

function formatTime(seconds: number) {
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function makeStyles(C: AppColors, isDark: boolean) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
    header: {
      paddingTop: 58,
      paddingHorizontal: 18,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: C.bg,
    },
    cancel: { color: C.text2, fontSize: 14, fontWeight: '600' },
    headerTitleWrap: { alignItems: 'center' },
    headerTitle: { color: C.text, fontSize: 17, fontWeight: '800' },
    headerArabic: { color: C.gold, fontSize: 18, marginTop: -2 },
    postBtn: { backgroundColor: C.gold, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
    postBtnDisabled: { opacity: 0.55 },
    postBtnText: { color: C.black, fontSize: 13, fontWeight: '800' },
    content: { padding: 16, paddingBottom: 40 },
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
  });
}