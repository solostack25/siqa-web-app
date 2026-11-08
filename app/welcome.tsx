import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, StyleSheet, useWindowDimensions, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, G } from 'react-native-svg';
import { Icon, type SiqaIconName } from '../components/Icon';
import { SeedsIcon } from '../components/Siqa';
import { font, useDS } from '../lib/ds';
import { setSkipWelcome, appStartPath } from '../lib/welcome';
import { supabase } from '../lib/supabase';

/**
 * siqa.us welcome page (web only), playful version: a warm greeting, a
 * collage of app pieces, a "What are you in the mood for?" picker that shows
 * where each part of the app lives, a teaser for what's coming, why to trust
 * Siqa, and ways to join. First-time visitors land here from "/"; see
 * lib/welcome.ts.
 */

// Fixed brand colors for the hero and the colored blocks (same in both themes).
const B = {
  night: '#0a0f1c',
  nightInk: '#edf1f7',
  nightInk2: '#b9c3d6',
  brandGold: '#d4ac73',
  goldText: '#e6c290',
  sand: '#f7f1e4',
  gold: '#a8843f',
  goldInk: '#7e6330',
  seed: '#1b6b4a',
  seedTint: '#e7f0ea',
  ink: '#111111',
  ink2: '#5e5e5e',
};

type MoodKey = 'learn' | 'give' | 'shop' | 'connect';
type Spot = {
  label: string; where: string; title: string; body: string; points: string[]; cta: string; href: string;
  bg: string; fg: string; tagBg: string; btnBg: string; btnFg: string;
};
const SPOTS: Record<MoodKey, Spot> = {
  learn: { label: 'Learn something', where: 'Gems · the ▶ button', title: 'Watch something good', body: 'Short clips and full talks, straight from each speaker’s official channel.', points: ['Quick reminders', 'Full khutbahs and lectures', 'Real talks, not AI'], cta: 'Open Gems', href: '/gems', bg: B.night, fg: B.nightInk, tagBg: 'rgba(212,172,115,0.2)', btnBg: B.brandGold, btnFg: B.night },
  give: { label: 'Give back', where: 'Seeds tab', title: 'Plant a Seed', body: 'Back a masjid or nonprofit campaign with a clear goal.', points: ['Masjid and nonprofit campaigns', 'Watch the progress grow', 'Share it with family'], cta: 'See Seeds', href: '/seeds', bg: B.seed, fg: '#ffffff', tagBg: 'rgba(255,255,255,0.18)', btnBg: '#ffffff', btnFg: B.seed },
  shop: { label: 'Shop', where: 'Shop tab', title: 'Shop Muslim-owned', body: 'Products from Muslim-owned sellers, plus local services near you.', points: ['Handmade and small-batch goods', 'Local services near you', 'Message sellers directly'], cta: 'Browse the Shop', href: '/marketplace', bg: B.gold, fg: B.ink, tagBg: 'rgba(255,255,255,0.3)', btnBg: B.ink, btnFg: '#ffffff' },
  connect: { label: 'Find my community', where: 'Orgs tab', title: 'Find your people', body: 'Masjids, schools and nonprofits near you, all in one place.', points: ['Follow your masjid', 'See their Seeds and videos', 'Find one near you'], cta: 'Find organizations', href: '/orgs', bg: B.sand, fg: B.ink, tagBg: '#ffffff', btnBg: B.ink, btnFg: '#ffffff' },
};
const MOODS: MoodKey[] = ['learn', 'give', 'shop', 'connect'];

function Stars({ width, height }: { width: number; height: number }) {
  // Faint eight-point stars, like tile work. Decorative only.
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <G fill="none" stroke={B.gold} strokeWidth={1.3} opacity={0.17}>
        <Path d={`M${width - 70} 40l16 38 38 16-38 16-16 38-16-38-38-16 38-16z`} />
        <Path d={`M${width - 70} 54l28 28v38l-28 28-28-28V82z`} />
        <Path d={`M48 ${height - 150}l11 26 26 11-26 11-11 26-11-26-26-11 26-11z`} />
        <Path d={`M${width * 0.55} ${height - 60}l9 21 21 9-21 9-9 21-9-21-21-9 21-9z`} />
      </G>
    </Svg>
  );
}

