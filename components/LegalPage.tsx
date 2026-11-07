// Shared layout for siqa.us/privacy and siqa.us/terms. Plain, readable
// text on the calm system: a title, the date, then numbered sections.
// Reachable signed out (App Store reviewers and new users open them).

import { View, Text, ScrollView, Pressable, Linking } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DesktopShell, useIsDesktopWeb } from './DesktopShell';
import { IconButton } from './ui';
import { font, space, type, useDS } from '../lib/ds';
import { goBack } from '../lib/goBack';
import { HEADER_TOP_PADDING } from '../constants/theme';

export const LEGAL_UPDATED = 'November 7, 2026';
export const LEGAL_CONTACT = 'claims@siqa.us';

export type LegalSection = { heading: string; body: (string | string[])[] };

export function LegalPage({ title, intro, sections, other }: { title: string; intro: string; sections: LegalSection[]; other: { label: string; href: string } }) {
  const { c } = useDS();
  const isDesktop = useIsDesktopWeb();
  const insets = useSafeAreaInsets();
  return (
    <DesktopShell>
      <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingHorizontal: space[5], paddingTop: isDesktop ? space[8] : Math.max(insets.top, HEADER_TOP_PADDING - 20), paddingBottom: 80 }}>
        <View style={{ maxWidth: 720, width: '100%', alignSelf: 'center', gap: space[5] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], marginLeft: -8 }}>
            <IconButton icon="chevron-back" label="Back" onPress={() => goBack('/home')} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={[isDesktop ? type.display : type.title1 ?? type.display, { color: c.ink }]} accessibilityRole="header">{title}</Text>
            <Text style={[type.caption, { color: c.ink2 }]}>Last updated {LEGAL_UPDATED}</Text>
          </View>
          <Text style={[type.body, { color: c.ink, lineHeight: 24 }]}>{intro}</Text>
          {sections.map((s, i) => (
            <View key={s.heading} style={{ gap: space[2] }}>
              <Text style={[type.headline, { color: c.ink }]} accessibilityRole="header">{i + 1}. {s.heading}</Text>
              {s.body.map((p, j) => Array.isArray(p) ? (
                <View key={j} style={{ gap: 6 }}>
                  {p.map((li) => (
                    <View key={li} style={{ flexDirection: 'row', gap: 8 }}>
                      <Text style={[type.body, { color: c.ink2 }]}>•</Text>
                      <Text style={[type.body, { color: c.ink, flex: 1, lineHeight: 24 }]}>{li}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text key={j} style={[type.body, { color: c.ink, lineHeight: 24 }]}>{p}</Text>
              ))}
            </View>
          ))}
          <View style={{ gap: space[2], paddingTop: space[4], borderTopWidth: 1, borderTopColor: c.line }}>
            <Text style={[type.callout, { color: c.ink2 }]}>
              Questions? Email{' '}
              <Text style={[font(600), { color: c.ink, textDecorationLine: 'underline' }]} onPress={() => Linking.openURL(`mailto:${LEGAL_CONTACT}`)}>{LEGAL_CONTACT}</Text>.
            </Text>
            <Pressable onPress={() => router.push(other.href as any)} accessibilityRole="link">
              <Text style={[type.callout, font(600), { color: c.ink, textDecorationLine: 'underline' }]}>{other.label}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </DesktopShell>
  );
}
