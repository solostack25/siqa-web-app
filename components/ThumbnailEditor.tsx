import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { makeBunnyThumbnailPath, uploadThumbnailToBunny } from '../lib/bunnyUpload';
import { captureVideoFrames } from '../lib/videoFrame';
import { radius, type as dsType, useDS } from '../lib/ds';
import { BottomSheet, Button } from './ui';
import { Icon } from './Icon';

export type ThumbnailEditorVideo = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  video_url?: string | null;
  platform?: string | null;
  format?: string | null;
  duration_secs?: number | null;
};

type Picked = { uri: string; fileName: string; mimeType: string };

// Where in the video to offer frames (share of its length).
const FRAME_POINTS = [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95];

/**
 * Change the thumbnail of a video that's already posted: pick a frame from
 * the video itself, or upload a photo. Saves to Bunny and updates
 * videos.thumbnail_url.
 */
export function ThumbnailEditor({
  video,
  onClose,
  onSaved,
}: {
  video: ThumbnailEditorVideo | null;
  onClose: () => void;
  onSaved: (videoId: string, thumbnailUrl: string) => void;
}) {
  const { c } = useDS();
  const [frames, setFrames] = useState<(string | null)[] | null>(null);
  const [loadingFrames, setLoadingFrames] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isShort = video?.format === 'short';
  const aspect = isShort ? 9 / 16 : 16 / 9;
  // Frames can only be read from videos stored on Siqa (Bunny), not YouTube embeds.
  const canPickFrame = Boolean(video?.video_url && video.platform !== 'youtube');

  useEffect(() => {
    setPicked(null);
    setError(null);
    setFrames(null);
    if (!video || !canPickFrame) return;
    let cancelled = false;
    setLoadingFrames(true);
    captureVideoFrames(video.video_url as string, FRAME_POINTS, video.duration_secs)
      .then((f) => { if (!cancelled) setFrames(f); })
      .finally(() => { if (!cancelled) setLoadingFrames(false); });
    return () => { cancelled = true; };
  }, [video?.id]);

  async function pickPhoto() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Allow Siqa to access your photos to choose a thumbnail.');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: isShort ? [9, 16] : [16, 9],
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const a = result.assets[0];
      setPicked({
        uri: a.uri,
        fileName: a.fileName || `siqa-thumbnail-${Date.now()}.jpg`,
        mimeType: a.mimeType || 'image/jpeg',
      });
    } catch {
      setError('Could not open that photo. Try one saved on this device.');
    }
  }

  function pickFrame(uri: string) {
    setError(null);
    setPicked({ uri, fileName: `siqa-frame-${Date.now()}.jpg`, mimeType: 'image/jpeg' });
  }

  async function save() {
    if (!video || !picked || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Please sign in again.');
      const path = makeBunnyThumbnailPath(user.id, picked.fileName, picked.mimeType);
      const url = await uploadThumbnailToBunny({ uri: picked.uri, fileName: path, mimeType: picked.mimeType });
      const { error: dbErr } = await supabase.from('videos').update({ thumbnail_url: url }).eq('id', video.id);
      if (dbErr) throw dbErr;
      onSaved(video.id, url);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not save the thumbnail. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const preview = picked?.uri ?? video?.thumbnail_url ?? null;
  const validFrames = (frames ?? []).map((f, i) => ({ f, i })).filter((x) => x.f) as { f: string; i: number }[];

  return (
    <BottomSheet
      visible={Boolean(video)}
      onClose={() => { if (!saving) onClose(); }}
      title="Edit thumbnail"
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button label="Cancel" variant="soft" grow onPress={onClose} disabled={saving} />
          <Button label="Save" grow onPress={save} loading={saving} disabled={!picked} />
        </View>
      }
    >
      {video ? (
        <View style={{ gap: 16 }}>
          <Text style={[dsType.caption, { color: c.ink2 }]} numberOfLines={2}>{video.title}</Text>

          {/* Preview */}
          <View
            style={{
              alignSelf: 'center',
              width: isShort ? 160 : '100%',
              aspectRatio: aspect,
              borderRadius: radius.lg,
              overflow: 'hidden',
              backgroundColor: c.surfaceSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {preview ? (
              <Image source={{ uri: preview }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <>
                <Icon name="image-outline" size={26} color={c.ink3} />
                <Text style={[dsType.caption, { color: c.ink3, marginTop: 6 }]}>No thumbnail yet</Text>
              </>
            )}
            {picked ? (
              <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={[dsType.micro, { color: '#fff' }]}>New</Text>
              </View>
            ) : null}
          </View>

          {/* Frames from the video */}
          {canPickFrame ? (
            <View style={{ gap: 8 }}>
              <Text style={[dsType.subhead, { color: c.ink }]}>Pick a frame from the video</Text>
              {loadingFrames ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 }}>
                  <ActivityIndicator size="small" color={c.ink2} />
                  <Text style={[dsType.caption, { color: c.ink2 }]}>Loading frames…</Text>
                </View>
              ) : validFrames.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {validFrames.map(({ f, i }) => {
                    const selected = picked?.uri === f;
                    return (
                      <Pressable
                        key={i}
                        onPress={() => pickFrame(f)}
                        accessibilityRole="button"
                        accessibilityLabel={`Use frame ${i + 1}`}
                        accessibilityState={{ selected }}
                        style={{
                          width: isShort ? 64 : 120,
                          aspectRatio: aspect,
                          borderRadius: radius.sm,
                          overflow: 'hidden',
                          borderWidth: 2,
                          borderColor: selected ? c.gold : 'transparent',
                        }}
                      >
                        <Image source={{ uri: f }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : (
                <Text style={[dsType.caption, { color: c.ink3 }]}>
                  Couldn't load frames from this video. Upload a photo instead.
                </Text>
              )}
            </View>
          ) : null}

          <Button label="Upload a photo" icon="image-outline" variant="secondary" onPress={pickPhoto} disabled={saving} />

          {error ? <Text style={[dsType.caption, { color: c.danger }]}>{error}</Text> : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}
