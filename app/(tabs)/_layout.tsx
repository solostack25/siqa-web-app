import React from 'react';
import { Tabs, usePathname } from 'expo-router';
import { View, Text, StyleSheet, Platform, Easing, useWindowDimensions } from 'react-native';
import { useTheme } from '../../lib/theme';
import { ChaiIcon, DiscoverIcon, GemIcon, HomeIcon, SeedsIcon } from '../../components/Siqa';
import { DesktopSidebar } from '../../components/DesktopSidebar';
import { DesktopTopBar } from '../../components/DesktopTopBar';
import { useIsDesktopWeb, InDesktopShell } from '../../components/DesktopShell';
import { IS_MARKETPLACE_SITE } from '../../lib/site';
import { brandStyles } from '../../lib/ds';
import { useTabSwipe, useNativeTabSwipeGesture } from '../../components/useTabSwipe';
import { GestureDetector } from 'react-native-gesture-handler';

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

// The five main tabs, in bottom-bar order. Moving between them slides the
// screens sideways like pages (old one out, new one in from the side you're
// heading to). Detail screens inside the tab group (seed, org profile, watch…)
// keep opening instantly.
const SLIDE_TABS = new Set(['home', 'marketplace', 'gems', 'seeds', 'chai']);

export default function TabsLayout() {
  const { colors: C, isDark } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const { width } = useWindowDimensions();
  const slide = !isDesktopWeb && !IS_MARKETPLACE_SITE;
  // Local & services lives under the Shop tab.
  const pathname = usePathname();
  const onLocal = pathname.startsWith('/local');
  // Organizations live under the Seeds tab.
  const onOrgs = pathname.startsWith('/orgs');
  // Swipe sideways between the main tabs (phone web/PWA).
  useTabSwipe(!isDesktopWeb && !IS_MARKETPLACE_SITE);
  // Same thing on the phone app.
  const nativeSwipe = useNativeTabSwipeGesture(Platform.OS !== 'web' && !IS_MARKETPLACE_SITE);

  const tabs = (
    <Tabs
      // Back returns to the tab/screen you came from, not always to the first tab.
      backBehavior="history"
      screenOptions={({ route }) => ({
        ...(slide && SLIDE_TABS.has(route.name)
          ? {
              animation: 'shift' as const,
              transitionSpec: {
                animation: 'timing' as const,
                config: { duration: 280, easing: Easing.out(Easing.cubic) },
              },
              // progress: 0 = this tab is showing, 1 = it sits to the right of
              // the focused tab, -1 = to the left. Full-width slide.
              sceneStyleInterpolator: ({ current }: any) => ({
                sceneStyle: {
                  transform: [{
                    translateX: current.progress.interpolate({
                      inputRange: [-1, 0, 1],
                      outputRange: [-width, 0, width],
                    }),
                  }],
                },
              }),
            }
          : { animation: 'none' as const }),
        headerShown: false,
        // The Marketplace site has only the Shop, so no tab bar at all
        // (the Shop header has cart, messages and account buttons).
        tabBarStyle: isDesktopWeb || IS_MARKETPLACE_SITE
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
      })}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen
        name="home"
        options={{
          ...(IS_MARKETPLACE_SITE ? { href: null } : {}),
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
            <TabIcon focused={focused || onLocal} label="Shop" icon={<DiscoverIcon color={focused || onLocal ? C.gold : C.text3} />} />
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="gems"
        options={{
          ...(IS_MARKETPLACE_SITE ? { href: null } : {}),
          title: 'Gems',
          tabBarIcon: () => (
            // Gems mark (brand kit): gold gem on navy in Light; colors flip
            // in Night so the tile doesn't disappear into the dark bar.
            <View style={[styles.gemsBtn, { backgroundColor: isDark ? '#d4ac73' : '#0a0f1c' }]} accessibilityLabel="Gems">
              <GemIcon size={24} strokeWidth={2} color={isDark ? '#0a0f1c' : '#d4ac73'} />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="seeds"
        options={{
          ...(IS_MARKETPLACE_SITE ? { href: null } : {}),
          title: 'Seeds',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused || onOrgs} label="Seeds" icon={<SeedsIcon color={focused || onOrgs ? C.emeraldLight : C.text3} />} />
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="local"
        options={{ href: null, title: 'Local & services' }}
      />
      {/* Inside the tab group so the bottom menu stays visible on them. */}
      <Tabs.Screen name="browse" options={{ href: null, title: 'Browse' }} />
      <Tabs.Screen name="watch/[videoId]" options={{ href: null, title: 'Watch' }} />
      <Tabs.Screen name="speaker/[id]" options={{ href: null, title: 'Speaker' }} />
      <Tabs.Screen name="org-profile" options={{ href: null, title: 'Organization' }} />
      <Tabs.Screen name="seed/[id]" options={{ href: null, title: 'Seed' }} />
      <Tabs.Screen name="product/[id]" options={{ href: null, title: 'Product' }} />
      <Tabs.Screen name="shop/[id]" options={{ href: null, title: 'Shop' }} />
      <Tabs.Screen name="org-listing/[id]" options={{ href: null, title: 'Organization' }} />
      {/* Organizations moved inside the Seeds tab (Seeds | Organizations). */}
      <Tabs.Screen name="orgs" options={{ href: null, title: 'Organizations' }} />
      <Tabs.Screen name="chai/[id]" options={{ href: null, title: 'Chai' }} />
      <Tabs.Screen
        name="chai"
        options={{
          ...(IS_MARKETPLACE_SITE ? { href: null } : {}),
          title: 'Chai',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Chai" icon={<ChaiIcon size={24} color={focused ? C.gold : C.text3} />} />
          ),
          tabBarLabel: () => null,
        }}
      />
    </Tabs>
  );

  if (Platform.OS !== 'web') {
    return (
      <GestureDetector gesture={nativeSwipe}>
        <View style={{ flex: 1 }} collapsable={false}>{tabs}</View>
      </GestureDetector>
    );
  }
  if (!isDesktopWeb) return tabs;

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: C.bg }}>
      <DesktopSidebar />
      <View style={{ flex: 1, flexDirection: 'column' }}>
        <DesktopTopBar />
        <View style={{ flex: 1 }}><InDesktopShell.Provider value>{tabs}</InDesktopShell.Provider></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create(brandStyles({
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
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
