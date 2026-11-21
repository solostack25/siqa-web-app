// Siqa for Masjids: the masjid console. Its own clutter-free shell (no Gems, Shop or
// nonprofit directory): prayer times, the schedule, announcements, Seeds, TV screens
// and the team. Masjid-only accounts land here when they open Siqa.

import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, useWindowDimensions, Image } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { font, radius, space, type, useDS } from '../lib/ds';
import { Icon } from '../components/Icon';
import { Button, TextField, BottomSheet } from '../components/ui';
import { SECTIONS, type MasjidRef, type SectionKey, Choice } from '../components/masjid/admin/kit';
import { Overview } from '../components/masjid/admin/Overview';
import { PrayerTimesSection } from '../components/masjid/admin/PrayerTimes';
import { ScheduleSection } from '../components/masjid/admin/Schedule';
import { AnnouncementsSection } from '../components/masjid/admin/Announcements';
import { SeedsSection } from '../components/masjid/admin/Seeds';
import { ScreensSection } from '../components/masjid/admin/Screens';
import { TeamSection } from '../components/masjid/admin/Team';
import { isMasjidOnly, loadAccountKind, setWantsFullApp } from '../lib/accountKind';
import { US_TIMEZONES, masjidInitials } from '../lib/masjid';
import { showToast } from '../components/Toast';

const PICK_KEY = 'siqa_masjid_console_org';

