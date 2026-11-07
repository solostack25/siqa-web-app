// siqa.us/privacy — written from what the app actually collects.
// Keep in step with App Store Connect's privacy answers when features change.

import { LegalPage, LEGAL_CONTACT, type LegalSection } from '../components/LegalPage';

const SECTIONS: LegalSection[] = [
  {
    heading: 'What we collect',
    body: [
      'Only what Siqa needs to work:',
      [
        'Account details: your name, email address and password (stored securely by our login provider, never readable by us), plus a profile photo and bio if you add them.',
        'What you post: Gems and other videos, thumbnails, comments, Chai votes, quiz results and comments, product listings, Seed campaigns, organization and business profiles, and messages you send to buyers or sellers.',
        'Activity in the app: who you follow, videos you like, save or watch (view counts), reports you file and people you block.',
        'Purchases and orders: what you bought or sold, order totals and the shipping address you enter. Card details go straight to Stripe; Siqa never sees or stores your card number.',
        'Donations: the Seed you gave to, the amount and the receipt details, processed by Stripe or the organization’s own payment page.',
        'Location: only if you allow it, used on your device to show businesses and organizations near you. The area you choose is saved on your device, not on our servers.',
        'Camera, microphone and photos: only when you choose to record or upload something. We only receive the files you post.',
      ],
    ],
  },
  {
    heading: 'How we use it',
    body: [
      [
        'To run your account and show your posts, comments, store and campaigns.',
        'To process orders, pay sellers and send donations to the organizations you choose.',
        'To keep Siqa safe: reviewing reports, removing content that breaks our Terms, and stopping spam and abuse.',
        'To show simple counts, like views, followers, votes and amount raised.',
      ],
      'We don’t sell your personal information. We don’t use it for third-party advertising, and we don’t track you across other companies’ apps or websites.',
    ],
  },
  {
    heading: 'What other people can see',
    body: [
      'Your name, profile photo, public profile, Gems, comments, Chai comments (with the vote or result you got), product listings and Seeds are public. Your individual Chai votes and quiz answers are private; others only see totals.',
      'Messages are visible only to you and the person you’re talking with. Siqa moderators may read a conversation when it’s reported, to check it.',
    ],
  },
  {
    heading: 'Services we rely on',
    body: [
      'We share data with these providers only so they can run parts of Siqa for us:',
      [
        'Supabase: database, file storage and sign-in.',
        'Vercel: hosting for siqa.us.',
        'Bunny.net: video storage and streaming.',
        'Stripe: payments, seller payouts and donations.',
        'Expo: delivering app updates.',
        'YouTube: some videos are YouTube embeds, which follow Google’s privacy policy when they play.',
      ],
      'We may also share information if the law requires it, or to protect people from harm.',
    ],
  },
  {
    heading: 'Keeping and deleting your data',
    body: [
      'We keep your information while your account is open. You can delete your account at any time in Settings › Delete account. That deletes your login and profile, along with your likes, saves, follows, comments and cart, and your speaker profile and its videos if you have one.',
      'A few things stay because other people rely on them: past orders and donations are kept for sellers’ and organizations’ records and taxes, but no longer point to you. A shop you ran is closed and hidden but keeps its order history, and an organization you registered stays listed without your login.',
      'You can also ask us for a copy of your data, or to correct it, by emailing ' + LEGAL_CONTACT + '.',
    ],
  },
  {
    heading: 'Children',
    body: [
      'Siqa is not meant for children under 13, and we don’t knowingly collect information from them. If you believe a child under 13 has an account, email us and we’ll remove it.',
    ],
  },
  {
    heading: 'Security',
    body: [
      'Data is sent over encrypted connections and access is limited by account. No system is perfectly secure, so use a strong password and tell us right away if you think your account was misused.',
    ],
  },
  {
    heading: 'Changes',
    body: [
      'If we change this policy we’ll update the date at the top, and tell you in the app if the change is significant.',
    ],
  },
];

export default function PrivacyScreen() {
  return (
    <LegalPage
      title="Privacy policy"
      intro="This explains what information Siqa collects, how it’s used and the choices you have. It applies to the Siqa app on iPhone and Android and to siqa.us."
      sections={SECTIONS}
      other={{ label: 'Read the Terms of use', href: '/terms' }}
    />
  );
}
