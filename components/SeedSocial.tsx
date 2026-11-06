// Shared pieces for the Seed / nonprofit-profile pages: speaker
// endorsements, donor "why I gave" reviews, and the sheets a speaker or an
// organizer uses to endorse / request endorsements.
//
// Data lives in seed_endorsements, donation_reviews (read through the
// public_donation_reviews view) and donation_review_votes — see
// supabase/migrations/20261105230000_seed_endorsements_and_donor_reviews.sql.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useTheme, type AppColors } from '../lib/theme';
import { makeBunnySeedVideoPath, uploadVideoToBunny } from '../lib/bunnyUpload';
import { Icon } from './Icon';
import { showToast } from './Toast';
import { brandStyles, font, radius, type, useDS } from '../lib/ds';
import { Button, Chip as DSChip } from './ui';

// ── Types ────────────────────────────────────────────────────────────────

export type SpeakerLite = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  state?: string | null;
  topics?: string[] | null;
};

export type SeedEndorsement = {
  id: string;
  fundraiser_id: string;
  speaker_id: string;
  status: 'requested' | 'endorsed' | 'declined';
  message: string | null;
  connections: string[] | null;
  video_url: string | null;
  request_note: string | null;
  created_at: string;
  responded_at: string | null;
  speakers: SpeakerLite | null;
};

export type PublicReview = {
  id: string;
  fundraiser_id: string;
  fundraiser_title?: string | null;
  body: string;
  reason: string | null;
  visibility: 'full' | 'name' | 'anonymous';
  display_name: string;
  amount: number | null;
  via_speaker_id: string | null;
  via_speaker_name: string | null;
  helpful_count: number;
  created_at: string;
};

export const ENDORSEMENT_SELECT =
  'id,fundraiser_id,speaker_id,status,message,connections,video_url,request_note,created_at,responded_at,speakers(id,display_name,avatar_url,state,topics)';

export const CONNECTION_OPTIONS: { key: string; label: string }[] = [
  { key: 'visited', label: 'I have seen their work in person' },
  { key: 'partner', label: 'My masjid / organization partners with them' },
  { key: 'donor', label: 'I personally donate to them' },
];

export const REVIEW_REASONS = ['Giving back', 'Speaker recommended', 'Zakat', 'In memory of someone', 'I know the team', 'Urgent need'];

// ── Small helpers ────────────────────────────────────────────────────────

export function money(cents: number | null | undefined) {
  return '$' + Math.round((cents || 0) / 100).toLocaleString('en-US');
}

export function timeAgo(ts: string) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 2592000) return Math.floor(diff / 86400) + 'd ago';
  return Math.floor(diff / 2592000) + 'mo ago';
}

export function initialsOf(name: string | null | undefined) {
  const parts = String(name || '?').replace(/^(Shaykh|Sheikh|Imam|Ustadh|Ustadha|Dr\.?|Mufti)\s+/i, '').split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

/** Width of the element the returned onLayout is attached to. Layout
 *  decisions (1 / 2 / 3 columns) follow the space the page actually has,
 *  which on desktop web is the window minus the sidebar. */
export function useMeasuredWidth(initial = 390) {
  const [width, setWidth] = useState(initial);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setWidth(prev => (Math.abs(prev - w) > 2 ? w : prev));
  }, []);
  return { width, onLayout };
}

// ── Avatars, progress, cards ─────────────────────────────────────────────

export function Avatar({ name, url, size = 44, tone = 'gold', square = false }: {
  name: string | null | undefined; url?: string | null; size?: number; tone?: 'gold' | 'emerald' | 'neutral'; square?: boolean;
}) {
  const { c } = useDS();
  const bg = tone === 'gold' ? c.goldTint : tone === 'emerald' ? c.seedTint : c.surfaceSoft;
  const fg = tone === 'gold' ? c.goldInk : tone === 'emerald' ? c.seed : c.ink2;
  return (
    <View style={{
      width: size, height: size, borderRadius: square ? size * 0.26 : size / 2, backgroundColor: bg,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    }}>
      {url ? (
        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <Text style={[font(700), { color: fg, fontSize: Math.max(11, size * 0.32) }]}>{initialsOf(name)}</Text>
      )}
    </View>
  );
}

