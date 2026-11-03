import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme, type AppColors } from '../../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../../constants/theme';
import { DesktopShell } from '../../components/DesktopShell';
import { Icon } from '../../components/Icon';
import {
  SUPPORT_EMAIL,
  LEGAL_ENTITY,
  LEGAL_EFFECTIVE_DATE,
  GOVERNING_STATE,
  LEGAL_TITLES,
  type LegalDoc,
} from '../../lib/legal';

// Public legal pages: /legal/terms, /legal/privacy, /legal/guidelines.
// Linked from Settings, sign-up, and the upload screen, and usable as the
// Privacy Policy / Terms URLs in App Store Connect and Google Play
// (https://gems.thesiqaapp.com/legal/privacy).
//
// DRAFT: have a lawyer review this text before launch.

type Section = { h: string; p: string[] };

const E = LEGAL_ENTITY;
// "Siqa" alone, or "Acme LLC (\"Siqa\")" once a legal entity is set.
const WHO = E === 'Siqa' ? 'Siqa' : `${E} ("Siqa")`;

const TERMS: Section[] = [
  { h: '1. Agreement', p: [
    `These Terms of Service ("Terms") are an agreement between you and ${WHO} ("we," "us") covering your use of the Siqa app and websites, including Gems, Seeds, Organizations and the Siqa Marketplace (together, the "Service"). By creating an account or using the Service, you agree to these Terms, our Privacy Policy and our Community Guidelines.`,
  ] },
  { h: '2. Who can use Siqa', p: [
    'You must be at least 13 years old to use Siqa. You must be at least 18 (or have a parent or guardian\'s permission and involvement) to buy, sell, or donate. If you use Siqa on behalf of an organization, you confirm you are authorized to bind that organization to these Terms.',
  ] },
  { h: '3. Your account', p: [
    'Give accurate information and keep your login secure. You are responsible for activity on your account. You can delete your account at any time in Settings → Delete account.',
  ] },
  { h: '4. Your content', p: [
    'You keep ownership of the videos, comments, listings, messages and other content you post ("Your Content"). You give Siqa a worldwide, non-exclusive, royalty-free license to host, store, display, distribute, and format Your Content in order to operate, promote and improve the Service. This license ends when you delete the content or your account, except for copies kept for legal reasons or already shared by others.',
    'You confirm you have the rights to everything you post and that it does not infringe anyone else\'s rights or break the law.',
  ] },
  { h: '5. Religious content and speakers', p: [
    'Siqa exists to share authentic Islamic knowledge. Do not impersonate a scholar, speaker, or organization, and do not post AI-generated or edited content that presents words as coming from a real person who did not say them. A "verified" badge means we confirmed a speaker\'s or organization\'s identity; it is not an endorsement of every view expressed. Content reflects the views of the person who posted it.',
  ] },
  { h: '6. Prohibited conduct', p: [
    'Do not use Siqa to: harass, threaten, or promote hatred against anyone; post sexual, violent, or illegal content; spam or scam; sell prohibited or counterfeit items; collect other users\' data; interfere with or attempt to break the Service; or break any law. See the Community Guidelines for more.',
  ] },
  { h: '7. Reporting, blocking and moderation', p: [
    'You can report any Gem, comment, listing, or conversation, and block any user. We review reports and may remove content, limit features, or suspend or terminate accounts that break these Terms or the Community Guidelines, at our discretion and without prior notice where needed to protect users.',
  ] },
  { h: '8. Siqa Marketplace', p: [
    'The Marketplace connects independent sellers with buyers. Siqa is not the seller of items listed by others and is not a party to the sale contract between buyer and seller. Sellers are responsible for their listings, item quality, legality, shipping, returns, and any taxes they owe.',
    'Payments are processed by Stripe. Sellers must complete Stripe Connect onboarding and agree to Stripe\'s Connected Account Agreement. Siqa may charge sellers a subscription and/or a fee on each sale, as shown when you set up your shop. Payouts are made by Stripe according to its schedule.',
    'Buyers should contact the seller first about problems with an order. If an issue isn\'t resolved, contact us at the support email below. Siqa may, but is not required to, help resolve disputes.',
  ] },
  { h: '9. Donations (Seeds)', p: [
    'Donations go to the organization running the Seed, processed by Stripe. Siqa is a platform, not a charity, and does not control how organizations use donations. Processing and platform fees are shown before you donate. Tax receipts, where applicable, come from the receiving organization. Donations are generally non-refundable; contact the organization or us if you believe a donation was made in error.',
  ] },
  { h: '10. Intellectual property and copyright', p: [
    `The Siqa name, logo, and app are owned by ${E}. If you believe content on Siqa infringes your copyright, email ${SUPPORT_EMAIL} with: the work, where it appears on Siqa, your contact details, a statement of good-faith belief that the use is unauthorized, and a statement under penalty of perjury that your notice is accurate and you are authorized to act. We remove infringing content and terminate repeat infringers.`,
  ] },
  { h: '11. Third-party content and services', p: [
    'Some videos are embedded from third parties such as YouTube and are subject to those services\' terms. Siqa relies on providers such as Stripe, Supabase, Bunny.net and Cloudflare to operate.',
  ] },
  { h: '12. Disclaimers', p: [
    'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. Siqa does not guarantee the accuracy of user content, the quality of Marketplace items, or uninterrupted service. Content on Siqa is not a substitute for personal advice from a qualified scholar, doctor, lawyer, or other professional.',
  ] },
  { h: '13. Limitation of liability', p: [
    'TO THE FULLEST EXTENT PERMITTED BY LAW, SIQA WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES, OR LOST PROFITS OR DATA. SIQA\'S TOTAL LIABILITY FOR ANY CLAIM IS LIMITED TO THE GREATER OF $100 OR THE AMOUNT YOU PAID SIQA IN THE 12 MONTHS BEFORE THE CLAIM.',
  ] },
  { h: '14. Indemnity', p: [
    'You agree to indemnify Siqa against claims arising from Your Content, your sales or purchases, or your violation of these Terms or the law.',
  ] },
  { h: '15. Governing law', p: [
    `These Terms are governed by the laws of the State of ${GOVERNING_STATE}, without regard to conflict-of-law rules. Disputes will be brought in the state or federal courts located in ${GOVERNING_STATE}, unless applicable law requires otherwise.`,
  ] },
  { h: '16. Changes', p: [
    'We may update these Terms. If changes are material, we will notify you in the app or by email. Continuing to use Siqa after changes take effect means you accept them.',
  ] },
  { h: '17. Contact', p: [`Questions: ${SUPPORT_EMAIL}`] },
];

