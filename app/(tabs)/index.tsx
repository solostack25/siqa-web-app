import { Redirect } from 'expo-router';
import { IS_MARKETPLACE_SITE } from '../../lib/site';

// The app opens on Gems (like TikTok). Home lives at /home.
// The Marketplace site has only the Shop.
export default function Index() {
  return <Redirect href={(IS_MARKETPLACE_SITE ? '/marketplace' : '/gems') as any} />;
}
