// Event device → Big screen: what the projector shows. Laid out at 1920×1080 and scaled to fit.
// "Follow the program" picks the view from the current part: slides, a video, the remote speaker, or the appeal.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Animated, Easing } from 'react-native';
import { font } from '../../../lib/ds';
import { TVStage, Ticker } from '../../masjid/TVStage';
import { QRCode } from '../../masjid/QRCode';
import { STUDIO_URL } from '../../../lib/studioLink';
import { eventUrl, giveUrl, segmentClock, usd, type LiveState, type StageMode } from '../../../lib/events';

const C = { bg: '#0a0f1c', panel: '#141c30', ink: '#edf1f7', ink2: '#9facc4', gold: '#d4ac73', goldInk: '#e6c290', seed: '#3fa070' };
const d = (w: any, size: number, line = size * 1.15, tracking = 0) => ({ ...font(w, 'display'), fontSize: size, lineHeight: line, letterSpacing: tracking });

function youTubeId(url: string) {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export function StageView({ state, skew }: { state: LiveState; skew: number }) {
  const e = state.event;
  const { cur, next } = segmentClock(state, skew);
  let mode: StageMode = e.stage_mode;
  if (e.status === 'ended') mode = 'thanks';
  else if (e.status !== 'live' && mode === 'auto') mode = 'welcome';
  else if (mode === 'auto') {
    if (!cur) mode = 'program';
    else if (cur.kind === 'appeal') mode = 'appeal';
    else if (cur.slides?.length) mode = 'slides';
    else if (cur.kind === 'video' && cur.video_url) mode = 'video';
    else if (cur.remote && e.online_watch_token) mode = 'speaker';
    else mode = 'program';
  }
  return (
    <TVStage>
      {mode === 'welcome' ? <Welcome state={state} /> : null}
      {mode === 'program' ? <Program state={state} title={cur?.title} speaker={cur?.speaker} nextTitle={next?.title} /> : null}
      {mode === 'slides' ? <Slides urls={cur?.slides ?? []} index={e.slide_index} fallback={<Program state={state} title={cur?.title} speaker={cur?.speaker} nextTitle={next?.title} />} /> : null}
      {mode === 'video' ? <Video url={cur?.video_url ?? ''} key={`${cur?.id}:${e.segment_started_at}`} /> : null}
      {mode === 'speaker' ? <Speaker token={e.online_watch_token} title={cur?.title} speaker={cur?.speaker} /> : null}
      {mode === 'appeal' ? <Appeal state={state} /> : null}
      {mode === 'thanks' ? <Thanks state={state} /> : null}
      <GiftFlash state={state} />
    </TVStage>
  );
}

function Brand({ state }: { state: LiveState }) {
  const e = state.event;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
      {e.org_logo ? <Image source={{ uri: e.org_logo }} style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: '#fff' }} /> : null}
      <Text style={[d(700, 30), { color: C.ink2 }]}>{e.org_name}</Text>
    </View>
  );
}

