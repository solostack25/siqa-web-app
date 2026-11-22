// Event editor → Basics: name, date, place, description, cover photo, in person / online.
import { useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { font, space, type, useDS } from '../../../lib/ds';
import { Button, TextField } from '../../ui';
import { Card, CardTitle, Choice } from '../../masjid/admin/kit';
import { supabase } from '../../../lib/supabase';
import { showToast } from '../../Toast';
import { pickFiles, uploadEventFile } from '../../../lib/events';
import { DateTimeField, ToggleRow } from '../fields';
import { EventCover, type EventData } from './EventsSection';

export function BasicsTab({ data, reload, wide, onDelete }: { data: EventData; reload: () => void; wide: boolean; onDelete: () => void }) {
  const { c } = useDS();
  const [d, setD] = useState(() => ({ ...data.event }));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));

  const watchToken = (v: string) => {
    // Accept a full Siqa viewer link (…/live/<token> or …/join/<token>) or just the token.
    const m = v.trim().match(/(?:live|join|watch)\/([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : v.trim() || null;
  };

  const save = async () => {
    if (!d.title.trim()) { showToast('Give the event a name.'); return; }
    setBusy(true);
    const { error } = await supabase.from('events').update({
      title: d.title.trim(), kind: d.kind, starts_at: d.starts_at, doors_at: d.doors_at, venue: d.venue?.trim() || null,
      address: d.address?.trim() || null, about: d.about?.trim() || null, cover_url: d.cover_url, in_person: d.in_person, online: d.online,
      online_watch_token: d.online_watch_token ? watchToken(d.online_watch_token) : null, ask_names: d.ask_names, ask_diet: d.ask_diet,
    }).eq('id', d.id);
    setBusy(false);
    if (error) { showToast(error.message); return; }
    showToast('Saved.');
    reload();
  };

  const uploadCover = async () => {
    const [f] = await pickFiles('image/*');
    if (!f) return;
    setUploading(true);
    try {
      const url = await uploadEventFile(d.id, f, (f.name.split('.').pop() || 'jpg').toLowerCase());
      set({ cover_url: url });
    } catch (e: any) { showToast(e.message); }
    setUploading(false);
  };

  const col = { flexDirection: wide ? 'row' : 'column', gap: space[3] } as const;

  return (
    <View style={{ gap: space[4] }}>
      <Card>
        <CardTitle>The event</CardTitle>
        <TextField label="Name" value={d.title} onChangeText={(v) => set({ title: v })} placeholder="Annual Banquet 2026" maxLength={90} />
        <View style={{ gap: 6 }}>
          <Text style={[type.caption, font(600), { color: c.ink2 }]}>Type</Text>
          <Choice label="Type" value={d.kind} onChange={(v) => set({ kind: v })}
            options={[{ value: 'banquet', label: 'Banquet' }, { value: 'dinner', label: 'Fundraising dinner' }, { value: 'conference', label: 'Conference' }, { value: 'class', label: 'Class' }, { value: 'other', label: 'Other' }]} />
        </View>
        <View style={col}>
          <View style={{ flex: 1 }}><DateTimeField label="Starts" value={d.starts_at} onChange={(v) => set({ starts_at: v })} /></View>
          <View style={{ flex: 1 }}><DateTimeField label="Doors open" value={d.doors_at} onChange={(v) => set({ doors_at: v })} help="When check-in starts." /></View>
        </View>
        <TextField label="About" value={d.about ?? ''} onChangeText={(v) => set({ about: v })} multiline style={{ minHeight: 110 }}
          placeholder="What the night is for, who's speaking, what the money will build. This shows on your event page." />
      </Card>

      <Card>
        <CardTitle>Where</CardTitle>
        <ToggleRow label="In person" sub="Guests come to a venue and check in with a QR ticket." value={d.in_person} onChange={(v) => set({ in_person: v })} />
        <ToggleRow label="Online too" sub="Sell cheaper online seats. Guests watch from home and can give during the appeal." value={d.online} onChange={(v) => set({ online: v })} last={!d.online} />
        {d.in_person ? (
          <View style={col}>
            <TextField label="Venue" value={d.venue ?? ''} onChangeText={(v) => set({ venue: v })} placeholder="Grand Ballroom, Marriott Westchase" containerStyle={{ flex: 1 }} />
            <TextField label="Address" value={d.address ?? ''} onChangeText={(v) => set({ address: v })} placeholder="2900 Briarpark Dr, Houston, TX" containerStyle={{ flex: 1 }} />
          </View>
        ) : null}
        {d.online ? (
          <TextField label="Siqa live link for online guests (optional)" value={d.online_watch_token ?? ''} onChangeText={(v) => set({ online_watch_token: v })}
            autoCapitalize="none" placeholder="Paste the viewer link from Go Live"
            help="Start a Siqa live from the camera at the event and paste its viewer link here. Online guests watch it on their seat page." />
        ) : null}
      </Card>

      <Card>
        <CardTitle>Cover photo</CardTitle>
        <EventCover url={d.cover_url} height={wide ? 220 : 160} />
        <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
          {Platform.OS === 'web' ? <Button label={d.cover_url ? 'Change photo' : 'Upload a photo'} icon="image-outline" size="md" variant="secondary" onPress={uploadCover} loading={uploading} /> : null}
          {d.cover_url ? <Button label="Remove" size="md" variant="ghost" onPress={() => set({ cover_url: null })} /> : null}
        </View>
        <Text style={[type.caption, font(400), { color: c.ink2 }]}>A wide photo (about 1600 × 900) looks best on the event page.</Text>
      </Card>

      <Card>
        <CardTitle>At checkout</CardTitle>
        <ToggleRow label="Ask for each guest's name" sub="So name badges and the check-in list show everyone, not just the buyer." value={d.ask_names} onChange={(v) => set({ ask_names: v })} />
        <ToggleRow label="Ask about dietary needs" sub="Vegetarian, allergies… shown to the registration desk." value={d.ask_diet} onChange={(v) => set({ ask_diet: v })} last />
      </Card>

      <View style={{ flexDirection: 'row', gap: space[2], justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Button label="Delete event" variant="danger" size="md" onPress={onDelete} />
        <Button label="Save changes" size="lg" onPress={save} loading={busy} style={{ minWidth: 200 }} />
      </View>
    </View>
  );
}