export function ProgressBar({ pct, height = 8 }: { pct: number; height?: number }) {
  const { c } = useDS();
  return (
    <View style={{ height, borderRadius: 999, backgroundColor: c.surfaceStrong, overflow: 'hidden' }}>
      <View style={{ height, width: `${Math.max(0, Math.min(100, pct))}%` as any, borderRadius: 999, backgroundColor: c.seed }} />
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  const { c, shadow } = useDS();
  return (
    <View style={[{
      backgroundColor: c.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: c.line, padding: 18, gap: 14,
    }, shadow('card'), style]}>
      {children}
    </View>
  );
}

export function CardTitle({ children, right, icon }: { children: React.ReactNode; right?: React.ReactNode; icon?: any }) {
  const { c } = useDS();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
        {icon ? <Icon name={icon} size={18} color={c.gold} /> : null}
        <Text style={[type.headline, font(700, 'display'), { color: c.ink, fontSize: 18, flexShrink: 1 }]} accessibilityRole="header">{children}</Text>
      </View>
      {right}
    </View>
  );
}

/** Kept for existing callers; draws the brand kit chip. */
export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void; tone?: 'emerald' | 'gold' }) {
  return <DSChip label={label} selected={active} onPress={onPress} disabled={!onPress} />;
}

export function Tag({ label, tone = 'emerald' }: { label: string; tone?: 'emerald' | 'gold' }) {
  const { c } = useDS();
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: tone === 'gold' ? c.goldTint : c.seedTint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={[type.micro, font(700), { color: tone === 'gold' ? c.goldInk : c.seed }]}>{label}</Text>
    </View>
  );
}

// ── Endorsement card ─────────────────────────────────────────────────────

export function EndorsementCard({ e, compact }: { e: SeedEndorsement; compact?: boolean }) {
  const { colors: C } = useTheme();
  const s = makeStyles(C);
  const [playing, setPlaying] = useState(false);
  const sp = e.speakers;
  const ties = (e.connections || [])
    .map(k => CONNECTION_OPTIONS.find(o => o.key === k)?.label)
    .filter(Boolean) as string[];
  return (
    <View style={[s.endorseCard, compact && { padding: 0, borderWidth: 0, backgroundColor: 'transparent' }]}>
      <TouchableOpacity
        style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}
        onPress={() => sp && router.push(`/speaker/${sp.id}` as any)}
        accessibilityRole="link"
      >
        <Avatar name={sp?.display_name} url={sp?.avatar_url} size={compact ? 40 : 44} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={s.endorseName} numberOfLines={1}>{sp?.display_name || 'Siqa speaker'}</Text>
            <Icon name="checkmark-circle" size={14} color={C.emerald} />
          </View>
          <Text style={s.endorseMeta} numberOfLines={1}>Verified speaker{sp?.state ? ` · ${sp.state}` : ''}</Text>
        </View>
      </TouchableOpacity>
      {e.message ? <Text style={s.endorseQuote}>“{e.message}”</Text> : null}
      {!compact && ties.length > 0 && (
        <View style={{ gap: 4 }}>
          {ties.map(t => (
            <View key={t} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <Icon name="checkmark" size={13} color={C.goldDim} />
              <Text style={s.endorseTie}>{t}</Text>
            </View>
          ))}
        </View>
      )}
      {!compact && e.video_url ? (
        playing ? (
          <EndorsementVideo url={e.video_url} />
        ) : (
          <TouchableOpacity style={s.videoBtn} onPress={() => setPlaying(true)} accessibilityRole="button">
            <Icon name="play" size={14} color={C.goldDim} />
            <Text style={s.videoBtnText}>Watch video endorsement</Text>
          </TouchableOpacity>
        )
      ) : null}
    </View>
  );
}

