// The masjid console now lives in the Siqa dashboard (dashboard.siqa.us → Masjid space).
// Old links to /masjid-admin forward there, keeping the masjid and section.
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function MasjidConsoleRedirect() {
  const { org, section } = useLocalSearchParams<{ org?: string; section?: string }>();
  const params = new URLSearchParams();
  params.set('space', org ? `masjid:${org}` : 'masjid');
  if (section) params.set('page', section);
  return <Redirect href={`/manage?${params.toString()}` as any} />;
}
