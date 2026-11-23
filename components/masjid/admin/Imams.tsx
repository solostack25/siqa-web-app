// "Live on Siqa" on the masjid's Schedule page: the masjid's imams and its live programs.
// Imams added here can send their lives to this masjid's TVs from Go live, without being on the team.
// Anyone on the team can start a program's live for its imam (the live is posted as the imam's).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { font, radius, space, type, useDS } from '../../../lib/ds';
import { Button, IconButton, TextField } from '../../ui';
import { Card, CardTitle } from './kit';
import { supabase } from '../../../lib/supabase';
import { openStudio } from '../../../lib/studioLink';
import { EVENT_KIND_LABEL, dayKeyIn, fmtTime, occurrences, type MasjidEvent } from '../../../lib/masjid';
import { confirmDialog } from '../../../lib/dialogs';
import { showToast } from '../../Toast';

export type Imam = { id: string; display_name: string; avatar_url: string | null };

export function useImams(orgId: string) {
  const [imams, setImams] = useState<Imam[] | null>(null);
  const reload = useCallback(async () => {
    const { data } = await supabase.rpc('masjid_imam_list', { p_org: orgId });
    setImams((data as Imam[]) || []);
  }, [orgId]);
  useEffect(() => { reload(); }, [reload]);
  return { imams, reload };
}

