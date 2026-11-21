// "Notifications on this device" for the web app / PWA: turn push on, then pick Prayer times and Live.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { Button, ListRow, SectionLabel, Switch } from './ui';
import { radius, space, type, useDS } from '../lib/ds';
import { disablePush, enablePush, myPushRow, pushState, setPushTopic, type PushState } from '../lib/webPush';

export function PushCard({ focus }: { focus?: 'prayer' | 'live' }) {
  const { c, shadow } = useDS();
  const [state, setState] = useState<PushState | null>(null);
  const [row, setRow] = useState<{ id: string; prayer: boolean; live: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const s = await pushState().catch(() => 'unsupported' as PushState);
    setState(s);
    setRow(s === 'on' ? await myPushRow() : null);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (Platform.OS !== 'web' || state === null || state === 'unsupported') return null;

  async function turnOn() {
    setBusy(true); setErr('');
    try { setState(await enablePush()); setRow(await myPushRow()); } catch (e) { setErr((e as Error).message || 'Could not turn on notifications.'); }
    setBusy(false);
  }
  async function turnOff() {
    setBusy(true); setErr('');
    await disablePush().catch(() => {});
    await load();
    setBusy(false);
  }
  async function topic(t: 'prayer' | 'live', on: boolean) {
    if (!row) return;
    setRow({ ...row, [t]: on });
    try { await setPushTopic(row.id, t, on); } catch { setRow({ ...row, [t]: !on }); setErr("Couldn't save that."); }
  }

  const card = [{ backgroundColor: c.surface, borderRadius: radius.xl, paddingHorizontal: space[4] }, shadow('card')];

  return (
    <View style={{ gap: space[2] }}>
      <SectionLabel>Notifications on this device</SectionLabel>
      {state === 'needs-home-screen' ? (
        <View style={[...card, { padding: space[4], gap: space[2] }] as any}>
          <Text style={[type.headline, { color: c.ink }]}>Add Siqa to your Home Screen first</Text>
          <Text style={[type.callout, { color: c.ink2 }]}>
            On iPhone, notifications only work from the Home Screen app. In Safari, tap Share, then Add to Home Screen. Open Siqa from there and come back here.
          </Text>
        </View>
      ) : state === 'denied' ? (
        <View style={[...card, { padding: space[4], gap: space[2] }] as any}>
          <Text style={[type.headline, { color: c.ink }]}>Notifications are blocked</Text>
          <Text style={[type.callout, { color: c.ink2 }]}>Turn them on for Siqa in your phone or browser settings, then come back here.</Text>
        </View>
      ) : state === 'off' ? (
        <View style={[...card, { padding: space[4], gap: space[3] }] as any}>
          <Text style={[type.callout, { color: c.ink2 }]}>
            {focus === 'prayer' ? 'Get a notification at each prayer time, and before it if you set a reminder.'
              : focus === 'live' ? 'Get a notification the moment a speaker you follow goes live.'
              : 'Prayer times, and the moment a speaker you follow goes live.'}
          </Text>
          <Button label="Turn on notifications" icon="notifications-outline" onPress={turnOn} loading={busy} />
        </View>
      ) : (
        <View style={card as any}>
          <ListRow icon="time-outline" label="Prayer times" sub="Uses your prayer settings: which salah, and the reminder before it"
            right={<Switch value={row?.prayer ?? true} onValueChange={(v) => topic('prayer', v)} label="Prayer time notifications" />} />
          <ListRow icon="radio-outline" label="Live now" sub="When a speaker you follow goes live"
            right={<Switch value={row?.live ?? true} onValueChange={(v) => topic('live', v)} label="Live notifications" />} />
          <ListRow icon="notifications-off-outline" label="Turn off on this device" onPress={turnOff} last danger />
        </View>
      )}
      {err ? <Text style={[type.callout, { color: c.danger }]}>{err}</Text> : null}
    </View>
  );
}
