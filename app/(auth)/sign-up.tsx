import { Redirect } from 'expo-router';

// One Create Account screen: the sign-in screen's "Create Account" tab has the
// role picker (Community Member / Speaker / Organization / Seller) and
// Apple/Google sign-in. Old links to /sign-up land there.
export default function SignUpRedirect() {
  return <Redirect href={{ pathname: '/(auth)/sign-in', params: { mode: 'signup' } } as any} />;
}
