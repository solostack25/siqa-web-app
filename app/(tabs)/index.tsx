import { Redirect } from 'expo-router';
import { useIsDesktopWeb } from '../../components/DesktopShell';
import { appStartPath, shouldShowWelcome } from '../../lib/welcome';

// Phones open on Gems (like TikTok). Gems is built for a phone screen, so
// desktop opens on Home. The Marketplace site has only the Shop.
// First-time visitors to siqa.us see the welcome page first (lib/welcome.ts).
export default function Index() {
  const isDesktopWeb = useIsDesktopWeb();
  const target = shouldShowWelcome() ? '/welcome' : appStartPath(isDesktopWeb);
  return <Redirect href={target as any} />;
}
