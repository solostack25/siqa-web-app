import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
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
  const { isDark, mode } = useTheme();
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

  return (
    <StripeProvider {...stripeProps}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={isDark ? '#0A0D0B' : '#F5F3EE'} />
      <Stack key={`${mode}-${isDark ? 'dark' : 'light'}`} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="speaker/[id]" options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }} />
        <Stack.Screen name="donate" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="donate-success" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="org-profile" options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }} />
        <Stack.Screen name="org-register" options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }} />
        <Stack.Screen name="gem-upload" options={{ headerShown: false, animation: 'slide_from_bottom', gestureEnabled: true }} />
        <Stack.Screen name="seed-create" options={{ headerShown: false, animation: 'slide_from_bottom', gestureEnabled: true }} />
        <Stack.Screen name="admin" options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }} />
      </Stack>
    </StripeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}