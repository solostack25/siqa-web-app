// The Siqa dashboard (dashboard.siqa.us, and /manage in the app): one place for everything a
// person runs on Siqa. Each thing they run is a "space" (store, Studio channel, nonprofit,
// masjid, Siqa admin). You land in the last space you used and switch from the top.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, ActivityIndicator, useWindowDimensions, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { font, radius, space, type, useDS } from '../lib/ds';
import { Icon, type SiqaIconName } from '../components/Icon';
import { Button, BottomSheet } from '../components/ui';
import { InDesktopShell } from '../components/DesktopShell';
import { InDashboard } from '../components/dashboard/context';
import { loadSpaces, lastSpace, rememberSpace, spaceKey, initials, SPACE_LABEL, type Space, type SpaceKind } from '../lib/spaces';
import { SECTIONS as MASJID_SECTIONS, type SectionKey } from '../components/masjid/admin/kit';
import { MasjidBody } from '../components/masjid/admin/MasjidBody';
import { OrgOverview } from '../components/dashboard/OrgOverview';
import { AdminMasjids } from '../components/dashboard/AdminMasjids';
import { backToSiqa, openOnSiqa } from '../components/dashboard/links';
import SellerDashboard from './seller-dashboard';
import StudioScreen from './studio';
import CreateHub from '../components/studio/CreateHub';
import AdminScreen from './admin';

type NavItem = { key: string; label: string; icon: SiqaIconName; route?: string; link?: string };

function navFor(s: Space): NavItem[] {
  switch (s.kind) {
    case 'store': return [
      { key: 'overview', label: 'Overview', icon: 'home-outline' },
      { key: 'add', label: 'Add product', icon: 'add-circle-outline', route: '/listing-create' },
      { key: 'plans', label: 'Plans', icon: 'ribbon-outline', route: '/sell' },
      { key: 'shop', label: 'View store', icon: 'open-outline', link: `/shop/${s.id}` },
    ];
    case 'studio': return [
      { key: 'overview', label: 'Overview', icon: 'stats-chart-outline' },
      { key: 'create', label: 'Create', icon: 'add-circle-outline' },
      { key: 'camera', label: 'Camera', icon: 'videocam-outline', route: '/go-live' },
      { key: 'watermark', label: 'Watermark', icon: 'water-outline', route: '/watermark' },
      { key: 'profile', label: 'Public profile', icon: 'open-outline', link: `/speaker/${s.id}` },
    ];
    case 'org': return [
      { key: 'overview', label: 'Overview', icon: 'home-outline' },
      { key: 'seed', label: 'Start a Seed', icon: 'leaf-outline', route: `/seed-create?orgId=${s.id}` },
      { key: 'page', label: 'Public page', icon: 'open-outline', link: `/org-profile?id=${s.id}` },
    ];
    case 'masjid': return MASJID_SECTIONS.map((m) => ({ key: m.key, label: m.label, icon: m.icon }));
    case 'admin': return [
      { key: 'overview', label: 'Review queue', icon: 'shield-checkmark-outline' },
      { key: 'masjids', label: 'Masjids', icon: 'business-outline' },
      { key: 'chai', label: 'Chai', icon: 'cafe-outline', route: '/chai-admin' },
    ];
  }
}

