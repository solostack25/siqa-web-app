// Siqa Admin → Review queue: every queue in one list (claims, Gems, speakers, organizations, 501(c)(3) proof,
// sellers, reports) with a detail panel and the approve / decline actions.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, Linking, Platform } from 'react-native';
import { font, radius, space, type, useDS } from '../../../lib/ds';
import { supabase } from '../../../lib/supabase';
import { Button } from '../../ui';
import { Icon, type SiqaIconName } from '../../Icon';
import { confirmDialog, promptDialog } from '../../../lib/dialogs';
import { showToast } from '../../Toast';
import { openOnSiqa } from '../../dashboard/links';
import { AdminPage, FilterTab, Panel, Pill, since } from './kit';

export type QueueKind = 'claim' | 'gem' | 'application' | 'speaker' | 'tax' | 'org' | 'seller' | 'report';
export const QUEUE_KINDS: { key: QueueKind; label: string; short: string; icon: SiqaIconName }[] = [
  { key: 'claim', label: 'Profile claims', short: 'Claims', icon: 'person-circle-outline' },
  { key: 'gem', label: 'Gems to publish', short: 'Gems', icon: 'diamond-outline' },
  { key: 'application', label: 'Speaker applications', short: 'Applications', icon: 'mic-outline' },
  { key: 'speaker', label: 'Speaker verification', short: 'Speakers', icon: 'checkmark-circle-outline' },
  { key: 'tax', label: '501(c)(3) proof to check', short: '501(c)(3)', icon: 'document-text-outline' },
  { key: 'org', label: 'Organizations', short: 'Organizations', icon: 'business-outline' },
  { key: 'seller', label: 'Marketplace sellers', short: 'Sellers', icon: 'storefront-outline' },
  { key: 'report', label: 'Reports', short: 'Reports', icon: 'flag-outline' },
];
const KIND_LABEL = Object.fromEntries(QUEUE_KINDS.map((k) => [k.key, k.short])) as Record<QueueKind, string>;

type Action = { label: string; variant?: 'primary' | 'secondary' | 'danger'; run: () => Promise<string | null | false> };
type Item = {
  key: string; kind: QueueKind; title: string; sub: string; at: string | null; image?: string | null;
  meta: [string, string][]; body?: string | null; link?: string | null; outLink?: string | null; actions: Action[];
};

const METHOD: Record<string, string> = { official_email: 'Email from official address', social_post: 'Post on official social account', other: 'Other' };
const REPORT_KIND: Record<string, string> = {
  comment: 'Video comment', chai_comment: 'Chai comment', thread: 'Conversation', message: 'Message', gem: 'Gem', profile: 'Profile', video: 'Video',
  speaker: 'Speaker profile', org: 'Organization', org_post: 'Organization post', product: 'Marketplace item', shop: 'Shop', seed: 'Seed', business: 'Business listing',
};
function reportLink(r: any): string | null {
  const id = r.target_id;
  switch (r.target_type) {
    case 'video': return id ? `/watch/${id}` : null;
    case 'gem': return r.video_id ? `/gems?videoId=${r.video_id}` : null;
    case 'comment': return r.video_id ? `/watch/${r.video_id}` : null;
    case 'speaker': return id ? `/speaker/${id}` : null;
    case 'org': return id ? `/org/${id}` : null;
    case 'product': return id ? `/product/${id}` : null;
    case 'shop': return id ? `/shop/${id}` : null;
    case 'seed': return id ? `/seed/${id}` : null;
    case 'business': return id ? `/local/${id}` : null;
    default: return null;
  }
}
const err = (e: { message: string } | null) => (e ? (showToast(e.message), false as const) : null);

