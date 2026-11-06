import React from 'react';
import { View, Platform, useWindowDimensions } from 'react-native';
import { DesktopSidebar } from './DesktopSidebar';
import { DesktopTopBar } from './DesktopTopBar';

// Kept in one place so the tabs layout and the standalone routes
// (browse, watch, channel) can't drift out of sync on the breakpoint.
export const DESKTOP_BREAKPOINT = 900;

export function useIsDesktopWeb() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
}

// The tabs layout already draws the sidebar + top bar on desktop. Screens
// that live inside the tab group (browse, watch) still wrap themselves in
// DesktopShell, so it steps aside there instead of drawing a second sidebar.
export const InDesktopShell = React.createContext(false);

export function DesktopShell({ children }: { children: React.ReactNode }) {
  const isDesktopWeb = useIsDesktopWeb();
  const nested = React.useContext(InDesktopShell);

  if (!isDesktopWeb || nested) return <>{children}</>;

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <DesktopSidebar />
      <View style={{ flex: 1, flexDirection: 'column' }}>
        <DesktopTopBar />
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    </View>
  );
}
