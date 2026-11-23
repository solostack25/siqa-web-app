// siqa.us/event-device — the one page every banquet device opens (projector laptop, podium tablet, MC phone,
// check-in tablet, volunteer phones). Shows a 6-digit code until an organizer links it from the dashboard,
// then becomes whatever role they picked. The link survives refreshes (kept in this browser).
import { useEffect, useState } from 'react';
import { View, Text, Platform, Pressable } from 'react-native';
import { font } from '../lib/ds';
import { supabase } from '../lib/supabase';
import { QRCode } from '../components/masjid/QRCode';
import { deviceAct, deviceState, readDeviceToken, writeDeviceToken, useLivePoll, useWakeLock, ROLE_INFO, type LiveState } from '../lib/events';
import { StageView } from '../components/events/device/Stage';
import { PodiumView } from '../components/events/device/Podium';
import { MCView } from '../components/events/device/MC';
import { RegistrationView } from '../components/events/device/Registration';
import { VolunteerView } from '../components/events/device/Volunteer';
import { N } from '../components/events/device/kit';
import { showToast } from '../components/Toast';

export default function EventDevicePage() {
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useWakeLock(true);

  const register = async (existing: string | null) => {
    const { data, error } = await supabase.rpc('event_device_register', { p_device_token: existing });
    if (error || !data) { setFailed(true); setTimeout(() => register(existing), 5000); return; }
    setFailed(false);
    writeDeviceToken((data as any).device_token);
    setToken((data as any).device_token);
  };
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.title = 'Siqa Events device';
    register(readDeviceToken());
  }, []);

  const { state, skew, refresh } = useLivePoll(token ? () => deviceState(token) : null, 2000);

  // Unlinked from the dashboard (row deleted) → get a fresh code.
  useEffect(() => { if (state?.status === 'unknown' && token) register(null); }, [state?.status]);
  // Codes last 30 minutes; get a new one before it runs out.
  useEffect(() => {
    if (state?.status !== 'unpaired' || !token) return;
    const t = setInterval(() => register(token), 25 * 60 * 1000);
    return () => clearInterval(t);
  }, [state?.status, token]);

  if (!token || !state) {
    return <Center><Text style={[font(600), { fontSize: 20, color: N.ink2 }]}>{failed ? 'No connection. Retrying…' : 'Starting…'}</Text></Center>;
  }
  if (state.status !== 'paired') return <Pairing code={state.pair_code ?? '······'} />;

  const act = async (action: string, payload: Record<string, unknown> = {}) => {
    try {
      const r = await deviceAct(token, action, payload);
      if (r?.ok === false && r.reason === 'no_more') showToast('That was the last part of the program.');
      await refresh();
      return r;
    } catch (e: any) {
      showToast(e?.message ?? 'Something went wrong');
      throw e;
    }
  };
  const s = state as LiveState;
  switch (s.role) {
    case 'stage': return <StageView state={s} skew={skew} />;
    case 'podium': return <Full><PodiumView state={s} skew={skew} act={act} /></Full>;
    case 'mc': return <Full><MCView state={s} skew={skew} act={act} /></Full>;
    case 'registration': return <Full><RegistrationView state={s} token={token} act={act} /></Full>;
    case 'volunteer': return <Full><VolunteerView state={s} name={s.name ?? 'Volunteer'} act={act} /></Full>;
    default: return <Pairing code="······" />;
  }
}

function Full({ children }: { children: React.ReactNode }) {
  return <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: N.bg }}>{children}</View>;
}
function Center({ children }: { children: React.ReactNode }) {
  return <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: N.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 }}>{children}</View>;
}

function Pairing({ code }: { code: string }) {
  const [help, setHelp] = useState(false);
  return (
    <Center>
      <Text style={[font(700), { fontSize: 16, letterSpacing: 2, color: N.gold }]}>SIQA EVENTS</Text>
      <Text style={[font(800, 'display'), { fontSize: 30, color: N.ink, textAlign: 'center' }]}>Link this device to your event</Text>
      <Text style={[font(800, 'display'), { fontSize: 76, lineHeight: 84, letterSpacing: 10, color: N.ink }]} accessibilityLabel={`Code ${code.split('').join(' ')}`}>
        {code.slice(0, 3)} {code.slice(3)}
      </Text>
      <Text style={[font(500), { fontSize: 18, lineHeight: 26, color: N.ink2, textAlign: 'center', maxWidth: 520 }]}>
        On your computer or phone, open <Text style={{ color: N.ink, ...font(700) }}>siqa.us/manage</Text> → Events → your event → Devices, type this code and pick what this device does.
      </Text>
      <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: 18 }}>
        <QRCode value="https://www.siqa.us/manage" size={130} />
      </View>
      <Pressable onPress={() => setHelp(!help)} accessibilityRole="button"><Text style={[font(600), { fontSize: 15, color: N.ink2, textDecorationLine: 'underline' }]}>What can a device do?</Text></Pressable>
      {help ? (
        <View style={{ gap: 8, maxWidth: 520 }}>
          {Object.values(ROLE_INFO).map((r) => (
            <Text key={r.label} style={[font(500), { fontSize: 15, color: N.ink2 }]}><Text style={{ color: N.ink, ...font(700) }}>{r.label}</Text> — {r.sub}</Text>
          ))}
        </View>
      ) : null}
      <Text style={[font(500), { fontSize: 13, color: N.ink3 }]}>The code changes every 30 minutes. Keep this page open.</Text>
    </Center>
  );
}
