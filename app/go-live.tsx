import { View, Text, ScrollView, ActivityIndicator, Pressable, Image } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { HEADER_TOP_PADDING } from '../constants/theme';
import { DesktopShell, useIsDesktopWeb } from '../components/DesktopShell';
import { Button, IconButton, ListRow, SectionLabel, Switch, TextField } from '../components/ui';
import { Icon, type SiqaIconName } from '../components/Icon';
import { font, radius, space, type, useDS } from '../lib/ds';
import { goBack } from '../lib/goBack';
import { STREAM_WORDS, type StreamKind } from '../lib/create';
import {
  createCamera, copyOrShare, myCameras, openStudio, saveKhutbahDetails, streamAddress, syncCameras, uploadStudioImage, watchUrl,
  type CameraChannel,
} from '../lib/studioLink';

// Camera streams: a speaker streams a khutbah or halaqa from a DJI camera (through the DJI Mimo app) into Siqa.
// One permanent stream address per speaker; Siqa opens the live page and posts the khutbah when it ends.

type Step = 'home' | 'choose' | 'dji' | 'details';
const LIVE = (c?: CameraChannel | null) => Boolean(c?.live_session_id);

export default function GoLiveScreen() {
  const { c: C, shadow } = useDS();
  const isDesktop = useIsDesktopWeb();
  const params = useLocalSearchParams<{ step?: string; kind?: string }>();
  // Opened from Create as "Livestream a khutbah" / "a halaqa", or from the dashboard as camera settings.
  const kind: StreamKind | null = params.kind === 'halaqa' ? 'halaqa' : params.kind === 'khutbah' ? 'khutbah' : null;
  const W = STREAM_WORDS[kind ?? 'khutbah'];
  const heading = kind ? W.title : 'Your camera';
  const noun = kind ? W.noun : 'stream';
  const [loading, setLoading] = useState(true);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [userId, setUserId] = useState('');
  const [cam, setCam] = useState<CameraChannel | null>(null);
  const [step, setStep] = useState<Step>('home');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { router.replace('/(auth)/sign-in' as any); return; }
    setUserId(session.user.id);
    const { data: me } = await supabase.rpc('studio_my_speaker');
    const speaker = ((me as { id: string }[]) || [])[0];
    setIsSpeaker(Boolean(speaker));
    const list = speaker ? await myCameras() : [];
    setCam(list[0] || null);
    setLoading(false);
    return list[0] || null;
  }, []);

  useFocusEffect(useCallback(() => {
    load().then((c) => {
      const want = params.step as Step | undefined;
      setStep(want && ['choose', 'dji', 'details'].includes(want) ? want : c ? 'home' : 'choose');
    });
  }, [load, params.step]));

  // While this screen is open, check every 5 seconds so LIVE shows up right away.
  useEffect(() => {
    if (!cam) return;
    let alive = true;
    const t = setInterval(async () => {
      await syncCameras();
      if (!alive) return;
      const list = await myCameras();
      if (alive && list[0]) setCam(list[0]);
    }, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [cam?.id]);

  async function startDji() {
    setMsg('');
    if (cam) { setStep('dji'); return; }
    setBusy(true);
    try {
      await createCamera('Jumuah Khutbah');
      const c = await load();
      if (c) setStep('dji');
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
  }

  const page = (title: string, sub: string, body: React.ReactNode, back: () => void) => (
    <DesktopShell>
      <ScrollView style={{ flex: 1, backgroundColor: C.bgSunk }} contentContainerStyle={{ paddingTop: HEADER_TOP_PADDING + space[4], paddingBottom: 64, paddingHorizontal: isDesktop ? space[10] : space[5] }}>
        <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center', gap: space[6] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
            <IconButton icon="arrow-back" label="Back" variant="raised" onPress={back} />
            <View style={{ flexShrink: 1 }}>
              <Text style={[type.title1, { color: C.ink }]} accessibilityRole="header">{title}</Text>
              <Text style={[type.subhead, { color: C.ink2 }]}>{sub}</Text>
            </View>
          </View>
          {body}
          {msg ? <Text style={[type.callout, { color: C.danger }]}>{msg}</Text> : null}
        </View>
      </ScrollView>
    </DesktopShell>
  );

  if (loading) return page(heading, '', <ActivityIndicator color={C.gold} style={{ marginTop: 40 }} />, () => goBack('/studio'));

  if (!isSpeaker) {
    return page(heading, 'For Siqa speakers', (
      <View style={[{ backgroundColor: C.surface, borderRadius: radius.xl, padding: space[5], gap: space[3] }, shadow('card')]}>
        <Text style={[type.body, { color: C.ink }]}>Going live is for approved Siqa speakers. Once your speaker profile is approved, you can stream your khutbahs here.</Text>
        <Button label="Apply to be a speaker" onPress={() => router.push('/apply-speaker' as any)} />
      </View>
    ), () => goBack('/studio'));
  }

  /* ---------- choose what you're filming with ---------- */
  if (step === 'choose') {
    const Opt = ({ icon, title, sub, onPress, dark }: { icon: SiqaIconName; title: string; sub: string; onPress: () => void; dark?: boolean }) => (
      <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [{
        flexDirection: 'row', gap: space[4], alignItems: 'center', padding: space[4], borderRadius: radius.xl, backgroundColor: C.surface,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      }, shadow('card')]}>
        <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: dark ? C.night : C.surfaceSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={24} color={dark ? C.brandGold : C.ink} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.headline, { color: C.ink }]}>{title}</Text>
          <Text style={[type.subhead, { color: C.ink2 }]}>{sub}</Text>
        </View>
        <Icon name="chevron-forward" size={20} color={C.ink3} />
      </Pressable>
    );
    return page(heading, 'What are you filming with? You only set this up once.', (
      <View style={{ gap: space[3] }}>
        <Opt dark icon="videocam-outline" title="DJI camera with my phone" sub="Osmo Pocket 3 or Osmo Action, streamed through the DJI Mimo app" onPress={startDji} />
        <Opt icon="laptop-outline" title="Camera plugged into a laptop or iPad" sub="USB-C in Webcam mode. Opens the Siqa live room. Not on iPhone." onPress={() => openStudio(`/live?kind=${kind ?? 'khutbah'}`)} />
        <Opt icon="phone-portrait-outline" title="Just my phone or computer" sub="Uses its own camera. Opens the Siqa live room." onPress={() => openStudio(`/live?kind=${kind ?? 'khutbah'}`)} />
        {busy ? <ActivityIndicator color={C.gold} /> : null}
      </View>
    ), () => (cam ? setStep('home') : goBack('/studio')));
  }

  if (!cam) return page(heading, '', <Button label="Set up my camera" onPress={() => setStep('choose')} />, () => goBack('/studio'));

  /* ---------- one-time DJI Mimo setup ---------- */
  if (step === 'dji') {
    const addr = streamAddress(cam);
    const masked = `${cam.rtmps_url}••••••••${cam.stream_key.slice(-4)}`;
    const setupText = [
      'Siqa stream setup for the Osmo Pocket 3 (DJI Mimo):',
      '1. Pair the DJI Mic transmitter with the Pocket 3.',
      '2. In DJI Mimo, connect the camera, tap Livestream > RTMP and paste:',
      addr,
      '3. Pick the masjid Wi-Fi or your iPhone hotspot. 1080p, 3 Mbps on a hotspot.',
      '4. Tap Start. Keep this address private.',
      ...(cam.rtmp_url ? ['', 'If Mimo says the address is invalid, use:', `${cam.rtmp_url}${cam.stream_key}`] : []),
    ].join('\n');
    const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <View style={{ width: 28, height: 28, borderRadius: 999, backgroundColor: C.surfaceSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[type.subhead, font(700), { color: C.ink }]}>{n}</Text>
        </View>
        <Text style={[type.callout, { color: C.ink, flex: 1 }]}>{children}</Text>
      </View>
    );
    return page('Set up DJI Mimo', 'Do this once. After that, Friday is just: open Mimo, tap Start.', (
      <View style={{ gap: space[5] }}>
        <View style={[{ backgroundColor: C.surface, borderRadius: radius.xl, padding: space[5], gap: space[3] }, shadow('card')]}>
          <Text style={[type.caption, font(600), { color: C.ink2 }]}>YOUR STREAM ADDRESS</Text>
          <Text selectable style={[type.subhead, { color: C.ink2, backgroundColor: C.surfaceSoft, padding: space[3], borderRadius: radius.md }]}>{masked}</Text>
          <Button label={copied ? 'Copied' : 'Copy address'} icon="copy-outline" onPress={async () => {
            if ((await copyOrShare(addr, 'Siqa stream address')) === 'copied') { setCopied(true); setTimeout(() => setCopied(false), 2000); }
          }} />
          <Button label="Send setup steps" variant="secondary" icon="share-outline" onPress={() => copyOrShare(setupText, 'Siqa stream setup')} />
          <Text style={[type.caption, { color: C.ink2 }]}>Anyone with this address can stream to your profile. Only share it with yourself or your media person.</Text>
        </View>
        <View style={{ gap: space[4] }}>
          <Step n={1}>Pair your DJI Mic with the Pocket 3 so the khutbah audio comes from the mic.</Step>
          <Step n={2}>In DJI Mimo, connect the camera, tap Livestream → RTMP and paste the address.</Step>
          <Step n={3}>Pick the masjid Wi-Fi or your iPhone hotspot (type its name and password). Quality: 1080p, 3 Mbps on a hotspot.</Step>
          <Step n={4}>Tap Start. This page turns green when Siqa sees your stream.</Step>
        </View>
        <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center', padding: space[3], borderRadius: radius.md, backgroundColor: LIVE(cam) ? C.seedTint : C.surfaceSoft }} accessibilityLiveRegion="polite">
          <Icon name={LIVE(cam) ? 'checkmark-circle' : 'time-outline'} size={18} color={LIVE(cam) ? C.seed : C.ink2} />
          <Text style={[type.subhead, font(600), { color: LIVE(cam) ? C.seed : C.ink2 }]}>{LIVE(cam) ? 'Connected. Your stream is coming through.' : 'Waiting for your camera…'}</Text>
        </View>
        <Button label="Done" onPress={() => setStep('details')} />
      </View>
    ), () => setStep('home'));
  }

  /* ---------- this week's khutbah ---------- */
  if (step === 'details') return <Details cam={cam} userId={userId} kind={kind} onDone={async () => { await load(); setStep('home'); }} page={page} />;

  /* ---------- home ---------- */
  const live = LIVE(cam);
  return page(heading, live ? 'You are live on Siqa' : 'Your camera is set up', (
    <View style={{ gap: space[5] }}>
      <View style={[{ backgroundColor: C.night, borderRadius: radius.xl, padding: space[5], gap: space[3] }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          {live ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#33201f' }}>
              <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#f08b74' }} />
              <Text style={[type.caption, font(700), { color: '#f08b74' }]}>LIVE</Text>
            </View>
          ) : (
            <Text style={[type.caption, font(700), { color: '#9facc4', letterSpacing: 1 }]}>YOUR CAMERA</Text>
          )}
        </View>
        <Text style={[type.title2, { color: '#edf1f7' }]}>{live ? (cam.next_title || cam.title) : kind ? W.ready : 'Ready to stream'}</Text>
        {live ? (
          <Text style={[type.subhead, { color: '#9facc4' }]}>On your profile and Siqa Live. Stop the stream in DJI Mimo when you are done.</Text>
        ) : (
          <>
            <Text style={[type.subhead, font(700), { color: '#edf1f7' }]}>To go live, use the DJI Mimo app:</Text>
            {[
              'Turn on your camera and open DJI Mimo.',
              'Tap Livestream, then RTMP. First time? Use DJI Mimo setup below to add your Siqa address.',
              'Tap Start.',
            ].map((t, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#1e2a40', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[type.caption, font(700), { color: '#edf1f7' }]}>{i + 1}</Text>
                </View>
                <Text style={[type.callout, { color: '#c9d2e2', flex: 1 }]}>{t}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingTop: space[1] }} accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" color="#9facc4" />
              <Text style={[type.subhead, { color: '#9facc4', flex: 1 }]}>
                Waiting for your camera. This page switches to LIVE by itself. Your {noun} {cam.auto_post ? 'posts to your profile' : 'saves as a draft in Studio'} when it ends.
              </Text>
            </View>
          </>
        )}
        {live && cam.live_watch_token ? (
          <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
            <Button label="Watch live" size="md" variant="light" icon="play" onPress={() => router.push(`/live/${cam.live_watch_token}` as any)} />
            <Button label="Share link" size="md" variant="secondary" icon="share-outline" onPress={() => copyOrShare(watchUrl(cam.live_watch_token!), cam.next_title || cam.title)} />
          </View>
        ) : null}
      </View>

      <View style={{ gap: space[2] }}>
        <SectionLabel>Before you start</SectionLabel>
        <View style={[{ backgroundColor: C.surface, borderRadius: radius.xl, paddingHorizontal: space[4] }, shadow('card')]}>
          <ListRow icon="create-outline" label={kind === 'halaqa' ? 'This halaqa' : kind === 'khutbah' ? "This week's khutbah" : 'What you are streaming next'} sub={cam.next_title || 'Title, description and cover (optional)'} onPress={() => setStep('details')} />
          <ListRow icon="ribbon-outline" label="Your watermark" sub="Your logo on your lives and videos" onPress={() => router.push('/watermark' as any)} />
          <ListRow icon="videocam-outline" label="DJI Mimo setup" sub="Stream address and steps" onPress={() => setStep('dji')} />
          <ListRow icon="phone-portrait-outline" label="No camera with you?" sub="Go live from this phone or computer instead" onPress={() => openStudio(`/live?kind=${kind ?? 'khutbah'}`)} last />
        </View>
      </View>

      {cam.last_video_id ? (
        <View style={{ gap: space[2] }}>
          <SectionLabel>Last stream</SectionLabel>
          <View style={[{ backgroundColor: C.surface, borderRadius: radius.xl, paddingHorizontal: space[4] }, shadow('card')]}>
            <ListRow icon="play-circle-outline" label={cam.last_video_title || 'Khutbah'} sub={cam.last_video_published ? 'Posted' : 'Draft in Studio'} onPress={() => router.push(`/watch/${cam.last_video_id}` as any)} last />
          </View>
        </View>
      ) : null}
    </View>
  ), () => goBack('/studio'));
}

function Details({ cam, userId, onDone, page, kind }: {
  kind: StreamKind | null;
  cam: CameraChannel; userId: string; onDone: () => void;
  page: (title: string, sub: string, body: React.ReactNode, back: () => void) => React.ReactElement;
}) {
  const { c: C, shadow } = useDS();
  const [f, setF] = useState({ title: cam.next_title || '', description: cam.next_description || '', coverUrl: cam.next_cover_url || '', masjid: cam.masjid_name || '', autoPost: cam.auto_post });
  const [busy, setBusy] = useState<'' | 'save' | 'cover'>('');
  const [err, setErr] = useState('');

  async function pickCover() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [16, 9] });
    if (res.canceled || !res.assets?.[0]) return;
    setBusy('cover'); setErr('');
    try {
      const url = await uploadStudioImage(userId, 'covers', res.assets[0].uri, res.assets[0].mimeType);
      setF((x) => ({ ...x, coverUrl: url }));
    } catch (e) { setErr((e as Error).message || 'Could not upload the cover.'); }
    setBusy('');
  }

  async function save() {
    setBusy('save'); setErr('');
    try { await saveKhutbahDetails(cam.id, f); onDone(); } catch (e) { setErr((e as Error).message); }
    setBusy('');
  }

  return page(kind === 'halaqa' ? 'This halaqa' : kind === 'khutbah' ? "This week's khutbah" : 'What you are streaming', 'Used for the live and the post. You can change it after, too.', (
    <View style={{ gap: space[5] }}>
      <Pressable onPress={pickCover} accessibilityRole="button" accessibilityLabel={f.coverUrl ? 'Change cover photo' : 'Add a cover photo'}
        style={{ height: 190, borderRadius: radius.lg, backgroundColor: C.night, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {f.coverUrl ? <Image source={{ uri: f.coverUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : (
          <View style={{ alignItems: 'center', gap: space[2] }}>
            {busy === 'cover' ? <ActivityIndicator color={C.brandGold} /> : <Icon name="image-outline" size={28} color="#9facc4" />}
            <Text style={[type.subhead, { color: '#9facc4' }]}>Add a cover photo (optional)</Text>
          </View>
        )}
      </Pressable>
      {f.coverUrl ? <Button label="Use a frame from the video instead" variant="soft" size="md" onPress={() => setF({ ...f, coverUrl: '' })} /> : null}
      <TextField label="Title" value={f.title} onChangeText={(t) => setF({ ...f, title: t })} placeholder={STREAM_WORDS[kind ?? 'khutbah'].placeholder} maxLength={120} />
      <TextField label="Description" value={f.description} onChangeText={(t) => setF({ ...f, description: t })} placeholder={`What the ${kind ?? 'khutbah'} covers`} multiline maxLength={2000} />
      <TextField label="Masjid" value={f.masjid} onChangeText={(t) => setF({ ...f, masjid: t })} placeholder="Where you're giving it" maxLength={120} />
      <View style={[{ backgroundColor: C.surface, borderRadius: radius.xl, paddingHorizontal: space[4] }, shadow('card')]}>
        <ListRow label="Post when it ends" sub={f.autoPost ? 'Goes on your profile automatically' : 'Saves as a draft in Studio'} last
          right={<Switch value={f.autoPost} onValueChange={(v) => setF({ ...f, autoPost: v })} label="Post when it ends" />} />
      </View>
      <Text style={[type.caption, { color: C.ink2 }]}>Without a title it's named by date. These are cleared after it posts, ready for next week.</Text>
      {err ? <Text style={[type.callout, { color: C.danger }]}>{err}</Text> : null}
      <Button label="Save" onPress={save} loading={busy === 'save'} />
    </View>
  ), onDone);
}
