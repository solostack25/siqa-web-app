// siqa.us/support — the App Store "Support URL". Reachable signed out.
// Contact addresses up top, then short answers to the questions people
// actually email about. Keep answers in step with /terms and /privacy.

import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DesktopShell, useIsDesktopWeb } from '../components/DesktopShell';
import { IconButton } from '../components/ui';
import { Icon, type SiqaIconName } from '../components/Icon';
import { font, radius, space, type, useDS } from '../lib/ds';
import { goBack } from '../lib/goBack';
import { HEADER_TOP_PADDING } from '../constants/theme';

const SUPPORT_EMAIL = 'info@siqa.us';
const CLAIMS_EMAIL = 'claims@siqa.us';

type Contact = { icon: SiqaIconName; title: string; detail: string; email: string };

const CONTACTS: Contact[] = [
  { icon: 'mail-outline', title: 'Help and general questions', detail: 'Account problems, bugs, orders, feedback', email: SUPPORT_EMAIL },
  { icon: 'shield-checkmark-outline', title: 'Profile claims and privacy', detail: 'Claiming a profile, verification, data requests', email: CLAIMS_EMAIL },
];

// A link inside an answer: { label, href } for in-app routes, { label, email } for mail.
type Part = string | { label: string; href?: string; email?: string };
type Faq = { q: string; a: Part[][] };
type Group = { title: string; items: Faq[] };

const GROUPS: Group[] = [
  {
    title: 'Your account',
    items: [
      { q: 'I forgot my password', a: [['On the sign-in screen, tap ', { label: 'Forgot password?', href: '/(auth)/forgot-password' }, ' and enter your email. We’ll send a reset link from siqa.us. Check spam if it doesn’t arrive within a few minutes.']] },
      { q: 'How do I change my name, photo or bio?', a: [['Go to ', { label: 'Settings', href: '/settings' }, ' and edit your profile.']] },
      { q: 'How do I delete my account?', a: [['Go to ', { label: 'Settings', href: '/settings' }, ' › Delete account. This removes your login, profile and activity. Past orders and donations are kept for sellers’ and organizations’ records but no longer point to you. See the ', { label: 'Privacy policy', href: '/privacy' }, ' for details.']] },
      { q: 'Can I get a copy of my data?', a: [['Yes. Email ', { label: CLAIMS_EMAIL, email: CLAIMS_EMAIL }, ' from the address on your account and we’ll send it to you.']] },
    ],
  },
  {
    title: 'Speakers, organizations and businesses',
    items: [
      { q: 'My profile says “Unclaimed.” How do I claim it?', a: [['Siqa sets up some profiles from public sources so people can find you. Sign in, open your profile and tap Claim, or go to ', { label: 'siqa.us/claim', href: '/claim' }, '. We verify that it’s really you before handing it over. Questions go to ', { label: CLAIMS_EMAIL, email: CLAIMS_EMAIL }, '.']] },
      { q: 'How do I become a speaker on Siqa?', a: [['Speakers are reviewed before they can post. ', { label: 'Apply here', href: '/apply-speaker' }, '. Siqa only lists speakers with real content, to keep fake and AI-generated videos out.']] },
      { q: 'How do I register my organization?', a: [['Use ', { label: 'Register an organization', href: '/org-register' }, '. Organizations are reviewed before they appear or can run Seeds.']] },
    ],
  },
  {
    title: 'Shopping and selling',
    items: [
      { q: 'Something is wrong with my order', a: [['Message the seller first from ', { label: 'your orders', href: '/orders' }, ' — sellers handle shipping, returns and refunds. If you don’t hear back, email ', { label: SUPPORT_EMAIL, email: SUPPORT_EMAIL }, ' with your order details and we’ll step in.']] },
      { q: 'How do I start selling?', a: [['Go to ', { label: 'Sell on Siqa', href: '/sell' }, '. You’ll connect a Stripe account so you get paid directly. Siqa never sees your card or bank details.']] },
    ],
  },
  {
    title: 'Seeds and donations',
    items: [
      { q: 'I need a receipt or refund for a donation', a: [['Seeds are run by the organization or speaker, not Siqa, so receipts and refunds come from them. Contact the organization from its profile. If you can’t reach them, email ', { label: SUPPORT_EMAIL, email: SUPPORT_EMAIL }, '.']] },
    ],
  },
  {
    title: 'Safety',
    items: [
      { q: 'I think a video is fake or AI-generated', a: [['Tap the … or Report menu on the video and choose a reason. We review every report within 24 hours. You can also email ', { label: SUPPORT_EMAIL, email: SUPPORT_EMAIL }, ' with a link.']] },
      { q: 'Someone is bothering me', a: [['Report them from the … menu on their comment, Gem or conversation, and block them. Blocked people can’t message you or show up in your feed. Manage blocks in ', { label: 'Blocked accounts', href: '/blocked' }, '.']] },
    ],
  },
  {
    title: 'The app',
    items: [
      { q: 'Where can I use Siqa?', a: [['On iPhone, Android and the web at siqa.us. On a phone browser, use “Add to Home Screen” to install it like an app.']] },
      { q: 'Something isn’t working', a: [['Update to the latest version or refresh siqa.us first. If it still happens, email ', { label: SUPPORT_EMAIL, email: SUPPORT_EMAIL }, ' with what you tapped, what you expected and your device. A screenshot helps.']] },
    ],
  },
];

