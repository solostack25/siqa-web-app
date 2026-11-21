// The one page every Siqa TV device runs (siqa.us/screen and siqa.us/tv, and the Siqa box).
// Unpaired: shows a 6-digit code and a QR code. Paired to a masjid: the masjid screen.
// Paired to a person: Siqa Home.

import { useEffect, useMemo } from 'react';
import { View, Text, Platform } from 'react-native';
import { font } from '../../lib/ds';
import { useScreenDevice, useTick } from '../../lib/screenDevice';
import { TVStage } from './TVStage';
import { QRCode } from './QRCode';
import { MasjidScreen } from './MasjidScreen';
import { HomeTV } from './HomeTV';
import { SITE } from '../../lib/masjid';
import { useLocalSearchParams } from 'expo-router';
import { demoState } from './demo';

const C = { bg: '#0a0f1c', panel: '#141c30', ink: '#edf1f7', ink2: '#9facc4', gold: '#d4ac73', goldInk: '#e6c290' };

export function ScreenApp({ prefer }: { prefer: 'masjid' | 'home' }) {
  const { demo } = useLocalSearchParams<{ demo?: string }>();
  return demo ? <Demo kind={String(demo)} /> : <Device prefer={prefer} />;
}

function Demo({ kind }: { kind: string }) {
  const now = useTick(1000);
  const state = useMemo(() => demoState(kind, new Date()), [kind]);
  if (kind === 'pair') return <Pairing code="482913" prefer="masjid" />;
  if (state.mode === 'home') return <HomeTV data={state} now={now} />;
  return <MasjidScreen data={state} now={now} />;
}

function Device({ prefer }: { prefer: 'masjid' | 'home' }) {
  const { state, online } = useScreenDevice();
  const now = useTick(1000);

  // A TV page should never sleep, scroll or show the browser's UI.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.title = 'Siqa';
    document.body.style.cursor = 'none';
    let lock: any = null;
    const wake = async () => { try { lock = await (navigator as any).wakeLock?.request('screen'); } catch {} };
    wake();
    const onVis = () => { if (document.visibilityState === 'visible') wake(); };
    document.addEventListener('visibilitychange', onVis);
    // Show the pointer again if someone moves a mouse.
    let t: any;
    const onMove = () => { document.body.style.cursor = 'default'; clearTimeout(t); t = setTimeout(() => { document.body.style.cursor = 'none'; }, 3000); };
    window.addEventListener('mousemove', onMove);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('mousemove', onMove); document.body.style.cursor = ''; try { lock?.release(); } catch {} };
  }, []);

  if (state.status === 'paired' && state.mode === 'masjid') return <MasjidScreen data={state as any} now={now} offline={!online} />;
  if (state.status === 'paired' && state.mode === 'home') return <HomeTV data={state as any} now={now} />;

  if (state.status === 'unpaired' && state.pair_code) return <Pairing code={state.pair_code} prefer={prefer} />;

  return (
    <TVStage>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28 }}>
        <Mark size={120} />
        <Text style={[font(600), { fontSize: 32, color: C.ink2 }]}>{state.status === 'offline' ? 'Waiting for the internet…' : 'Starting Siqa…'}</Text>
      </View>
    </TVStage>
  );
}

function Mark({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.27, backgroundColor: '#05080f', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#222b40' }}>
      <Text style={{ color: C.gold, fontSize: size * 0.6, fontWeight: '700' }}>ص</Text>
    </View>
  );
}

function Pairing({ code, prefer }: { code: string; prefer: 'masjid' | 'home' }) {
  const pretty = `${code.slice(0, 3)} ${code.slice(3)}`;
  const link = `${SITE}/link-tv?code=${code}`;
  return (
    <TVStage>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 120, gap: 110 }}>
        <View style={{ flex: 1, gap: 30 }}>
          <Mark size={96} />
          <Text style={[font(800, 'display'), { fontSize: 76, lineHeight: 82, color: C.ink, letterSpacing: -2 }]}>
            {prefer === 'home' ? 'Link this TV to Siqa' : 'Add this screen to your masjid'}
          </Text>
          <Text style={[font(500), { fontSize: 30, lineHeight: 40, color: C.ink2 }]}>
            {prefer === 'home'
              ? 'Scan the code with your phone and sign in. Or go to siqa.us/link-tv and type the code.'
              : 'In Siqa for Masjids, open Screens → Add screen and type this code. Or scan it with your phone.'}
          </Text>
          <View style={{ alignSelf: 'flex-start', backgroundColor: C.panel, borderRadius: 32, paddingHorizontal: 48, paddingVertical: 28 }}>
            <Text style={[font(800, 'display'), { fontSize: 120, color: C.goldInk, letterSpacing: 12 }]}>{pretty}</Text>
          </View>
          <Text style={[font(500), { fontSize: 22, color: '#7e89a3' }]}>The code changes every 30 minutes.</Text>
        </View>
        <View style={{ alignItems: 'center', gap: 18 }}>
          <View style={{ backgroundColor: '#fff', padding: 24, borderRadius: 28 }}>
            <QRCode value={link} size={400} label="Scan to link this TV" />
          </View>
          <Text style={[font(700), { fontSize: 26, color: C.ink }]}>Scan with your phone's camera</Text>
        </View>
      </View>
    </TVStage>
  );
}
