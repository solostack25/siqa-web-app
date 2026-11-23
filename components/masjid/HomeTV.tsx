// Siqa Home on the TV: a remote-friendly Siqa for the living room. Big tiles you move
// between with the arrow keys: what's live, the next salah, lectures from the speakers
// and masjids you follow, and halaqas you can join (questions go through your phone).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { font } from '../../lib/ds';
import { TVStage } from './TVStage';
import { LivePlayer } from './LivePlayer';
import { QRCode } from './QRCode';
import { tvTile, useTVFocus } from './useTVFocus';
import { youTubeEmbedUrl } from '../youtubeNative';
import { STUDIO_URL } from '../../lib/studioLink';
import {
  dayKeyIn, fmtDateLong, fmtHijri, fmtIn, fmtTime, occurrences, upcoming,
  type MasjidEvent, type MasjidSettings, SITE,
} from '../../lib/masjid';

const C = { bg: '#0a0f1c', panel: '#141c30', panel2: '#1b2438', line: '#222b40', ink: '#edf1f7', ink2: '#9facc4', gold: '#d4ac73', goldInk: '#e6c290', goldTint: '#2b2618', danger: '#e0664f' };
const disp = (w: 700 | 800 = 800) => font(w, 'display');
const sans = (w: 400 | 500 | 600 | 700 = 500) => font(w);

export type HomeData = {
  screen: { id: string; name: string };
  user: { id: string; name: string | null } | null;
  following_speakers: string[];
  following_masjids: string[];
};

type Video = { id: string; title: string; thumbnail_url: string | null; duration_secs: number | null; platform: string | null; platform_video_id: string | null; video_url: string | null; speaker_id: string | null; speakers?: { display_name: string } | null };
type Live = { key: string; title: string; who: string; playback_url?: string; watch_token: string };
type Halaqa = { occ: ReturnType<typeof occurrences>[number]; masjid: string; tz: string };
type Playing = { kind: 'video'; v: Video } | { kind: 'live'; l: Live } | { kind: 'halaqa'; h: Halaqa } | null;

