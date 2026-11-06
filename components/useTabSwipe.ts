import { useEffect, useMemo, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { Platform } from 'react-native';
import { router, usePathname } from 'expo-router';

/**
 * Swipe sideways on a main tab to move to the next/previous tab, in the
 * bottom bar's order.
 *
 * Web/PWA: useTabSwipe() listens to document touch events (below).
 * Phone app: useNativeTabSwipeGesture() returns a gesture-handler Pan for a
 * GestureDetector around the tabs. Browser touch events don't exist there,
 * and plain PanResponders lose to iOS scroll views, so it has to be native.
 *
 * Only clearly horizontal, quick swipes count, and a swipe is ignored when it
 * starts inside something that scrolls sideways itself (category chips,
 * carousels), a form field, an embedded player, a video's own controls, an
 * open modal, or anything marked data-no-tab-swipe.
 */
const TAB_ORDER = ['/home', '/marketplace', '/gems', '/seeds', '/orgs'];

const MIN_DX = 70;          // px of sideways travel
const MAX_SLOPE = 0.5;      // |dy| must be under half of |dx|
const MAX_MS = 700;         // slow drags are scrolling/reading, not swiping

function blocksSwipe(start: EventTarget | null): boolean {
  let el = start as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return true;
  if (el.closest('input, textarea, select, iframe, [contenteditable="true"], [aria-modal="true"], [data-no-tab-swipe]')) return true;
  const video = el.closest('video');
  if (video && video.hasAttribute('controls')) return true;
  while (el && el !== document.body) {
    const style = window.getComputedStyle(el);
    if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
    el = el.parentElement;
  }
  return false;
}

export function useTabSwipe(enabled: boolean) {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled || typeof document === 'undefined') return;

    let start: { x: number; y: number; t: number } | null = null;

    function onStart(e: TouchEvent) {
      start = null;
      if (e.touches.length !== 1) return;
      if (!TAB_ORDER.includes(pathRef.current)) return;
      if (blocksSwipe(e.target)) return;
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY, t: Date.now() };
    }

    function onEnd(e: TouchEvent) {
      const s = start;
      start = null;
      if (!s) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < MIN_DX || Math.abs(dy) > Math.abs(dx) * MAX_SLOPE || Date.now() - s.t > MAX_MS) return;
      const i = TAB_ORDER.indexOf(pathRef.current);
      const next = TAB_ORDER[i + (dx < 0 ? 1 : -1)];
      if (next) router.navigate(next as any);
    }

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    const onCancel = () => { start = null; };
    document.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, [enabled]);
}

/**
 * Phone app (iOS/Android) version. Activates only on a clearly sideways drag
 * (25px), and gives up as soon as the finger moves 20px vertically, so normal
 * scrolling wins. Horizontal scrollers (chips, carousels) activate sooner
 * than this, so they keep their own swipes.
 */
export function useNativeTabSwipeGesture(enabled: boolean) {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  // Only live on the five main tabs, so it never fights a video scrubber or
  // a sideways carousel on other pages.
  const onTab = TAB_ORDER.includes(pathname);

  return useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled && onTab && Platform.OS !== 'web')
        .runOnJS(true)
        .activeOffsetX([-25, 25])
        .failOffsetY([-20, 20])
        .onEnd((e) => {
          const i = TAB_ORDER.indexOf(pathRef.current);
          if (i < 0) return;
          const dx = e.translationX;
          const fastEnough = Math.abs(e.velocityX) > 400;
          if (Math.abs(dx) < MIN_DX && !(fastEnough && Math.abs(dx) > 35)) return;
          if (Math.abs(e.translationY) > Math.abs(dx) * MAX_SLOPE) return;
          const next = TAB_ORDER[i + (dx < 0 ? 1 : -1)];
          if (next) router.navigate(next as any);
        }),
    [enabled, onTab],
  );
}