export default function MasjidConsole() {
  const { c, shadow } = useDS();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const params = useLocalSearchParams<{ org?: string; section?: string }>();

  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(true);
  const [masjids, setMasjids] = useState<MasjidRef[]>([]);
  const [orgId, setOrgId] = useState<string | null>(params.org ?? null);
  const [section, setSection] = useState<SectionKey>((params.section as SectionKey) || 'overview');
  const [isSiqaAdmin, setIsSiqaAdmin] = useState(false);
  const [masjidOnly, setMasjidOnly] = useState(false);
  const [picker, setPicker] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSignedIn(false); setLoading(false); return; }
    const [{ data }, kind] = await Promise.all([supabase.rpc('my_masjids'), loadAccountKind()]);
    const list = (data as MasjidRef[]) || [];
    setMasjids(list);
    setIsSiqaAdmin(kind?.role === 'admin');
    setMasjidOnly(isMasjidOnly(kind));
    let pick = params.org ?? null;
    try { pick = pick ?? localStorage.getItem(PICK_KEY); } catch {}
    if (!pick || !list.some((m) => m.id === pick)) pick = list[0]?.id ?? null;
    setOrgId(pick);
    setLoading(false);
  }, [params.org]);
  useEffect(() => { load(); }, [load]);

  const choose = (id: string) => { setOrgId(id); setPicker(false); try { localStorage.setItem(PICK_KEY, id); } catch {} };
  const masjid = masjids.find((m) => m.id === orgId) ?? null;
  const go = (s: SectionKey) => setSection(s);

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}><ActivityIndicator color={c.ink2} /></View>;

  if (!signedIn) {
    return (
      <Centered>
        <Brand />
        <Text style={[type.title1, { color: c.ink, textAlign: 'center' }]}>Siqa for Masjids</Text>
        <Text style={[type.callout, { color: c.ink2, textAlign: 'center', maxWidth: 380 }]}>Sign in with the account Siqa set up for your masjid.</Text>
        <Button label="Sign in" onPress={() => router.push('/sign-in' as any)} style={{ alignSelf: 'stretch' }} />
      </Centered>
    );
  }

  if (!masjid) {
    return (
      <Centered>
        <Brand />
        <Text style={[type.title1, { color: c.ink, textAlign: 'center' }]}>No masjid on this account yet</Text>
        <Text style={[type.callout, { color: c.ink2, textAlign: 'center', maxWidth: 420 }]}>
          {isSiqaAdmin ? 'Set up the first masjid, then add its people from Team.' : 'Ask Siqa to add your account to your masjid. Email info@siqa.us.'}
        </Text>
        {isSiqaAdmin ? <Button label="Set up a masjid" icon="add" onPress={() => setCreating(true)} style={{ alignSelf: 'stretch' }} /> : null}
        <Button label="Back to Siqa" variant="ghost" onPress={() => router.replace('/(tabs)/home' as any)} />
        <CreateMasjidSheet visible={creating} onClose={() => setCreating(false)} onCreated={async (id) => { setCreating(false); await load(); choose(id); }} />
      </Centered>
    );
  }

  const body = (() => {
    const p = { masjid, go, wide };
    switch (section) {
      case 'prayer': return <PrayerTimesSection {...p} />;
      case 'schedule': return <ScheduleSection {...p} />;
      case 'announcements': return <AnnouncementsSection {...p} />;
      case 'seeds': return <SeedsSection {...p} />;
      case 'screens': return <ScreensSection {...p} />;
      case 'team': return <TeamSection {...p} />;
      default: return <Overview {...p} />;
    }
  })();

  const masjidButton = (
    <Pressable
      onPress={() => setPicker(true)}
      accessibilityRole="button"
      accessibilityLabel={`${masjid.org_name}. Switch masjid`}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, opacity: pressed ? 0.85 : 1 }, shadow('hairline')]}
    >
      <Logo m={masjid} size={38} />
      <View style={{ flex: 1 }}>
        <Text style={[type.subhead, font(700), { color: c.ink }]} numberOfLines={1}>{masjid.org_name}</Text>
        <Text style={[type.micro, { color: c.ink2 }]} numberOfLines={1}>{[masjid.city, masjid.state].filter(Boolean).join(', ') || 'Masjid'}</Text>
      </View>
      <Icon name="chevron-expand-outline" size={16} color={c.ink2} />
    </Pressable>
  );

  const fullApp = () => { setWantsFullApp(true); router.replace('/(tabs)/home' as any); };
  const signOut = async () => { await supabase.auth.signOut(); router.replace('/sign-in' as any); };

  const sheets = (
    <>
      <BottomSheet visible={picker} onClose={() => setPicker(false)} title="Your masjids">
        <View style={{ gap: space[2] }}>
          {masjids.map((m) => (
            <Pressable key={m.id} onPress={() => choose(m.id)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 10 }}>
              <Logo m={m} size={36} />
              <Text style={[type.body, font(m.id === orgId ? 700 : 500), { color: c.ink, flex: 1 }]}>{m.org_name}</Text>
              {m.id === orgId ? <Icon name="checkmark" size={18} color={c.ink} /> : null}
            </Pressable>
          ))}
          {isSiqaAdmin ? <Button label="Set up a masjid" icon="add" variant="secondary" size="md" onPress={() => { setPicker(false); setCreating(true); }} /> : null}
        </View>
      </BottomSheet>
      <CreateMasjidSheet visible={creating} onClose={() => setCreating(false)} onCreated={async (id) => { setCreating(false); await load(); choose(id); }} />
    </>
  );

  if (wide) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.bgSunk }}>
        <View style={{ width: 252, backgroundColor: c.bg, borderRightWidth: 1, borderRightColor: c.line, padding: space[4], gap: 4 }}>
          <View style={{ paddingHorizontal: 6, paddingBottom: space[4] }}><Brand small /></View>
          {masjidButton}
          <View style={{ height: space[3] }} />
          {SECTIONS.map((s) => {
            const on = s.key === section;
            return (
              <Pressable key={s.key} onPress={() => go(s.key)} accessibilityRole="link" accessibilityState={{ selected: on }}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], height: 42, paddingHorizontal: space[3], borderRadius: radius.md, backgroundColor: on ? c.surfaceSoft : pressed ? c.bgSunk : 'transparent' })}>
                <Icon name={s.icon} size={20} color={on ? c.ink : c.ink2} />
                <Text style={[type.subhead, font(on ? 700 : 500), { color: on ? c.ink : c.ink2 }]}>{s.label}</Text>
              </Pressable>
            );
          })}
          <View style={{ flex: 1 }} />
          {masjidOnly ? (
            <Pressable onPress={fullApp} accessibilityRole="link" style={{ padding: space[3] }}>
              <Text style={[type.caption, font(600), { color: c.goldInk }]}>Open the full Siqa app</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => router.replace('/(tabs)/home' as any)} accessibilityRole="link" style={{ padding: space[3] }}>
              <Text style={[type.caption, font(600), { color: c.goldInk }]}>Back to Siqa</Text>
            </Pressable>
          )}
          <Pressable onPress={signOut} accessibilityRole="button" style={{ paddingHorizontal: space[3], paddingBottom: space[2] }}>
            <Text style={[type.caption, { color: c.ink2 }]}>Sign out</Text>
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space[10], paddingBottom: 80, maxWidth: 1240, width: '100%', alignSelf: 'center', gap: space[6] }}>
          {body}
        </ScrollView>
        {sheets}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bgSunk }}>
      <View style={{ paddingTop: insets.top + space[3], paddingHorizontal: space[5], paddingBottom: space[3], backgroundColor: c.bg, borderBottomWidth: 1, borderBottomColor: c.line, gap: space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Brand small />
          <Pressable onPress={masjidOnly ? signOut : () => router.replace('/(tabs)/home' as any)} accessibilityRole="button" hitSlop={8}>
            <Text style={[type.caption, font(600), { color: c.ink2 }]}>{masjidOnly ? 'Sign out' : 'Back to Siqa'}</Text>
          </Pressable>
        </View>
        {masjidButton}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
          <Choice label="Section" options={SECTIONS.map((s) => ({ value: s.key, label: s.label }))} value={section} onChange={go} />
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ padding: space[5], paddingBottom: insets.bottom + 60, gap: space[5] }}>
        {body}
        {masjidOnly ? (
          <Pressable onPress={fullApp} accessibilityRole="link" style={{ alignSelf: 'center', padding: space[3] }}>
            <Text style={[type.caption, font(600), { color: c.goldInk }]}>Open the full Siqa app</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      {sheets}
    </View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  const { c } = useDS();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: space[6] }}>
      <View style={{ width: '100%', maxWidth: 440, alignItems: 'center', gap: space[4] }}>{children}</View>
    </ScrollView>
  );
}

