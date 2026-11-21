import { View, Text, ScrollView, useWindowDimensions } from 'react-native';
import { HEADER_TOP_PADDING } from '../constants/theme';
import { DesktopShell, useIsDesktopWeb } from '../components/DesktopShell';
import { IconButton } from '../components/ui';
import { space, type, useDS } from '../lib/ds';
import { goBack } from '../lib/goBack';
import CreateHub from '../components/studio/CreateHub';

// Create: go live, record or upload. The same page is the "Create" tab in the dashboard's Studio space.
export default function CreateScreen() {
  const { c } = useDS();
  const isDesktop = useIsDesktopWeb();
  const { width } = useWindowDimensions();
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
