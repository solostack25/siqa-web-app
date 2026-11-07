import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, StyleSheet, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type SiqaIconName } from '../components/Icon';
import { HomeIcon, DiscoverIcon, PlayIcon, SeedsIcon, OrgsIcon } from '../components/Siqa';
import { font, useDS } from '../lib/ds';
import { setSkipWelcome, appStartPath } from '../lib/welcome';

/**
 * siqa.us welcome page (web only): what Siqa is, a "what brings you here?"
 * chooser that teaches the tabs, why to trust it, and ways to join.
 * First-time visitors land here from "/"; see lib/welcome.ts.
 */

// Night-navy hero colors (same in light and dark themes).
const N = { bg: '#0a0f1c', ink: '#edf1f7', ink2: '#b9c3d6', gold: '#e6c290', goldLine: 'rgba(212,172,115,0.4)' };

type PathCard = { key: string; title: string; body: string; where: string; cta: string; href: string; icon: React.ReactNode; tileBg: string };

export default function Welcome() {
  const { c, shadow } = useDS();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 900;
  const [skipNext, setSkipNext] = useState(false);

  const pad = wide ? 40 : 20;
  const wrap = { width: '100%' as const, maxWidth: 1200, alignSelf: 'center' as const, paddingHorizontal: pad };

  const paths: PathCard[] = [
    { key: 'gems', title: 'Watch Gems', body: 'Short clips and full talks from speakers Siqa has verified.', where: 'Gems · the ▶ button', cta: 'Start watching', href: '/gems', tileBg: N.bg, icon: <Icon name="play" size={24} color="#d4ac73" /> },
    { key: 'shop', title: 'Shop and find services', body: 'Products from Muslim-owned sellers, plus local services near you.', where: 'Shop tab', cta: 'Browse the Shop', href: '/marketplace', tileBg: c.surfaceSoft, icon: <Icon name="bag-handle-outline" size={24} color={c.ink} /> },
    { key: 'seeds', title: 'Plant a Seed', body: 'Campaigns from masjids and nonprofits, each with a clear goal.', where: 'Seeds tab', cta: 'See Seeds', href: '/seeds', tileBg: c.seedTint, icon: <SeedsIcon size={24} color={c.seed} /> },
    { key: 'orgs', title: 'Find organizations', body: 'Masjids, schools and nonprofits, with their Seeds and videos.', where: 'Orgs tab', cta: 'Find one near you', href: '/orgs', tileBg: c.goldTint, icon: <OrgsIcon size={24} color={c.goldInk} /> },
  ];

  const trust: { icon: SiqaIconName; title: string; body: string }[] = [
    { icon: 'shield-checkmark-outline', title: 'Verified speakers', body: 'Speakers are approved by Siqa before they can post a single Gem.' },
    { icon: 'business-outline', title: 'Checked organizations', body: 'Nonprofits are verified before they can raise money with a Seed.' },
    { icon: 'person-circle-outline', title: 'Real owners on every profile', body: 'Profiles Siqa adds stay marked Unclaimed until the real person or business claims them.' },
  ];

  const join: { icon: SiqaIconName; label: string; action: string; href: string }[] = [
    { icon: 'mic-outline', label: "I'm a speaker", action: 'Apply', href: '/apply-speaker' },
    { icon: 'business-outline', label: 'I run a masjid or nonprofit', action: 'Register', href: '/org-register' },
    { icon: 'storefront-outline', label: 'I own a business', action: 'Sell or list', href: '/sell' },
  ];

  const tabs = [
    { label: 'Home', hint: 'Latest videos', icon: <HomeIcon size={22} color={c.ink} /> },
    { label: 'Shop', hint: 'Products and services', icon: <DiscoverIcon size={22} color={c.ink} /> },
    { label: 'Gems', hint: 'Full-screen clips', icon: <View style={[s.gemsPill, { backgroundColor: c.gold }]}><PlayIcon size={12} color={c.onGold} /></View> },
    { label: 'Seeds', hint: 'Causes to support', icon: <SeedsIcon size={22} color={c.ink} /> },
    { label: 'Orgs', hint: 'Masjids and nonprofits', icon: <OrgsIcon size={22} color={c.ink} /> },
  ];

  const go = (href: string) => router.push(href as any);
  const enterApp = () => {
    if (skipNext) setSkipWelcome();
    router.replace(appStartPath(wide) as any);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ flexGrow: 1 }}>
      {/* Header */}
      <View style={{ backgroundColor: N.bg, paddingTop: insets.top }}>
        <View style={[wrap, s.header]}>
          <View style={s.brand}>
            <Image source={require('../assets/icon.png')} style={s.logo} accessibilityIgnoresInvertColors />
            <Text style={[s.wordmark, font(800, 'display')]}>Siqa</Text>
          </View>
          <Pressable onPress={() => go('/(auth)/login')} style={({ pressed }) => [s.signIn, pressed && s.pressed]} accessibilityRole="button">
            <Text style={[s.signInText, font(700)]}>Sign in</Text>
          </Pressable>
        </View>
      </View>

      {/* Hero */}
      <View style={{ backgroundColor: N.bg, paddingTop: wide ? 56 : 28, paddingBottom: wide ? 160 : 36 }}>
        <View style={[wrap, { flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', gap: 40 }]}>
          <View style={{ flex: wide ? 1 : undefined, gap: wide ? 24 : 18 }}>
            <Text style={[{ color: N.ink, fontSize: wide ? 58 : 34, lineHeight: wide ? 62 : 38, letterSpacing: wide ? -2 : -1 }, font(800, 'display')]} accessibilityRole="header">
              Islamic knowledge, giving and Muslim-owned business, in one place.
            </Text>
            <Text style={[{ color: N.ink2, fontSize: wide ? 19 : 16, lineHeight: wide ? 29 : 24, maxWidth: 600 }, font(400)]}>
              Watch talks from speakers we've verified, support masjids and nonprofits, and shop from businesses in your community.
            </Text>
            <View style={{ flexDirection: wide ? 'row' : 'column', gap: 10, marginTop: 6 }}>
              <Pressable
                onPress={() => go(paths[0].href)}
                style={({ pressed }) => [s.heroBtn, { backgroundColor: N.ink }, shadow('primary'), pressed && s.pressed]}
                accessibilityRole="button"
              >
                <Text style={[s.heroBtnText, { color: N.bg }, font(700)]}>Start watching</Text>
                <Icon name="arrow-forward" size={18} color={N.bg} />
              </Pressable>
              <Pressable onPress={enterApp} style={({ pressed }) => [s.heroBtn, s.heroBtnGhost, pressed && s.pressed]} accessibilityRole="button">
                <Text style={[s.heroBtnText, { color: N.ink }, font(700)]}>Skip to the app</Text>
              </Pressable>
            </View>
          </View>
          {wide ? (
            <Image source={require('../assets/icon.png')} style={s.heroMark} accessibilityLabel="The Siqa mark" />
          ) : null}
        </View>
      </View>

      {/* What brings you here */}
      <View style={[wrap, { marginTop: wide ? -112 : 32, gap: 16 }]}>
        <View style={{ gap: 6 }}>
          <Text style={[{ color: wide ? N.ink : c.ink, fontSize: wide ? 22 : 26, lineHeight: wide ? 28 : 30, letterSpacing: -0.5 }, font(wide ? 700 : 800, 'display')]} accessibilityRole="header">
            What brings you to Siqa?
          </Text>
          {!wide ? (
            <Text style={[s.lead, { color: c.ink2 }, font(400)]}>Pick one to jump in. You can switch any time from the bar at the bottom of the app.</Text>
          ) : null}
        </View>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 20 : 12 }}>
          {paths.map((p) => (
            <Pressable
              key={p.key}
              onPress={() => go(p.href)}
              accessibilityRole="link"
              accessibilityLabel={`${p.title}. ${p.body}`}
              style={({ pressed }) => [
                wide ? s.pathCardWide : s.pathCard,
                { backgroundColor: c.surface },
                shadow(wide ? 'raised' : 'card'),
                pressed && s.pressed,
              ]}
            >
              <View style={[s.tile, wide && s.tileWide, { backgroundColor: p.tileBg }]}>{p.icon}</View>
              <View style={{ flex: 1, gap: wide ? 6 : 3 }}>
                <Text style={[{ color: c.ink, fontSize: wide ? 22 : 17, lineHeight: wide ? 28 : 22 }, font(700, wide ? 'display' : 'sans')]}>{p.title}</Text>
                <Text style={[{ color: c.ink2, fontSize: wide ? 15 : 14, lineHeight: wide ? 22 : 20 }, font(400)]}>{p.body}</Text>
                {!wide ? <Text style={[s.where, { color: c.goldInk }, font(600)]}>{p.where}</Text> : null}
              </View>
              {wide ? (
                <View style={s.ctaRow}>
                  <Text style={[{ color: c.goldInk, fontSize: 15 }, font(700)]}>{p.cta}</Text>
                  <Icon name="arrow-forward" size={16} color={c.goldInk} />
                </View>
              ) : (
                <Icon name="chevron-forward" size={20} color={c.ink3} />
              )}
            </Pressable>
          ))}
        </View>
      </View>

      {/* Finding your way around (phones: the bottom bar) */}
      {!wide ? (
        <View style={[wrap, { marginTop: 36, gap: 16 }]}>
          <View style={{ gap: 6 }}>
            <Text style={[s.h2, { color: c.ink }, font(700, 'display')]} accessibilityRole="header">Finding your way around</Text>
            <Text style={[s.lead, { color: c.ink2 }, font(400)]}>Everything lives in the bar at the bottom of the screen. Swipe left or right to move between tabs.</Text>
          </View>
          <View style={[s.tabGuide, { backgroundColor: c.bgSunk }]}>
            {tabs.map((t) => (
              <View key={t.label} style={s.tabItem}>
                <View style={s.tabIcon}>{t.icon}</View>
                <Text style={[{ color: c.ink, fontSize: 12, lineHeight: 16 }, font(700)]}>{t.label}</Text>
                <Text style={[{ color: c.ink2, fontSize: 11, lineHeight: 14, textAlign: 'center' }, font(500)]}>{t.hint}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Why Siqa */}
      <View style={{ backgroundColor: c.bgSunk, marginTop: wide ? 72 : 36, paddingVertical: wide ? 80 : 36 }}>
        <View style={[wrap, { flexDirection: wide ? 'row' : 'column', gap: wide ? 48 : 20 }]}>
          <View style={{ flex: wide ? 1 : undefined, gap: 8 }}>
            <Text style={[s.eyebrow, { color: c.goldInk }, font(600)]}>WHY SIQA</Text>
            <Text style={[{ color: c.ink, fontSize: wide ? 40 : 26, lineHeight: wide ? 44 : 30, letterSpacing: wide ? -1.2 : -0.6 }, font(800, 'display')]} accessibilityRole="header">
              Know who you're really hearing from.
            </Text>
            <Text style={[{ color: c.ink2, fontSize: wide ? 17 : 15, lineHeight: wide ? 26 : 22 }, font(400)]}>
              AI can now make videos that look and sound like well-known scholars. Siqa checks the people and organizations behind everything you see.
            </Text>
          </View>
          <View style={{ flex: wide ? 2 : undefined, flexDirection: wide ? 'row' : 'column', gap: wide ? 20 : 18 }}>
            {trust.map((t) => (
              <View key={t.title} style={wide ? [s.trustCard, { backgroundColor: c.surface }, shadow('card')] : s.trustRow}>
                <View style={[s.trustIcon, { backgroundColor: wide ? c.seedTint : c.surface }, !wide && shadow('hairline')]}>
                  <Icon name={t.icon} size={22} color={c.seed} />
                </View>
                <View style={{ flex: wide ? undefined : 1, gap: 4 }}>
                  <Text style={[{ color: c.ink, fontSize: wide ? 17 : 16, lineHeight: 22 }, font(700)]}>{t.title}</Text>
                  <Text style={[{ color: c.ink2, fontSize: wide ? 15 : 14, lineHeight: wide ? 22 : 20 }, font(400)]}>{t.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Join */}
      <View style={[wrap, { paddingTop: wide ? 72 : 36, gap: 16 }]}>
        <View style={{ gap: 6 }}>
          <Text style={[{ color: c.ink, fontSize: wide ? 28 : 22, lineHeight: wide ? 32 : 28, letterSpacing: -0.5 }, font(800, 'display')]} accessibilityRole="header">
            Want to be on Siqa?
          </Text>
          <Text style={[s.lead, { color: c.ink2 }, font(400)]}>Speakers, organizations and businesses join through a quick review.</Text>
        </View>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 16 : 10 }}>
          {join.map((j) => (
            <Pressable
              key={j.label}
              onPress={() => go(j.href)}
              accessibilityRole="link"
              style={({ pressed }) => [s.joinRow, wide && { flex: 1 }, { backgroundColor: c.surfaceSoft }, pressed && s.pressed]}
            >
              <Icon name={j.icon} size={22} color={c.ink} />
              <Text style={[{ flex: 1, color: c.ink, fontSize: 16 }, font(500)]}>{j.label}</Text>
              <Text style={[{ color: c.ink2, fontSize: 14 }, font(600)]}>{j.action}</Text>
              <Icon name="chevron-forward" size={18} color={c.ink3} />
            </Pressable>
          ))}
        </View>
      </View>

      {/* Go to the app */}
      <View style={[wrap, { paddingTop: wide ? 48 : 28, paddingBottom: wide ? 80 : 40, gap: 12, alignItems: 'center', flexDirection: wide ? 'row' : 'column', justifyContent: 'center' }]}>
        <Pressable
          onPress={enterApp}
          accessibilityRole="button"
          style={({ pressed }) => [s.primaryBtn, !wide && { alignSelf: 'stretch' }, { backgroundColor: c.primary }, shadow('primary'), pressed && s.pressed]}
        >
          <Text style={[{ color: c.onPrimary, fontSize: 16 }, font(700)]}>Go to the app</Text>
          <Icon name="arrow-forward" size={18} color={c.onPrimary} />
        </Pressable>
        <Pressable
          onPress={() => setSkipNext((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: skipNext }}
          style={s.checkRow}
        >
          <Icon name={skipNext ? 'checkbox' : 'square-outline'} size={22} color={skipNext ? c.gold : c.ink3} />
          <Text style={[{ color: c.ink2, fontSize: 15 }, font(500)]}>Skip this page next time</Text>
        </Pressable>
      </View>

      {/* Footer */}
      <View style={{ backgroundColor: N.bg, marginTop: 'auto', paddingBottom: insets.bottom }}>
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
  logo: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(212,172,115,0.3)' },
  wordmark: { color: N.ink, fontSize: 22, letterSpacing: -0.5 },
  signIn: { height: 38, paddingHorizontal: 18, borderRadius: 999, backgroundColor: N.ink, alignItems: 'center', justifyContent: 'center' },
  signInText: { color: N.bg, fontSize: 14 },
  heroBtn: { height: 54, paddingHorizontal: 28, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  heroBtnGhost: { borderWidth: 1, borderColor: 'rgba(237,241,247,0.25)' },
  heroBtnText: { fontSize: 16 },
  heroMark: { width: 280, height: 280, borderRadius: 60, borderWidth: 1, borderColor: 'rgba(212,172,115,0.25)' },
  lead: { fontSize: 15, lineHeight: 21 },
  h2: { fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  eyebrow: { fontSize: 12, lineHeight: 16, letterSpacing: 1 },
  pathCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20 },
  pathCardWide: { flex: 1, gap: 16, padding: 24, borderRadius: 20 },
  tile: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tileWide: { width: 56, height: 56, borderRadius: 16 },
  where: { fontSize: 12, lineHeight: 16 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabGuide: { flexDirection: 'row', borderRadius: 20, paddingVertical: 16, paddingHorizontal: 6 },
  tabItem: { flex: 1, alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  tabIcon: { height: 30, alignItems: 'center', justifyContent: 'center' },
  gemsPill: { width: 42, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  trustRow: { flexDirection: 'row', gap: 14 },
  trustCard: { flex: 1, padding: 24, borderRadius: 20, gap: 12 },
  trustIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  joinRow: { minHeight: 58, paddingHorizontal: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  primaryBtn: { height: 54, paddingHorizontal: 32, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  checkRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8 },
  footer: { paddingVertical: 28, flexDirection: 'row', alignItems: 'center', gap: 12 },
  footerLogo: { width: 30, height: 30, borderRadius: 8 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.92 },
});
