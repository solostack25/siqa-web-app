import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { router, usePathname } from 'expo-router';

/**
 * Swipe sideways on a main tab to move to the next/previous tab, in the
 * bottom bar's order. Web/PWA only for now (touch screens).
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
