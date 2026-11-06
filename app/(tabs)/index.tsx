import { Redirect } from 'expo-router';
import { IS_MARKETPLACE_SITE } from '../../lib/site';
import { useIsDesktopWeb } from '../../components/DesktopShell';

// Phones open on Gems (like TikTok). Gems is built for a phone screen, so
// desktop opens on Home. The Marketplace site has only the Shop.
export default function Index() {
  const isDesktopWeb = useIsDesktopWeb();
  const target = IS_MARKETPLACE_SITE ? '/marketplace' : isDesktopWeb ? '/home' : '/gems';
  return <Redirect href={target as any} />;
}
