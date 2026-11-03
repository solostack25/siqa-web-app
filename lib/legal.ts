// Legal + support constants. Have a lawyer review the documents in
// app/legal/[doc].tsx before launch, and update these values.

/** Inbox that receives support requests, reports by email and legal notices. */
export const SUPPORT_EMAIL = 'support@thesiqaapp.com';

/** The legal owner/operator of Siqa as it should appear in the Terms. */
export const LEGAL_ENTITY = 'Siqa';

export const LEGAL_EFFECTIVE_DATE = 'November 15, 2026';

export const GOVERNING_STATE = 'Texas';

export type LegalDoc = 'terms' | 'privacy' | 'guidelines';

export const LEGAL_TITLES: Record<LegalDoc, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  guidelines: 'Community Guidelines',
};