function EndorsementVideo({ url }: { url: string }) {
  // expo-av is already used for Seed appeals; required lazily so this file
  // stays light where no video is ever played.
  const { Video, ResizeMode } = require('expo-av');
  return (
    <View style={{ aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' }}>
      <Video source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode={ResizeMode.CONTAIN} shouldPlay useNativeControls />
    </View>
  );
}

// ── Review card ──────────────────────────────────────────────────────────

export function ReviewCard({ r, showSeed, voted, onVote }: {
  r: PublicReview; showSeed?: boolean; voted?: boolean; onVote?: (r: PublicReview) => void;
}) {
  const { colors: C } = useTheme();
  const s = makeStyles(C);
  const meta = [r.amount ? money(r.amount) : null, timeAgo(r.created_at)].filter(Boolean).join(' · ');
  return (
    <View style={s.reviewRow}>
      <Avatar name={r.display_name === 'Anonymous' ? '—' : r.display_name} size={40} tone="neutral" />
      <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Text style={s.reviewName}>{r.display_name}</Text>
          <Text style={s.reviewMeta}>{meta}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {r.via_speaker_name ? <Tag label={`Came via ${r.via_speaker_name}`} tone="gold" /> : null}
          {r.reason ? <Tag label={r.reason} /> : null}
        </View>
        <Text style={s.reviewBody}>{r.body}</Text>
        {showSeed && r.fundraiser_title ? (
          <TouchableOpacity onPress={() => router.push({ pathname: '/seed/[id]', params: { id: r.fundraiser_id } } as any)}>
            <Text style={s.reviewSeed} numberOfLines={1}>Gave to {r.fundraiser_title}</Text>
          </TouchableOpacity>
        ) : null}
        {onVote && (
          <TouchableOpacity
            onPress={() => onVote(r)}
            style={s.helpfulBtn}
            accessibilityRole="button"
            accessibilityState={{ selected: !!voted }}
          >
            <Icon name={voted ? 'thumbs-up' : 'thumbs-up-outline'} size={14} color={voted ? C.emerald : C.text2} />
            <Text style={[s.helpfulText, voted && { color: C.emerald }]}>Helpful{r.helpful_count ? ` · ${r.helpful_count}` : ''}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/** Loads the signed-in user's helpful votes and toggles them. */
export function useReviewVotes(reviewIds: string[]) {
  const [voted, setVoted] = useState<Record<string, boolean>>({});
  const key = reviewIds.join(',');
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!reviewIds.length) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.from('donation_review_votes').select('review_id').in('review_id', reviewIds);
      if (alive && data) setVoted(Object.fromEntries(data.map((d: any) => [d.review_id, true])));
    })();
    return () => { alive = false; };
  }, [key]);

  async function toggle(r: PublicReview, onCount: (id: string, delta: number) => void) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { showToast('Sign in to mark reviews helpful'); return; }
    const on = !voted[r.id];
    setVoted(v => ({ ...v, [r.id]: on }));
    onCount(r.id, on ? 1 : -1);
    const res = on
      ? await supabase.from('donation_review_votes').insert({ review_id: r.id })
      : await supabase.from('donation_review_votes').delete().eq('review_id', r.id).eq('profile_id', session.user.id);
    if (res.error) {
      setVoted(v => ({ ...v, [r.id]: !on }));
      onCount(r.id, on ? -1 : 1);
    }
  }
  return { voted, toggle };
}

// ── Sheet shell (bottom sheet on phones, centered dialog on wide screens) ─