export function HomeTV({ data, now }: { data: HomeData; now: Date }) {
  const [live, setLive] = useState<Live[]>([]);
  const [following, setFollowing] = useState<Video[]>([]);
  const [lectures, setLectures] = useState<Video[]>([]);
  const [halaqas, setHalaqas] = useState<Halaqa[]>([]);
  const [salah, setSalah] = useState<{ s: MasjidSettings; masjid: string } | null>(null);
  const [playing, setPlaying] = useState<Playing>(null);

  const load = useCallback(async () => {
    const spk = data.following_speakers ?? [];
    const msj = data.following_masjids ?? [];
    const vSel = 'id, title, thumbnail_url, duration_secs, platform, platform_video_id, video_url, speaker_id, speakers(display_name)';
    const [liveRes, folRes, lecRes, setRes, evRes, orgRes, ...masjidLive] = await Promise.all([
      supabase.rpc('siqa_live_now', { p_speaker: null }),
      spk.length ? supabase.from('videos').select(vSel).in('speaker_id', spk).eq('is_published', true).eq('format', 'long').order('published_at', { ascending: false }).limit(16) : Promise.resolve({ data: [] }),
      supabase.from('videos').select(vSel).eq('is_published', true).eq('format', 'long').order('published_at', { ascending: false }).limit(16),
      msj.length ? supabase.from('masjid_settings').select('*').in('org_id', msj) : Promise.resolve({ data: [] }),
      msj.length ? supabase.from('masjid_events').select('*').in('org_id', msj).eq('live_on_siqa', true) : Promise.resolve({ data: [] }),
      msj.length ? supabase.from('organizations').select('id, org_name').in('id', msj) : Promise.resolve({ data: [] }),
      ...msj.map((id) => supabase.rpc('masjid_live', { p_org: id })),
    ]);
    const names = new Map(((orgRes.data as any[]) || []).map((o) => [o.id, o.org_name]));
    const lives: Live[] = [];
    masjidLive.forEach((r: any, i) => { if (r.data) lives.push({ key: 'm' + i, title: r.data.title, who: names.get(msj[i]) ?? r.data.speaker_name, playback_url: r.data.playback_url, watch_token: r.data.watch_token }); });
    ((liveRes.data as any[]) || [])
      .sort((a, b) => Number(spk.includes(b.speaker_id)) - Number(spk.includes(a.speaker_id)))
      .forEach((l) => { if (!lives.some((x) => x.watch_token === l.watch_token)) lives.push({ key: l.watch_token, title: l.title, who: l.speaker_name + (l.masjid_name ? ` · ${l.masjid_name}` : ''), watch_token: l.watch_token }); });
    setLive(lives);
    setFollowing(((folRes.data as any[]) || []) as Video[]);
    setLectures((((lecRes.data as any[]) || []) as Video[]).filter((v) => !spk.includes(v.speaker_id ?? '')));
    const settings = ((setRes.data as any[]) || [])[0] as MasjidSettings | undefined;
    if (settings && settings.lat != null) setSalah({ s: settings, masjid: names.get(settings.org_id) ?? '' });
    const tz = settings?.timezone ?? 'America/Chicago';
    const evs = ((evRes.data as any[]) || []).map((e) => ({ ...e, start_time: String(e.start_time).slice(0, 5) })) as MasjidEvent[];
    setHalaqas(occurrences(evs, dayKeyIn(new Date(), tz), 7, tz).slice(0, 8).map((occ) => ({ occ, masjid: names.get(occ.event.org_id ?? '') ?? '', tz })));
  }, [data.following_speakers?.join(','), data.following_masjids?.join(',')]);

  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  useTVFocus(playing ? () => setPlaying(null) : undefined, [playing, live.length, following.length, lectures.length, halaqas.length]);

  const next = useMemo(() => (salah ? upcoming(salah.s, [], now).find((i) => i.type === 'salah') : null), [salah, Math.floor(now.getTime() / 30000)]);
  const tz = salah?.s.timezone ?? 'America/Chicago';

  // Athan reminder on screen when a salah is about to start.
  const salahSoon = next && next.at.getTime() - now.getTime() < 10 * 60000;

  if (playing) return <Player p={playing} onClose={() => setPlaying(null)} />;

  const greeting = data.user?.name ? `Assalamu alaikum, ${data.user.name.split(' ')[0]}` : 'Assalamu alaikum';
  return (
    <TVStage>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 80 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 72, paddingTop: 48, paddingBottom: 24, gap: 24 }}>
          <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: '#05080f', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.gold, fontSize: 38, fontWeight: '700' }}>ص</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[disp(), { fontSize: 44, color: C.ink, letterSpacing: -1 }]}>{greeting}</Text>
            <Text style={[sans(500), { fontSize: 22, color: C.ink2 }]}>{fmtDateLong(now, tz)} · {fmtHijri(now, tz, salah?.s.hijri_offset ?? 0)}</Text>
          </View>
          {next ? (
            <View style={{ alignItems: 'flex-end', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 22, backgroundColor: salahSoon ? C.goldTint : C.panel, borderWidth: salahSoon ? 2 : 0, borderColor: C.gold }}>
              <Text style={[sans(600), { fontSize: 20, color: C.goldInk }]}>{next.type === 'salah' ? next.row.name : ''} {fmtTime(next.at, tz)}</Text>
              <Text style={[sans(500), { fontSize: 18, color: C.ink2 }]}>in {fmtIn(next.at.getTime() - now.getTime())}{salah?.masjid ? ` · ${salah.masjid}` : ''}</Text>
            </View>
          ) : null}
          <Text style={[disp(), { fontSize: 64, color: C.ink, letterSpacing: -2 }]}>{fmtTime(now, tz, false)}</Text>
        </View>

        {live.length ? (
          <Row title="Live now">
            {live.map((l, i) => (
              <Tile key={l.key} isDefault={i === 0} w={560} onPress={() => setPlaying({ kind: 'live', l })} label={`Watch ${l.title} live`}>
                <View style={{ height: 300, backgroundColor: '#05080f', alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.danger, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: '#fff' }} />
                    <Text style={[sans(700), { fontSize: 22, color: '#fff' }]}>LIVE</Text>
                  </View>
                </View>
                <TileText title={l.title} sub={l.who} />
              </Tile>
            ))}
          </Row>
        ) : null}

        {halaqas.length ? (
          <Row title="Halaqas this week">
            {halaqas.map((h, i) => (
              <Tile key={i} w={420} onPress={() => setPlaying({ kind: 'halaqa', h })} label={`${h.occ.event.title}, ${fmtWhen(h.occ.start, tz)}`}>
                <View style={{ height: 150, padding: 24, backgroundColor: C.panel2, justifyContent: 'flex-end' }}>
                  <Text style={[sans(600), { fontSize: 20, color: C.goldInk }]}>{fmtWhen(h.occ.start, tz)}</Text>
                </View>
                <TileText title={h.occ.event.title} sub={[h.occ.event.teacher, h.masjid].filter(Boolean).join(' · ')} />
              </Tile>
            ))}
          </Row>
        ) : null}

        {following.length ? <VideoRow title="From people you follow" videos={following} onPlay={(v) => setPlaying({ kind: 'video', v })} firstDefault={!live.length} /> : null}
        <VideoRow title="Lectures" videos={lectures} onPlay={(v) => setPlaying({ kind: 'video', v })} firstDefault={!live.length && !following.length} />

        <View style={{ paddingHorizontal: 72, paddingTop: 24 }}>
          <Text style={[sans(500), { fontSize: 20, color: C.ink2 }]}>Follow masjids and speakers in the Siqa app on your phone, and they show up here.</Text>
        </View>
      </ScrollView>
    </TVStage>
  );
}

