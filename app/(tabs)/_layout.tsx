import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../lib/theme';
import { DiscoverIcon, HomeIcon, OrgsIcon, PlayIcon, SeedsIcon } from '../../components/Siqa';

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

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.bg2,
          borderTopColor: C.border,
          borderTopWidth: 0.5,
          height: 80,
          paddingBottom: 16,
          paddingTop: 8,
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
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Discover" icon={<DiscoverIcon color={focused ? C.gold : C.text3} />} />
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
