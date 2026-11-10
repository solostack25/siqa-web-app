// siqa.us/delete-account — the public account-deletion page Google Play asks
// for in the Data safety form. Works signed out; deletion itself happens in
// Settings (signed in) or by email.

import { LegalPage, type LegalSection } from '../components/LegalPage';

const SECTIONS: LegalSection[] = [
  {
    heading: 'Delete it yourself (fastest)',
    body: [
      [
        'In the Siqa app or at siqa.us, sign in and go to Settings.',
        'Scroll to the bottom and tap Delete account.',
        'Type DELETE to confirm. Your account is deleted right away.',
      ],
    ],
  },
  {
    heading: 'Ask us to delete it',
    body: [
      'If you can’t sign in, email info@siqa.us from the address on your account with the subject “Delete my account”. We confirm it’s you and delete the account within 30 days, usually much sooner.',
    ],
  },
  {
    heading: 'What gets deleted',
    body: [
      [
        'Your login, profile, photo and bio.',
        'Your likes, saves, follows, playlists, comments and cart.',
        'Your speaker profile and its videos, if you have one.',
      ],
    ],
  },
  {
    heading: 'What we keep, and why',
    body: [
      'Past orders and donations are kept for the sellers’ and organizations’ records and taxes, but they no longer point to you. A shop you ran is closed and hidden but keeps its order history, and an organization you registered stays listed without your login. Stripe keeps its own payment records under its privacy policy.',
    ],
  },
];

export default function DeleteAccountScreen() {
  return (
    <LegalPage
      title="Delete your Siqa account"
      intro="You can delete your Siqa account and the data tied to it at any time. Here’s how, and what happens to your information."
      sections={SECTIONS}
      other={{ label: 'Privacy policy', href: '/privacy' }}
    />
  );
}
