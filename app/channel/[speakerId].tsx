import { Redirect, useLocalSearchParams } from 'expo-router';

// /channel/:id was an older, duplicate speaker page. Everything now lives on
// /speaker/:id (tabs, real follow, verification). Keep this route so existing
// shared links still work, and send them to the current profile.
export default function ChannelRedirect() {
  const { speakerId } = useLocalSearchParams<{ speakerId: string }>();
  if (!speakerId) return <Redirect href={'/(tabs)' as any} />;
  return <Redirect href={`/speaker/${speakerId}` as any} />;
}