export function Sheet({ visible, onClose, title, children, footer }: {
  visible: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode;
}) {
  const { colors: C } = useTheme();
  const { width, onLayout } = useMeasuredWidth(400);
  const wide = width >= 640;
  return (
    <Modal visible={visible} transparent animationType={wide ? 'fade' : 'slide'} onRequestClose={onClose}>
      <View onLayout={onLayout} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: wide ? 'center' : 'flex-end', alignItems: 'center', padding: wide ? 24 : 0 }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={{
          width: '100%', maxWidth: 560, maxHeight: wide ? '90%' : '92%', backgroundColor: C.bg,
          borderRadius: 20, borderBottomLeftRadius: wide ? 20 : 0, borderBottomRightRadius: wide ? 20 : 0, overflow: 'hidden',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border2 }}>
            <Text style={[type.headline, { flex: 1, color: C.text }]} accessibilityRole="header">{title}</Text>
            <TouchableOpacity onPress={onClose} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Close">
              <Icon name="close" size={22} color={C.text2} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? (
            <View style={{ padding: 16, paddingBottom: Platform.OS === 'ios' && !wide ? 34 : 16, borderTopWidth: 1, borderTopColor: C.border2, flexDirection: 'row', gap: 10 }}>
              {footer}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/**
 * Kept for existing callers; draws the brand kit button.
 * gold → gold (giving), emerald → primary, ghost → secondary.
 */
export function PrimaryButton({ label, onPress, busy, disabled, tone = 'gold', style }: {
  label: string; onPress: () => void; busy?: boolean; disabled?: boolean; tone?: 'gold' | 'emerald' | 'ghost'; style?: any;
}) {
  const variant = tone === 'gold' ? 'gold' : tone === 'emerald' ? 'primary' : 'secondary';
  return <Button label={label} onPress={onPress} loading={busy} disabled={disabled} variant={variant} style={style} />;
}

// ── Speaker picker (verified speakers only) ──────────────────────────────

export function SpeakerPicker({ selected, onToggle, exclude = [] }: {
  selected: Record<string, boolean>; onToggle: (sp: SpeakerLite) => void; exclude?: string[];
}) {
  const { colors: C } = useTheme();
  const s = makeStyles(C);
  const [q, setQ] = useState('');
  const [list, setList] = useState<SpeakerLite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      let query = supabase
        .from('speakers')
        .select('id,display_name,avatar_url,state,topics')
        .eq('is_verified', true)
        .eq('approval_status', 'approved')
        .order('follower_count', { ascending: false })
        .limit(25);
      if (q.trim()) query = query.ilike('display_name', `%${q.trim()}%`);
      const { data } = await query;
      if (alive) { setList((data || []) as SpeakerLite[]); setLoading(false); }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const shown = list.filter(sp => !exclude.includes(sp.id));
  return (
    <View style={{ gap: 10 }}>
      <View style={s.searchBox}>
        <Icon name="search" size={16} color={C.text3} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search verified speakers"
          placeholderTextColor={C.text3}
          style={s.searchInput}
          accessibilityLabel="Search verified speakers"
        />
      </View>
      {loading ? (
        <ActivityIndicator color={C.gold} style={{ marginVertical: 16 }} />
      ) : shown.length === 0 ? (
        <Text style={s.muted}>{q ? 'No verified speakers match that name.' : 'No verified speakers yet. Speakers appear here once Siqa approves them.'}</Text>
      ) : (
        shown.map(sp => {
          const on = !!selected[sp.id];
          return (
            <View key={sp.id} style={[s.pickRow, on && { borderColor: C.gold, backgroundColor: C.goldBg }]}>
              <Avatar name={sp.display_name} url={sp.avatar_url} size={44} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.pickName} numberOfLines={1}>{sp.display_name}</Text>
                <Text style={s.muted} numberOfLines={1}>{[sp.state, (sp.topics || []).slice(0, 2).join(', ')].filter(Boolean).join(' · ') || 'Verified speaker'}</Text>
              </View>
              <TouchableOpacity
                onPress={() => onToggle(sp)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[s.pickBtn, on && { backgroundColor: C.gold, borderColor: C.gold }]}
              >
                <Text style={[s.pickBtnText, on && { color: C.black }]}>{on ? 'Requested' : 'Request'}</Text>
              </TouchableOpacity>
            </View>
          );
        })
      )}
    </View>
  );
}

/** Sends endorsement requests for a Seed. Used by the wizard and the Seed page. */
export async function sendEndorsementRequests(fundraiserId: string, speakerIds: string[], note: string) {
  if (!speakerIds.length) return { error: null as any };
  const rows = speakerIds.map(speaker_id => ({
    fundraiser_id: fundraiserId,
    speaker_id,
    status: 'requested',
    request_note: note.trim() || null,
  }));
  return supabase.from('seed_endorsements').upsert(rows, { onConflict: 'fundraiser_id,speaker_id', ignoreDuplicates: true });
}

export function RequestEndorsementsSheet({ visible, onClose, fundraiserId, existing, onSent }: {
  visible: boolean; onClose: () => void; fundraiserId: string; existing: SeedEndorsement[]; onSent: () => void;
}) {
  const { colors: C } = useTheme();
  const s = makeStyles(C);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = existing.filter(e => e.status === 'requested');
  const count = Object.values(picked).filter(Boolean).length;

  async function send() {
    setBusy(true);
    const { error } = await sendEndorsementRequests(fundraiserId, Object.keys(picked).filter(k => picked[k]), note);
    setBusy(false);
    if (error) { showToast(error.message); return; }
    showToast(`Request${count > 1 ? 's' : ''} sent`);
    setPicked({}); setNote('');
    onSent();
    onClose();
  }

  async function cancelRequest(id: string) {
    const { error } = await supabase.from('seed_endorsements').delete().eq('id', id);
    if (error) showToast(error.message); else onSent();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Request endorsements"
      footer={<PrimaryButton label={count ? `Send ${count} request${count > 1 ? 's' : ''}` : 'Pick speakers to ask'} onPress={send} busy={busy} disabled={!count} style={{ flex: 1 }} />}
    >
      <Text style={s.body}>Speakers get a request in Siqa and decide for themselves. You can't write or edit what they say.</Text>
      {pending.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={s.label}>Waiting to hear back</Text>
          {pending.map(e => (
            <View key={e.id} style={s.pendingRow}>
              <Avatar name={e.speakers?.display_name} url={e.speakers?.avatar_url} size={32} />
              <Text style={[s.pickName, { flex: 1 }]} numberOfLines={1}>{e.speakers?.display_name}</Text>
              <TouchableOpacity onPress={() => cancelRequest(e.id)} style={{ padding: 10 }}>
                <Text style={{ color: C.text2, ...font(600), fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      <SpeakerPicker
        selected={picked}
        onToggle={sp => setPicked(p => ({ ...p, [sp.id]: !p[sp.id] }))}
        exclude={existing.map(e => e.speaker_id)}
      />
      <View style={{ gap: 6 }}>
        <Text style={s.label}>Note to speakers (optional)</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={500}
          placeholder="Assalamu alaikum — we'd be honored if you'd look at this Seed…"
          placeholderTextColor={C.text3}
          style={[s.input, { minHeight: 90, textAlignVertical: 'top' }]}
        />
      </View>
    </Sheet>
  );
}

// ── Speaker: endorse / decline / withdraw ────────────────────────────────

export function EndorseSeedSheet({ visible, onClose, fundraiserId, seedTitle, orgName, speakerId, existing, onDone }: {
  visible: boolean; onClose: () => void; fundraiserId: string; seedTitle: string; orgName?: string | null;
  speakerId: string; existing: SeedEndorsement | null; onDone: () => void;
}) {
  const { colors: C } = useTheme();
  const s = makeStyles(C);
  const [message, setMessage] = useState(existing?.message || '');
  const [ties, setTies] = useState<Record<string, boolean>>(
    Object.fromEntries((existing?.connections || []).map(k => [k, true]))
  );
  const [videoUrl, setVideoUrl] = useState<string | null>(existing?.video_url || null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [busy, setBusy] = useState<'endorse' | 'decline' | 'withdraw' | null>(null);

  useEffect(() => {
    if (!visible) return;
    setMessage(existing?.message || '');
    setTies(Object.fromEntries((existing?.connections || []).map(k => [k, true])));
    setVideoUrl(existing?.video_url || null);
  }, [visible, existing?.id]);

  const isEndorsed = existing?.status === 'endorsed';

  async function pickVideo() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { showToast('Allow Siqa to access your videos'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, quality: 1, videoMaxDuration: 60 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if (a.duration && a.duration > 61000) { showToast('Keep it under a minute'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    try {
      setUploading(0);
      const url = await uploadVideoToBunny({
        uri: a.uri,
        fileName: makeBunnySeedVideoPath(user.id, a.fileName || `endorsement-${Date.now()}.mp4`, a.mimeType),
        mimeType: a.mimeType || 'video/mp4',
        onProgress: ({ pct }) => setUploading(pct),
      });
      setVideoUrl(url);
    } catch (e: any) {
      showToast(e?.message || 'Video upload failed');
    } finally {
      setUploading(null);
    }
  }

  async function endorse() {
    if (!message.trim()) { showToast('Write a sentence or two first'); return; }
    setBusy('endorse');
    const fields = {
      status: 'endorsed',
      message: message.trim(),
      connections: Object.keys(ties).filter(k => ties[k]),
      video_url: videoUrl,
    };
    const res = existing
      ? await supabase.from('seed_endorsements').update(fields).eq('id', existing.id)
      : await supabase.from('seed_endorsements').insert({ ...fields, fundraiser_id: fundraiserId, speaker_id: speakerId });
    setBusy(null);
    if (res.error) { showToast(res.error.message); return; }
    showToast(isEndorsed ? 'Endorsement updated' : 'Endorsement posted');
    onDone(); onClose();
  }

  async function decline() {
    if (!existing) return;
    setBusy('decline');
    const { error } = await supabase.from('seed_endorsements').update({ status: 'declined' }).eq('id', existing.id);
    setBusy(null);
    if (error) { showToast(error.message); return; }
    showToast('Request declined');
    onDone(); onClose();
  }

  async function withdraw() {
    if (!existing) return;
    setBusy('withdraw');
    const { error } = await supabase.from('seed_endorsements').delete().eq('id', existing.id);
    setBusy(null);
    if (error) { showToast(error.message); return; }
    showToast('Endorsement withdrawn');
    onDone(); onClose();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={isEndorsed ? 'Your endorsement' : 'Endorse this Seed'}
      footer={
        <>
          {existing?.status === 'requested' && (
            <PrimaryButton label="Decline" tone="ghost" onPress={decline} busy={busy === 'decline'} style={{ flex: 1 }} />
          )}
          {isEndorsed && (
            <PrimaryButton label="Withdraw" tone="ghost" onPress={withdraw} busy={busy === 'withdraw'} style={{ flex: 1 }} />
          )}
          <PrimaryButton label={isEndorsed ? 'Save changes' : 'Endorse'} onPress={endorse} busy={busy === 'endorse'} disabled={uploading !== null} style={{ flex: 2 }} />
        </>
      }
    >
      <View style={s.pendingRow}>
        <Icon name="leaf-outline" size={20} color={C.gold} />
        <View style={{ flex: 1 }}>
          <Text style={s.pickName} numberOfLines={2}>{seedTitle}</Text>
          {orgName ? <Text style={s.muted}>{orgName}</Text> : null}
        </View>
      </View>
      {existing?.request_note ? (
        <View style={s.noteBox}>
          <Text style={s.body}>“{existing.request_note}”</Text>
          <Text style={s.muted}>— {orgName || 'The organizer'}</Text>
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <Text style={s.label}>Your connection (shown with your endorsement)</Text>
        {CONNECTION_OPTIONS.map(o => {
          const on = !!ties[o.key];
          return (
            <TouchableOpacity
              key={o.key}
              onPress={() => setTies(t => ({ ...t, [o.key]: !on }))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={[s.checkRow, on && { borderColor: C.gold, backgroundColor: C.goldBg }]}
            >
              <View style={[s.checkBox, on && { backgroundColor: C.gold, borderColor: C.gold }]}>
                {on ? <Icon name="checkmark" size={14} color={C.black} /> : null}
              </View>
              <Text style={[s.body, { flex: 1 }]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ gap: 6 }}>
        <Text style={s.label}>Your endorsement</Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={200}
          placeholder="Why should people trust and support this Seed?"
          placeholderTextColor={C.text3}
          style={[s.input, { minHeight: 96, textAlignVertical: 'top' }]}
        />
        <Text style={s.muted}>{message.length}/200 · The organization can't edit this.</Text>
      </View>

      {videoUrl ? (
        <View style={{ gap: 8 }}>
          <EndorsementVideo url={videoUrl} />
          <TouchableOpacity onPress={() => setVideoUrl(null)} style={{ alignSelf: 'flex-start', paddingVertical: 8 }}>
            <Text style={{ color: C.text2, ...font(600) }}>Remove video</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={s.videoAdd} onPress={pickVideo} disabled={uploading !== null} accessibilityRole="button">
          {uploading !== null ? (
            <Text style={s.videoBtnText}>Uploading… {uploading}%</Text>
          ) : (
            <>
              <Icon name="videocam-outline" size={18} color={C.goldDim} />
              <Text style={s.videoBtnText}>Add a short video (optional, under 1 min)</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </Sheet>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────

function makeStyles(C: AppColors) {
  return StyleSheet.create(brandStyles({
    endorseCard: { borderWidth: 1, borderColor: C.goldSoft, backgroundColor: C.goldBg, borderRadius: 14, padding: 14, gap: 10 },
    endorseName: { color: C.text, fontSize: 15, fontWeight: '700', flexShrink: 1 },
    endorseMeta: { color: C.text2, fontSize: 12, marginTop: 1 },
    endorseQuote: { color: C.text, fontSize: 15, lineHeight: 22 },
    endorseTie: { color: C.text2, fontSize: 13 },
    videoBtn: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: C.goldSoft, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    videoBtnText: { color: C.goldDim, fontWeight: '700', fontSize: 14 },
    videoAdd: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: C.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },

    reviewRow: { flexDirection: 'row', gap: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border2 },
    reviewName: { color: C.text, fontSize: 15, fontWeight: '700' },
    reviewMeta: { color: C.text2, fontSize: 13 },
    reviewBody: { color: C.text, fontSize: 15, lineHeight: 22 },
    reviewSeed: { color: C.emerald, fontSize: 13, fontWeight: '600' },
    helpfulBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 36, paddingRight: 8 },
    helpfulText: { color: C.text2, fontSize: 13, fontWeight: '600' },

    searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface2, borderRadius: 12, paddingHorizontal: 14, minHeight: 48 },
    searchInput: { flex: 1, color: C.text, fontSize: 15, paddingVertical: 10, outlineStyle: 'none' as any },
    pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface },
    pickName: { color: C.text, fontSize: 15, fontWeight: '700' },
    pickBtn: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: C.gold, justifyContent: 'center' },
    pickBtnText: { color: C.goldDim, fontWeight: '700', fontSize: 14 },
    pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface },
    noteBox: { padding: 12, borderRadius: 12, backgroundColor: C.surface2, gap: 4 },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border2 },
    checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.text3, alignItems: 'center', justifyContent: 'center' },

    label: { color: C.text, fontSize: 14, fontWeight: '700' },
    body: { color: C.text, fontSize: 15, lineHeight: 22 },
    muted: { color: C.text2, fontSize: 13 },
    input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, color: C.text, fontSize: 15 },
  }));
}

// ── Speaker dashboard: pending endorsement requests ─────────────────────

type InboxRow = {
  id: string;
  fundraiser_id: string;
  request_note: string | null;
  created_at: string;
  fundraisers: { title: string; organizations: { org_name: string; logo_url: string | null } | null } | null;
};

/** Pending "please endorse this Seed" requests for a speaker. Renders
 *  nothing when there are none, so it can sit on the dashboard unconditionally. */
export function EndorsementInbox({ speakerId, style }: { speakerId: string; style?: any }) {
  const { colors: C } = useTheme();
  const s = makeStyles(C);
  const [rows, setRows] = useState<InboxRow[]>([]);

  useEffect(() => {
    let alive = true;
    supabase
      .from('seed_endorsements')
      .select('id, fundraiser_id, request_note, created_at, fundraisers(title, organizations(org_name, logo_url))')
      .eq('speaker_id', speakerId)
      .eq('status', 'requested')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => { if (alive) setRows((data || []) as any); });
    return () => { alive = false; };
  }, [speakerId]);

  if (!rows.length) return null;
  return (
    <View style={[{ backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.goldSoft, borderRadius: 16, padding: 16, gap: 12 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="mail-unread-outline" size={18} color={C.goldDim} />
        <Text style={{ color: C.text, fontSize: 16, ...font(800) }}>
          Endorsement request{rows.length === 1 ? '' : 's'} ({rows.length})
        </Text>
      </View>
      {rows.map(r => (
        <TouchableOpacity
          key={r.id}
          style={s.pendingRow}
          onPress={() => router.push({ pathname: '/seed/[id]', params: { id: r.fundraiser_id, endorse: '1' } } as any)}
          accessibilityRole="button"
        >
          <Avatar name={r.fundraisers?.organizations?.org_name} url={r.fundraisers?.organizations?.logo_url} size={40} tone="emerald" square />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.pickName} numberOfLines={1}>{r.fundraisers?.title || 'A Seed'}</Text>
            <Text style={s.muted} numberOfLines={1}>{r.fundraisers?.organizations?.org_name || 'An organization'} · {timeAgo(r.created_at)}</Text>
          </View>
          <Text style={{ color: C.emerald, ...font(700), fontSize: 14 }}>Respond</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
