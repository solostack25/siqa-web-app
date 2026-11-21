// "Set up a masjid" (Siqa admins only): creates the masjid org and its settings.
import { useState } from 'react';
import { View, Text } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { space, type, useDS } from '../../../lib/ds';
import { Button, TextField, BottomSheet } from '../../ui';
import { Choice } from './kit';
import { US_TIMEZONES } from '../../../lib/masjid';

export function CreateMasjidSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('Houston');
  const [state, setState] = useState('TX');
  const [tz, setTz] = useState('America/Chicago');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { c } = useDS();
  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setErr('');
    const { data, error } = await supabase.rpc('masjid_create', { p_name: name.trim(), p_city: city.trim(), p_state: state.trim().toUpperCase(), p_timezone: tz });
    setBusy(false);
    // Shown in the sheet: a toast would sit behind it.
    if (error) { setErr(error.message || 'Could not create the masjid. Try again.'); return; }
    setName('');
    onCreated(data as string);
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Set up a masjid"
      footer={<Button label="Create masjid" onPress={create} loading={busy} disabled={!name.trim()} />}>
      <View style={{ gap: space[4] }}>
        <TextField label="Masjid name" value={name} onChangeText={setName} placeholder="Masjid An-Noor" />
        <View style={{ flexDirection: 'row', gap: space[3] }}>
          <TextField label="City" value={city} onChangeText={setCity} containerStyle={{ flex: 2 }} />
          <TextField label="State" value={state} onChangeText={setState} autoCapitalize="characters" maxLength={2} containerStyle={{ flex: 1 }} />
        </View>
        <Choice label="Timezone" options={US_TIMEZONES.map((t) => ({ value: t.id, label: t.label }))} value={tz} onChange={setTz} />
        {err ? <Text style={[type.callout, { color: c.danger }]} accessibilityLiveRegion="polite">{err}</Text> : null}
      </View>
    </BottomSheet>
  );
}
