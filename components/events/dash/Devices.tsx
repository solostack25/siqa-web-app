// Event editor → Devices: link the big screen, podium tablet, MC phone, check-in desk and volunteer phones.
// Each device opens siqa.us/event-device, which shows a 6-digit code; type it here and pick what the device does.
import { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { font, space, type, useDS } from '../../../lib/ds';
import { BottomSheet, Button, IconButton, TextField } from '../../ui';
import { Card, CardTitle, Dot, ago, screenOnline } from '../../masjid/admin/kit';
import { Icon } from '../../Icon';
import { supabase } from '../../../lib/supabase';
import { showToast } from '../../Toast';
import { confirmDialog } from '../../../lib/dialogs';
import { ROLE_INFO, type DeviceRole } from '../../../lib/events';
import type { EventData } from './EventsSection';

type Device = { id: string; role: DeviceRole; name: string; last_seen_at: string | null; paired_at: string };
const ROLES = Object.keys(ROLE_INFO) as DeviceRole[];

export function DevicesTab({ data, wide }: { data: EventData; wide: boolean }) {
  const { c } = useDS();
  const ev = data.event;
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [code, setCode] = useState('');
  const [role, setRole] = useState<DeviceRole>('stage');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Device | null>(null);

  const load = useCallback(async () => {
    const { data: d } = await supabase.from('event_devices').select('id, role, name, last_seen_at, paired_at').eq('event_id', ev.id).order('paired_at');
    setDevices((d as Device[]) ?? []);
  }, [ev.id]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const link = async () => {
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) { showToast('Type the 6-digit code shown on the device.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('event_device_claim', { p_code: digits, p_event: ev.id, p_role: role, p_name: name.trim() || null });
    setBusy(false);
    if (error) { showToast(error.message); return; }
    showToast(`${name.trim() || ROLE_INFO[role].label} is linked. It switches over in a few seconds.`);
    setCode(''); setName(''); load();
  };
  const saveEdit = async () => {
    if (!edit) return;
    const { error } = await supabase.rpc('event_device_update', { p_device: edit.id, p_role: edit.role, p_name: edit.name });
    if (error) { showToast(error.message); return; }
    setEdit(null); load();
  };
  const unlink = async (d: Device) => {
    if (!(await confirmDialog(`Unlink ${d.name}?`, 'The device goes back to showing a new code.', 'Unlink'))) return;
    const { error } = await supabase.from('event_devices').delete().eq('id', d.id);
    if (error) { showToast(error.message); return; }
    setEdit(null); load();
  };

  return (
    <View style={{ gap: space[4] }}>
      <Card>
        <CardTitle>Link a device</CardTitle>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: space[4] }}>
          <View style={{ flex: 1, gap: space[2] }}>
            {[
              ['1', 'On the device, open', 'siqa.us/event-device'],
              ['2', 'It shows a 6-digit code.', 'Type it here.'],
              ['3', 'Pick what it does tonight.', 'You can change it any time.'],
            ].map(([n, a, b]) => (
              <View key={n} style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
                <View style={{ width: 28, height: 28, borderRadius: 999, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[type.buttonSm, { color: c.onPrimary }]}>{n}</Text>
                </View>
                <Text style={[type.callout, { color: c.ink, flex: 1 }]}>{a} <Text style={font(700)}>{b}</Text></Text>
              </View>
            ))}
            <Text style={[type.caption, font(400), { color: c.ink2 }]}>Any laptop, tablet or phone with a browser works. For the projector, plug a laptop or a Siqa box into it.</Text>
          </View>
          <View style={{ flex: 1, gap: space[3] }}>
            <TextField label="Code on the device" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="123456"
              style={{ fontSize: 26, letterSpacing: 6, textAlign: 'center' }} maxLength={6} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              {ROLES.map((r) => <RoleChip key={r} role={r} on={role === r} onPress={() => setRole(r)} />)}
            </View>
            <Text style={[type.caption, font(400), { color: c.ink2 }]}>{ROLE_INFO[role].sub}</Text>
            <TextField label="Name (optional)" value={name} onChangeText={setName} placeholder={role === 'volunteer' ? 'Aisha — tables 1–10' : ROLE_INFO[role].label} />
            <Button label="Link device" onPress={link} loading={busy} disabled={code.length !== 6} />
          </View>
        </View>
      </Card>

      <Card>
        <CardTitle>Linked devices</CardTitle>
        {devices && devices.length === 0 ? <Text style={[type.callout, { color: c.ink2 }]}>None yet. Most banquets use one big screen, one podium tablet, the MC's phone, a check-in tablet and a few volunteer phones.</Text> : null}
        {(devices ?? []).map((d, i) => {
          const on = screenOnline(d.last_seen_at);
          return (
            <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.surfaceSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={ROLE_INFO[d.role].icon as any} size={20} color={c.ink} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.body, font(700), { color: c.ink }]}>{d.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Dot color={on ? c.seed : c.ink3} />
                  <Text style={[type.caption, font(400), { color: c.ink2 }]}>{ROLE_INFO[d.role].label} · {on ? 'Online' : `Last seen ${ago(d.last_seen_at)}`}</Text>
                </View>
              </View>
              <IconButton icon="create-outline" label={`Edit ${d.name}`} onPress={() => setEdit({ ...d })} />
            </View>
          );
        })}
      </Card>

      <BottomSheet visible={!!edit} onClose={() => setEdit(null)} title="Edit device"
        footer={<View style={{ flexDirection: 'row', gap: space[2] }}>{edit ? <Button label="Unlink" variant="danger" onPress={() => unlink(edit)} /> : null}<Button label="Save" onPress={saveEdit} grow /></View>}>
        {edit ? (
          <View style={{ gap: space[4] }}>
            <TextField label="Name" value={edit.name} onChangeText={(v) => setEdit({ ...edit, name: v })} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              {ROLES.map((r) => <RoleChip key={r} role={r} on={edit.role === r} onPress={() => setEdit({ ...edit, role: r })} />)}
            </View>
            <Text style={[type.caption, font(400), { color: c.ink2 }]}>{ROLE_INFO[edit.role].sub}</Text>
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}

function RoleChip({ role, on, onPress }: { role: DeviceRole; on: boolean; onPress: () => void }) {
  return (
    <Button label={ROLE_INFO[role].label} icon={ROLE_INFO[role].icon as any} size="sm" variant={on ? 'primary' : 'soft'} onPress={onPress}
      accessibilityLabel={`${ROLE_INFO[role].label}${on ? ', selected' : ''}`} />
  );
}
