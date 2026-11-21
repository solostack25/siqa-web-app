import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { font, space, type, useDS } from '../../../lib/ds';
import { Button, Switch, TextField, BottomSheet } from '../../ui';
import { Card, Empty, PageHeader, Tag, type SectionProps } from './kit';
import { useAnnouncements, type AnnouncementRow } from './useMasjidData';
import { supabase } from '../../../lib/supabase';
import { confirmDialog } from '../../../lib/dialogs';
import { showToast } from '../../Toast';

type Draft = Partial<AnnouncementRow> & { title: string };
const today = () => new Date().toISOString().slice(0, 10);

export function AnnouncementsSection({ masjid }: SectionProps) {
  const { c } = useDS();
  const { items, reload } = useAnnouncements(masjid.id);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!draft || !draft.title.trim()) { showToast('Add a headline.'); return; }
    setBusy(true);
    const row = {
      org_id: masjid.id, title: draft.title.trim(), body: draft.body?.trim() || null, image_url: draft.image_url?.trim() || null,
      starts_on: draft.starts_on || today(), ends_on: draft.ends_on || null,
      on_screens: draft.on_screens ?? true, on_page: draft.on_page ?? true, pinned: draft.pinned ?? false,
    };
    const { data: { user } } = await supabase.auth.getUser();
    const res = draft.id
      ? await supabase.from('masjid_announcements').update(row).eq('id', draft.id)
      : await supabase.from('masjid_announcements').insert({ ...row, created_by: user?.id ?? null });
    setBusy(false);
    if (res.error) { showToast(res.error.message); return; }
    setDraft(null); reload();
  };
  const remove = async () => {
    if (!draft?.id || !(await confirmDialog('Delete this announcement?', 'It comes off your screens and page.', 'Delete'))) return;
    await supabase.from('masjid_announcements').delete().eq('id', draft.id);
    setDraft(null); reload();
  };

  const t = today();
  const live = (a: AnnouncementRow) => a.starts_on <= t && (!a.ends_on || a.ends_on >= t);

  return (
    <>
      <PageHeader title="Announcements" sub="Shown on your TV screens and your Siqa page." right={<Button label="New announcement" icon="add" size="md" onPress={() => setDraft({ title: '', on_screens: true, on_page: true, starts_on: t })} />} />
      {items && items.length === 0 ? <Empty icon="megaphone-outline" title="No announcements yet" sub="Parking reminders, Eid notices, class sign-ups. They rotate on your screens." /> : null}
      <View style={{ gap: space[3] }}>
        {(items ?? []).map((a) => (
          <Pressable key={a.id} onPress={() => setDraft(a)} accessibilityRole="button">
            <Card>
              <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
                {live(a) ? <Tag label="Showing now" tone="seed" /> : <Tag label={a.starts_on > t ? `Starts ${a.starts_on}` : 'Ended'} />}
                {a.pinned ? <Tag label="Pinned" tone="gold" /> : null}
                {a.on_screens ? <Tag label="Screens" /> : null}
                {a.on_page ? <Tag label="Page" /> : null}
              </View>
              <Text style={[type.headline, { color: c.ink }]}>{a.title}</Text>
              {a.body ? <Text style={[type.callout, { color: c.ink2 }]} numberOfLines={2}>{a.body}</Text> : null}
            </Card>
          </Pressable>
        ))}
      </View>
      <BottomSheet visible={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Edit announcement' : 'New announcement'}
        footer={<View style={{ flexDirection: 'row', gap: space[2] }}>{draft?.id ? <Button label="Delete" variant="danger" onPress={remove} /> : null}<Button label="Save" onPress={save} loading={busy} grow /></View>}>
        {draft ? (
          <View style={{ gap: space[4] }}>
            <TextField label="Headline" value={draft.title} onChangeText={(v) => setDraft({ ...draft, title: v })} placeholder="Eid prayer at 8:00 AM in the main hall" maxLength={90} />
            <TextField label="Details" value={draft.body ?? ''} onChangeText={(v) => setDraft({ ...draft, body: v })} multiline style={{ minHeight: 90 }} placeholder="One or two short lines read best on a TV." />
            <TextField label="Flyer image link (optional)" value={draft.image_url ?? ''} onChangeText={(v) => setDraft({ ...draft, image_url: v })} placeholder="https://…" autoCapitalize="none" />
            <View style={{ flexDirection: 'row', gap: space[3] }}>
              <TextField label="Starts" value={draft.starts_on ?? t} onChangeText={(v) => setDraft({ ...draft, starts_on: v })} placeholder="2026-11-21" containerStyle={{ flex: 1 }} />
              <TextField label="Ends (optional)" value={draft.ends_on ?? ''} onChangeText={(v) => setDraft({ ...draft, ends_on: v })} placeholder="2026-11-30" containerStyle={{ flex: 1 }} />
            </View>
            <Toggle label="Show on screens" value={draft.on_screens ?? true} onChange={(v) => setDraft({ ...draft, on_screens: v })} />
            <Toggle label="Show on your Siqa page" value={draft.on_page ?? true} onChange={(v) => setDraft({ ...draft, on_page: v })} />
            <Toggle label="Pin to the top" value={draft.pinned ?? false} onChange={(v) => setDraft({ ...draft, pinned: v })} />
          </View>
        ) : null}
      </BottomSheet>
    </>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { c } = useDS();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <Text style={[type.body, font(500), { color: c.ink }]}>{label}</Text>
      <Switch label={label} value={value} onValueChange={onChange} />
    </View>
  );
}
