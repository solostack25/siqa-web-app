import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Lightweight crash/error reporting into the client_errors table
// (supabase/migrations/20261103_view_counts_client_errors.sql).
// Admins see recent errors in Admin → App errors. No third-party account needed.

const MAX_PER_SESSION = 25;
let sentCount = 0;
const recent = new Set<string>();
let currentRoute: string | null = null;

export function setErrorRoute(route: string) {
  currentRoute = route;
}

function appVersion(): string | null {
  return (Constants.expoConfig?.version as string | undefined) ?? null;
}

export function reportError(err: unknown, source = 'manual', extra?: Record<string, unknown>) {
  try {
    if (sentCount >= MAX_PER_SESSION) return;
    const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
    const message = String(e.message || 'Unknown error').slice(0, 2000);
    // Don't send the same error over and over in one session.
    const key = `${source}:${message}`;
    if (recent.has(key)) return;
    recent.add(key);
    sentCount += 1;

    if (__DEV__) console.warn('[reportError]', source, message);

    void supabase
      .from('client_errors')
      .insert({
        platform: Platform.OS,
        app_version: appVersion(),
        route: currentRoute,
        source,
        message,
        stack: e.stack ? String(e.stack).slice(0, 8000) : null,
        extra: extra ?? null,
      })
      .then(() => {}, () => {});
  } catch {
    // Reporting must never crash the app.
  }
}

let installed = false;

/** Catch uncaught JS errors and unhandled promise rejections. Call once at startup. */
export function installGlobalErrorHandlers() {
  if (installed) return;
  installed = true;

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    window.addEventListener('error', (ev) => reportError(ev.error ?? ev.message, 'window.onerror'));
    window.addEventListener('unhandledrejection', (ev) => reportError(ev.reason, 'unhandledrejection'));
    return;
  }

  const g = globalThis as any;
  const ErrorUtils = g.ErrorUtils;
  if (ErrorUtils?.getGlobalHandler && ErrorUtils?.setGlobalHandler) {
    const previous = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
      reportError(error, isFatal ? 'fatal' : 'global');
      previous?.(error, isFatal);
    });
  }
}
