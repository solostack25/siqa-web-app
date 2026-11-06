import { Linking, Platform } from 'react-native';
import { router } from 'expo-router';

// App Store Review Guideline 3.2.2(iv): unless the developer is an
// Apple-approved nonprofit, an iOS app may not collect donations inside the
// app — it has to send the donor out to Safari. So on iOS every "Donate"
// button opens siqa.us in Safari (Linking.openURL, NOT an in-app browser).
// Android and web keep the in-app Stripe flow.

export const SITE_ORIGIN = 'https://www.siqa.us';

/** True when donations must leave the app (iOS native). */
export const DONATE_IN_BROWSER = Platform.OS === 'ios';

/** Label for donate buttons: tells iOS users they're leaving the app. */
export function donateLabel(base = 'Donate'): string {
  return DONATE_IN_BROWSER ? `${base} on siqa.us` : base;
}

export function donateUrl(fundraiserId: string, via?: string | null): string {
  const q = new URLSearchParams({ fundraiserId });
  if (via) q.set('via', via);
  return `${SITE_ORIGIN}/donate?${q.toString()}`;
}

export type DonateTarget = {
  fundraiserId: string;
  title?: string;
  orgId?: string | null;
  orgStripeAccountId?: string | null;
  paymentMethodType?: string | null;
  paymentMethodUrl?: string | null;
  paymentMethodLabel?: string | null;
  via?: string | null;
};

/** Send the user to donate to a Seed — Safari on iOS, in-app elsewhere. */
export async function openDonation(t: DonateTarget): Promise<void> {
  if (DONATE_IN_BROWSER) {
    await Linking.openURL(donateUrl(t.fundraiserId, t.via));
    return;
  }
  router.push({
    pathname: '/donate',
    params: {
      fundraiserId: t.fundraiserId,
      orgId: t.orgId ?? '',
      title: t.title ?? '',
      orgStripeAccountId: t.orgStripeAccountId ?? '',
      paymentMethodType: t.paymentMethodType ?? '',
      paymentMethodUrl: t.paymentMethodUrl ?? '',
      paymentMethodLabel: t.paymentMethodLabel ?? '',
      via: t.via ?? '',
    },
  } as any);
}