async function loadItems(): Promise<Item[]> {
  const [claims, gems, apps, speakers, orgs, tax, sellers, reports] = await Promise.all([
    supabase.from('profile_claims').select('*').eq('status', 'pending').order('created_at').limit(100),
    supabase.from('videos').select('id, title, thumbnail_url, platform, platform_video_id, status, created_at, speakers(display_name)')
      .or('is_published.eq.false,status.eq.pending,status.eq.submitted,status.eq.draft').order('created_at', { ascending: false }).limit(100),
    supabase.from('speaker_applications').select('*').eq('status', 'pending').order('created_at').limit(100),
    supabase.from('speakers').select('id, display_name, slug, created_at, avatar_url').eq('is_claimed', true).or('is_verified.eq.false,is_verified.is.null').order('created_at').limit(100),
    supabase.from('organizations').select('id, org_name, org_kind, city, state, website, slug, is_verified, approval_status, created_at, logo_url')
      .or('is_verified.eq.false,is_verified.is.null,approval_status.neq.approved,approval_status.is.null').order('created_at').limit(100),
    supabase.from('organizations').select('id, org_name, slug, ein, tax_exempt_doc_url, tax_exempt_note, tax_exempt_submitted_at').eq('tax_exempt_status', 'pending').order('tax_exempt_submitted_at').limit(100),
    supabase.from('marketplace_sellers').select('id, shop_name, bio, created_at').eq('approval_status', 'pending').order('created_at').limit(100),
    supabase.from('content_reports').select('id, reason, status, created_at, video_id, target_type, target_id, details').or('status.is.null,status.eq.open,status.eq.pending').order('created_at').limit(100),
  ]);
  const { data: { user } } = await supabase.auth.getUser();
  const me = user?.id ?? null;
  const out: Item[] = [];

  for (const c of (claims.data as any[]) ?? []) {
    out.push({
      key: `claim:${c.id}`, kind: 'claim', title: c.entity_name || `A ${c.entity_type}`, sub: `${c.entity_type === 'speaker' ? 'Speaker' : c.entity_type === 'organization' ? 'Organization' : 'Business'} profile · claimed by ${c.full_name}`,
      at: c.created_at,
      meta: [['Claimed by', `${c.full_name}${c.title ? ` (${c.title})` : ''}`], ['Relationship', c.relationship === 'self' ? 'This is me' : 'Representative'],
        ['Email', c.contact_email], ['Phone', c.contact_phone || '—'], ['Proof', METHOD[c.verification_method || 'other'] ?? 'Other'],
        ['Code to look for', c.verification_code], ['Official link', c.official_link || '—']],
      body: c.notes, outLink: c.official_link,
      link: c.entity_type === 'speaker' ? `/speaker/${c.entity_id}` : c.entity_type === 'organization' ? `/org/${c.entity_id}` : `/local/${c.entity_id}`,
      actions: [
        { label: 'Reject', variant: 'secondary', run: async () => {
          const reason = await promptDialog('Reject this claim?', 'Optional: tell them why (they will see this).');
          if (reason === null) return false;
          return err((await supabase.rpc('reject_profile_claim', { p_claim_id: c.id, p_reason: reason || null })).error) ?? 'Claim rejected';
        } },
        { label: 'Approve claim', run: async () => {
          if (!(await confirmDialog('Approve this claim?', `${c.full_name} takes over ${c.entity_name || 'this profile'}. Only approve once you've seen code ${c.verification_code}.`, 'Approve'))) return false;
          return err((await supabase.rpc('approve_profile_claim', { p_claim_id: c.id })).error) ?? 'Claim approved';
        } },
      ],
    });
  }
  for (const v of (gems.data as any[]) ?? []) {
    const thumb = v.thumbnail_url || (v.platform === 'youtube' && v.platform_video_id ? `https://i.ytimg.com/vi/${v.platform_video_id}/mqdefault.jpg` : null);
    out.push({
      key: `gem:${v.id}`, kind: 'gem', title: v.title || 'Untitled Gem', sub: `${v.speakers?.display_name ?? 'No speaker'} · ${v.platform === 'youtube' ? 'YouTube' : 'Uploaded'}`,
      at: v.created_at, image: thumb,
      meta: [['Speaker', v.speakers?.display_name ?? '—'], ['Source', v.platform === 'youtube' ? 'YouTube import' : 'Uploaded to Siqa'], ['Status', v.status || 'Unpublished']],
      link: `/watch/${v.id}`,
      actions: [
        { label: 'Keep hidden', variant: 'secondary', run: async () => err((await supabase.from('videos').update({ is_published: false, status: 'rejected' }).eq('id', v.id)).error) ?? 'Kept off Gems' },
        { label: 'Publish to Gems', run: async () => err((await supabase.from('videos').update({ is_published: true, status: 'published', published_at: new Date().toISOString() }).eq('id', v.id)).error) ?? 'Published' },
      ],
    });
  }
  for (const a of (apps.data as any[]) ?? []) {
    out.push({
      key: `application:${a.id}`, kind: 'application', title: a.display_name, sub: [a.state, (a.topics ?? []).slice(0, 3).join(', ')].filter(Boolean).join(' · ') || 'Speaker application',
      at: a.created_at,
      meta: [['Full name', a.full_name], ['State', a.state || '—'], ['Topics', (a.topics ?? []).join(', ') || '—'], ['Website', a.website || '—'],
        ['YouTube', a.youtube_url || '—'], ['Instagram', a.instagram_url || '—'], ['Claims profile', a.claimed_speaker_id ? 'Yes, an existing Siqa profile' : 'No, new profile']],
      body: [a.bio, a.why_siqa ? `Why Siqa: ${a.why_siqa}` : null].filter(Boolean).join('\n\n') || null,
      outLink: a.youtube_url || a.website,
      actions: [
        { label: 'Decline', variant: 'secondary', run: async () => {
          if (!(await confirmDialog('Decline this application?', `${a.display_name} won't become a speaker.`, 'Decline'))) return false;
          return err((await supabase.from('speaker_applications').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', a.id)).error) ?? 'Declined';
        } },
        { label: 'Approve speaker', run: async () => {
          if (!(await confirmDialog('Approve this speaker?', `${a.display_name} becomes a verified speaker on Siqa.`, 'Approve'))) return false;
          const fields = { profile_id: a.profile_id, display_name: a.display_name, state: a.state, topics: a.topics, bio: a.bio, is_verified: true, approval_status: 'approved' };
          const r1 = a.claimed_speaker_id ? await supabase.from('speakers').update(fields).eq('id', a.claimed_speaker_id) : await supabase.from('speakers').insert(fields);
          if (r1.error) return err(r1.error);
          await supabase.from('profiles').update({ role: 'speaker' }).eq('id', a.profile_id);
          return err((await supabase.from('speaker_applications').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', a.id)).error) ?? `${a.display_name} is now a speaker`;
        } },
      ],
    });
  }
  for (const s of (speakers.data as any[]) ?? []) {
    out.push({
      key: `speaker:${s.id}`, kind: 'speaker', title: s.display_name, sub: 'Claimed profile, not verified yet', at: s.created_at, image: s.avatar_url,
      meta: [['Profile', `siqa.us/speaker/${s.slug || s.id}`]], link: `/speaker/${s.slug || s.id}`,
      actions: [{ label: 'Verify speaker', run: async () => err((await supabase.from('speakers').update({ is_verified: true }).eq('id', s.id)).error) ?? 'Verified' }],
    });
  }
  for (const o of (orgs.data as any[]) ?? []) {
    out.push({
      key: `org:${o.id}`, kind: 'org', title: o.org_name, sub: `${o.org_kind === 'masjid' ? 'Masjid' : o.org_kind === 'content' ? 'Content publisher' : 'Nonprofit'}${o.city ? ` · ${[o.city, o.state].filter(Boolean).join(', ')}` : ''}`,
      at: o.created_at, image: o.logo_url,
      meta: [['Verified', o.is_verified ? 'Yes' : 'Not yet'], ['Directory', o.approval_status === 'approved' ? 'Listed' : 'Not listed'], ['Website', o.website || '—'], ['Link', `siqa.us/org/${o.slug || o.id}`]],
      link: `/org/${o.slug || o.id}`, outLink: o.website,
      actions: [
        { label: 'Reject', variant: 'secondary', run: async () => {
          if (!(await confirmDialog('Reject this organization?', `${o.org_name} stays off the directory.`, 'Reject'))) return false;
          return err((await supabase.from('organizations').update({ approval_status: 'rejected' }).eq('id', o.id)).error) ?? 'Rejected';
        } },
        { label: o.is_verified ? 'Approve & list' : 'Verify & list', run: async () => err((await supabase.from('organizations').update({ is_verified: true, approval_status: 'approved' }).eq('id', o.id)).error) ?? `${o.org_name} is listed` },
      ],
    });
  }
  for (const o of (tax.data as any[]) ?? []) {
    out.push({
      key: `tax:${o.id}`, kind: 'tax', title: o.org_name, sub: 'IRS determination letter uploaded', at: o.tax_exempt_submitted_at,
      image: o.tax_exempt_doc_url && /\.(jpe?g|png|webp)(\?|$)/i.test(o.tax_exempt_doc_url) ? o.tax_exempt_doc_url : null,
      meta: [['EIN', o.ein || 'Not on profile'], ['Document', o.tax_exempt_doc_url ? 'Open below' : 'Missing'], ['Donations', 'Off until confirmed']],
      body: o.tax_exempt_note, link: `/org/${o.slug || o.id}`, outLink: o.tax_exempt_doc_url,
      actions: [
        { label: 'Not confirmed', variant: 'secondary', run: async () => err((await supabase.from('organizations').update({ tax_exempt_status: 'rejected' }).eq('id', o.id)).error) ?? 'Marked not confirmed' },
        { label: 'Confirm 501(c)(3)', run: async () => err((await supabase.from('organizations').update({ tax_exempt_status: 'verified', tax_exempt_verified_at: new Date().toISOString(), tax_exempt_verified_by: me }).eq('id', o.id)).error) ?? 'Confirmed. Donations are on.' },
      ],
    });
  }
  for (const s of (sellers.data as any[]) ?? []) {
    out.push({
      key: `seller:${s.id}`, kind: 'seller', title: s.shop_name, sub: 'New Marketplace shop', at: s.created_at, meta: [], body: s.bio, link: `/shop/${s.id}`,
      actions: [
        { label: 'Reject', variant: 'secondary', run: async () => err((await supabase.from('marketplace_sellers').update({ approval_status: 'rejected', approved_at: new Date().toISOString(), approved_by: me }).eq('id', s.id)).error) ?? 'Rejected' },
        { label: 'Approve shop', run: async () => err((await supabase.from('marketplace_sellers').update({ approval_status: 'approved', approved_at: new Date().toISOString(), approved_by: me }).eq('id', s.id)).error) ?? 'Shop approved' },
      ],
    });
  }
  for (const r of (reports.data as any[]) ?? []) {
    const isComment = r.target_type === 'comment' || r.target_type === 'chai_comment';
    const acts: Action[] = [{ label: 'Close report', variant: 'secondary', run: async () => err((await supabase.from('content_reports').update({ status: 'closed' }).eq('id', r.id)).error) ?? 'Report closed' }];
    if (isComment && r.target_id) acts.push({ label: 'Remove comment', variant: 'danger', run: async () => {
      if (!(await confirmDialog('Remove this comment?', 'It will be deleted for everyone and the report closed.', 'Remove'))) return false;
      const del = await supabase.from(r.target_type === 'chai_comment' ? 'chai_comments' : 'comments').delete().eq('id', r.target_id);
      if (del.error) return err(del.error);
      await supabase.from('content_reports').update({ status: 'closed' }).eq('id', r.id);
      return 'Removed';
    } });
    out.push({
      key: `report:${r.id}`, kind: 'report', title: r.reason || 'Report', sub: REPORT_KIND[r.target_type] ?? 'Content', at: r.created_at,
      meta: [['What', REPORT_KIND[r.target_type] ?? r.target_type ?? '—']], body: r.details, link: reportLink(r), actions: acts,
    });
  }
  // Oldest first, so nothing waits forever.
  return out.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
}

export function AdminQueue({ wide, initial }: { wide: boolean; initial?: string }) {
  const { c, shadow } = useDS();
  const [items, setItems] = useState<Item[] | null>(null);
  const [tab, setTab] = useState<'all' | QueueKind>((QUEUE_KINDS.some((k) => k.key === initial) ? initial : 'all') as any);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const reload = useCallback(async () => setItems(await loadItems()), []);
  useEffect(() => { reload(); }, [reload]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: items?.length ?? 0 };
    for (const k of QUEUE_KINDS) m[k.key] = (items ?? []).filter((i) => i.kind === k.key).length;
    return m;
  }, [items]);
  const shown = useMemo(() => (items ?? []).filter((i) => tab === 'all' || i.kind === tab), [items, tab]);
  const cur = shown.find((i) => i.key === sel) ?? (wide ? shown[0] : null) ?? null;

  const run = async (a: Action) => {
    if (!cur) return;
    setBusy(a.label);
    try {
      const msg = await a.run();
      if (msg === false) return;
      if (msg) showToast(msg);
      const idx = shown.findIndex((i) => i.key === cur.key);
      const next = shown[idx + 1] ?? shown[idx - 1] ?? null;
      setItems((list) => (list ?? []).filter((i) => i.key !== cur.key));
      setSel(next?.key ?? null);
      if (!wide) setShowDetail(false);
    } finally { setBusy(null); }
  };
  const openOut = (u: string) => {
    const url = /^https?:\/\//i.test(u) ? u : `https://${u}`;
    if (Platform.OS === 'web') window.open(url, '_blank', 'noopener'); else Linking.openURL(url);
  };

  const list = (
    <Panel flush style={{ flex: 1.25, alignSelf: 'stretch', minWidth: 0 }}>
      {items === null ? <Text style={[type.callout, { color: c.ink2, padding: 20 }]}>Loading…</Text> : null}
      {items && shown.length === 0 ? (
        <View style={{ alignItems: 'center', gap: 6, paddingVertical: 56, paddingHorizontal: 20 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.seedTint, alignItems: 'center', justifyContent: 'center' }}><Icon name="checkmark" size={22} color={c.seed} /></View>
          <Text style={[type.headline, { color: c.ink }]}>All clear</Text>
          <Text style={[type.subhead, font(400), { color: c.ink2 }]}>Nothing waiting here.</Text>
        </View>
      ) : null}
      {shown.length ? (
        <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line }} importantForAccessibility="no-hide-descendants">
          <Text style={[type.micro, { color: c.ink2, flex: 1 }]}>Item</Text>
          {wide ? <Text style={[type.micro, { color: c.ink2, width: 130 }]}>Type</Text> : null}
          <Text style={[type.micro, { color: c.ink2, width: 64, textAlign: 'right' }]}>Waiting</Text>
        </View>
      ) : null}
      {shown.slice(0, 300).map((i) => {
        const on = cur?.key === i.key;
        return (
          <Pressable key={i.key} onPress={() => { setSel(i.key); setShowDetail(true); }} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line,
              backgroundColor: on ? c.goldTint : pressed ? c.bgSunk : 'transparent' })}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={[type.subhead, font(600), { color: c.ink }]} numberOfLines={1}>{i.title}</Text>
              <Text style={[type.micro, font(400), { color: c.ink2 }]} numberOfLines={1}>{i.sub}</Text>
            </View>
            {wide ? <View style={{ width: 130 }}><Pill label={KIND_LABEL[i.kind]} /></View> : null}
            <Text style={[type.caption, font(400), { color: c.ink2, width: 64, textAlign: 'right' }]}>{since(i.at)}</Text>
          </Pressable>
        );
      })}
      {shown.length > 300 ? <Text style={[type.caption, { color: c.ink2, padding: 16 }]}>Showing the oldest 300.</Text> : null}
    </Panel>
  );

  const detail = cur ? (
    <View style={[{ flex: 1, alignSelf: 'flex-start', minWidth: 0, width: wide ? undefined : '100%', backgroundColor: c.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }, shadow('card')]}>
      {!wide ? (
        <Pressable onPress={() => setShowDetail(false)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 16, paddingBottom: 0 }}>
          <Icon name="chevron-back" size={16} color={c.ink2} /><Text style={[type.subhead, font(600), { color: c.ink2 }]}>Back to the list</Text>
        </Pressable>
      ) : null}
      {cur.image ? <Image source={{ uri: cur.image }} style={{ width: '100%', aspectRatio: cur.kind === 'gem' ? 16 / 9 : 2, backgroundColor: c.bgSunk }} resizeMode={cur.kind === 'tax' ? 'contain' : 'cover'} /> : null}
      <View style={{ padding: 20, gap: 8, borderBottomWidth: 1, borderBottomColor: c.line }}>
        <Pill label={KIND_LABEL[cur.kind]} tone="gold" />
        <Text style={[{ fontSize: 22, lineHeight: 28 }, font(800, 'display'), { color: c.ink }]}>{cur.title}</Text>
        <Text style={[type.subhead, font(400), { color: c.ink2 }]}>{cur.sub} · waiting {since(cur.at)}</Text>
      </View>
      {cur.meta.length ? (
        <View style={{ paddingHorizontal: 20, paddingVertical: 6 }}>
          {cur.meta.map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line }}>
              <Text style={[type.caption, font(400), { color: c.ink2, width: 130 }]}>{k}</Text>
              <Text style={[type.subhead, font(500), { color: c.ink, flex: 1 }]} selectable>{v}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {cur.body ? <Text style={[type.subhead, font(400), { color: c.ink, paddingHorizontal: 20, paddingTop: 12, lineHeight: 21 }]}>{cur.body}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 16, paddingHorizontal: 20, paddingTop: 14, flexWrap: 'wrap' }}>
        {cur.link ? <Pressable onPress={() => openOnSiqa(cur.link!)} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[type.caption, font(600), { color: c.ink, textDecorationLine: 'underline' }]}>Open on Siqa</Text><Icon name="open-outline" size={13} color={c.ink} />
        </Pressable> : null}
        {cur.outLink ? <Pressable onPress={() => openOut(cur.outLink!)} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[type.caption, font(600), { color: c.ink, textDecorationLine: 'underline' }]}>{cur.kind === 'tax' ? 'Open the document' : 'Open their link'}</Text><Icon name="open-outline" size={13} color={c.ink} />
        </Pressable> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, padding: 20, flexWrap: 'wrap' }}>
        {cur.actions.map((a, k) => (
          <Button key={a.label} label={a.label} size="md" variant={a.variant ?? 'primary'} grow={k === cur.actions.length - 1}
            loading={busy === a.label} disabled={!!busy && busy !== a.label} onPress={() => run(a)} />
        ))}
      </View>
    </View>
  ) : wide ? (
    <View style={{ flex: 1, padding: 24, borderRadius: radius.xl, borderWidth: 1, borderStyle: 'dashed', borderColor: c.line, alignItems: 'center' }}>
      <Text style={[type.subhead, { color: c.ink2 }]}>Pick an item to review it.</Text>
    </View>
  ) : null;

  return (
    <AdminPage wide={wide} title="Review queue" sub="Everything waiting on a Siqa admin, oldest first."
      right={<Button label="Refresh" icon="refresh" size="md" variant="secondary" onPress={reload} />}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }} accessibilityRole="tablist">
        <FilterTab label="All" count={counts.all} on={tab === 'all'} onPress={() => { setTab('all'); setSel(null); }} />
        {QUEUE_KINDS.map((k) => <FilterTab key={k.key} label={k.short} count={counts[k.key]} on={tab === k.key} onPress={() => { setTab(k.key); setSel(null); }} />)}
      </ScrollView>
      {wide ? (
        <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>{list}{detail}</View>
      ) : showDetail && cur ? detail : list}
    </AdminPage>
  );
}