const PRIVACY: Section[] = [
  { h: 'Overview', p: [
    `This Privacy Policy explains what information ${WHO} collects, how we use it, and your choices. We do not sell your personal information, and we do not use third-party advertising trackers.`,
  ] },
  { h: 'Information you give us', p: [
    'Account details: name, email address, password (stored securely by our authentication provider), and profile photo.',
    'Content: videos, thumbnails, comments, reactions, listings, product photos, reviews, and messages you send to other users.',
    'Marketplace and donations: shipping name and address, order history, shop details, and seller payout onboarding details (collected by Stripe). We do not store your full card number; payments are handled by Stripe.',
    'Organizations and speakers: information you submit for registration or verification.',
    'Reports and support: reports you submit and messages you send us.',
  ] },
  { h: 'Information collected automatically', p: [
    'Basic usage and device information needed to run the Service, such as app version, device type, approximate region derived from IP address, and error logs. Camera, microphone, and photo library are accessed only when you choose to record or upload.',
  ] },
  { h: 'How we use information', p: [
    'To provide and secure the Service; process purchases, payouts and donations; calculate taxes; deliver messages between buyers and sellers; review reports and enforce our rules; respond to support requests; and improve Siqa.',
  ] },
  { h: 'Who we share it with', p: [
    'Other users see your public profile and the content you post publicly. Sellers receive the name and shipping address needed to fulfill your order. Organizations receive donation details needed to process your gift.',
    'Service providers process data on our behalf: Supabase (database and authentication), Stripe (payments, payouts and tax), Bunny.net (video storage and delivery), Cloudflare (livestreaming and network), and Vercel (website hosting). Embedded YouTube videos are subject to Google\'s privacy policy.',
    'We may disclose information if required by law or to protect the safety of users or the public, or as part of a merger or sale of the business.',
  ] },
  { h: 'Retention', p: [
    'We keep information while your account is active. When you delete your account, we delete your login, profile, likes, saves, follows, comments, cart and favorites. Order and donation records are kept without your name where needed for sellers\', charities\', tax and legal purposes.',
  ] },
  { h: 'Your choices and rights', p: [
    `You can edit your profile in Settings, delete your account in Settings → Delete account, and block users. You may request access to or correction of your information by emailing ${SUPPORT_EMAIL}. Depending on where you live (for example, California), you may have additional rights, which we will honor as required by law.`,
  ] },
  { h: 'Children', p: [
    `Siqa is not directed to children under 13, and we do not knowingly collect their personal information. If you believe a child under 13 has given us information, contact ${SUPPORT_EMAIL} and we will delete it.`,
  ] },
  { h: 'Security', p: [
    'We use industry-standard safeguards, including encryption in transit and access controls on our database. No system is perfectly secure.',
  ] },
  { h: 'Changes', p: ['We may update this policy and will notify you of material changes in the app or by email.'] },
  { h: 'Contact', p: [`${SUPPORT_EMAIL}`] },
];

