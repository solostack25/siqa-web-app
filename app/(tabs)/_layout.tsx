import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../../lib/theme';
import { DiscoverIcon, HomeIcon, OrgsIcon, PlayIcon, SeedsIcon } from '../../components/Siqa';
import { DesktopSidebar } from '../../components/DesktopSidebar';
import { DesktopTopBar } from '../../components/DesktopTopBar';
import { useIsDesktopWeb } from '../../components/DesktopShell';

type TabIconProps = {
  focused: boolean;
  label: string;
  icon: React.ReactNode;
};

function TabIcon({ focused, label, icon }: TabIconProps) {
  const { colors: C } = useTheme();
  return (
    <View style={styles.tabItem}>
      {icon}
      <Text style={[styles.tabLabel, { color: focused ? C.gold : C.text3 }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const { colors: C } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();

  const tabs = (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: isDesktopWeb
          ? { display: 'none' }
          : {
              // Was C.bg2 - a visibly different shade from every screen's
              // content background (C.bg), which showed up as a seam/gap
              // right above the tab bar wherever content didn't reach it.
              backgroundColor: C.bg,
              borderTopColor: C.border,
              borderTopWidth: 0.5,
              height: 80,
              // Native needs the extra bottom padding to clear the phone's
              // gesture bar / home indicator; web has no such overlay, so
              // that asymmetry (8 top / 16 bottom) was just pushing the
              // icon+label content 4px above true vertical center.
              paddingBottom: Platform.OS === 'web' ? 12 : 16,
              paddingTop: Platform.OS === 'web' ? 12 : 8,
            },
        tabBarItemStyle: {
          alignItems: 'center',
          justifyContent: 'center',
        },
        tabBarActiveTintColor: C.gold,
        tabBarInactiveTintColor: C.text3,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Home" icon={<HomeIcon color={focused ? C.gold : C.text3} />} />
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="marketplace"
        options={{
          title: 'Marketplace',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Shop" icon={<DiscoverIcon color={focused ? C.gold : C.text3} />} />
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="gems"
        options={{
          title: 'Gems',
          tabBarIcon: () => (
            <View style={[styles.gemsBtn, { backgroundColor: C.gold }]}> 
              <PlayIcon color={C.bg} />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="seeds"
        options={{
          title: 'Seeds',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Seeds" icon={<SeedsIcon color={focused ? C.emeraldLight : C.text3} />} />
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="orgs"
        options={{
          title: 'Orgs',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Orgs" icon={<OrgsIcon color={focused ? C.gold : C.text3} />} />
          ),
          tabBarLabel: () => null,
        }}
      />
    </Tabs>
  );

  if (!isDesktopWeb) return tabs;

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: C.bg }}>
      <DesktopSidebar />
      <View style={{ flex: 1, flexDirection: 'column' }}>
        <DesktopTopBar />
        <View style={{ flex: 1 }}>{tabs}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    width: 68,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  gemsBtn: {
    width: 46,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
