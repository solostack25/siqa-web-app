import React from 'react';
import { useIsFocused } from '@react-navigation/native';

/**
 * Screens inside the (tabs) group stay mounted after you leave them. For
 * detail pages (watch, speaker, seed, product, org) that means a video could
 * keep playing and old data could flash when the page is reused for another
 * id. Wrapping the screen renders it only while it's focused, so it behaves
 * like a normal pushed page while the bottom menu stays visible.
 */
export function focusedOnly<P extends object>(Screen: React.ComponentType<P>) {
  function FocusedOnly(props: P) {
    return useIsFocused() ? <Screen {...props} /> : null;
  }
  FocusedOnly.displayName = `FocusedOnly(${Screen.displayName || Screen.name || 'Screen'})`;
  return FocusedOnly;
}