const fmtWhen = (d: Date, tz: string) => `${new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(d)} ${fmtTime(d, tz)}`;

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 28 }}>
      <Text style={[sans(700), { fontSize: 30, color: C.ink, paddingHorizontal: 72, marginBottom: 16 }]}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 72, gap: 28, paddingVertical: 12 }}>{children}</ScrollView>
    </View>
  );
}

function Tile({ children, w, onPress, label, isDefault }: { children: React.ReactNode; w: number; onPress: () => void; label: string; isDefault?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} {...tvTile(isDefault)}
      style={({ focused, hovered }: any) => ({
        width: w, borderRadius: 22, overflow: 'hidden', backgroundColor: C.panel,
        transform: [{ scale: focused || hovered ? 1.06 : 1 }],
        borderWidth: 4, borderColor: focused || hovered ? C.gold : 'transparent',
        outlineStyle: 'none',
      } as any)}>
      {children}
    </Pressable>
  );
}

function TileText({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ padding: 20, gap: 4 }}>
      <Text style={[sans(700), { fontSize: 24, lineHeight: 30, color: C.ink }]} numberOfLines={2}>{title}</Text>
      {sub ? <Text style={[sans(500), { fontSize: 19, color: C.ink2 }]} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

function VideoRow({ title, videos, onPlay, firstDefault }: { title: string; videos: Video[]; onPlay: (v: Video) => void; firstDefault?: boolean }) {
  if (!videos.length) return null;
  return (
    <Row title={title}>
      {videos.map((v, i) => (
        <Tile key={v.id} w={440} isDefault={firstDefault && i === 0} onPress={() => onPlay(v)} label={`Play ${v.title}`}>
          <View style={{ height: 248, backgroundColor: '#05080f' }}>
            {v.thumbnail_url ? <Image source={{ uri: v.thumbnail_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
            {v.duration_secs ? (
              <View style={{ position: 'absolute', right: 12, bottom: 12, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={[sans(700), { fontSize: 16, color: '#fff' }]}>{Math.floor(v.duration_secs / 60)}:{String(v.duration_secs % 60).padStart(2, '0')}</Text>
              </View>
            ) : null}
          </View>
          <TileText title={v.title} sub={v.speakers?.display_name} />
        </Tile>
      ))}
    </Row>
  );
}

function Player({ p, onClose }: { p: NonNullable<Playing>; onClose: () => void }) {
  useTVFocus(onClose, [p]);
  const close = (
    <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Back" {...tvTile(p.kind === 'halaqa')}
      style={({ focused }: any) => ({ position: 'absolute', left: 40, top: 36, paddingHorizontal: 24, height: 56, justifyContent: 'center', borderRadius: 999, backgroundColor: focused ? C.ink : 'rgba(0,0,0,0.6)', outlineStyle: 'none' } as any)}>
      {({ focused }: any) => <Text style={[sans(700), { fontSize: 22, color: focused ? C.bg : '#fff' }]}>Back</Text>}
    </Pressable>
  );

  if (p.kind === 'halaqa') {
    const e = p.h.occ.event;
    const tz = p.h.tz;
    return (
      <TVStage>
        <View style={{ flex: 1, flexDirection: 'row', padding: 96, gap: 72, alignItems: 'center' }}>
          <View style={{ flex: 1, gap: 18 }}>
            <Text style={[sans(600), { fontSize: 24, color: C.goldInk }]}>{fmtWhen(p.h.occ.start, tz).toUpperCase()}</Text>
            <Text style={[disp(), { fontSize: 72, lineHeight: 78, color: C.ink, letterSpacing: -2 }]}>{e.title}</Text>
            <Text style={[sans(500), { fontSize: 30, color: C.ink2 }]}>{[e.teacher, p.h.masjid].filter(Boolean).join(' · ')}</Text>
            <Text style={[sans(500), { fontSize: 26, lineHeight: 36, color: C.ink2, marginTop: 20 }]}>When it starts, it plays here. Ask questions, get the PDF notes and give to the attached Seed from your phone.</Text>
          </View>
          <View style={{ alignItems: 'center', gap: 16, backgroundColor: C.panel, borderRadius: 32, padding: 40 }}>
            <View style={{ backgroundColor: '#fff', padding: 18, borderRadius: 20 }}><QRCode value={`${SITE}/`} size={260} label="Open on your phone" /></View>
            <Text style={[sans(700), { fontSize: 24, color: C.ink }]}>Scan with your phone</Text>
            <Text style={[sans(500), { fontSize: 20, color: C.ink2 }]}>Questions · notes · donate</Text>
          </View>
        </View>
        {close}
      </TVStage>
    );
  }

  if (p.kind === 'live') {
    if (p.l.playback_url) {
      return (
        <TVStage bg="#000">
          <LivePlayer src={p.l.playback_url} muted={false} style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080 }} />
          {close}
        </TVStage>
      );
    }
    return <WebFrame src={`${STUDIO_URL}/watch/${p.l.watch_token}?embed=1`} close={close} />;
  }

  const v = p.v;
  if (v.platform === 'youtube' && v.platform_video_id) {
    return <WebFrame src={youTubeEmbedUrl(v.platform_video_id, { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1 })} close={close} />;
  }
  return (
    <TVStage bg="#000">
      {Platform.OS === 'web' && v.video_url ? React.createElement('video', { src: v.video_url, autoPlay: true, controls: true, style: { width: 1920, height: 1080, background: '#000' } }) : null}
      {close}
    </TVStage>
  );
}

function WebFrame({ src, close }: { src: string; close: React.ReactNode }) {
  return (
    <TVStage bg="#000">
      {Platform.OS === 'web' ? React.createElement('iframe', {
        src, title: 'Player', allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture', allowFullScreen: true,
        style: { position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, border: 0, background: '#000' },
      }) : null}
      {close}
    </TVStage>
  );
}
