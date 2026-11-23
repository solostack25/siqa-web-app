// The old moderation page is retired. Everything moved to the Siqa Admin console on the dashboard
// (Overview, Review queue, Organizations, Masjids, Moderation). /admin just sends you there.
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { openDashboard } from '../components/dashboard/links';
import { IS_DASHBOARD_SITE } from '../lib/site';
import { useDS } from '../lib/ds';

export default function AdminRedirect() {
  const { c } = useDS();
  useEffect(() => {
    if (IS_DASHBOARD_SITE) router.replace('/manage?space=admin&page=overview' as any);
    else openDashboard('admin');
  }, []);
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}><ActivityIndicator color={c.ink2} /></View>;
}
