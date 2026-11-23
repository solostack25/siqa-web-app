// The masjid's camera (autopilot). Set it up once. After that, on Friday someone presses Start in DJI Mimo and Siqa:
// titles the live from the schedule ("Jumu'ah khutbah · Nov 27"), credits the imam on the schedule, switches the
// masjid's TVs to it, and when it ends posts it to the imam's page and the masjid's page. Nobody opens Siqa.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { copyOrShare, createMasjidCamera, syncCameras } from '../../../lib/studioLink';
import { font, radius, space, type, useDS } from '../../../lib/ds';
import { Button } from '../../ui';
import { Icon } from '../../Icon';
import { Card, CardTitle, PageHeader, type SectionProps } from './kit';
import { showToast } from '../../Toast';

type Cam = {
  id: string; title: string; rtmps_url: string; rtmp_url: string | null; stream_key: string | null;
  cf_status: string | null; checked_at: string | null; auto_post: boolean;
  live: { title: string; speaker: string | null; watch_token: string; started_at: string } | null;
  last: { title: string; id: string; published: boolean; at: string } | null;
  now_program: { title: string; speaker: string | null } | null;
};

export function CameraSection({ masjid }: SectionProps) {
  const { c } = useDS();
  const canManage = ['owner', 'admin', 'siqa'].includes(masjid.my_role);
  const [cam, setCam] = useState<Cam | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('masjid_camera', { p_org: masjid.id });
    setCam((data as Cam | null) ?? null);
  }, [masjid.id]);
  useEffect(() => { load(); }, [load]);
  // While this page is open, check the camera every 10 seconds so LIVE shows up right away.
  useEffect(() => {
    if (!cam) return;
    const t = setInterval(async () => { await syncCameras(); load(); }, 10000);
    return () => clearInterval(t);
  }, [cam?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    setBusy(true);
    try { await createMasjidCamera(masjid.id); await load(); showToast('Your camera is set up. Add the address to DJI Mimo once.'); }
    catch (e) { showToast((e as Error).message); }
    setBusy(false);
  };

  const Step = ({ n, children }: { n: number; children: string }) => (
    <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.surfaceSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[type.body, font(800), { color: c.ink }]}>{n}</Text>
      </View>
      <Text style={[type.body, { color: c.ink, flex: 1, paddingTop: 4 }]}>{children}</Text>
    </View>
  );

  if (cam === undefined) return <PageHeader title="Camera" sub="Loading…" />;

  if (!cam) return (
    <>
      <PageHeader title="Camera" sub="Khutbahs that stream and post themselves." />
      <Card>
        <CardTitle>How it works</CardTitle>
        <Step n={1}>Set it up once here, and add the address to the DJI Mimo app on your camera phone.</Step>
        <Step n={2}>On Friday, press Start in DJI Mimo. That's it.</Step>
        <Step n={3}>Siqa names the live from your schedule (like "Jumu'ah khutbah · Nov 27"), shows the imam on your schedule, and switches your TVs to it.</Step>
        <Step n={4}>When you stop, it's posted to the imam's page and your masjid's page.</Step>
        {canManage
          ? <Button label="Set up the masjid camera" icon="videocam-outline" onPress={create} loading={busy} style={{ alignSelf: 'flex-start', marginTop: space[2] }} />
          : <Text style={[type.caption, { color: c.ink2 }]}>Ask your masjid's owner or an admin to set it up.</Text>}
      </Card>
    </>
  );

  const live = !!cam.live;
  const addr = cam.stream_key ? `${cam.rtmps_url}${cam.stream_key}` : null;
  const setupText = addr ? [
    `Siqa camera for ${masjid.org_name} (DJI Mimo):`,
    '1. Pair the DJI Mic with the camera.',
    '2. In DJI Mimo, connect the camera, tap Livestream > RTMP and paste:',
    addr,
    '3. Pick the masjid Wi-Fi. Quality: 1080p.',
    '4. Tap Start. Keep this address private.',
    ...(cam.rtmp_url && cam.stream_key ? ['', 'If Mimo says the address is invalid, use:', `${cam.rtmp_url}${cam.stream_key}`] : []),
  ].join('\n') : '';

  return (
    <>
      <PageHeader title="Camera" sub="Press Start in DJI Mimo. Siqa does the rest." />

      <View style={{ borderRadius: radius.xl, padding: space[5], gap: space[2], backgroundColor: live ? '#C8312B' : c.night }} accessibilityLiveRegion="polite">
        <Text style={[type.caption, font(800), { color: '#fff', letterSpacing: 1 }]}>{live ? '● LIVE NOW' : 'READY'}</Text>
        <Text style={[{ fontSize: 24, lineHeight: 30 }, font(800), { color: '#fff' }]}>
          {live ? cam.live!.title : cam.now_program ? `Ready for ${cam.now_program.title}` : 'Ready when you are'}
        </Text>
        <Text style={[type.body, { color: 'rgba(255,255,255,0.85)' }]}>
          {live
            ? `${cam.live!.speaker ? `${cam.live!.speaker} · ` : ''}On your TVs and on Siqa. Stop it in DJI Mimo when you're done; it posts itself.`
            : cam.now_program
              ? `When you press Start, it goes live as "${cam.now_program.title}"${cam.now_program.speaker ? ` with ${cam.now_program.speaker}` : ''}.`
              : 'When you press Start in DJI Mimo, it goes live and your TVs switch to it. Add your khutbah to the Schedule (with Live on Siqa on) so it gets the right title and imam.'}
        </Text>
        {live ? <Button label="Watch" variant="light" size="md" onPress={() => router.push(`/live/${cam.live!.watch_token}` as any)} style={{ alignSelf: 'flex-start' }} /> : null}
      </View>

      {cam.last ? (
        <Card>
          <CardTitle>Last post</CardTitle>
          <Pressable onPress={() => router.push(`/watch/${cam.last!.id}` as any)} accessibilityRole="link">
            <Text style={[type.body, font(700), { color: c.ink }]}>{cam.last.title}</Text>
            <Text style={[type.caption, { color: c.ink2 }]}>
              {cam.last.published ? 'Posted to the imam’s page and yours.' : 'Saved as a draft: the imam’s profile isn’t verified yet, so it waits for review before it’s public.'}
            </Text>
          </Pressable>
        </Card>
      ) : null}

      {canManage && addr ? (
        <Card>
          <CardTitle>Set up DJI Mimo (once)</CardTitle>
          <Step n={1}>Pair the DJI Mic with the camera so the khutbah audio comes from the mic.</Step>
          <Step n={2}>In DJI Mimo, connect the camera, tap Livestream → RTMP and paste the address below.</Step>
          <Step n={3}>Pick the masjid Wi-Fi. Quality: 1080p.</Step>
          <Step n={4}>Tap Start. The box at the top turns red when Siqa sees it.</Step>
          <Text selectable style={[type.subhead, { color: c.ink2, backgroundColor: c.surfaceSoft, padding: space[3], borderRadius: radius.md }]}>
            {`${cam.rtmps_url}••••••••${cam.stream_key!.slice(-4)}`}
          </Text>
          <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
            <Button label={copied ? 'Copied' : 'Copy address'} icon="copy-outline" size="md" onPress={async () => {
              if ((await copyOrShare(addr, 'Siqa camera address')) === 'copied') { setCopied(true); setTimeout(() => setCopied(false), 2000); }
            }} />
            <Button label="Send setup steps" icon="share-outline" variant="secondary" size="md" onPress={() => copyOrShare(setupText, 'Siqa camera setup')} />
          </View>
          <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
            <Icon name="lock-closed-outline" size={16} color={c.ink3} />
            <Text style={[type.caption, { color: c.ink2, flex: 1 }]}>Anyone with this address can stream to your masjid's TVs. Only share it with your media person.</Text>
          </View>
        </Card>
      ) : null}
    </>
  );
}
