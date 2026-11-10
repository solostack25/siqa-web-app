import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { font, radius, size as SIZE, type, useDS } from '../lib/ds';
import { Icon } from './Icon';
import { Avatar, Card, CardTitle } from './SeedSocial';
import { Button, TextField } from './ui';
import { showToast } from './Toast';

// "Our scholars" for content organizations (speaker_affiliations).
// Everyone sees confirmed scholars. The org's managers also see pending
// invites and can add / remove; Siqa admins can confirm on behalf of
// unclaimed speaker profiles.

export type Affiliation = {
  id: string;
  speaker_id: string | null;
  invite_name: string | null;
  title: string | null;
  status: 'pending' | 'confirmed' | 'declined' | 'ended';
  sort_order: number;
  speakers: { id: string; display_name: string; avatar_url: string | null; is_claimed: boolean | null } | null;
};

export const AFFILIATION_SELECT = 'id,speaker_id,invite_name,title,status,sort_order,speakers(id,display_name,avatar_url,is_claimed)';

type Hit = { id: string; display_name: string; avatar_url: string | null; is_claimed: boolean | null };

export function OrgScholars({ orgId, canEdit, isAdmin, limit, columns, onSeeAll, onChange }: {
  orgId: string;
  canEdit: boolean;
  isAdmin: boolean;
  limit?: number;
  columns: number;
  onSeeAll?: () => void;
  onChange?: (confirmed: Affiliation[]) => void;
}) {
  const { c, shadow } = useDS();
  const [rows, setRows] = useState<Affiliation[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('speaker_affiliations')
      .select(AFFILIATION_SELECT)
      .eq('org_id', orgId)
      .in('status', canEdit ? ['pending', 'confirmed'] : ['confirmed'])
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    const list = (data as any as Affiliation[]) ?? [];
    setRows(list);
    setLoading(false);
    onChange?.(list.filter(r => r.status === 'confirmed'));
  }, [orgId, canEdit]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const q = query.trim();
    if (!adding || q.length < 2) { setHits([]); return; }
    let live = true;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('speakers')
        .select('id,display_name,avatar_url,is_claimed')
        .eq('approval_status', 'approved')
        .ilike('display_name', `%${q.replace(/[%_]/g, '')}%`)
        .limit(6);
      if (live) setHits((data as Hit[]) ?? []);
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [query, adding]);

  async function add(h: Hit) {
    setBusy(h.id);
    const { error } = await supabase.from('speaker_affiliations').insert({
      org_id: orgId, speaker_id: h.id, title: title.trim() || null, sort_order: rows.length,
    });
    setBusy(null);
    if (error) { showToast(/duplicate/i.test(error.message) ? 'Already added' : error.message); return; }
    setQuery(''); setTitle(''); setHits([]); setAdding(false);
    showToast(h.is_claimed === false ? 'Added. Siqa will verify them.' : 'Added. They’ll be asked to confirm.');
    load();
  }

  async function remove(a: Affiliation) {
    setBusy(a.id);
    const { error } = await supabase.from('speaker_affiliations').delete().eq('id', a.id);
    setBusy(null);
    if (error) { showToast(error.message); return; }
    load();
  }

  async function confirmAsAdmin(a: Affiliation) {
    setBusy(a.id);
    const { error } = await supabase.from('speaker_affiliations').update({ status: 'confirmed' }).eq('id', a.id);
    setBusy(null);
    if (error) { showToast(error.message); return; }
    load();
  }

  const confirmed = rows.filter(r => r.status === 'confirmed');
  const pending = rows.filter(r => r.status === 'pending');
  const shown = limit ? confirmed.slice(0, limit) : confirmed;
  const cardWidth = columns >= 3 ? '23%' : columns === 2 ? '31%' : '47%';

  return (
    <Card>
      <CardTitle right={limit && confirmed.length > limit && onSeeAll ? (
        <Pressable onPress={onSeeAll} hitSlop={8} accessibilityRole="link">
          <Text style={[type.subhead, font(600), { color: c.ink, textDecorationLine: 'underline' }]}>See all {confirmed.length}</Text>
        </Pressable>
      ) : canEdit && !limit ? (
        <Button size="sm" variant="soft" icon="add" label="Add scholar" onPress={() => setAdding(v => !v)} />
      ) : undefined}>Our scholars</CardTitle>

      {loading ? <ActivityIndicator color={c.ink2} /> : null}

      {!loading && confirmed.length === 0 ? (
        <Text style={[type.callout, { color: c.ink2 }]}>
          {canEdit ? 'Scholars you add show here once they confirm.' : 'Scholars will show here soon.'}
        </Text>
      ) : null}

      {shown.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {shown.map(a => (
            <Pressable
              key={a.id}
              onPress={a.speaker_id ? () => router.push(`/speaker/${a.speaker_id}` as any) : undefined}
              accessibilityRole={a.speaker_id ? 'link' : undefined}
              style={({ pressed }) => [{
                width: cardWidth as any, flexGrow: 1, maxWidth: 220, minWidth: 130,
                alignItems: 'center', gap: 8, paddingVertical: 18, paddingHorizontal: 10,
                borderRadius: radius.lg, backgroundColor: c.bgSunk, opacity: pressed ? 0.85 : 1,
              }]}
            >
              <Avatar name={a.speakers?.display_name ?? a.invite_name} url={a.speakers?.avatar_url} size={72} tone="neutral" />
              <Text style={[type.callout, font(700), { color: c.ink, textAlign: 'center' }]} numberOfLines={2}>
                {a.speakers?.display_name ?? a.invite_name}
              </Text>
              {a.title ? <Text style={[type.caption, { color: c.ink2, textAlign: 'center' }]} numberOfLines={2}>{a.title}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {canEdit && !limit && adding ? (
        <View style={{ gap: 10, padding: 14, borderRadius: radius.lg, backgroundColor: c.bgSunk }}>
          <TextField label="Search speakers on Siqa" placeholder="Type a name" value={query} onChangeText={setQuery} autoCapitalize="words" />
          <TextField label="Role (optional)" placeholder="e.g. Senior Fellow" value={title} onChangeText={setTitle} maxLength={80} />
          {hits.map(h => {
            const already = rows.some(r => r.speaker_id === h.id);
            return (
              <View key={h.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md, backgroundColor: c.surface }, shadow('hairline')]}>
                <Avatar name={h.display_name} url={h.avatar_url} size={40} tone="neutral" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.body, font(600), { color: c.ink }]} numberOfLines={1}>{h.display_name}</Text>
                  <Text style={[type.caption, { color: c.ink2 }]}>{h.is_claimed === false ? 'Unclaimed profile' : 'On Siqa'}</Text>
                </View>
                <Button size="sm" label={already ? 'Added' : 'Add'} disabled={already} loading={busy === h.id} onPress={() => add(h)} />
              </View>
            );
          })}
          {query.trim().length >= 2 && !hits.length ? (
            <Text style={[type.caption, font(400), { color: c.ink2 }]}>No speakers match. Email support@siqa.us and we’ll set up their profile.</Text>
          ) : null}
        </View>
      ) : null}

      {canEdit && !limit && pending.length ? (
        <View style={{ gap: 4 }}>
          <Text style={[type.micro, { color: c.ink2, letterSpacing: 0.4 }]}>WAITING TO CONFIRM · ONLY YOU SEE THIS</Text>
          {pending.map(a => {
            const unclaimed = !a.speaker_id || a.speakers?.is_claimed === false;
            return (
              <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line, flexWrap: 'wrap' }}>
                <Avatar name={a.speakers?.display_name ?? a.invite_name} url={a.speakers?.avatar_url} size={40} tone="neutral" />
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text style={[type.body, font(600), { color: c.ink }]} numberOfLines={1}>{a.speakers?.display_name ?? a.invite_name}</Text>
                  <Text style={[type.micro, { color: unclaimed ? c.seed : c.goldInk }]}>
                    {!a.speaker_id ? 'Not on Siqa yet · Siqa will reach out' : unclaimed ? 'Unclaimed profile · Siqa will verify' : 'Waiting for them to confirm'}
                  </Text>
                </View>
                {isAdmin && a.speaker_id ? (
                  <Button size="sm" variant="secondary" label="Confirm (admin)" loading={busy === a.id} onPress={() => confirmAsAdmin(a)} />
                ) : null}
                <Pressable onPress={() => remove(a)} style={{ width: SIZE.controlMd, height: SIZE.controlMd, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={`Remove ${a.speakers?.display_name ?? a.invite_name}`}>
                  <Icon name="close" size={18} color={c.ink2} />
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}

      {canEdit && !limit && confirmed.length ? (
        <View style={{ gap: 4 }}>
          {confirmed.map(a => (
            <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text style={[type.caption, { color: c.ink2, flex: 1 }]} numberOfLines={1}>{a.speakers?.display_name ?? a.invite_name}</Text>
              <Pressable onPress={() => remove(a)} hitSlop={8} accessibilityRole="button">
                <Text style={[type.caption, font(600), { color: c.danger }]}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
