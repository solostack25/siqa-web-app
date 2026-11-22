import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { font, space, type, useDS } from '../../../lib/ds';
import { Button, Switch, TextField, BottomSheet } from '../../ui';
import { Card, CardTitle, Choice, Dot, Empty, KV, PageHeader, Tag, ago, parseClock, screenOnline, type SectionProps } from './kit';
import { useScreens, type ScreenRow } from './useMasjidData';
import { supabase } from '../../../lib/supabase';
import { fmtClock } from '../../../lib/masjid';
import { confirmDialog } from '../../../lib/dialogs';
import { showToast } from '../../Toast';

type Wifi = { id: string; ssid: string; security: string; status: string; priority: number };

export function ScreensSection({ masjid, wide }: SectionProps) {
  const { c } = useDS();
  const { screens, reload } = useScreens(masjid.id, 15000);
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('Main hall TV');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<ScreenRow | null>(null);
  const canWifi = masjid.my_role === 'owner' || masjid.my_role === 'siqa';

  const add = async () => {
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) { showToast('The code on the TV has 6 digits.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('screen_claim_masjid', { p_code: digits, p_org: masjid.id, p_name: name });
    setBusy(false);
    if (error) { showToast(error.message); return; }
    setAdding(false); setCode(''); reload();
    showToast('Screen added. It switches to your masjid within 20 seconds.');
  };

  return (
    <>
      <PageHeader title="Screens" sub="TVs showing your prayer times, schedule and live khutbah." right={<Button label="Add screen" icon="add" size="md" onPress={() => setAdding(true)} />} />
      {screens && screens.length === 0 ? (
        <Empty icon="tv-outline" title="No screens yet" sub="Plug in a Siqa box, or open siqa.us/screen on the TV's computer and make it full screen. The TV shows a 6-digit code: add it here.">
          <Button label="Add screen" size="md" onPress={() => setAdding(true)} style={{ marginTop: space[2] }} />
        </Empty>
      ) : null}
      <View style={{ flexDirection: wide ? 'row' : 'column', flexWrap: 'wrap', gap: space[4] }}>
        {(screens ?? []).map((s) => {
          const on = screenOnline(s.last_seen_at);
          return (
            <Pressable key={s.id} onPress={() => setOpen(s)} accessibilityRole="button" style={{ width: wide ? 360 : '100%' }}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                  <Dot color={on ? c.seed : c.danger} />
                  <Text style={[type.headline, { color: c.ink, flex: 1 }]} numberOfLines={1}>{s.name || 'Screen'}</Text>
                  <Tag label={s.info?.app === 'box' ? 'Siqa box' : 'Browser'} />
                </View>
                <Text style={[type.caption, { color: on ? c.ink2 : c.danger }]}>{on ? `Online · checked in ${ago(s.last_seen_at)}` : `Offline since ${ago(s.last_seen_at)}`}</Text>
                <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
                  {s.show_live ? <Tag label="Shows live khutbah" tone="gold" /> : null}
                  {s.show_live && s.live_audio ? <Tag label="Live audio on" /> : null}
                  {s.layout !== 'standard' ? <Tag label={s.layout === 'portrait' ? 'Portrait' : 'Times only'} /> : null}
                  {s.wifi_event?.ssid ? <Tag label={`Wi-Fi: ${s.wifi_event.ssid}`} tone={s.wifi_event.ok ? 'seed' : 'danger'} /> : null}
                </View>
              </Card>
            </Pressable>
          );
        })}
      </View>

      <Card style={{ backgroundColor: c.bgSunk }}>
        <CardTitle>Setting up a TV</CardTitle>
        <KV k="Siqa box" v="Plug it into the TV's HDMI port and power. It opens Siqa on its own and shows a code." />
        <KV k="A computer" v="Open siqa.us/screen in Chrome, press F11 for full screen, and share it to the TV." />
        <KV k="Then" v="Tap Add screen here and type the 6-digit code from the TV." last />
      </Card>

      <BottomSheet visible={adding} onClose={() => setAdding(false)} title="Add a screen" footer={<Button label="Add screen" onPress={add} loading={busy} />}>
        <View style={{ gap: space[4] }}>
          <TextField label="Code on the TV" value={code} onChangeText={setCode} placeholder="123 456" keyboardType="number-pad" maxLength={7} />
          <TextField label="Name" value={name} onChangeText={setName} placeholder="Main hall TV" help="So you can tell your screens apart." />
        </View>
      </BottomSheet>

      <ScreenSheet screen={open} canWifi={canWifi} onClose={() => setOpen(null)} onChanged={() => { reload(); }} />
    </>
  );
}

function ScreenSheet({ screen, canWifi, onClose, onChanged }: { screen: ScreenRow | null; canWifi: boolean; onClose: () => void; onChanged: () => void }) {
  const { c } = useDS();
  const [s, setS] = useState<ScreenRow | null>(screen);
  const [onText, setOnText] = useState('');
  const [offText, setOffText] = useState('');
  const [wifi, setWifi] = useState<Wifi[]>([]);
  const [ssid, setSsid] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setS(screen);
    setOnText(screen?.power_on ? fmtClock(screen.power_on) : '');
    setOffText(screen?.power_off ? fmtClock(screen.power_off) : '');
    if (screen && canWifi) {
      supabase.from('masjid_screen_wifi').select('id, ssid, security, status, priority').eq('screen_id', screen.id).order('priority', { ascending: false })
        .then(({ data }) => setWifi((data as Wifi[]) || []));
    } else setWifi([]);
  }, [screen, canWifi]);

  if (!s) return <BottomSheet visible={false} onClose={onClose} title="">{null}</BottomSheet>;

  const save = async () => {
    const pOn = onText.trim() ? parseClock(onText) : null;
    const pOff = offText.trim() ? parseClock(offText) : null;
    if ((onText.trim() && !pOn) || (offText.trim() && !pOff)) { showToast('Check the on/off times, like "5:00 AM".'); return; }
    setBusy(true);
    const { error } = await supabase.from('masjid_screens').update({
      name: s.name, layout: s.layout, show_live: s.show_live, live_audio: s.live_audio, power_on: pOn, power_off: pOff,
    }).eq('id', s.id);
    setBusy(false);
    if (error) { showToast(error.message); return; }
    onChanged(); onClose(); showToast('Saved');
  };
  const command = async (type: 'reload' | 'reboot' | 'wifi_sync') => {
    const { error } = await supabase.from('masjid_screens').update({ command: { id: String(Date.now()), type } }).eq('id', s.id);
    showToast(error ? error.message : type === 'wifi_sync' ? 'Sent. The box saves the networks and reports back.' : 'Sent. The screen does it within 20 seconds.');
  };
  const remove = async () => {
    if (!(await confirmDialog('Remove this screen?', 'It goes back to showing a pairing code.', 'Remove'))) return;
    await supabase.from('masjid_screens').delete().eq('id', s.id);
    onChanged(); onClose();
  };
  const addWifi = async () => {
    if (!ssid.trim()) return;
    const { error } = await supabase.from('masjid_screen_wifi').upsert({ screen_id: s.id, ssid: ssid.trim(), password: pw || null, security: pw ? 'WPA' : 'OPEN', priority: wifi.length ? Math.max(...wifi.map((w) => w.priority)) + 1 : 1, status: 'pending' }, { onConflict: 'screen_id,ssid' });
    if (error) { showToast(error.message); return; }
    setSsid(''); setPw('');
    const { data } = await supabase.from('masjid_screen_wifi').select('id, ssid, security, status, priority').eq('screen_id', s.id).order('priority', { ascending: false });
    setWifi((data as Wifi[]) || []);
    await command('wifi_sync');
  };
  const moveHome = async () => {
    if (!(await confirmDialog('Move this TV to your home?', 'It stops showing the masjid screen and becomes your Siqa Home TV within 20 seconds. Its saved Wi-Fi stays. You can move it back from Settings → Your TVs.', 'Move'))) return;
    const { error } = await supabase.rpc('screen_move_home', { p_screen: s.id, p_name: null });
    if (error) { showToast(error.message); return; }
    showToast('Moved. It becomes your home TV within 20 seconds.');
    onChanged(); onClose();
  };
  const removeWifi = async (id: string) => {
    await supabase.from('masjid_screen_wifi').delete().eq('id', id);
    setWifi(wifi.filter((w) => w.id !== id));
  };

  const info = s.info || {};
  return (
    <BottomSheet visible onClose={onClose} title={s.name || 'Screen'}
      footer={<View style={{ flexDirection: 'row', gap: space[2] }}><Button label="Remove" variant="danger" onPress={remove} /><Button label="Save" onPress={save} loading={busy} grow /></View>}>
      <View style={{ gap: space[4] }}>
        <TextField label="Name" value={s.name ?? ''} onChangeText={(v) => setS({ ...s, name: v })} />
        <View style={{ gap: space[2] }}>
          <Text style={[type.caption, font(600), { color: c.ink2 }]}>Layout</Text>
          <Choice label="Layout" value={s.layout} options={[{ value: 'standard', label: 'Standard' }, { value: 'portrait', label: 'Portrait TV' }, { value: 'times_only', label: 'Prayer times only' }]} onChange={(v) => setS({ ...s, layout: v })} />
        </View>
        <Line label="Switch to the live khutbah" sub="When your khutbah camera goes live"><Switch label="Show live" value={s.show_live} onValueChange={(v) => setS({ ...s, show_live: v })} /></Line>
        {s.show_live ? <Line label="Play live audio" sub="Leave off where the PA can be heard, or you'll hear it twice, out of sync"><Switch label="Live audio" value={s.live_audio} onValueChange={(v) => setS({ ...s, live_audio: v })} /></Line> : null}
        <View style={{ flexDirection: 'row', gap: space[3] }}>
          <TextField label="TV on at (Siqa box)" value={onText} onChangeText={setOnText} placeholder="5:00 AM" containerStyle={{ flex: 1 }} />
          <TextField label="TV off at" value={offText} onChangeText={setOffText} placeholder="11:00 PM" containerStyle={{ flex: 1 }} />
        </View>

        <View style={{ gap: 2 }}>
          <Text style={[type.caption, font(600), { color: c.ink2 }]}>Device</Text>
          <KV k="Last check-in" v={ago(s.last_seen_at)} />
          <KV k="Type" v={info.app === 'box' ? `Siqa box${info.version ? ` · v${info.version}` : ''}${info.model ? ` · ${info.model}` : ''}` : 'Browser'} />
          {info.resolution ? <KV k="Resolution" v={String(info.resolution)} /> : null}
          {info.ssid ? <KV k="Wi-Fi" v={`${info.ssid}${info.signal != null ? ` · ${info.signal}% signal` : ''}`} /> : null}
          {s.wifi_event?.ssid ? <KV k="Last Wi-Fi change" v={`${s.wifi_event.ok ? 'Joined' : 'Couldn\'t join'} ${s.wifi_event.ssid}${s.wifi_event.source === 'tv' ? ' (set up at the TV)' : ''}`} last /> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
          <Button label="Reload screen" size="sm" variant="secondary" onPress={() => command('reload')} />
          {info.app === 'box' ? <Button label="Restart box" size="sm" variant="secondary" onPress={() => command('reboot')} /> : null}
          <Button label="Move to my home" size="sm" variant="secondary" onPress={moveHome} />
        </View>

        {canWifi && info.app === 'box' ? (
          <View style={{ gap: space[3] }}>
            <Text style={[type.caption, font(600), { color: c.ink2 }]}>Wi-Fi networks this box knows</Text>
            {wifi.length === 0 ? <Text style={[type.caption, { color: c.ink3 }]}>None saved here yet. Add the new network before you change the router or password.</Text> : null}
            {wifi.map((w) => (
              <View key={w.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.line }}>
                <Text style={[type.callout, font(600), { color: c.ink, flex: 1 }]}>{w.ssid}</Text>
                <Tag label={w.status === 'saved' ? 'Saved on box' : w.status === 'failed' ? 'Failed' : 'Sending'} tone={w.status === 'saved' ? 'seed' : w.status === 'failed' ? 'danger' : 'soft'} />
                <Pressable onPress={() => removeWifi(w.id)} accessibilityRole="button" accessibilityLabel={`Forget ${w.ssid}`} hitSlop={8}><Text style={[type.caption, { color: c.danger }]}>Forget</Text></Pressable>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: space[3] }}>
              <TextField label="Network name" value={ssid} onChangeText={setSsid} autoCapitalize="none" containerStyle={{ flex: 1 }} />
              <TextField label="Password" value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" containerStyle={{ flex: 1 }} />
            </View>
            <Button label="Add network" size="sm" variant="secondary" onPress={addWifi} style={{ alignSelf: 'flex-start' }} />
            <Text style={[type.caption, { color: c.ink3 }]}>The box tests a new network before switching, and stays on the old one if it can't join. If a box loses Wi-Fi completely, it shows a QR code on the TV to set Wi-Fi from a phone.</Text>
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}

function Line({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  const { c } = useDS();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, font(500), { color: c.ink }]}>{label}</Text>
        {sub ? <Text style={[type.caption, { color: c.ink2 }]}>{sub}</Text> : null}
      </View>
      {children}
    </View>
  );
}