export function Brand({ small }: { small?: boolean }) {
  const { c } = useDS();
  const s = small ? 30 : 56;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
      <View style={{ width: s, height: s, borderRadius: s * 0.28, backgroundColor: '#0a0f1c', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#d4ac73', fontSize: s * 0.6, fontWeight: '700' }}>ص</Text>
      </View>
      {small ? <Text style={[type.headline, font(800, 'display'), { color: c.ink }]}>Siqa for Masjids</Text> : null}
    </View>
  );
}

function Logo({ m, size }: { m: MasjidRef; size: number }) {
  const { c } = useDS();
  if (m.logo_url) return <Image source={{ uri: m.logo_url }} style={{ width: size, height: size, borderRadius: size * 0.27, backgroundColor: c.surfaceSoft }} />;
  const initials = masjidInitials(m.org_name);
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.27, backgroundColor: c.goldTint, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[type.subhead, font(800, 'display'), { color: c.goldInk }]}>{initials}</Text>
    </View>
  );
}

function CreateMasjidSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('Houston');
  const [state, setState] = useState('TX');
  const [tz, setTz] = useState('America/Chicago');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('masjid_create', { p_name: name.trim(), p_city: city.trim(), p_state: state.trim().toUpperCase(), p_timezone: tz });
    setBusy(false);
    if (error) { showToast(error.message); return; }
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
      </View>
    </BottomSheet>
  );
}
