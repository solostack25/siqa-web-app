import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useIsDesktopWeb } from '../../components/DesktopShell';
import { appStartPath, shouldShowWelcome } from '../../lib/welcome';
import { supabase } from '../../lib/supabase';

// Phones open on Gems (like TikTok). Gems is built for a phone screen, so
// desktop opens on Home. The Marketplace site has only the Shop.
// First-time visitors to siqa.us see the welcome page first (lib/welcome.ts);
// signed-in people skip it (including right after Apple/Google sign-in).
export default function Index() {
  const isDesktopWeb = useIsDesktopWeb();
  const welcome = shouldShowWelcome();
  // The root layout waits for Supabase to load the session (and read any
  // sign-in tokens from the URL) before rendering, so this resolves at once.
  const [signedIn, setSignedIn] = useState<boolean | null>(welcome ? null : false);
  useEffect(() => {
    if (!welcome) return;
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, [welcome]);
  if (signedIn === null) return null;
  const target = welcome && !signedIn ? '/welcome' : appStartPath(isDesktopWeb);
  return <Redirect href={target as any} />;
}
