import { View, Text, ScrollView, useWindowDimensions } from 'react-native';
import { HEADER_TOP_PADDING } from '../constants/theme';
import { DesktopShell, useIsDesktopWeb } from '../components/DesktopShell';
import { IconButton } from '../components/ui';
import { space, type, useDS } from '../lib/ds';
import { goBack } from '../lib/goBack';
import CreateHub from '../components/studio/CreateHub';
import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { supabase } from '../lib/supabase';

// Create: for speakers this is their home in the dashboard (Go live, Upload, My videos, Help).
// Everyone else can still upload here.
export default function CreateScreen() {
  const { c } = useDS();
  const [speaker, setSpeaker] = useState<boolean | null>(null);
  useEffect(() => { supabase.rpc('studio_my_speaker').then(({ data }) => setSpeaker(((data as unknown[]) || []).length > 0)); }, []);
  const isDesktop = useIsDesktopWeb();
  const { width } = useWindowDimensions();
  if (speaker) return <Redirect href={'/manage?space=studio' as any} />;
  if (speaker === null) return null;
  return (
    <DesktopShell>
      <ScrollView style={{ flex: 1, backgroundColor: c.bgSunk }} contentContainerStyle={{ paddingTop: HEADER_TOP_PADDING + space[4], paddingBottom: 64, paddingHorizontal: isDesktop ? space[10] : space[5] }}>
        <View style={{ width: '100%', maxWidth: 900, alignSelf: 'center', gap: space[6] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
            <IconButton icon="arrow-back" label="Back" variant="raised" onPress={() => goBack('/studio')} />
            <View style={{ flexShrink: 1 }}>
              <Text style={[type.title1, { color: c.ink }]} accessibilityRole="header">Create</Text>
              <Text style={[type.subhead, { color: c.ink2 }]}>Go live, record or upload</Text>
            </View>
          </View>
          <CreateHub wide={width >= 760} />
        </View>
      </ScrollView>
    </DesktopShell>
  );
}
