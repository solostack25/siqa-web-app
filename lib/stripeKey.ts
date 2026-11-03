// Stripe publishable key.
//
// Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to your LIVE key (pk_live_...) for
// launch, in two places:
//   • EAS (iOS/Android builds):  eas env:create --name EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY --value pk_live_... --environment production
//   • Vercel (web):              Project → Settings → Environment Variables (Production)
//
// The test key below is only used in local development (__DEV__). A
// production build without the env var gets an empty key, so checkout
// fails loudly instead of silently taking test-mode payments.
const TEST_KEY =
  'pk_test_51T2HncK5xjtBKuF4Y965OsNOGhXJ16tWfdELCQjCVxYBGB9KK8MilrSuuO43Qu7aExBp3uIQh9sEWqnPrInHyBjY00lN8XtXAb';

const fromEnv = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

export const STRIPE_PUBLISHABLE_KEY: string = fromEnv || (__DEV__ ? TEST_KEY : '');

export const STRIPE_IS_LIVE = STRIPE_PUBLISHABLE_KEY.startsWith('pk_live_');

if (!STRIPE_PUBLISHABLE_KEY) {
  console.error('[Siqa] EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set — payments will not work in this build.');
}
