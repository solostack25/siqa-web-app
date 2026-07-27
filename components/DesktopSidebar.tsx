import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useTheme } from '../lib/theme';
import { HomeIcon, DiscoverIcon, OrgsIcon, PlayIcon, SeedsIcon, SiqaWordmark } from './Siqa';

type NavItem = {
  key: string;
  label: string;
  path: string;
  // Pathname prefixes that should count as "active" for this item,
  // since /watch and /channel are reached from the video feed but
  // aren't literally the "/" route.
  matchPrefixes: string[];
  icon: (color: string) => React.ReactNode;
};

export function DesktopSidebar() {
  const { colors: C } = useTheme();
  const pathname = usePathname();

  const items: NavItem[] = [
    {
      key: 'home',
      label: 'Home',
      path: '/(tabs)',
      matchPrefixes: ['/', '/watch', '/channel', '/browse'],
      icon: (color) => <HomeIcon color={color} />,
    },
    {
      key: 'gems',
      label: 'Gems',
      path: '/(tabs)/gems',
      matchPrefixes: ['/gems'],
      icon: (color) => <PlayIcon color={color} size={16} />,
    },
    {
      key: 'discover',
      label: 'Discover',
      path: '/(tabs)/discover',
      matchPrefixes: ['/discover'],
      icon: (color) => <DiscoverIcon color={color} />,
    },
    {
      key: 'seeds',
      label: 'Seeds',
      path: '/(tabs)/seeds',
      matchPrefixes: ['/seeds'],
      icon: (color) => <SeedsIcon color={color} />,
    },
    {
      key: 'orgs',
      label: 'Orgs',
      path: '/(tabs)/orgs',
      matchPrefixes: ['/orgs'],
      icon: (color) => <OrgsIcon color={color} />,
    },
  ];

  function isActive(item: NavItem) {
    if (item.key === 'home') return pathname === '/' || pathname.startsWith('/watch') || pathname.startsWith('/channel') || pathname.startsWith('/browse');
    return item.matchPrefixes.some((p) => pathname.startsWith(p));
  }

  const styles = makeStyles(C);

  return (
    <View style={styles.sidebar}>
      <TouchableOpacity style={styles.logoRow} onPress={() => router.push('/(tabs)' as any)}>
        <SiqaWordmark size={22} />
      </TouchableOpacity>

      <View style={styles.navList}>
        {items.map((item) => {
          const active = isActive(item);
          const isGems = item.key === 'gems';
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.navItem, active && styles.navItemActive]}
              onPress={() => router.push(item.path as any)}
            >
              <View style={[styles.iconWrap, isGems && { backgroundColor: active ? C.gold : C.surface2 }]}>
                {item.icon(isGems ? (active ? C.bg : C.gold) : active ? C.gold : C.text3)}
              </View>
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    sidebar: {
      width: 220,
      flexShrink: 0,
      backgroundColor: C.bg2,
      borderRightWidth: 0.5,
      borderRightColor: C.border,
      paddingTop: 20,
      paddingHorizontal: 12,
    },
    logoRow: { paddingHorizontal: 12, paddingBottom: 24, paddingTop: 4 },
    navList: { gap: 4 },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
    },
    navItemActive: { backgroundColor: C.surface },
    iconWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navLabel: { fontSize: 14, fontWeight: '500', color: C.text2 },
    navLabelActive: { color: C.text, fontWeight: '700' },
  });
}
