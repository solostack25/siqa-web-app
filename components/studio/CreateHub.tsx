import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Icon, type SiqaIconName } from '../Icon';
import { BottomSheet, Button } from '../ui';
import { font, radius, space, type, useDS } from '../../lib/ds';
import { CREATE_GROUPS, startCreate, startHalaqa, type CreateItem } from '../../lib/create';
import { copyOrShare, myCameras, syncCameras, watchUrl, type CameraChannel } from '../../lib/studioLink';

// One page with everything a speaker can make: go live, record, upload.
export default function CreateHub({ wide }: { wide: boolean }) {
  const { c, shadow } = useDS();
  const [approved, setApproved] = useState<boolean | null>(null);
  const [cam, setCam] = useState<CameraChannel | null>(null);
  const [halaqa, setHalaqa] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace('/(auth)/sign-in' as any); return; }
    const { data: sp } = await supabase.from('speakers').select('approval_status').eq('profile_id', session.user.id).maybeSingle();
    const ok = sp?.approval_status === 'approved';
    setApproved(ok);
    if (ok) setCam((await myCameras())[0] ?? null);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // While the camera is live (or might be), keep its status fresh.
  useEffect(() => {
    if (!cam) return;
    let alive = true;
    const t = setInterval(async () => {
      await syncCameras();
      const list = await myCameras();
      if (alive) setCam(list[0] ?? null);
    }, cam.live_session_id ? 10000 : 30000);
    return () => { alive = false; clearInterval(t); };
  }, [cam?.id, cam?.live_session_id]);

  if (approved === null) return <View style={{ padding: space[6], alignItems: 'center' }}><ActivityIndicator color={c.ink2} /></View>;

  const live = Boolean(cam?.live_session_id);

  const pick = (it: CreateItem) => {
    setNote('');
    if (it.speakersOnly && !approved) { setNote('Going live and recording are for approved speakers.'); return; }
    if (it.key === 'halaqa') { setHalaqa(true); return; }
    startCreate(it.key);
  };

  const Tile = ({ it }: { it: CreateItem }) => {
    const locked = it.speakersOnly && !approved;
    const isLive = it.key === 'khutbah' && live;
    return (
      <Pressable onPress={() => pick(it)} accessibilityRole="button" accessibilityLabel={`${it.label}. ${it.sub}`}
        style={({ pressed }) => [{
          flexBasis: wide ? '48%' : '100%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: space[4],
          backgroundColor: c.surface, borderRadius: radius.xl, padding: space[4], opacity: locked ? 0.5 : pressed ? 0.85 : 1,
        }, shadow('card')]}>
        <View style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: isLive ? '#33201f' : c.surfaceStrong }}>
          <Icon name={it.icon} size={24} color={isLive ? '#f08b74' : c.ink} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Text style={[type.headline, { color: c.ink }]}>{it.label}</Text>
            {isLive ? <Text style={[type.caption, font(700), { color: '#d9755f' }]}>LIVE</Text> : null}
          </View>
          <Text style={[type.subhead, { color: c.ink2 }]}>{it.sub}</Text>
        </View>
        <Icon name={locked ? 'lock-closed-outline' : 'chevron-forward'} size={18} color={c.ink3} />
      </Pressable>
    );
  };

  return (
    <View style={{ gap: space[6] }}>
      {live && cam ? <LiveNow cam={cam} /> : null}

      {!approved ? (
        <View style={{ backgroundColor: c.goldTint, borderRadius: radius.xl, padding: space[4], gap: space[3] }}>
          <Text style={[type.body, { color: c.ink }]}>You can upload now. Going live and recording open up once your speaker profile is approved.</Text>
          <Button label="Apply to be a speaker" size="md" variant="secondary" onPress={() => router.push('/apply-speaker' as any)} style={{ alignSelf: 'flex-start' }} />
        </View>
      ) : null}
      {note ? <Text style={[type.callout, { color: c.danger }]}>{note}</Text> : null}

      {CREATE_GROUPS.map((g) => (
        <View key={g.title} style={{ gap: space[3] }}>
          <Text style={[type.headline, font(800), { color: c.ink }]} accessibilityRole="header">{g.title}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
            {g.items.map((it) => <Tile key={it.key} it={it} />)}
          </View>
        </View>
      ))}

      <BottomSheet visible={halaqa} onClose={() => setHalaqa(false)} title="How are you streaming it?">
        <View style={{ padding: space[5], gap: space[3] }}>
          <Choice icon="videocam-outline" title="My DJI camera" sub="Through DJI Mimo, same as Jumuah" onPress={() => { setHalaqa(false); startHalaqa('camera'); }} />
          <Choice icon="phone-portrait-outline" title="My phone or computer" sub="Uses its own camera. Opens the live room." onPress={() => { setHalaqa(false); startHalaqa('phone'); }} />
        </View>
      </BottomSheet>
    </View>
  );
}

function Choice({ icon, title, sub, onPress }: { icon: SiqaIconName; title: string; sub: string; onPress: () => void }) {
  const { c } = useDS();
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[4], padding: space[4], borderRadius: radius.lg, backgroundColor: c.surfaceStrong, opacity: pressed ? 0.8 : 1 })}>
      <Icon name={icon} size={24} color={c.ink} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.headline, { color: c.ink }]}>{title}</Text>
        <Text style={[type.subhead, { color: c.ink2 }]}>{sub}</Text>
      </View>
      <Icon name="chevron-forward" size={18} color={c.ink3} />
    </Pressable>
  );
}

/** Shown at the top while the DJI camera is streaming: one tap to the live page or to share it. */
export function LiveNow({ cam }: { cam: CameraChannel }) {
  const { c } = useDS();
  const token = cam.live_watch_token;
  return (
    <View style={{ backgroundColor: c.night, borderRadius: radius.xl, padding: space[5], gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#33201f' }}>
        <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#f08b74' }} />
        <Text style={[type.caption, font(700), { color: '#f08b74' }]}>YOU'RE LIVE</Text>
      </View>
      <Text style={[type.title2, { color: '#edf1f7' }]}>{cam.next_title || cam.title}</Text>
      <Text style={[type.subhead, { color: '#9facc4' }]}>From your DJI camera. Stop the stream in DJI Mimo when you're done.</Text>
      {token ? (
        <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
          <Button label="Watch live" size="md" variant="light" icon="play" onPress={() => router.push(`/live/${token}` as any)} />
          <Button label="Share link" size="md" variant="secondary" icon="share-outline" onPress={() => copyOrShare(watchUrl(token), cam.next_title || cam.title)} />
          <Button label="Camera settings" size="md" variant="secondary" icon="settings-outline" onPress={() => router.push('/go-live' as any)} />
        </View>
      ) : null}
    </View>
  );
}
