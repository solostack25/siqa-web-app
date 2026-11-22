// Event editor → Program: the run of show. Each segment has a speaker, time, script for the podium, and slides.
import { useState } from 'react';
import { View, Text, Pressable, Image, Platform, ScrollView } from 'react-native';
import { font, radius, space, type, useDS } from '../../../lib/ds';
import { BottomSheet, Button, IconButton, Stepper, TextField } from '../../ui';
import { Card, CardTitle, Choice, Tag } from '../../masjid/admin/kit';
import { Icon } from '../../Icon';
import { supabase } from '../../../lib/supabase';
import { showToast } from '../../Toast';
import { confirmDialog } from '../../../lib/dialogs';
import { SEGMENT_KINDS, pdfToImages, pickFiles, timeText, uploadEventFile, type Segment, type SegmentKind } from '../../../lib/events';
import { ToggleRow } from '../fields';
import type { EventData } from './EventsSection';

type Draft = Partial<Segment> & { title: string; kind: SegmentKind; minutes: number; slides: string[] };
const KIND_ICON: Record<SegmentKind, any> = {
  welcome: 'hand-right-outline', recitation: 'book-outline', talk: 'mic-outline', video: 'film-outline', appeal: 'heart-outline', meal: 'restaurant-outline', other: 'ellipse-outline',
};

