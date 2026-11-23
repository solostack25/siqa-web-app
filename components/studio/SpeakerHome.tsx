// The speaker's home in the dashboard (Studio space). Built for an imam who is 70 and has never heard the word
// "stream": four big buttons, what's coming up, and what's waiting to be posted. Nothing else.
// Everything advanced (podcast, recording, camera address, watermark, series) is under More tools.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { font, radius, space, useDS } from '../../lib/ds';
import { Icon, type SiqaIconName } from '../Icon';
import { BottomSheet } from '../ui';
import { openStudio } from '../../lib/studioLink';
import { router } from 'expo-router';

const SUPPORT_EMAIL = 'info@siqa.us';

type Program = { id: string; title: string; masjid_name: string; speaker_name: string | null; next_at: string; mine: boolean };
type LiveSession = { id: string; title: string; status: string };
type Rec = { id: string; owner_id: string; title: string; status: string; review_status: string; created_at: string };

function when(iso: string) {
  const d = new Date(iso);
  const mins = (d.getTime() - Date.now()) / 60000;
  if (mins <= 0) return 'Now';
  if (mins <= 30) return `In ${Math.max(1, Math.round(mins))} min`;
  const today = d.toDateString() === new Date().toDateString();
  return `${today ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'long' })} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

export function SpeakerHome({ wide, go }: { wide: boolean; go: (page: string) => void }) {
  const { c, shadow } = useDS();
  const [name, setName] = useState<string | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [live, setLive] = useState<LiveSession | null>(null);
  const [recs, setRecs] = useState<Rec[] | null>(null);
  const [help, setHelp] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const [opts, sess, rec] = await Promise.all([
      supabase.rpc('studio_live_options'),
      supabase.rpc('studio_list_sessions'),
      supabase.rpc('studio_list_recordings'),
    ]);
    const o = opts.data as { speaker: { name: string } | null; programs: Program[] } | null;
    setName(o?.speaker?.name ?? null);
    setPrograms((o?.programs ?? []).slice(0, 3));
    setLive(((sess.data as LiveSession[]) ?? []).find((s) => s.status === 'live') ?? null);
    // Staff can see everyone's recordings; the home only shows your own.
    setRecs(((rec.data as Rec[]) ?? []).filter((r) => r.owner_id === user?.id && r.review_status === 'draft' && r.status !== 'failed').slice(0, 4));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const big = (icon: SiqaIconName, label: string, sub: string, onPress: () => void, tone: 'live' | 'plain') => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [{
        flexBasis: wide ? '47%' : '100%', flexGrow: 1, minHeight: 104, borderRadius: radius.xl, padding: space[5],
        flexDirection: 'row', alignItems: 'center', gap: space[4],
        backgroundColor: tone === 'live' ? '#C8312B' : c.surface, opacity: pressed ? 0.85 : 1,
      }, tone === 'plain' ? shadow('card') : null]}>
      <View style={{ width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: tone === 'live' ? 'rgba(255,255,255,0.18)' : c.surfaceSoft }}>
        <Icon name={icon} size={30} color={tone === 'live' ? '#fff' : c.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[{ fontSize: 24, lineHeight: 30 }, font(800), { color: tone === 'live' ? '#fff' : c.ink }]}>{label}</Text>
        <Text style={[{ fontSize: 17, lineHeight: 23 }, font(500), { color: tone === 'live' ? 'rgba(255,255,255,0.9)' : c.ink2 }]}>{sub}</Text>
      </View>
    </Pressable>
  );

  const section = (title: string, children: React.ReactNode) => (
    <View style={{ gap: space[3] }}>
      <Text style={[{ fontSize: 20, lineHeight: 26 }, font(800), { color: c.ink }]}>{title}</Text>
      {children}
    </View>
  );
  const row = (key: string, title: string, sub: string, action: string, onPress: () => void, hot = false) => (
    <View key={key} style={[{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', gap: space[3], padding: space[4], borderRadius: radius.xl, backgroundColor: hot ? c.goldTint : c.surface }, shadow('card')]}>
      <View style={{ flex: 1 }}>
        <Text style={[{ fontSize: 19, lineHeight: 25 }, font(700), { color: c.ink }]}>{title}</Text>
        <Text style={[{ fontSize: 17, lineHeight: 23 }, font(500), { color: c.ink2 }]}>{sub}</Text>
      </View>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${action}: ${title}`}
        style={{ minHeight: 56, paddingHorizontal: space[5], borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ink }}>
        <Text style={[{ fontSize: 18 }, font(700), { color: c.surface }]}>{action}</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={{ gap: space[6], paddingBottom: space[8] }}>
      <View style={{ gap: 4 }}>
        <Text style={[{ fontSize: 30, lineHeight: 36 }, font(800), { color: c.ink }]}>Assalamu alaikum{name ? `, ${name}` : ''}</Text>
        <Text style={[{ fontSize: 18, lineHeight: 24 }, font(500), { color: c.ink2 }]}>What would you like to do?</Text>
      </View>

      {live ? (
        <Pressable onPress={() => openStudio(`/live?session=${live.id}`)} accessibilityRole="button"
          style={{ minHeight: 72, borderRadius: radius.xl, padding: space[4], backgroundColor: '#C8312B', flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff' }} />
          <Text style={[{ fontSize: 20, flex: 1 }, font(800), { color: '#fff' }]}>You’re live: {live.title}</Text>
          <Text style={[{ fontSize: 18 }, font(700), { color: '#fff' }]}>Go back in ›</Text>
        </Pressable>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
        {big('radio-outline', 'Go live', 'Khutbah, halaqa, class or talk', () => openStudio('/live'), 'live')}
        {big('cloud-upload-outline', 'Upload a video', 'A video you already have', () => router.push('/gem-upload' as any), 'plain')}
        {big('play-circle-outline', 'My videos', 'Everything you’ve posted', () => go('videos'), 'plain')}
        {big('help-buoy-outline', 'Get help', 'Ask the Siqa team', () => setHelp(true), 'plain')}
      </View>

      {programs.length ? section('Coming up', programs.map((p) => {
        const soon = new Date(p.next_at).getTime() - Date.now() < 30 * 60000;
        return row(p.id, p.title, `${when(p.next_at)} · ${p.masjid_name}${!p.mine && p.speaker_name ? ` · ${p.speaker_name}` : ''}`,
          !p.mine && p.speaker_name ? 'Go live for them' : 'Go live', () => openStudio(`/live?program=${p.id}`), soon);
      })) : null}

      {recs && recs.length ? section('Waiting for you', recs.map((r) => (
        r.status === 'ready'
          ? row(r.id, r.title || 'Your recording', 'Recorded. Not posted yet.', 'Look and post', () => openStudio(`/review/${r.id}`), true)
          : row(r.id, r.title || 'Your recording', 'Still saving. This takes a few minutes after you end.', 'Open', () => openStudio(`/review/${r.id}`))
      ))) : null}

      <Pressable onPress={() => go('more')} accessibilityRole="button" style={{ minHeight: 56, justifyContent: 'center' }}>
        <Text style={[{ fontSize: 18 }, font(700), { color: c.ink2, textDecorationLine: 'underline' }]}>More tools: guests, camera, recording, watermark, classes</Text>
      </Pressable>

      <BottomSheet visible={help} onClose={() => setHelp(false)} title="Get help">
        <View style={{ gap: space[3] }}>
          <Text style={[{ fontSize: 18, lineHeight: 25 }, font(500), { color: c.ink2 }]}>Write to us and a person on the Siqa team will answer, usually the same day.</Text>
          <Pressable onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Help with Siqa')}`)} accessibilityRole="button"
            style={{ minHeight: 60, borderRadius: radius.pill, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[{ fontSize: 19 }, font(700), { color: c.surface }]}>Email {SUPPORT_EMAIL}</Text>
          </Pressable>
          <Pressable onPress={() => { setHelp(false); router.push('/support' as any); }} accessibilityRole="button"
            style={{ minHeight: 60, borderRadius: radius.pill, backgroundColor: c.surfaceSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[{ fontSize: 19 }, font(700), { color: c.ink }]}>Common questions</Text>
          </Pressable>
        </View>
      </BottomSheet>
    </View>
  );
}

type Tool = { icon: SiqaIconName; title: string; sub: string; run: () => void };

/** Advanced tools, one tap below the speaker home. */
export function MoreTools({ speakerId, go }: { speakerId: string; go: (page: string) => void }) {
  const { c, shadow } = useDS();
  const tools: Tool[] = [
    { icon: 'mic-outline', title: 'Invite a guest speaker', sub: 'Live with up to 4 speakers. Send them a link.', run: () => openStudio('/live?kind=podcast') },
    { icon: 'videocam-outline', title: 'Record without going live', sub: 'Record a short clip or a long talk.', run: () => openStudio('/record?type=video') },
    { icon: 'aperture-outline', title: 'DJI camera', sub: 'Set up a camera that streams on its own.', run: () => router.push('/go-live' as any) },
    { icon: 'calendar-outline', title: 'Scheduled lives', sub: 'Lives you set up ahead of time.', run: () => openStudio('/sessions') },
    { icon: 'book-outline', title: 'Classes and series', sub: 'Weekly classes, members and handouts.', run: () => openStudio('/series') },
    { icon: 'folder-open-outline', title: 'All recordings', sub: 'Everything you’ve recorded, posted or not.', run: () => openStudio('/recordings') },
    { icon: 'water-outline', title: 'Your watermark', sub: 'Your logo on your videos.', run: () => router.push('/watermark' as any) },
    { icon: 'people-outline', title: 'Guests', sub: 'People who’ve joined your lives.', run: () => openStudio('/guests') },
    { icon: 'settings-outline', title: 'Studio settings', sub: 'Defaults for your lives and recordings.', run: () => openStudio('/settings') },
    { icon: 'open-outline', title: 'Your public profile', sub: 'See your page the way viewers do.', run: () => router.push(`/speaker/${speakerId}` as any) },
  ];
  return (
    <View style={{ gap: space[4], paddingBottom: space[8] }}>
      <Pressable onPress={() => go('overview')} accessibilityRole="button" style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Icon name="chevron-back" size={22} color={c.ink} />
        <Text style={[{ fontSize: 18 }, font(700), { color: c.ink }]}>Home</Text>
      </Pressable>
      <Text style={[{ fontSize: 28, lineHeight: 34 }, font(800), { color: c.ink }]}>More tools</Text>
      <View style={{ gap: space[2] }}>
        {tools.map((t) => (
          <Pressable key={t.title} onPress={t.run} accessibilityRole="button"
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space[4], minHeight: 76, padding: space[4], borderRadius: radius.xl, backgroundColor: c.surface, opacity: pressed ? 0.85 : 1 }, shadow('card')]}>
            <Icon name={t.icon} size={26} color={c.ink} />
            <View style={{ flex: 1 }}>
              <Text style={[{ fontSize: 19, lineHeight: 25 }, font(700), { color: c.ink }]}>{t.title}</Text>
              <Text style={[{ fontSize: 16, lineHeight: 22 }, font(500), { color: c.ink2 }]}>{t.sub}</Text>
            </View>
            <Icon name="chevron-forward" size={22} color={c.ink3} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
