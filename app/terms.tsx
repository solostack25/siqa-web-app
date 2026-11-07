// siqa.us/terms — Terms of use, including the community rules Apple
// requires for apps with user posts (Guideline 1.2): no objectionable
// content, report and block tools, and action on reports within 24 hours.

import { LegalPage, LEGAL_CONTACT, type LegalSection } from '../components/LegalPage';

const SECTIONS: LegalSection[] = [
  {
    heading: 'Using Siqa',
    body: [
      'By creating an account or using Siqa you agree to these terms and to our Privacy policy. You must be at least 13 years old. If you’re under 18, use Siqa with a parent or guardian’s permission.',
      'Keep your login to yourself. You’re responsible for what happens on your account.',
    ],
  },
  {
    heading: 'Community rules',
    body: [
      'Siqa is a respectful place to learn, give and shop. We have zero tolerance for objectionable content or abusive users. Don’t post, send or sell anything that:',
      [
        'Harasses, threatens, bullies or targets a person or group, including hate based on religion, race, ethnicity, sex, disability or nationality.',
        'Is sexual, graphic, violent or meant to shock.',
        'Promotes violence, extremism, self-harm or illegal activity.',
        'Is spam, a scam or fraud, or misleads people about who you are or where their money goes.',
        'Shares someone’s private information without permission.',
        'Infringes someone else’s copyright, trademark or other rights.',
      ],
      'Disagreement is fine; disrespect isn’t. Speak about others, including scholars and organizations, the way you’d want to be spoken about.',
    ],
  },
  {
    heading: 'Reporting and blocking',
    body: [
      'You can report any comment, Chai comment, Gem or conversation, and block anyone, from the … or Report menu next to it. Blocking hides that person’s comments, Gems and messages from you and stops them from messaging you. You can unblock people in Settings › Blocked accounts.',
      'Siqa reviews reports within 24 hours. When something breaks these rules we remove it, and we may suspend or permanently remove the account that posted it.',
    ],
  },
  {
    heading: 'Your content',
    body: [
      'You keep ownership of what you post. By posting it, you give Siqa permission to host, show, share and promote it in the app and on siqa.us so the service can work. That permission ends when you delete the content or your account, except where others have already shared it or we must keep it by law.',
      'Only post things you have the right to post.',
    ],
  },
  {
    heading: 'Seeds and donations',
    body: [
      'Seeds are fundraising campaigns run by organizations and speakers, not by Siqa. Siqa reviews organizations, but we can’t guarantee how any campaign uses its funds. Give to causes you trust. Questions about a gift or a tax receipt go to the organization that ran the Seed.',
      'On iPhone, donations are completed on siqa.us in your browser.',
    ],
  },
  {
    heading: 'Buying and selling',
    body: [
      'The Marketplace connects buyers with independent sellers. Sellers are responsible for their listings, shipping, returns and taxes, and are paid through their own Stripe account. Buyers pay through Stripe at checkout.',
      'If something goes wrong with an order, message the seller first. Sellers who mislead buyers or don’t deliver may be removed.',
    ],
  },
  {
    heading: 'Ending your account',
    body: [
      'You can delete your account at any time in Settings. We may suspend or remove accounts that break these terms or put other people at risk.',
    ],
  },
  {
    heading: 'Disclaimers',
    body: [
      'Siqa is provided as is. We work to keep it running and accurate, but we can’t promise it will always be available or error-free. Content from speakers, organizations, sellers and other users is theirs, not Siqa’s, and doesn’t replace advice from a qualified scholar or professional.',
      'To the extent the law allows, Siqa isn’t liable for indirect or consequential losses arising from your use of the service.',
    ],
  },
  {
    heading: 'Changes and contact',
    body: [
      'We may update these terms. We’ll change the date at the top and tell you in the app if the change is significant. Using Siqa after a change means you accept the new terms.',
      'These terms are governed by the laws of the State of Texas. Questions: ' + LEGAL_CONTACT + '.',
    ],
  },
];

export default function TermsScreen() {
  return (
    <LegalPage
      title="Terms of use"
      intro="These terms cover your use of the Siqa app on iPhone and Android and siqa.us, including the community rules everyone on Siqa agrees to."
      sections={SECTIONS}
      other={{ label: 'Read the Privacy policy', href: '/privacy' }}
    />
  );
}