export function ProgramTab({ data, reload, wide }: { data: EventData; reload: () => void; wide: boolean }) {
  const { c } = useDS();
  const ev = data.event;
  const segs = data.segments;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState<string | null>(null);

  const total = segs.reduce((a, s) => a + s.minutes, 0);
  let clock = ev.starts_at ? new Date(ev.starts_at).getTime() : null;

  const save = async () => {
    if (!draft || !draft.title.trim()) { showToast('Name this part of the program.'); return; }
    setBusy(true);
    const row = {
      event_id: ev.id, title: draft.title.trim(), speaker: draft.speaker?.trim() || null, kind: draft.kind, minutes: draft.minutes,
      remote: draft.remote ?? false, script: draft.script?.trim() || null, slides: draft.slides, video_url: draft.video_url?.trim() || null,
      sort: draft.sort ?? ((segs[segs.length - 1]?.sort ?? 0) + 1),
    };
    const res = draft.id ? await supabase.from('event_segments').update(row).eq('id', draft.id) : await supabase.from('event_segments').insert(row);
    setBusy(false);
    if (res.error) { showToast(res.error.message); return; }
    setDraft(null); reload();
  };
  const remove = async () => {
    if (!draft?.id || !(await confirmDialog('Remove this from the program?', draft.title, 'Remove'))) return;
    await supabase.from('event_segments').delete().eq('id', draft.id);
    setDraft(null); reload();
  };
  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= segs.length) return;
    const order = segs.map((s) => s.id);
    [order[i], order[j]] = [order[j], order[i]];
    await Promise.all(order.map((id, k) => supabase.from('event_segments').update({ sort: k + 1 }).eq('id', id)));
    reload();
  };

  const addSlides = async () => {
    if (!draft) return;
    const files = await pickFiles('application/pdf,image/*', true);
    if (!files.length) return;
    const urls: string[] = [];
    try {
      for (const f of files) {
        if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
          const pages = await pdfToImages(f, (n, of) => setUpload(`Reading page ${n} of ${of}…`));
          for (let i = 0; i < pages.length; i++) {
            setUpload(`Uploading slide ${i + 1} of ${pages.length}…`);
            urls.push(await uploadEventFile(ev.id, pages[i], 'jpg'));
          }
        } else {
          setUpload(`Uploading ${f.name}…`);
          urls.push(await uploadEventFile(ev.id, f, (f.name.split('.').pop() || 'jpg').toLowerCase()));
        }
      }
      setDraft((d) => (d ? { ...d, slides: [...d.slides, ...urls] } : d));
      showToast(`${urls.length} slide${urls.length === 1 ? '' : 's'} added. Save to keep them.`);
    } catch (e: any) {
      showToast(e?.message ?? 'Upload failed');
    }
    setUpload(null);
  };

  return (
    <View style={{ gap: space[4] }}>
      <Card>
        <CardTitle action="Add to program" onAction={() => setDraft({ title: '', kind: 'talk', minutes: 10, slides: [] })}>Program</CardTitle>
        <Text style={[type.caption, font(400), { color: c.ink2 }]}>
          {segs.length} parts · {Math.floor(total / 60) ? `${Math.floor(total / 60)} h ` : ''}{total % 60} min{ev.starts_at ? ` · ends around ${timeText(new Date(new Date(ev.starts_at).getTime() + total * 60000).toISOString())}` : ''}.
          The MC presses Next to move through it; the podium timer and big screen follow along.
        </Text>
        {segs.map((s, i) => {
          const at = clock ? timeText(new Date(clock).toISOString()) : '';
          if (clock) clock += s.minutes * 60000;
          return (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], borderTopWidth: 1, borderTopColor: c.line }}>
              {wide ? <Text style={[type.caption, { color: c.ink3, width: 64 }]}>{at}</Text> : null}
              <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: s.kind === 'appeal' ? c.goldTint : c.surfaceSoft }}>
                <Icon name={KIND_ICON[s.kind]} size={18} color={s.kind === 'appeal' ? c.goldInk : c.ink2} />
              </View>
              <Pressable style={{ flex: 1, gap: 2 }} onPress={() => setDraft({ ...s, slides: s.slides ?? [] })} accessibilityRole="button" accessibilityLabel={`Edit ${s.title}`}>
                <Text style={[type.body, font(700), { color: c.ink }]}>{s.title}</Text>
                <Text style={[type.caption, font(400), { color: c.ink2 }]} numberOfLines={1}>
                  {[!wide && at, s.speaker, `${s.minutes} min`, s.slides?.length ? `${s.slides.length} slides` : null, s.script ? 'Script' : null, s.remote ? 'Remote' : null].filter(Boolean).join(' · ')}
                </Text>
              </Pressable>
              <IconButton icon="chevron-up" label="Move up" size="sm" onPress={() => move(i, -1)} disabled={i === 0} />
              <IconButton icon="chevron-down" label="Move down" size="sm" onPress={() => move(i, 1)} disabled={i === segs.length - 1} />
            </View>
          );
        })}
      </Card>

      <BottomSheet visible={!!draft} onClose={() => !upload && setDraft(null)} title={draft?.id ? 'Edit program item' : 'Add to program'}
        footer={<View style={{ flexDirection: 'row', gap: space[2] }}>{draft?.id ? <Button label="Remove" variant="danger" onPress={remove} /> : null}<Button label="Save" onPress={save} loading={busy} disabled={!!upload} grow /></View>}>
        {draft ? (
          <View style={{ gap: space[4] }}>
            <Choice label="Kind" value={draft.kind} onChange={(v) => setDraft({ ...draft, kind: v })} options={SEGMENT_KINDS} />
            <TextField label="Title" value={draft.title} onChangeText={(v) => setDraft({ ...draft, title: v })} placeholder="Keynote" maxLength={80} />
            <TextField label="Speaker (optional)" value={draft.speaker ?? ''} onChangeText={(v) => setDraft({ ...draft, speaker: v })} placeholder="Sh. Omar Suleiman" />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
              <View style={{ flex: 1 }}>
                <Text style={[type.body, font(600), { color: c.ink }]}>Minutes</Text>
                <Text style={[type.caption, font(400), { color: c.ink2 }]}>The podium timer counts this down.</Text>
              </View>
              <Stepper label="Minutes" value={draft.minutes} onChange={(v) => setDraft({ ...draft, minutes: v })} min={1} max={240} />
            </View>
            <ToggleRow label="Joining remotely" sub="The speaker joins by video; the big screen shows them full size." value={draft.remote ?? false} onChange={(v) => setDraft({ ...draft, remote: v })} last />
            {draft.kind === 'video' ? (
              <TextField label="Video link" value={draft.video_url ?? ''} onChangeText={(v) => setDraft({ ...draft, video_url: v })} autoCapitalize="none"
                placeholder="YouTube link or an .mp4 link" help="Plays on the big screen when this part starts." />
            ) : null}
            <TextField label="Script for the podium (optional)" value={draft.script ?? ''} onChangeText={(v) => setDraft({ ...draft, script: v })} multiline style={{ minHeight: 140 }}
              placeholder={draft.kind === 'appeal' ? 'Who will be the first to give $100,000 tonight…' : 'Notes or the full speech. Shows large on the podium tablet, like a teleprompter.'} />

            <View style={{ gap: space[2] }}>
              <Text style={[type.caption, font(600), { color: c.ink2 }]}>Slides</Text>
              {draft.slides.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
                  {draft.slides.map((u, k) => (
                    <View key={u + k} style={{ gap: 4, alignItems: 'center' }}>
                      <Image source={{ uri: u }} style={{ width: 128, height: 72, borderRadius: radius.sm, backgroundColor: c.bgSunk }} resizeMode="contain" />
                      <View style={{ flexDirection: 'row', gap: 2 }}>
                        <IconButton icon="chevron-back" label="Earlier" size="sm" disabled={k === 0}
                          onPress={() => { const s = [...draft.slides]; [s[k - 1], s[k]] = [s[k], s[k - 1]]; setDraft({ ...draft, slides: s }); }} />
                        <IconButton icon="trash-outline" label={`Remove slide ${k + 1}`} size="sm" onPress={() => setDraft({ ...draft, slides: draft.slides.filter((_, x) => x !== k) })} />
                      </View>
                    </View>
                  ))}
                </ScrollView>
              ) : null}
              {upload ? <Tag label={upload} tone="gold" /> : null}
              {Platform.OS === 'web' ? <Button label="Add slides" icon="images-outline" size="md" variant="secondary" onPress={addSlides} disabled={!!upload} style={{ alignSelf: 'flex-start' }} /> : null}
              <Text style={[type.caption, font(400), { color: c.ink2 }]}>Upload a PDF or images. From PowerPoint or Keynote: File → Export → PDF. The speaker changes slides from the podium tablet.</Text>
            </View>
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}
