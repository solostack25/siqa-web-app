// Stripe publishable key. Set EXPO_PUBLIC_STRIPE_PK to the LIVE key
// (pk_live_…) in Vercel (Production) and in EAS for app builds.
// Publishable keys are safe to ship to browsers; the secret key never is.
// Falls back to the test key so local/preview builds keep working.
const TEST_KEY =
  'pk_test_51T2HncK5xjtBKuF4Y965OsNOGhXJ16tWfdELCQjCVxYBGB9KK8MilrSuuO43Qu7aExBp3uIQh9sEWqnPrInHyBjY00lN8XtXAb';

export const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PK || TEST_KEY;
export const STRIPE_IS_LIVE = STRIPE_PUBLISHABLE_KEY.startsWith('pk_live_');