export default function Dashboard() {
  const { c, shadow } = useDS();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const params = useLocalSearchParams<{ space?: string; page?: string }>();

  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [signedIn, setSignedIn] = useState(true);
  const [email, setEmail] = useState('');
  const [current, setCurrent] = useState<string | null>(null);
  const [page, setPage] = useState<string>(params.page ?? 'overview');
  const [switcher, setSwitcher] = useState(false);
  const [more, setMore] = useState(false);
  const [extra, setExtra] = useState<Space | null>(null); // a masjid a Siqa admin opened from Admin → Masjids

  // Screens inside the dashboard switch pages with router.setParams({ page }).
  useEffect(() => { if (params.page) setPage(params.page); }, [params.page]);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSignedIn(false); setSpaces([]); return; }
    setEmail(session.user.email ?? '');
    const list = (await loadSpaces()) ?? [];
    setSpaces(list);
  }, []);
  useEffect(() => {
    load();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((e) => { if (e === 'SIGNED_IN' || e === 'SIGNED_OUT') setTimeout(load, 0); });
    return () => subscription.unsubscribe();
  }, [load]);

  // Pick the space: ?space=kind:id (or just kind), else the last one used, else the first.
  useEffect(() => {
    if (!spaces || !spaces.length) return;
    const want = params.space ?? lastSpace();
    let pick = spaces.find((s) => spaceKey(s) === want) ?? (want ? spaces.find((s) => s.kind === want.split(':')[0] && !want.includes(':')) : undefined);
    if (!pick && want?.startsWith('masjid:') && spaces.some((s) => s.kind === 'admin')) {
      const id = want.split(':')[1];
      supabase.rpc('my_masjids').then(({ data }) => {
        const m = ((data as any[]) || []).find((x) => x.id === id);
        if (m) { const sp: Space = { kind: 'masjid', id: m.id, name: m.org_name, label: 'Masjid', image: m.logo_url, role: 'siqa' }; setExtra(sp); setCurrent(spaceKey(sp)); }
      });
      return;
    }
    pick = pick ?? spaces[0];
    setCurrent(spaceKey(pick));
  }, [spaces, params.space]);

  const all = useMemo(() => (extra && spaces && !spaces.some((s) => spaceKey(s) === spaceKey(extra)) ? [...spaces, extra] : spaces ?? []), [spaces, extra]);
  const cur = all.find((s) => spaceKey(s) === current) ?? null;
  const nav = cur ? navFor(cur) : [];

  const choose = (s: Space) => {
    setCurrent(spaceKey(s)); rememberSpace(spaceKey(s)); setPage('overview'); setSwitcher(false);
    if (Platform.OS === 'web') try { router.setParams({ space: spaceKey(s), page: 'overview' } as any); } catch {}
  };
  const openItem = (n: NavItem) => {
    setMore(false);
    if (n.route) { router.push(n.route as any); return; }
    if (n.link) { openOnSiqa(n.link); return; }
    setPage(n.key);
    if (Platform.OS === 'web') try { router.setParams({ page: n.key } as any); } catch {}
  };
  const signOut = async () => { await supabase.auth.signOut(); router.replace('/sign-in' as any); };

  if (!spaces) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}><ActivityIndicator color={c.ink2} /></View>;
  if (!signedIn) return <SignedOut />;
  if (!all.length) return <NothingYet />;
  if (!cur) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  const body = (
    <InDesktopShell.Provider value={true}>
      <InDashboard.Provider value={true}>
        <SpaceBody s={cur} page={page} wide={wide} go={(p) => setPage(p)} openMasjid={(id) => {
          const m: Space = { kind: 'masjid', id, name: '', label: 'Masjid', image: null };
          const known = all.find((s) => s.kind === 'masjid' && s.id === id);
          if (known) choose(known);
          else supabase.rpc('my_masjids').then(({ data }) => {
            const x = ((data as any[]) || []).find((r) => r.id === id);
            if (x) { const sp = { ...m, name: x.org_name, image: x.logo_url, role: 'siqa' }; setExtra(sp); choose(sp); }
          });
        }} />
      </InDashboard.Provider>
    </InDesktopShell.Provider>
  );
  // Masjid sections and the org overview lay themselves out as page content; the embedded
  // screens (store, Studio, admin) bring their own scrolling.
  const selfScrolling = (cur.kind === 'store' || cur.kind === 'studio' || cur.kind === 'admin') && page === 'overview';

  const spaceButton = (compact = false) => (
    <Pressable onPress={() => setSwitcher(true)} accessibilityRole="button" accessibilityLabel={`${cur.name}, ${cur.label}. Switch`}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: compact ? 10 : space[3], borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, opacity: pressed ? 0.85 : 1 }, shadow('hairline')]}>
      <Avatar s={cur} size={compact ? 34 : 38} />
      <View style={{ flex: 1 }}>
        <Text style={[type.subhead, font(700), { color: c.ink }]} numberOfLines={1}>{cur.name}</Text>
        <Text style={[type.micro, { color: c.ink2 }]} numberOfLines={1}>{cur.label}{all.length > 1 ? ` · ${all.length} spaces` : ''}</Text>
      </View>
      <Icon name="chevron-expand-outline" size={16} color={c.ink2} />
    </Pressable>
  );

  const sheets = (
    <>
      <BottomSheet visible={switcher} onClose={() => setSwitcher(false)} title="What do you want to manage?">
        <View style={{ gap: space[2] }}>
          {all.map((s) => {
            const on = spaceKey(s) === current;
            return (
              <Pressable key={spaceKey(s)} onPress={() => choose(s)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.lg, backgroundColor: on ? c.goldTint : c.surfaceSoft, borderWidth: 1.5, borderColor: on ? c.gold : 'transparent' }}>
                <Avatar s={s} size={42} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, font(700), { color: c.ink }]} numberOfLines={1}>{s.name}</Text>
                  <Text style={[type.caption, { color: c.ink2 }]}>{SPACE_LABEL[s.kind]}</Text>
                </View>
                {on ? <Text style={[type.caption, font(700), { color: c.ink }]}>Current</Text> : null}
              </Pressable>
            );
          })}
          <StartSomething />
        </View>
      </BottomSheet>
      <BottomSheet visible={more} onClose={() => setMore(false)} title={cur.name}>
        <View>
          {nav.slice(4).map((n) => (
            <Pressable key={n.key} onPress={() => openItem(n)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 54, borderBottomWidth: 1, borderBottomColor: c.line }}>
              <Icon name={n.icon} size={22} color={c.ink} />
              <Text style={[type.body, font(500), { color: c.ink, flex: 1 }]}>{n.label}</Text>
              <Icon name="chevron-forward" size={16} color={c.ink3} />
            </Pressable>
          ))}
          <Pressable onPress={backToSiqa} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 54, borderBottomWidth: 1, borderBottomColor: c.line }}>
            <Icon name="arrow-back-outline" size={22} color={c.ink} /><Text style={[type.body, font(500), { color: c.ink }]}>Back to Siqa</Text>
          </Pressable>
          <Pressable onPress={signOut} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 54 }}>
            <Icon name="log-out-outline" size={22} color={c.danger} /><Text style={[type.body, font(500), { color: c.danger }]}>Sign out</Text>
          </Pressable>
        </View>
      </BottomSheet>
    </>
  );

  if (wide) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.bgSunk }}>
        <View style={{ width: 252, backgroundColor: c.bg, borderRightWidth: 1, borderRightColor: c.line, padding: space[4], gap: 4 }}>
          <View style={{ paddingHorizontal: 6, paddingBottom: space[4] }}><Brand /></View>
          {spaceButton()}
          <View style={{ height: space[3] }} />
          {nav.map((n) => {
            const on = !n.route && !n.link && n.key === page;
            return (
              <Pressable key={n.key} onPress={() => openItem(n)} accessibilityRole="link" accessibilityState={{ selected: on }}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], height: 42, paddingHorizontal: space[3], borderRadius: radius.md, backgroundColor: on ? c.surfaceSoft : pressed ? c.bgSunk : 'transparent' })}>
                <Icon name={n.icon} size={20} color={on ? c.ink : c.ink2} />
                <Text style={[type.subhead, font(on ? 700 : 500), { color: on ? c.ink : c.ink2, flex: 1 }]}>{n.label}</Text>
                {n.link ? <Icon name="open-outline" size={14} color={c.ink3} /> : null}
              </Pressable>
            );
          })}
          <View style={{ flex: 1 }} />
          <Pressable onPress={backToSiqa} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], height: 42, paddingHorizontal: space[3] }}>
            <Icon name="arrow-back-outline" size={20} color={c.ink2} /><Text style={[type.subhead, { color: c.ink2 }]}>Back to Siqa</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingTop: space[3], paddingHorizontal: space[2], borderTopWidth: 1, borderTopColor: c.line }}>
            <Text style={[type.caption, { color: c.ink2, flex: 1 }]} numberOfLines={1}>{email}</Text>
            <Pressable onPress={signOut} accessibilityRole="button" hitSlop={8}><Text style={[type.caption, font(600), { color: c.ink }]}>Sign out</Text></Pressable>
          </View>
        </View>
        {selfScrolling ? <View style={{ flex: 1 }}>{body}</View> : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space[10], paddingBottom: 80, maxWidth: 1240, width: '100%', alignSelf: 'center', gap: space[6] }}>{body}</ScrollView>
        )}
        {sheets}
      </View>
    );
  }

  const tabs = nav.length > 5 ? [...nav.slice(0, 4), { key: '__more', label: 'More', icon: 'ellipsis-horizontal' as SiqaIconName }] : nav;
  return (
    <View style={{ flex: 1, backgroundColor: c.bgSunk }}>
      <View style={{ paddingTop: insets.top + space[3], paddingHorizontal: space[5], paddingBottom: space[3], backgroundColor: c.bg, borderBottomWidth: 1, borderBottomColor: c.line, gap: space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Brand />
          <Pressable onPress={backToSiqa} accessibilityRole="link" hitSlop={8}><Text style={[type.caption, font(600), { color: c.ink2 }]}>Back to Siqa</Text></Pressable>
        </View>
        {spaceButton(true)}
      </View>
      {selfScrolling ? <View style={{ flex: 1 }}>{body}</View> : (
        <ScrollView contentContainerStyle={{ padding: space[5], paddingBottom: 40, gap: space[5] }}>{body}</ScrollView>
      )}
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', justifyContent: 'space-around', paddingTop: 8, paddingBottom: insets.bottom + 8, backgroundColor: c.bg, borderTopWidth: 1, borderTopColor: c.line }}>
        {tabs.map((n) => {
          const on = n.key === page;
          return (
            <Pressable key={n.key} onPress={() => n.key === '__more' ? setMore(true) : openItem(n as NavItem)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={{ alignItems: 'center', gap: 3, minWidth: 60, paddingVertical: 4 }}>
              <Icon name={n.icon} size={23} color={on ? c.ink : c.ink3} />
              <Text style={[{ fontSize: 11, lineHeight: 14 }, font(on ? 700 : 600), { color: on ? c.ink : c.ink3 }]} numberOfLines={1}>{n.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {sheets}
    </View>
  );
}

function SpaceBody({ s, page, wide, go, openMasjid }: { s: Space; page: string; wide: boolean; go: (p: string) => void; openMasjid: (id: string) => void }) {
  switch (s.kind) {
    case 'store': return <SellerDashboard />;
    case 'studio': return page === 'create' ? <CreateHub wide={wide} /> : <StudioScreen />;
    case 'org': return <OrgOverview orgId={s.id} wide={wide} />;
    case 'masjid':
      return <MasjidBody key={s.id} section={(page as SectionKey) || 'overview'} wide={wide} go={(p) => go(p)}
        masjid={{ id: s.id, org_name: s.name, city: null, state: null, logo_url: s.image, my_role: s.role ?? 'owner' }} />;
    case 'admin':
      return page === 'masjids' ? <AdminMasjids onOpen={openMasjid} /> : <AdminScreen />;
  }
}

function Avatar({ s, size }: { s: Space; size: number }) {
  const { c } = useDS();
  if (s.image) return <Image source={{ uri: s.image }} style={{ width: size, height: size, borderRadius: size * 0.27, backgroundColor: c.surfaceSoft }} />;
  const tone: Record<SpaceKind, [string, string]> = {
    store: [c.goldTint, c.goldInk], studio: [c.surfaceStrong, c.ink], org: [c.seedTint, c.seed], masjid: [c.goldTint, c.goldInk], admin: ['#0a0f1c', '#d4ac73'],
  };
  const [bg, fg] = tone[s.kind];
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.27, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[type.subhead, font(800, 'display'), { color: fg }]}>{s.kind === 'admin' ? 'ص' : initials(s.name)}</Text>
    </View>
  );
}

function Brand() {
  const { c } = useDS();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
      <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#0a0f1c', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#d4ac73', fontSize: 18, fontWeight: '700' }}>ص</Text>
      </View>
      <Text style={[type.headline, font(800, 'display'), { color: c.ink }]}>Dashboard</Text>
    </View>
  );
}

const START: { icon: SiqaIconName; title: string; sub: string; route: string }[] = [
  { icon: 'storefront-outline', title: 'Open a store', sub: 'Free up to 10 products', route: '/sell' },
  { icon: 'mic-outline', title: 'Apply as a speaker', sub: 'Siqa reviews every speaker', route: '/apply-speaker' },
  { icon: 'leaf-outline', title: 'Register a nonprofit', sub: 'Start Seeds and take donations', route: '/org-register' },
];

function StartSomething() {
  const { c } = useDS();
  const [open, setOpen] = useState(false);
  if (!open) return <Button label="Start something new" icon="add" variant="soft" size="md" onPress={() => setOpen(true)} />;
  return <View style={{ gap: space[2] }}>{START.map((s) => <StartRow key={s.route} {...s} c={c} />)}<MasjidRow /></View>;
}
function StartRow({ icon, title, sub, route, c }: (typeof START)[number] & { c: any }) {
  return (
    <Pressable onPress={() => router.push(route as any)} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.lg, backgroundColor: c.surfaceSoft }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={20} color={c.ink} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, font(700), { color: c.ink }]}>{title}</Text>
        <Text style={[type.caption, { color: c.ink2 }]}>{sub}</Text>
      </View>
    </Pressable>
  );
}
function MasjidRow() {
  const { c } = useDS();
  return (
    <Pressable onPress={() => openOnSiqa('/support')} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.lg, backgroundColor: c.surfaceSoft }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}><Icon name="business-outline" size={20} color={c.ink} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, font(700), { color: c.ink }]}>Add your masjid</Text>
        <Text style={[type.caption, { color: c.ink2 }]}>Prayer times, TV screens, live khutbahs. Siqa sets it up with you.</Text>
      </View>
    </Pressable>
  );
}

