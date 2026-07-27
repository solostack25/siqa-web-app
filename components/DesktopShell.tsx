import React from 'react';
import { View, Platform, useWindowDimensions } from 'react-native';
import { DesktopSidebar } from './DesktopSidebar';

// Kept in one place so the tabs layout and the standalone routes
// (browse, watch, channel) can't drift out of sync on the breakpoint.
export const DESKTOP_BREAKPOINT = 900;

export function useIsDesktopWeb() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
}

export function DesktopShell({ children }: { children: React.ReactNode }) {
  const isDesktopWeb = useIsDesktopWeb();

  if (!isDesktopWeb) return <>{children}</>;

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <DesktopSidebar />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}
