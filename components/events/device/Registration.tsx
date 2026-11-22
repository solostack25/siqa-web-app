// Event device → Registration desk: scan a ticket QR, or search a name, and tap to check in. Add walk-ins.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Platform, useWindowDimensions } from 'react-native';
import { font } from '../../../lib/ds';
import { supabase } from '../../../lib/supabase';
import { type LiveState } from '../../../lib/events';
import { DarkButton, H, N, Panel } from './kit';

type Guest = { id: string; name: string | null; email: string | null; table_label: string | null; diet: string | null; code: string; kind: string; checked_in_at: string | null; ticket: string | null };

export function RegistrationView({ state, token, act }: { state: LiveState; token: string; act: (a: string, p?: Record<string, unknown>) => Promise<any> }) {
  const { width } = useWindowDimensions();
  const [q, setQ] = useState('');
  const [list, setList] = useState<Guest[]>([]);
  const [flash, setFlash] = useState<{ ok: boolean; text: string; sub?: string } | null>(null);
  const [scan, setScan] = useState(false);
  const [walkin, setWalkin] = useState<{ name: string; email: string; table: string } | null>(null);
  const t = state.totals;

  const search = useCallback(async (text: string) => {
    const { data, error } = await supabase.rpc('event_device_attendees', { p_device_token: token, p_query: text });
    if (!error) setList((data as Guest[]) ?? []);
  }, [token]);
  useEffect(() => { const h = setTimeout(() => search(q), 200); return () => clearTimeout(h); }, [q, search]);

  const show = (f: typeof flash) => { setFlash(f); setTimeout(() => setFlash(null), 3500); };

  const checkIn = async (g: Guest) => {
    if (g.checked_in_at) { show({ ok: false, text: `${g.name ?? 'Guest'} is already checked in`, sub: `at ${new Date(g.checked_in_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` }); return; }
    try {
      await act('check_in', { attendee_id: g.id });
      show({ ok: true, text: `Welcome, ${g.name ?? 'guest'}!`, sub: [g.ticket, g.table_label ? `Table ${g.table_label}` : null, g.diet].filter(Boolean).join(' · ') });
      search(q);
    } catch (e: any) { show({ ok: false, text: e.message }); }
  };

  const byCode = async (raw: string) => {
    const m = raw.toUpperCase().match(/[0-9A-F]{8}(?!.*[0-9A-F]{8})/);
    if (!m) { show({ ok: false, text: 'That QR code isn\'t a ticket for this event.' }); return; }
    const { data } = await supabase.rpc('event_device_attendees', { p_device_token: token, p_query: m[0] });
    const g = ((data as Guest[]) ?? []).find((x) => x.code === m[0]);
    if (!g) { show({ ok: false, text: 'Ticket not found for this event.', sub: m[0] }); return; }
    checkIn(g);
  };

  const addWalkin = async () => {
    if (!walkin?.name.trim()) return;
    try {
      await act('add_guest', { name: walkin.name, email: walkin.email, table_label: walkin.table, check_in: true });
      show({ ok: true, text: `${walkin.name} added and checked in` });
      setWalkin(null); search(q);
    } catch (e: any) { show({ ok: false, text: e.message }); }
  };

  const wide = width > 760;
  return (
    <View style={{ flex: 1, backgroundColor: N.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: N.line }}>
        <View style={{ flex: 1 }}>
          <Text style={[font(800, 'display'), { fontSize: 20, color: N.ink }]} numberOfLines={1}>Check-in · {state.event.title}</Text>
          <Text style={[font(500), { fontSize: 14, color: N.ink2 }]}>{t.checked_in ?? 0} of {t.attendees ?? 0} guests here</Text>
        </View>
        <DarkButton label="+ Walk-in" onPress={() => setWalkin({ name: '', email: '', table: '' })} />
      </View>

      {flash ? (
        <View style={{ margin: 16, marginBottom: 0, padding: 20, borderRadius: 20, backgroundColor: flash.ok ? N.seed : N.danger }} accessibilityLiveRegion="assertive">
          <Text style={[font(800, 'display'), { fontSize: 28, color: '#0a0f1c' }]}>{flash.ok ? '✓ ' : ''}{flash.text}</Text>
          {flash.sub ? <Text style={[font(600), { fontSize: 18, color: '#0a0f1c' }]}>{flash.sub}</Text> : null}
        </View>
      ) : null}

      <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column', gap: 16, padding: 16 }}>
        <View style={{ width: wide ? 360 : '100%', gap: 12 }}>
          {scan ? <Scanner onCode={(c) => { setScan(false); byCode(c); }} onClose={() => setScan(false)} />
            : <DarkButton label="📷  Scan a ticket" tone="gold" big onPress={() => setScan(true)} />}
          {walkin ? (
            <Panel>
              <H>Walk-in guest</H>
              {(['name', 'email', 'table'] as const).map((k) => (
                <TextInput key={k} value={walkin[k]} onChangeText={(v) => setWalkin({ ...walkin, [k]: v })} placeholder={k === 'name' ? 'Name' : k === 'email' ? 'Email (optional)' : 'Table (optional)'}
                  placeholderTextColor={N.ink3} autoCapitalize={k === 'email' ? 'none' : 'words'}
                  style={[font(500), { minHeight: 50, borderRadius: 12, paddingHorizontal: 14, backgroundColor: N.panel2, color: N.ink, fontSize: 17, outlineStyle: 'none' } as any]} />
              ))}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <DarkButton label="Cancel" onPress={() => setWalkin(null)} />
                <DarkButton label="Add & check in" tone="seed" grow onPress={addWalkin} disabled={!walkin.name.trim()} />
              </View>
              <Text style={[font(500), { fontSize: 13, color: N.ink3 }]}>Collect payment for walk-ins at the desk, then log it from a volunteer device.</Text>
            </Panel>
          ) : null}
        </View>
        <View style={{ flex: 1, gap: 10 }}>
          <TextInput value={q} onChangeText={setQ} placeholder="Search name, email or ticket code" placeholderTextColor={N.ink3} autoCorrect={false}
            style={[font(500), { height: 58, borderRadius: 16, paddingHorizontal: 18, backgroundColor: N.panel, color: N.ink, fontSize: 19, outlineStyle: 'none' } as any]}
            onSubmitEditing={() => { if (/^[0-9a-f]{8}$/i.test(q.trim())) byCode(q.trim()); }} />
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 40 }}>
            {list.map((g) => (
              <Pressable key={g.id} onPress={() => checkIn(g)} accessibilityRole="button" accessibilityLabel={`${g.checked_in_at ? 'Already checked in: ' : 'Check in '}${g.name ?? 'guest'}`}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, backgroundColor: pressed ? N.panel2 : N.panel, opacity: g.checked_in_at ? 0.55 : 1 })}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[font(700), { fontSize: 19, color: N.ink }]}>{g.name || 'Guest'}</Text>
                  <Text style={[font(500), { fontSize: 14, color: N.ink2 }]} numberOfLines={1}>{[g.ticket ?? 'Walk-in', g.table_label ? `Table ${g.table_label}` : null, g.diet, g.kind === 'online' ? 'ONLINE TICKET' : null].filter(Boolean).join(' · ')}</Text>
                </View>
                <Text style={[font(800), { fontSize: 16, color: g.checked_in_at ? N.seed : N.gold }]}>{g.checked_in_at ? '✓ Here' : 'Check in'}</Text>
              </Pressable>
            ))}
            {list.length === 0 ? <Text style={[font(500), { fontSize: 16, color: N.ink3, padding: 10 }]}>{q ? 'No one by that name. Add them as a walk-in.' : 'No guests yet.'}</Text> : null}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

