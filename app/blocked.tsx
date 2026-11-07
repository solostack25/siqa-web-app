// Settings › Blocked accounts: everyone you've blocked, with Unblock.

import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { DesktopShell, useIsDesktopWeb } from '../components/DesktopShell';
import { Button, IconButton } from '../components/ui';
import { font, radius, space, type, useDS } from '../lib/ds';
import { goBack } from '../lib/goBack';
import { HEADER_TOP_PADDING } from '../constants/theme';
import { useBlocked, unblockUser } from '../lib/blocks';

type P = { id: string; full_name: string | null; avatar_url: string | null };

export default function BlockedScreen() {
  const { c, shadow } = useDS();
  const isDesktop = useIsDesktopWeb();
  const insets = useSafeAreaInsets();
  const blocked = useBlocked();
  const [people, setPeople] = useState<Record<string, P>>({});
  const [loading, setLoading] = useState(true);
  const ids = [...blocked];

  useEffect(() => {
    const missing = ids.filter((id) => !people[id]);
    if (!missing.length) { setLoading(false); return; }
    supabase.from('profiles').select('id, full_name, avatar_url').in('id', missing).then(({ data }) => {
      setPeople((prev) => ({ ...prev, ...Object.fromEntries(((data ?? []) as P[]).map((p) => [p.id, p])) }));
      setLoading(false);
    });
  }, [blocked.size]);

  return (
    <DesktopShell>
      <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingHorizontal: space[5], paddingTop: isDesktop ? space[8] : Math.max(insets.top, HEADER_TOP_PADDING - 20), paddingBottom: 80 }}>
        <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center', gap: space[5] }}>
          <View style={{ marginLeft: -8 }}><IconButton icon="chevron-back" label="Back" onPress={() => goBack('/settings')} /></View>
          <View style={{ gap: 6 }}>
            <Text style={[type.title1 ?? type.display, { color: c.ink }]} accessibilityRole="header">Blocked accounts</Text>
            <Text style={[type.callout, { color: c.ink2 }]}>You don't see their comments, Gems or messages, and they can't message you. They aren't told when you block or unblock them.</Text>
          </View>
          {loading ? <ActivityIndicator color={c.gold} /> : ids.length === 0 ? (
            <Text style={[type.callout, { color: c.ink2, paddingVertical: space[4] }]}>You haven't blocked anyone.</Text>
          ) : (
            <View style={[{ backgroundColor: c.surface, borderRadius: radius.xl, paddingHorizontal: space[4] }, shadow('card')]}>
              {ids.map((id, i) => {
                const p = people[id];
                const name = p?.full_name?.trim() || 'Siqa member';
                return (
                  <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceSoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                      {p?.avatar_url ? <Image source={{ uri: p.avatar_url }} style={{ width: '100%', height: '100%' }} /> : <Text style={[type.subhead, font(700), { color: c.ink2 }]}>{name.charAt(0).toUpperCase()}</Text>}
                    </View>
                    <Text style={[type.body, font(600), { color: c.ink, flex: 1 }]} numberOfLines={1}>{name}</Text>
                    <Button label="Unblock" size="sm" variant="secondary" onPress={() => unblockUser(id)} />
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </DesktopShell>
  );
}