export function LiveOnSiqa({ orgId, events, tz, imams, reloadImams, canManage, onEdit, onAddProgram }: {
  orgId: string; events: MasjidEvent[]; tz: string; imams: Imam[] | null; reloadImams: () => void; canManage: boolean;
  onEdit: (e: MasjidEvent) => void; onAddProgram: () => void;
}) {
  const { c } = useDS();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Imam[]>([]);

  useEffect(() => {
    if (!adding || q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('masjid_imam_candidates', { p_org: orgId, p_q: q.trim() });
      setFound((data as Imam[]) || []);
    }, 250);
    return () => clearTimeout(t);
  }, [q, adding, orgId]);

  const add = async (s: Imam) => {
    const { error } = await supabase.rpc('masjid_imam_add', { p_org: orgId, p_speaker: s.id });
    if (error) { showToast(error.message); return; }
    setQ(''); setFound([]); setAdding(false); reloadImams();
    showToast(`${s.display_name} can now send lives to your TVs.`);
  };
  const remove = async (s: Imam) => {
    if (!(await confirmDialog(`Remove ${s.display_name}?`, 'Their lives stop showing on your TVs, and they come off any program they were on.', 'Remove'))) return;
    const { error } = await supabase.rpc('masjid_imam_remove', { p_org: orgId, p_speaker: s.id });
    if (error) { showToast(error.message); return; }
    reloadImams();
  };

  // Live programs, soonest first (next 14 days).
  const programs = useMemo(() => {
    const now = Date.now();
    const occ = occurrences(events.filter((e) => e.live_on_siqa), dayKeyIn(new Date(Date.now() - 86400000), tz), 15, tz)
      .filter((o) => o.end.getTime() + 30 * 60000 > now);
    const seen = new Set<string>();
    return occ.sort((a, b) => a.start.getTime() - b.start.getTime()).filter((o) => (seen.has(o.event.id) ? false : (seen.add(o.event.id), true)));
  }, [events, tz]);
  const nameOf = (id?: string | null) => imams?.find((i) => i.id === id)?.display_name ?? null;

  return (
    <Card>
      <CardTitle>Live on Siqa</CardTitle>
      <Text style={[type.caption, { color: c.ink2 }]}>When one of these goes live, your TVs switch to it and switch back to salah times when it ends.</Text>

      <Text style={[type.caption, font(700), { color: c.ink2, marginTop: space[2] }]}>OUR IMAMS</Text>
      {imams === null ? <Text style={[type.caption, { color: c.ink3 }]}>Loading…</Text> : null}
      {imams?.length === 0 ? <Text style={[type.body, { color: c.ink2 }]}>No imams yet. Add the imams and speakers who give your khutbahs and halaqas.</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {(imams || []).map((s) => (
          <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingLeft: 6, paddingRight: canManage ? 2 : 12, height: 44, borderRadius: radius.pill, backgroundColor: c.surfaceSoft }}>
            {s.avatar_url ? <Image source={{ uri: s.avatar_url }} style={{ width: 32, height: 32, borderRadius: 16 }} /> : <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.surfaceStrong }} />}
            <Text style={[type.subhead, font(600), { color: c.ink }]}>{s.display_name}</Text>
            {canManage ? <IconButton icon="close" label={`Remove ${s.display_name}`} variant="plain" size="sm" onPress={() => remove(s)} /> : null}
          </View>
        ))}
      </View>
      {canManage ? (adding ? (
        <View style={{ gap: space[2] }}>
          <TextField label="Find the imam on Siqa" value={q} onChangeText={setQ} placeholder="Type their name" autoFocus />
          {found.map((s) => (
            <Pressable key={s.id} onPress={() => add(s)} accessibilityRole="button" accessibilityLabel={`Add ${s.display_name}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52, paddingHorizontal: space[3], borderRadius: radius.lg, backgroundColor: c.surfaceSoft }}>
              {s.avatar_url ? <Image source={{ uri: s.avatar_url }} style={{ width: 36, height: 36, borderRadius: 18 }} /> : <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceStrong }} />}
              <Text style={[type.body, font(600), { color: c.ink, flex: 1 }]}>{s.display_name}</Text>
              <Text style={[type.subhead, font(700), { color: c.ink }]}>Add</Text>
            </Pressable>
          ))}
          {q.trim().length >= 2 && found.length === 0 ? <Text style={[type.caption, { color: c.ink2 }]}>No speaker by that name. They need a speaker profile on Siqa first (siqa.us → Become a speaker).</Text> : null}
          <Button label="Done" variant="soft" size="md" onPress={() => { setAdding(false); setQ(''); }} />
        </View>
      ) : <Button label="Add an imam" icon="person-add-outline" variant="soft" size="md" onPress={() => setAdding(true)} style={{ alignSelf: 'flex-start' }} />) : null}

      <Text style={[type.caption, font(700), { color: c.ink2, marginTop: space[3] }]}>LIVE PROGRAMS</Text>
      {programs.length === 0 ? (
        <Text style={[type.body, { color: c.ink2 }]}>None yet. Add one to your schedule (like Jumu'ah khutbah, Fridays) and turn on Live on Siqa.</Text>
      ) : programs.map((o) => {
        const imam = nameOf(o.event.speaker_id);
        const soon = o.start.getTime() - Date.now() < 30 * 60000;
        return (
          <View key={o.event.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.lg, backgroundColor: soon ? c.goldTint : c.surfaceSoft }}>
            <Pressable onPress={() => onEdit(o.event)} accessibilityRole="button" style={{ flex: 1, minWidth: 0 }}>
              <Text style={[type.body, font(700), { color: c.ink }]} numberOfLines={1}>{o.event.title}</Text>
              <Text style={[type.caption, { color: c.ink2 }]} numberOfLines={1}>
                {EVENT_KIND_LABEL[o.event.kind]} · {o.start.toLocaleDateString(undefined, { weekday: 'short', timeZone: tz })} {fmtTime(o.start, tz, false)}{imam ? ` · ${imam}` : ' · No imam set'}
              </Text>
            </Pressable>
            <Button label={imam ? 'Go live for them' : 'Go live'} icon="radio-outline" size="md" onPress={() => openStudio(`/live?program=${o.event.id}`)} />
          </View>
        );
      })}
      <Button label="Add a live program" icon="add" variant="ghost" size="md" onPress={onAddProgram} style={{ alignSelf: 'flex-start' }} />
    </Card>
  );
}