const GUIDELINES: Section[] = [
  { h: 'Our purpose', p: [
    'Siqa is a place for authentic Islamic knowledge, community, and Muslim-owned business. These guidelines keep it trustworthy and respectful.',
  ] },
  { h: 'Be authentic', p: [
    'Don\'t impersonate scholars, speakers, organizations, or other users. Don\'t post AI-generated or edited clips that put words in a real person\'s mouth. Cite sources when sharing rulings or hadith.',
  ] },
  { h: 'Be respectful', p: [
    'Disagree with ideas, not people. No harassment, threats, bullying, or hate speech against anyone, including other Muslims of different schools of thought, other faiths, or any group.',
  ] },
  { h: 'Keep it appropriate', p: [
    'No sexual content, nudity, graphic violence, or content promoting violence, extremism, self-harm, or illegal activity.',
  ] },
  { h: 'Marketplace rules', p: [
    'List only items you have the right to sell, described accurately, with real photos. No counterfeit goods, weapons, drugs, alcohol, pork products, adult items, or anything illegal. Ship on time and honor your shop policies.',
  ] },
  { h: 'No spam or scams', p: [
    'No misleading fundraising, fake giveaways, pyramid schemes, repeated promotional posts, or attempts to move payments off Siqa to avoid buyer protections.',
  ] },
  { h: 'Report and block', p: [
    'If you see something that breaks these guidelines, tap Report. You can block anyone; they won\'t be able to message you and you won\'t see their comments. Our team reviews reports and may remove content or suspend accounts.',
  ] },
];

const DOCS: Record<LegalDoc, Section[]> = { terms: TERMS, privacy: PRIVACY, guidelines: GUIDELINES };

export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  const key = (doc && doc in DOCS ? doc : 'terms') as LegalDoc;
  const sections = DOCS[key];

  return (
    <DesktopShell>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.roundBtn}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/' as any))}
            accessibilityLabel="Back"
          >
            <Icon name="arrow-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{LEGAL_TITLES[key]}</Text>
          <View style={{ width: 38 }} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.inner}>
            <Text style={styles.updated}>Effective {LEGAL_EFFECTIVE_DATE}</Text>
            {sections.map((s) => (
              <View key={s.h} style={styles.section}>
                <Text style={styles.h}>{s.h}</Text>
                {s.p.map((para, i) => (
                  <Text key={i} style={styles.p}>{para}</Text>
                ))}
              </View>
            ))}
            <View style={styles.otherRow}>
              {(Object.keys(LEGAL_TITLES) as LegalDoc[]).filter((d) => d !== key).map((d) => (
                <TouchableOpacity key={d} onPress={() => router.replace({ pathname: '/legal/[doc]', params: { doc: d } } as any)}>
                  <Text style={styles.link}>{LEGAL_TITLES[d]}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}>
                <Text style={styles.link}>Contact us</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </DesktopShell>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Theme.spacing.md,
      paddingHorizontal: Theme.spacing.lg, paddingTop: HEADER_TOP_PADDING, paddingBottom: Theme.spacing.md,
    },
    roundBtn: {
      width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2,
    },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: Theme.fontSize.base, fontWeight: '700', color: C.text },
    scroll: { paddingBottom: 80 },
    inner: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: Theme.spacing.xl },
    updated: { color: C.text3, fontSize: Theme.fontSize.sm, marginBottom: Theme.spacing.lg },
    section: { marginBottom: Theme.spacing.xl },
    h: { color: C.text, fontSize: Theme.fontSize.lg, fontWeight: '700', marginBottom: Theme.spacing.sm },
    p: { color: C.text2, fontSize: Theme.fontSize.md, lineHeight: 23, marginBottom: Theme.spacing.sm },
    otherRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Theme.spacing.lg, marginTop: Theme.spacing.md },
    link: { color: C.gold, fontSize: Theme.fontSize.sm, fontWeight: '600' },
  });
}