/** Camera QR scanner using the browser's BarcodeDetector (Chrome, Android, Edge; Safari 17+ partly). */
function Scanner({ onCode, onClose }: { onCode: (s: string) => void; onClose: () => void }) {
  const video = useRef<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') { setErr('Scanning works in the browser.'); return; }
    const BD = (window as any).BarcodeDetector;
    if (!BD) { setErr('This browser can\'t scan codes. Type the 8-character code under the QR into search instead.'); return; }
    let stream: MediaStream | null = null;
    let stop = false;
    const detector = new BD({ formats: ['qr_code'] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const loop = async () => {
          if (stop) return;
          try {
            const codes = await detector.detect(video.current);
            if (codes?.[0]?.rawValue) { stop = true; onCode(codes[0].rawValue); return; }
          } catch { /* frame not ready */ }
          setTimeout(loop, 250);
        };
        loop();
      } catch { setErr('Allow camera access to scan tickets.'); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return (
    <Panel style={{ padding: 10 }}>
      {err ? <Text style={[font(600), { fontSize: 16, color: N.ink, padding: 8 }]}>{err}</Text>
        : <View style={{ borderRadius: 14, overflow: 'hidden', aspectRatio: 1, backgroundColor: '#000' }}>
            {React.createElement('video', { ref: video, muted: true, playsInline: true, style: { width: '100%', height: '100%', objectFit: 'cover' } })}
          </View>}
      <DarkButton label="Close camera" onPress={onClose} />
    </Panel>
  );
}
