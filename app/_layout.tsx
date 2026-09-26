import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider, useTheme, DarkColors, LightColors } from '../lib/theme';
import { Colors } from '../constants/colors';

// Stripe's native module doesn't support web — only import on native platforms.
const StripeProvider =
  Platform.OS === 'web'
    ? ({ children }: any) => children
    : require('@stripe/stripe-react-native').StripeProvider;

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

const STRIPE_PUBLISHABLE_KEY = 'pk_test_51T2HncK5xjtBKuF4Y965OsNOGhXJ16tWfdELCQjCVxYBGB9KK8MilrSuuO43Qu7aExBp3uIQh9sEWqnPrInHyBjY00lN8XtXAb';

function AppContent() {
  const { isDark, mode, colors: C } = useTheme();
  const [initialized, setInitialized] = useState(false);

  // Keep legacy static Colors imports in sync before screens render.
  // This is important because many existing screens build StyleSheet values from Colors.
  Object.assign(Colors, isDark ? DarkColors : LightColors);

  useEffect(() => {
    supabase.auth.getSession().then(() => {
      setInitialized(true);
      SplashScreen.hideAsync();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {}
    );

    return () => subscription.unsubscribe();
  }, []);

  if (!initialized) return null;

  const stripeProps =
    Platform.OS === 'web'
      ? {}
      : {
          publishableKey: STRIPE_PUBLISHABLE_KEY,
          merchantIdentifier: 'merchant.com.siqa.app',
        };

  // ScrollViewStyleReset (in app/+html.tsx) locks #root/body/html to
  // exactly height:100% with body{overflow:hidden} — a fixed, non-
  // scrolling viewport frame by design, with each screen expected to
  // manage its own scrolling inside it. But Expo Router's Stack wraps
  // every screen in its own transition container (for slide_from_right
  // etc.), which isn't part of that #root/body/html chain — breaking
  // it, so a screen's own height:100%/flex:1 had nothing real to
  // measure against and collapsed to fit its (very tall) content
  // instead of the viewport. That let the page overflow past body's
  // own painted background, showing raw white beneath. Rather than
  // patch every individual screen and Expo Router's internal wrapper,
  // this puts one solid, explicitly full-height backdrop at the true
  // app root, above all of that, so background coverage never depends
  // on any wrapper in between doing the right thing.
  //
  // First pass used minHeight:100vh here, which was wrong — minHeight
  // lets the box grow taller than the viewport when a screen's content
  // is tall (which it always is), so the whole app grew past one
  // screen's height and pushed the bottom tab bar down off-screen
  // instead of keeping it pinned. This needs a hard height:100vh clamp
  // (plus overflow:hidden as a backstop) so the root never grows —
  // every screen's own internal scrolling absorbs the extra content
  // instead, same as ScrollViewStyleReset already does for body itself.
  const rootBackdropStyle =
    Platform.OS === 'web'
      ? { flex: 1, backgroundColor: C.bg, height: '100vh' as any, overflow: 'hidden' as any }
      : { flex: 1, backgroundColor: C.bg };

  return (
    <View style={rootBackdropStyle}>
    <StripeProvider {...stripeProps}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={isDark ? '#0A0D0B' : '#F5F3EE'} />
      <Stack key={`${mode}-${isDark ? 'dark' : 'light'}`} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="speaker/[id]" options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }} />
        <Stack.Screen name="seed/[id]" options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }} />
        <Stack.Screen name="product/[id]" options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }} />
        <Stack.Screen name="cart" options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }} />
        <Stack.Screen name="messages/index" options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }} />
        <Stack.Screen name="messages/[id]" options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }} />
        <Stack.Screen name="sell" options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }} />
        <Stack.Screen name="listing-create" options={{ headerShown: false, animation: 'slide_from_bottom', gestureEnabled: true }} />
        <Stack.Screen name="seller-dashboard" options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }} />
        <Stack.Screen name="orders" options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }} />
        <Stack.Screen name="checkout" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="order-success" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="donate" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="donate-success" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="org-profile" options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }} />
        <Stack.Screen name="org-register" options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }} />
        <Stack.Screen name="settings" options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }} />
        <Stack.Screen name="gem-upload" options={{ headerShown: false, animation: 'slide_from_bottom', gestureEnabled: true }} />
        <Stack.Screen name="seed-create" options={{ headerShown: false, animation: 'slide_from_bottom', gestureEnabled: true }} />
        <Stack.Screen name="admin" options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }} />
      </Stack>
    </StripeProvider>
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}