function SignedOut() {
  const { c } = useDS();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: space[6] }}>
      <View style={{ width: '100%', maxWidth: 420, alignItems: 'center', gap: space[4] }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: '#0a0f1c', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#d4ac73', fontSize: 32, fontWeight: '700' }}>ص</Text></View>
        <Text style={[type.title1, { color: c.ink, textAlign: 'center' }]}>Siqa Dashboard</Text>
        <Text style={[type.callout, { color: c.ink2, textAlign: 'center' }]}>Your store, Studio, organization or masjid, in one place. Sign in with your Siqa account.</Text>
        <Button label="Sign in" onPress={() => router.push('/sign-in' as any)} style={{ alignSelf: 'stretch' }} />
        <Button label="Go to Siqa" variant="ghost" onPress={backToSiqa} />
      </View>
    </ScrollView>
  );
}

function NothingYet() {
  const { c } = useDS();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ flexGrow: 1, alignItems: 'center', padding: space[6], paddingTop: insets.top + space[10] }}>
      <View style={{ width: '100%', maxWidth: 460, gap: space[4] }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: '#0a0f1c', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#d4ac73', fontSize: 32, fontWeight: '700' }}>ص</Text></View>
        <Text style={[type.title1, { color: c.ink }]}>You don't run anything on Siqa yet</Text>
        <Text style={[type.callout, { color: c.ink2 }]}>The dashboard is for people who sell, teach or run an organization or masjid on Siqa.</Text>
        {START.map((s) => <StartRow key={s.route} {...s} c={c} />)}
        <MasjidRow />
        <Button label="Back to the Siqa app" variant="secondary" onPress={backToSiqa} style={{ marginTop: space[4] }} />
      </View>
    </ScrollView>
  );
}