export default function SupportScreen() {
  const { c } = useDS();
  const isDesktop = useIsDesktopWeb();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<string | null>(null);

  const renderParts = (parts: Part[], key: string) => (
    <Text key={key} style={[type.body, { color: c.ink, lineHeight: 24 }]}>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          p
        ) : (
          <Text
            key={i}
            style={[font(600), { color: c.ink, textDecorationLine: 'underline' }]}
            accessibilityRole="link"
            onPress={() => (p.email ? Linking.openURL(`mailto:${p.email}`) : router.push(p.href as any))}
          >
            {p.label}
          </Text>
        ),
      )}
    </Text>
  );

  return (
    <DesktopShell>
      <ScrollView
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={{ paddingHorizontal: space[5], paddingTop: isDesktop ? space[8] : Math.max(insets.top, HEADER_TOP_PADDING - 20), paddingBottom: 80 }}
      >
        <View style={{ maxWidth: 720, width: '100%', alignSelf: 'center', gap: space[6] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -8 }}>
            <IconButton icon="chevron-back" label="Back" onPress={() => goBack('/home')} />
          </View>

          <View style={{ gap: space[2] }}>
            <Text style={[isDesktop ? type.display : type.title1, { color: c.ink }]} accessibilityRole="header">Help and support</Text>
            <Text style={[type.body, { color: c.ink2, lineHeight: 24 }]}>
              Quick answers below. If you still need help, email us. A real person reads every message, usually within 1–2 business days.
            </Text>
          </View>

          <View style={{ gap: space[3], flexDirection: isDesktop ? 'row' : 'column' }}>
            {CONTACTS.map((ct) => (
              <Pressable
                key={ct.email}
                onPress={() => Linking.openURL(`mailto:${ct.email}`)}
                accessibilityRole="link"
                accessibilityLabel={`${ct.title}: ${ct.email}`}
                style={({ pressed }) => ({
                  flex: isDesktop ? 1 : undefined,
                  flexDirection: 'row',
                  gap: space[3],
                  padding: space[4],
                  borderRadius: radius.lg,
                  backgroundColor: c.surface,
                  borderWidth: 1,
                  borderColor: c.line,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.goldTint, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={ct.icon} size={20} color={c.goldInk} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.headline, { color: c.ink }]}>{ct.title}</Text>
                  <Text style={[type.caption, { color: c.ink2 }]}>{ct.detail}</Text>
                  <Text style={[type.callout, font(600), { color: c.goldInk, marginTop: 4 }]}>{ct.email}</Text>
                </View>
              </Pressable>
            ))}
          </View>

          {GROUPS.map((g) => (
            <View key={g.title} style={{ gap: space[2] }}>
              <Text style={[type.title2, { color: c.ink }]} accessibilityRole="header">{g.title}</Text>
              <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, overflow: 'hidden' }}>
                {g.items.map((f, i) => {
                  const id = `${g.title}:${f.q}`;
                  const isOpen = open === id;
                  return (
                    <View key={f.q} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line }}>
                      <Pressable
                        onPress={() => setOpen(isOpen ? null : id)}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: isOpen }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[4] }}
                      >
                        <Text style={[type.callout, font(600), { color: c.ink, flex: 1 }]}>{f.q}</Text>
                        <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={c.ink2} />
                      </Pressable>
                      {isOpen && (
                        <View style={{ paddingHorizontal: space[4], paddingBottom: space[4], gap: space[2] }}>
                          {f.a.map((parts, j) => renderParts(parts, `${id}:${j}`))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          ))}

          <View style={{ gap: space[2], paddingTop: space[4], borderTopWidth: 1, borderTopColor: c.line, flexDirection: 'row', flexWrap: 'wrap', columnGap: space[5] }}>
            <Pressable onPress={() => router.push('/terms' as any)} accessibilityRole="link">
              <Text style={[type.callout, font(600), { color: c.ink, textDecorationLine: 'underline' }]}>Terms of use</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/privacy' as any)} accessibilityRole="link">
              <Text style={[type.callout, font(600), { color: c.ink, textDecorationLine: 'underline' }]}>Privacy policy</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </DesktopShell>
  );
}