function Collage({ wide }: { wide: boolean }) {
  const k = wide ? 1.3 : 1; // scale everything up on desktop
  const card = (style: ViewStyle) => [style, { boxShadow: '0px 16px 40px rgba(10,15,28,0.18)' } as ViewStyle];
  return (
    <View style={{ height: 250 * k, width: '100%', maxWidth: 380 * k, alignSelf: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* Gem */}
      <View style={card({ position: 'absolute', left: 0, top: 10 * k, width: 170 * k, height: 210 * k, borderRadius: 22 * k, backgroundColor: B.night, padding: 16 * k, justifyContent: 'space-between', transform: [{ rotate: '-5deg' }] })}>
        <View style={[s.pill, { backgroundColor: 'rgba(212,172,115,0.18)', height: 24 * k }]}>
          <Text style={[{ color: B.goldText, fontSize: 11 * k }, font(700)]}>Gem</Text>
        </View>
        <View style={{ alignSelf: 'center', width: 58 * k, height: 58 * k, borderRadius: 999, backgroundColor: B.brandGold, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="play" size={24 * k} color={B.night} />
        </View>
        <View style={{ gap: 6 * k }}>
          <View style={{ height: 8 * k, width: 116 * k, borderRadius: 4, backgroundColor: 'rgba(237,241,247,0.7)' }} />
          <View style={{ height: 8 * k, width: 76 * k, borderRadius: 4, backgroundColor: 'rgba(237,241,247,0.35)' }} />
        </View>
      </View>
      {/* Seed */}
      <View style={card({ position: 'absolute', right: 0, top: 0, width: 184 * k, borderRadius: 20 * k, backgroundColor: '#ffffff', padding: 14 * k, gap: 10 * k, transform: [{ rotate: '4deg' }] })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 30 * k, height: 30 * k, borderRadius: 9 * k, backgroundColor: B.seedTint, alignItems: 'center', justifyContent: 'center' }}>
            <SeedsIcon size={17 * k} color={B.seed} />
          </View>
          <Text style={[{ color: B.ink, fontSize: 13 * k }, font(700)]}>Plant a Seed</Text>
        </View>
        <View style={{ height: 8 * k, borderRadius: 999, backgroundColor: '#e4e4e1', overflow: 'hidden' }}>
          <View style={{ height: '100%', width: '64%', borderRadius: 999, backgroundColor: B.seed }} />
        </View>
        <Text style={[{ color: B.ink2, fontSize: 11 * k }, font(600)]}>Masjid campaign · growing</Text>
      </View>
      {/* Shop */}
      <View style={[{ position: 'absolute', right: 18 * k, top: 118 * k, width: 150 * k, borderRadius: 18 * k, backgroundColor: B.gold, padding: 14 * k, flexDirection: 'row', alignItems: 'center', gap: 10, transform: [{ rotate: '-3deg' }] }, { boxShadow: '0px 12px 28px rgba(168,132,63,0.35)' } as ViewStyle]}>
        <Icon name="bag-handle-outline" size={22 * k} color={B.ink} />
        <Text style={[{ flex: 1, color: B.ink, fontSize: 13 * k, lineHeight: 16 * k }, font(700)]}>Muslim-owned shops</Text>
      </View>
      {/* Verified */}
      <View style={[{ position: 'absolute', left: 116 * k, top: 198 * k, height: 40 * k, paddingLeft: 8 * k, paddingRight: 14 * k, borderRadius: 999, backgroundColor: '#ffffff', flexDirection: 'row', alignItems: 'center', gap: 8, transform: [{ rotate: '2deg' }] }, { boxShadow: '0px 8px 20px rgba(0,0,0,0.12)' } as ViewStyle]}>
        <View style={{ width: 26 * k, height: 26 * k, borderRadius: 999, backgroundColor: B.seed, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="checkmark" size={15 * k} color="#ffffff" />
        </View>
        <Text style={[{ color: B.ink, fontSize: 12 * k }, font(700)]}>Official channel</Text>
      </View>
    </View>
  );
}

export default function Welcome() {
  const { c, shadow } = useDS();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 900;
  const [mood, setMood] = useState<MoodKey>('learn');
  const [skipNext, setSkipNext] = useState(false);
  const spot = SPOTS[mood];

  const pad = wide ? 40 : 20;
  const wrap = { width: '100%' as const, maxWidth: 1200, alignSelf: 'center' as const, paddingHorizontal: pad };
  const go = (href: string) => router.push(href as any);
  // Signed-in people see "Open Siqa" instead of "Sign in".
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(!!session));
    return () => subscription.unsubscribe();
  }, []);
  const enterApp = () => {
    if (skipNext) setSkipWelcome();
    router.replace(appStartPath(wide) as any);
  };

  const trust = ['From official channels', 'Checked nonprofits', 'Claimed profiles marked'];
  const soon: { icon: SiqaIconName; title: string; body: string }[] = [
    { icon: 'help-circle-outline', title: 'Quizzes', body: 'Test your Seerah and history knowledge in Chai.' },
    { icon: 'stats-chart-outline', title: 'Polls', body: 'Weigh in on community questions and see how others voted.' },
  ];
  const join: { icon: SiqaIconName; title: string; action: string; href: string }[] = [
    { icon: 'mic-outline', title: 'Speakers', action: wide ? 'Apply to post Gems' : 'Apply', href: '/apply-speaker' },
    { icon: 'business-outline', title: 'Masjids and nonprofits', action: wide ? 'Register and start a Seed' : 'Register', href: '/org-register' },
    { icon: 'storefront-outline', title: 'Businesses', action: wide ? 'Sell or list your business' : 'Sell or list', href: '/sell' },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ flexGrow: 1 }}>
      {/* Hero */}
      <View style={{ backgroundColor: B.sand, paddingTop: insets.top, overflow: 'hidden' }}>
        <Stars width={width} height={wide ? 680 : 600} />
        <View style={wrap}>
          <View style={s.header}>
            <View style={s.brand}>
              <Image source={require('../assets/icon.png')} style={s.logo} accessibilityIgnoresInvertColors />
              <Text style={[{ color: B.ink, fontSize: 22, letterSpacing: -0.5 }, font(800, 'display')]}>Siqa</Text>
            </View>
            <Pressable
              onPress={() => (signedIn ? router.replace(appStartPath(wide) as any) : go('/(auth)/login'))}
              accessibilityRole="button"
              style={({ pressed }) => [s.signIn, { backgroundColor: wide ? B.ink : '#ffffff' }, !wide && shadow('hairline'), pressed && s.pressed]}
            >
              <Text style={[{ color: wide ? '#ffffff' : B.ink, fontSize: 14 }, font(700)]}>{signedIn ? 'Open Siqa' : 'Sign in'}</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', gap: wide ? 48 : 26, paddingTop: wide ? 40 : 20, paddingBottom: wide ? 80 : 36 }}>
            <View style={{ flex: wide ? 1.2 : undefined, gap: wide ? 20 : 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
                <Text style={{ color: B.gold, fontSize: wide ? 42 : 32, lineHeight: wide ? 54 : 42, fontWeight: '700' }} accessibilityLanguage="ar">أهلاً وسهلاً</Text>
                <Text style={[{ color: B.goldInk, fontSize: wide ? 16 : 14 }, font(600)]}>Ahlan wa sahlan</Text>
              </View>
              <Text
                accessibilityRole="header"
                style={[{ color: B.night, fontSize: wide ? 62 : 38, lineHeight: wide ? 64 : 40, letterSpacing: wide ? -2.2 : -1.3 }, font(800, 'display')]}
              >
                Your corner of the ummah, all in one app.
              </Text>
              <Text style={[{ color: B.ink2, fontSize: wide ? 19 : 16, lineHeight: wide ? 29 : 24, maxWidth: 560 }, font(400)]}>
                Watch, give, shop and meet your community. Tell us what you're in the mood for and we'll point the way.
              </Text>
              {wide ? (
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                  <Pressable onPress={() => go('/gems')} accessibilityRole="button" style={({ pressed }) => [s.bigBtn, { backgroundColor: B.ink }, shadow('primary'), pressed && s.pressed]}>
                    <Text style={[{ color: '#ffffff', fontSize: 16 }, font(700)]}>Start watching</Text>
                    <Icon name="arrow-forward" size={18} color="#ffffff" />
                  </Pressable>
                  <Pressable onPress={enterApp} accessibilityRole="button" style={({ pressed }) => [s.bigBtn, { backgroundColor: '#ffffff' }, shadow('hairline'), pressed && s.pressed]}>
                    <Text style={[{ color: B.ink, fontSize: 16 }, font(700)]}>Skip to the app</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
            <View style={{ flex: wide ? 1 : undefined }}>
              <Collage wide={wide} />
            </View>
          </View>
        </View>
      </View>

      {/* Mood picker */}
      <View style={[wrap, { paddingTop: wide ? 80 : 32, flexDirection: wide ? 'row' : 'column', gap: wide ? 48 : 16, alignItems: wide ? 'flex-start' : 'stretch' }]}>
        <View style={{ flex: wide ? 1 : undefined, gap: wide ? 20 : 16 }}>
          <Text accessibilityRole="header" style={[{ color: c.ink, fontSize: wide ? 40 : 26, lineHeight: wide ? 44 : 30, letterSpacing: wide ? -1.2 : -0.6 }, font(800, 'display')]}>
            What are you in the mood for?
          </Text>
          {wide ? <Text style={[{ color: c.ink2, fontSize: 17, lineHeight: 25 }, font(400)]}>Pick one. We'll show you where it lives in the app.</Text> : null}
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: wide ? 10 : 8 }}>
            {MOODS.map((k) => {
              const on = k === mood;
              return (
                <Pressable
                  key={k}
                  onPress={() => setMood(k)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  style={({ pressed }) => [
                    s.chip,
                    wide && { height: 48, paddingHorizontal: 22 },
                    on ? { backgroundColor: c.primary } : { backgroundColor: c.surface, borderWidth: 1, borderColor: c.line },
                    shadow(on ? 'card' : 'hairline'),
                    pressed && s.pressed,
                  ]}
                >
                  <Text style={[{ color: on ? c.onPrimary : c.ink, fontSize: wide ? 16 : 15 }, font(on ? 700 : 600)]}>{SPOTS[k].label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[{ flex: wide ? 1.5 : undefined, borderRadius: wide ? 28 : 26, padding: wide ? 36 : 22, gap: wide ? 16 : 14, backgroundColor: spot.bg }, shadow('raised')]}>
          <View style={[s.pill, { backgroundColor: spot.tagBg, height: wide ? 28 : 26 }]}>
            <Text style={[{ color: spot.fg, fontSize: wide ? 13 : 12 }, font(700)]}>{spot.where}</Text>
          </View>
          <Text style={[{ color: spot.fg, fontSize: wide ? 44 : 30, lineHeight: wide ? 48 : 34, letterSpacing: wide ? -1.4 : -0.8 }, font(800, 'display')]}>{spot.title}</Text>
          <Text style={[{ color: spot.fg, opacity: 0.86, fontSize: wide ? 18 : 16, lineHeight: wide ? 27 : 23, maxWidth: 520 }, font(400)]}>{spot.body}</Text>
          <View style={{ flexDirection: wide ? 'row' : 'column', flexWrap: 'wrap', gap: wide ? 10 : 8, columnGap: 24 }}>
            {spot.points.map((p) => (
              <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="checkmark" size={18} color={spot.fg} />
                <Text style={[{ color: spot.fg, fontSize: wide ? 16 : 15 }, font(600)]}>{p}</Text>
              </View>
            ))}
          </View>
          <Pressable
            onPress={() => go(spot.href)}
            accessibilityRole="link"
            style={({ pressed }) => [s.bigBtn, { backgroundColor: spot.btnBg, marginTop: 4 }, wide && { alignSelf: 'flex-start' }, pressed && s.pressed]}
          >
            <Text style={[{ color: spot.btnFg, fontSize: 16 }, font(700)]}>{spot.cta}</Text>
            <Icon name="arrow-forward" size={18} color={spot.btnFg} />
          </Pressable>
        </View>
      </View>

      {/* Trust + new in Chai */}
      <View style={[wrap, { paddingTop: wide ? 72 : 32, flexDirection: wide ? 'row' : 'column-reverse', gap: 20 }]}>
        <View style={{ flex: wide ? 1 : undefined, borderRadius: 28, backgroundColor: B.night, padding: wide ? 32 : 22, gap: 14 }}>
          <Text style={[{ color: B.nightInk, fontSize: wide ? 30 : 22, lineHeight: wide ? 34 : 28, letterSpacing: -0.6 }, font(800, 'display')]}>No fakes. No guessing.</Text>
          <Text style={[{ color: B.nightInk2, fontSize: wide ? 16 : 15, lineHeight: wide ? 24 : 22 }, font(400)]}>
            AI can copy a scholar's face and voice now. Every talk on Siqa comes from the speaker's own official channel, and every campaign's organization is checked before it goes live. Speakers can claim their page to get a verified badge.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {trust.map((t) => (
              <View key={t} style={[s.badge, { backgroundColor: 'rgba(212,172,115,0.16)' }]}>
                <Icon name="checkmark" size={15} color={B.goldText} />
                <Text style={[{ color: B.goldText, fontSize: wide ? 14 : 13 }, font(700)]}>{t}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ flex: wide ? 1 : undefined, gap: 14, ...(wide ? { borderRadius: 28, borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: '#c4a266', padding: 32 } : {}) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={[{ color: c.ink, fontSize: wide ? 26 : 22, lineHeight: wide ? 30 : 28, letterSpacing: -0.4 }, font(800, 'display')]}>Chai</Text>
            <View style={[s.pill, { backgroundColor: c.goldTint, height: 24 }]}>
              <Text style={[{ color: c.goldInk, fontSize: 12 }, font(700)]}>New</Text>
            </View>
          </View>
          <View style={{ flexDirection: wide ? 'column' : 'row', gap: 12 }}>
            {soon.map((x) => (
              <View
                key={x.title}
                style={wide
                  ? { flexDirection: 'row', gap: 14, alignItems: 'flex-start' }
                  : { flex: 1, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#c4a266', padding: 16, gap: 10 }}
              >
                <View style={[s.softTile, { backgroundColor: c.goldTint }]}>
                  <Icon name={x.icon} size={22} color={c.goldInk} />
                </View>
                <View style={{ flex: wide ? 1 : undefined, gap: 4 }}>
                  <Text style={[{ color: c.ink, fontSize: wide ? 17 : 16 }, font(700)]}>{x.title}</Text>
                  <Text style={[{ color: c.ink2, fontSize: wide ? 15 : 13, lineHeight: wide ? 22 : 18 }, font(400)]}>{x.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Join */}
      <View style={[wrap, { paddingTop: wide ? 72 : 36, gap: 14 }]}>
        <Text accessibilityRole="header" style={[{ color: c.ink, fontSize: wide ? 28 : 22, lineHeight: wide ? 32 : 28, letterSpacing: -0.5 }, font(800, 'display')]}>
          Got something to share?
        </Text>
        <View style={{ flexDirection: 'row', gap: wide ? 16 : 10 }}>
          {join.map((j) => (
            <Pressable
              key={j.title}
              onPress={() => go(j.href)}
              accessibilityRole="link"
              accessibilityLabel={`${j.title}: ${j.action}`}
              style={({ pressed }) => [
                { flex: 1, borderRadius: 22, backgroundColor: c.surfaceSoft },
                wide ? { padding: 22, flexDirection: 'row', alignItems: 'center', gap: 16 } : { paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center', gap: 10 },
                pressed && s.pressed,
              ]}
            >
              <View style={[s.joinIcon, wide && { width: 52, height: 52 }, { backgroundColor: c.surface }, shadow('hairline')]}>
                <Icon name={j.icon} size={wide ? 24 : 22} color={c.ink} />
              </View>
              <View style={{ gap: 2, alignItems: wide ? 'flex-start' : 'center', flexShrink: 1 }}>
                <Text style={[{ color: c.ink, fontSize: wide ? 17 : 14, lineHeight: wide ? 22 : 18, textAlign: wide ? 'left' : 'center' }, font(700)]}>{j.title}</Text>
                <Text style={[{ color: c.goldInk, fontSize: wide ? 15 : 13 }, font(600)]}>{j.action}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Ready? */}
      <View style={[wrap, { paddingTop: wide ? 64 : 32, paddingBottom: wide ? 88 : 40, alignItems: 'center', gap: 10 }]}>
        <Text style={[{ color: c.ink, fontSize: wide ? 36 : 24, lineHeight: wide ? 40 : 30, letterSpacing: -0.8 }, font(800, 'display')]}>Ready? Bismillah.</Text>
        <Pressable
          onPress={enterApp}
          accessibilityRole="button"
          style={({ pressed }) => [s.bigBtn, wide ? { paddingHorizontal: 32 } : { alignSelf: 'stretch' }, { backgroundColor: c.primary }, shadow('primary'), pressed && s.pressed]}
        >
          <Text style={[{ color: c.onPrimary, fontSize: 16 }, font(700)]}>Jump into Siqa</Text>
          <Icon name="arrow-forward" size={18} color={c.onPrimary} />
        </Pressable>
        <Pressable onPress={() => setSkipNext((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: skipNext }} style={s.checkRow}>
          <Icon name={skipNext ? 'checkbox' : 'square-outline'} size={22} color={skipNext ? c.gold : c.ink3} />
          <Text style={[{ color: c.ink2, fontSize: 15 }, font(500)]}>Skip this page next time</Text>
        </Pressable>
      </View>

      {/* Footer */}
      <View style={{ backgroundColor: B.night, marginTop: 'auto', paddingBottom: insets.bottom }}>
        <View style={[wrap, s.footer]}>
          <Image source={require('../assets/icon.png')} style={s.footerLogo} accessibilityLabel="Siqa" />
          <Text style={[{ color: '#9facc4', fontSize: 13 }, font(500)]}>© {new Date().getFullYear()} Siqa</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  header: { height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 36, height: 36, borderRadius: 10 },
  signIn: { height: 38, paddingHorizontal: 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  badge: { height: 34, paddingHorizontal: 12, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6 },
  bigBtn: { height: 54, paddingHorizontal: 28, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  chip: { height: 44, paddingHorizontal: 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  softTile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  joinIcon: { width: 46, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  checkRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8 },
  footer: { paddingVertical: 28, flexDirection: 'row', alignItems: 'center', gap: 12 },
  footerLogo: { width: 30, height: 30, borderRadius: 8 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.92 },
});
