// Donation fee math, shared by the donate screen. The server
// (supabase/functions/create-payment-intent) uses the same formulas — keep
// them in sync.
//
//   Siqa platform fee: 1% of the gift, at least 50¢.
//   Card processing:   Stripe's 2.9% + 30¢ of the amount actually charged.
//                      Siqa pays Stripe and collects this from the gift.
//
// Normally the donor is charged the gift and the fees come out of it.
// If the donor covers the fees, the charge is grossed up so the
// organization receives the full gift.

export const PLATFORM_FEE_RATE = 0.01;
export const PLATFORM_FEE_MIN = 50;
export const CARD_RATE = 0.029;
export const CARD_FIXED = 30;

export function platformFee(giftCents: number) {
  return Math.max(Math.round(giftCents * PLATFORM_FEE_RATE), PLATFORM_FEE_MIN);
}

export function cardFee(chargeCents: number) {
  return Math.round(chargeCents * CARD_RATE) + CARD_FIXED;
}

export type DonationQuote = {
  gift: number;          // what the donor chose
  charge: number;        // what the card is charged
  platformFee: number;
  cardFee: number;
  orgReceives: number;
  coverFees: boolean;
};

export function quoteDonation(giftCents: number, coverFees: boolean): DonationQuote {
  const pf = platformFee(giftCents);
  if (!coverFees) {
    const cf = cardFee(giftCents);
    return { gift: giftCents, charge: giftCents, platformFee: pf, cardFee: cf, orgReceives: giftCents - pf - cf, coverFees };
  }
  // Smallest charge where charge − platform fee − card fee ≥ gift.
  let charge = Math.ceil((giftCents + pf + CARD_FIXED) / (1 - CARD_RATE));
  while (charge - pf - cardFee(charge) < giftCents) charge += 1;
  return { gift: giftCents, charge, platformFee: pf, cardFee: charge - giftCents - pf, orgReceives: giftCents, coverFees };
}

export function money(cents: number) {
  return '$' + (cents / 100).toFixed(2);
}