function Welcome({ state }: { state: LiveState }) {
  const e = state.event;
  return (
    <View style={{ flex: 1, padding: 120, justifyContent: 'space-between' }}>
      <Brand state={state} />
      <View style={{ gap: 24 }}>
        <Text style={[d(600, 40), { color: C.gold, letterSpacing: 2 }]}>WELCOME TO</Text>
        <Text style={[d(800, 132, 140, -4), { color: C.ink }]} numberOfLines={2}>{e.title}</Text>
        {e.venue ? <Text style={[d(500, 40), { color: C.ink2 }]}>{e.venue}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <Text style={[d(500, 34), { color: C.ink2, maxWidth: 1100 }]}>The program begins shortly. Find your table and enjoy.</Text>
        <View style={{ alignItems: 'center', gap: 12 }}>
          <View style={{ padding: 16, backgroundColor: '#fff', borderRadius: 24 }}><QRCode value={giveUrl(e.slug)} size={200} /></View>
          <Text style={[d(600, 24), { color: C.ink2 }]}>Scan to give</Text>
        </View>
      </View>
    </View>
  );
}

function Program({ state, title, speaker, nextTitle }: { state: LiveState; title?: string; speaker?: string | null; nextTitle?: string }) {
  const t = state.totals;
  return (
    <View style={{ flex: 1, padding: 120, justifyContent: 'space-between' }}>
      <Brand state={state} />
      <View style={{ gap: 28 }}>
        <Text style={[d(800, 150, 158, -5), { color: C.ink }]} numberOfLines={2}>{title ?? state.event.title}</Text>
        {speaker ? <Text style={[d(600, 60), { color: C.gold }]}>{speaker}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 60 }}>
        <Text style={[d(500, 34), { color: C.ink2 }]}>{nextTitle ? `Up next · ${nextTitle}` : ' '}</Text>
        {t.goal_cents ? (
          <View style={{ width: 620, gap: 14 }}>
            <Text style={[d(700, 34), { color: C.ink, textAlign: 'right' }]}>{usd(t.raised_cents)} <Text style={{ color: C.ink2 }}>of {usd(t.goal_cents)}</Text></Text>
            <Bar value={t.raised_cents} max={t.goal_cents} h={18} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Bar({ value, max, h }: { value: number; max: number; h: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const w = useRef(new Animated.Value(pct)).current;
  useEffect(() => { Animated.timing(w, { toValue: pct, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(); }, [pct]);
  return (
    <View style={{ height: h, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
      <Animated.View style={{ height: '100%', borderRadius: 999, backgroundColor: C.gold, width: w.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}

function Slides({ urls, index, fallback }: { urls: string[]; index: number; fallback: React.ReactNode }) {
  if (!urls.length) return <>{fallback}</>;
  const i = Math.min(index, urls.length - 1);
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Image source={{ uri: urls[i] }} style={{ width: 1920, height: 1080 }} resizeMode="contain" />
      {/* Load the next slide early so it changes instantly. */}
      {urls[i + 1] ? <Image source={{ uri: urls[i + 1] }} style={{ width: 1, height: 1, opacity: 0, position: 'absolute' }} /> : null}
    </View>
  );
}

function Video({ url }: { url: string }) {
  const id = youTubeId(url);
  const el = id
    ? React.createElement('iframe', { src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&controls=0&rel=0&modestbranding=1&playsinline=1`, allow: 'autoplay; encrypted-media; fullscreen', style: { width: 1920, height: 1080, border: 0 }, title: 'Video' })
    : React.createElement('video', { src: url, autoPlay: true, playsInline: true, controls: false, style: { width: 1920, height: 1080, background: '#000', objectFit: 'contain' } });
  return <View style={{ flex: 1, backgroundColor: '#000' }}>{el}</View>;
}

function Speaker({ token, title, speaker }: { token: string | null; title?: string; speaker?: string | null }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {token ? React.createElement('iframe', { src: `${STUDIO_URL}/watch/${token}?embed=1&tv=1`, allow: 'autoplay; fullscreen', style: { width: 1920, height: 1080, border: 0 }, title: 'Speaker' }) : null}
      <View style={{ position: 'absolute', left: 80, bottom: 80, paddingHorizontal: 36, paddingVertical: 22, borderRadius: 24, backgroundColor: 'rgba(10,15,28,0.8)' }}>
        <Text style={[d(800, 48), { color: C.ink }]}>{speaker || title}</Text>
        {speaker && title ? <Text style={[d(500, 30), { color: C.ink2 }]}>{title}</Text> : null}
      </View>
    </View>
  );
}

function Appeal({ state }: { state: LiveState }) {
  const e = state.event;
  const t = state.totals;
  const ask = e.ladder_index != null ? e.ladder?.[e.ladder_index] : null;
  const pct = t.goal_cents ? Math.min(100, Math.round((t.raised_cents / t.goal_cents) * 100)) : 0;
  const feed = t.feed.filter((g) => g.name !== 'Anonymous' || g.amount_cents >= 100000).slice(0, 8);
  return (
    <View style={{ flex: 1, padding: 90, gap: 40 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Brand state={state} />
        {t.match_cents ? (
          <View style={{ paddingHorizontal: 28, paddingVertical: 14, borderRadius: 999, backgroundColor: 'rgba(212,172,115,0.16)' }}>
            <Text style={[d(700, 30), { color: C.goldInk }]}>Every gift doubled{e.match_by ? ` by ${e.match_by}` : ''} · {usd(Math.max(0, t.match_cents - t.match_used_cents))} left</Text>
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, flexDirection: 'row', gap: 80 }}>
        <View style={{ flex: 1, justifyContent: 'center', gap: 30 }}>
          {ask ? (
            <View style={{ gap: 8 }}>
              <Text style={[d(600, 40), { color: C.gold, letterSpacing: 2 }]}>{ask.label ? ask.label.toUpperCase() : 'WHO WILL GIVE'}</Text>
              <Text style={[d(800, 200, 200, -8), { color: C.ink }]}>{usd(ask.amount_cents)}</Text>
            </View>
          ) : (
            <Text style={[d(800, 120, 128, -4), { color: C.ink }]}>{e.title}</Text>
          )}
          <View style={{ gap: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 24 }}>
              <Text style={[d(800, 96, 100, -3), { color: C.gold }]}>{usd(t.raised_cents)}</Text>
              {t.goal_cents ? <Text style={[d(600, 44), { color: C.ink2 }]}>of {usd(t.goal_cents)} · {pct}%</Text> : null}
            </View>
            {t.goal_cents ? <Bar value={t.raised_cents} max={t.goal_cents} h={36} /> : null}
            <Text style={[d(500, 32), { color: C.ink2 }]}>{t.donors} {t.donors === 1 ? 'gift' : 'gifts'} tonight</Text>
          </View>
        </View>
        <View style={{ width: 460, gap: 26, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ padding: 22, backgroundColor: '#fff', borderRadius: 32 }}><QRCode value={giveUrl(e.slug)} size={360} /></View>
          <Text style={[d(800, 44), { color: C.ink, textAlign: 'center' }]}>Give from your phone</Text>
          <Text style={[d(500, 28), { color: C.ink2, textAlign: 'center' }]}>{giveUrl(e.slug).replace('https://', '')}</Text>
        </View>
      </View>
      {feed.length ? (
        <View style={{ height: 70, justifyContent: 'center', borderRadius: 999, backgroundColor: C.panel, paddingHorizontal: 30 }}>
          <Ticker width={1680} text={feed.map((g) => `${g.name} · ${usd(g.amount_cents)}`).join('      ✦      ')} style={[d(600, 32), { color: C.ink }]} />
        </View>
      ) : null}
    </View>
  );
}

function Thanks({ state }: { state: LiveState }) {
  const t = state.totals;
  return (
    <View style={{ flex: 1, padding: 120, justifyContent: 'center', alignItems: 'center', gap: 30 }}>
      <Text style={[d(600, 44), { color: C.gold, letterSpacing: 3 }]}>JAZAKUM ALLAHU KHAYRAN</Text>
      <Text style={[d(800, 140, 148, -5), { color: C.ink, textAlign: 'center' }]}>Thank you</Text>
      {t.raised_cents ? <Text style={[d(700, 64), { color: C.ink2, textAlign: 'center' }]}>Together we raised <Text style={{ color: C.gold }}>{usd(t.raised_cents)}</Text></Text> : null}
      <View style={{ marginTop: 30 }}><Brand state={state} /></View>
      <Text style={[d(500, 28), { color: C.ink2 }]}>{eventUrl(state.event.slug).replace('https://', '')}</Text>
    </View>
  );
}

/** A banner when a named gift of $1,000+ comes in. */
function GiftFlash({ state }: { state: LiveState }) {
  const top = state.totals.feed[0];
  const seen = useRef<string | null>(null);
  const [show, setShow] = useState<typeof top | null>(null);
  const y = useRef(new Animated.Value(200)).current;
  useEffect(() => {
    if (!top) return;
    const key = `${top.at}:${top.amount_cents}`;
    if (seen.current === null) { seen.current = key; return; }
    if (key === seen.current) return;
    seen.current = key;
    if (top.amount_cents < 100000 || state.event.status !== 'live') return;
    setShow(top);
    y.setValue(200);
    Animated.sequence([
      Animated.timing(y, { toValue: 0, duration: 450, easing: Easing.out(Easing.back(1.4)), useNativeDriver: false }),
      Animated.delay(5000),
      Animated.timing(y, { toValue: 220, duration: 400, useNativeDriver: false }),
    ]).start(() => setShow(null));
  }, [top?.at, top?.amount_cents]);
  if (!show) return null;
  return (
    <Animated.View style={{ position: 'absolute', left: 0, right: 0, bottom: 60, alignItems: 'center', transform: [{ translateY: y }] }}>
      <View style={{ paddingHorizontal: 50, paddingVertical: 24, borderRadius: 999, backgroundColor: C.gold, flexDirection: 'row', gap: 24, alignItems: 'center' }}>
        <Text style={[d(800, 46), { color: '#0a0f1c' }]}>{usd(show.amount_cents)}</Text>
        <Text style={[d(600, 38), { color: '#0a0f1c' }]}>{show.name === 'Anonymous' ? 'from an anonymous donor' : `from ${show.name}`} · Alhamdulillah</Text>
      </View>
    </Animated.View>
  );
}
