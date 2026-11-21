// Push notifications for the web app / PWA (prayer times, people you follow going live).
// iPhone: only works once Siqa is added to the Home Screen from Safari (iOS 16.4+).
// Android Chrome and desktop browsers: works straight from the site.

import { Platform } from 'react-native';
import { supabase } from './supabase';

export const VAPID_PUBLIC_KEY = 'BPZ35-odsjV0w9QsOO8NLFb7P4u4EWtaIhzS6sEVxvPyAg2eFITjqUJxqsW7Q1YHMffCTwTeHxko9eUFhfTY2fc';

export type PushState = 'unsupported' | 'needs-home-screen' | 'denied' | 'off' | 'on';

const isWeb = () => Platform.OS === 'web' && typeof window !== 'undefined';
const isIOS = () => isWeb() && /iPhone|iPad|iPod/.test(navigator.userAgent);
const isStandalone = () => isWeb() && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);

function keyBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function pushState(): Promise<PushState> {
  if (!isWeb()) return 'unsupported';
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!supported) return isIOS() && !isStandalone() ? 'needs-home-screen' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Must be called from a tap (iPhone only shows the permission prompt after a user gesture). */
export async function enablePush(): Promise<PushState> {
  if (!isWeb()) return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return isIOS() && !isStandalone() ? 'needs-home-screen' : 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago';
  const { error } = await supabase.rpc('push_subscribe', {
    p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_timezone: tz, p_user_agent: navigator.userAgent,
  });
  if (error) throw new Error(error.message);
  return 'on';
}

export async function disablePush() {
  if (!isWeb()) return;
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe().catch(() => {});
  }
}

/** This device's subscription row (for the per-device Prayer / Live switches). */
export async function myPushRow(): Promise<{ id: string; prayer: boolean; live: boolean } | null> {
  if (!isWeb()) return null;
  const reg = await navigator.serviceWorker?.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return null;
  const { data } = await supabase.from('push_subscriptions').select('id, prayer, live').eq('endpoint', sub.endpoint).maybeSingle();
  return (data as { id: string; prayer: boolean; live: boolean }) ?? null;
}

export async function setPushTopic(id: string, topic: 'prayer' | 'live', on: boolean) {
  const { error } = await supabase.from('push_subscriptions').update({ [topic]: on }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Keep the service worker registered on every visit, so pushes keep arriving after updates. */
export function registerServiceWorker() {
  if (!isWeb() || !('serviceWorker' in navigator)) return;
  registration().catch(() => {});
}
