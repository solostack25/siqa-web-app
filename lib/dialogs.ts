import { Alert, Platform } from 'react-native';

/**
 * Cross-platform dialogs. React Native's Alert.alert does nothing on
 * react-native-web, so confirm/prompt flows built on it silently never
 * fire there. These use the browser dialogs on web and Alert on native.
 */

export function confirmDialog(title: string, message: string, confirmLabel = 'Confirm'): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : false);
  }
  return new Promise(resolve => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

/** Returns the entered text, '' if left blank, or null if cancelled. */
export function promptDialog(title: string, message: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return Promise.resolve(null);
    const v = window.prompt(`${title}\n\n${message}`, '');
    return Promise.resolve(v === null ? null : v.trim());
  }
  if (Platform.OS === 'ios' && (Alert as any).prompt) {
    return new Promise(resolve => {
      (Alert as any).prompt(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        { text: 'OK', onPress: (text: string) => resolve((text ?? '').trim()) },
      ]);
    });
  }
  // Android has no text prompt; fall back to a plain confirm with no reason.
  return confirmDialog(title, message).then(ok => (ok ? '' : null));
}

export function notifyDialog(title: string, message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

type AlertButton = { text?: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void | Promise<void> };

/**
 * Drop-in for Alert.alert that also works on web: a single action becomes a
 * browser confirm() that runs that action's onPress; no actions becomes alert().
 */
export const WebSafeAlert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    if (Platform.OS !== 'web') {
      Alert.alert(title, message, buttons as any);
      return;
    }
    if (typeof window === 'undefined') return;
    const actions = (buttons ?? []).filter(b => b.style !== 'cancel');
    if (actions.length === 0) {
      window.alert(message ? `${title}\n\n${message}` : title);
      (buttons ?? [])[0]?.onPress?.();
      return;
    }
    if (window.confirm(message ? `${title}\n\n${message}` : title)) {
      actions[actions.length - 1].onPress?.();
    } else {
      (buttons ?? []).find(b => b.style === 'cancel')?.onPress?.();
    }
  },
};
