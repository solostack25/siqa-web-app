// Remote-control navigation for TV pages: the arrow keys move focus to the nearest
// focusable tile in that direction, OK/Enter presses it, Back/Escape calls onBack.
// Tiles are plain buttons marked with data-tv="1".
import { useEffect } from 'react';
import { Platform } from 'react-native';

export function useTVFocus(onBack?: () => void, deps: unknown[] = []) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const tiles = () => Array.from(document.querySelectorAll<HTMLElement>('[data-tv="1"]')).filter((el) => el.offsetParent !== null);
    const focusFirst = () => {
      const active = document.activeElement as HTMLElement | null;
      if (active && active.dataset?.tv === '1') return;
      const first = document.querySelector<HTMLElement>('[data-tv-default="1"]') ?? tiles()[0];
      first?.focus();
    };
    const t = setTimeout(focusFirst, 300);

    const onKey = (e: KeyboardEvent) => {
      const dir = ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as Record<string, 'up' | 'down' | 'left' | 'right'>)[e.key];
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack' || e.key === 'BrowserBack') {
        if (onBack) { e.preventDefault(); onBack(); }
        return;
      }
      if (!dir) return;
      const cur = document.activeElement as HTMLElement | null;
      const all = tiles();
      if (!cur || !all.includes(cur)) { e.preventDefault(); all[0]?.focus(); return; }
      const a = cur.getBoundingClientRect();
      const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
      let best: HTMLElement | null = null, bestScore = Infinity;
      for (const el of all) {
        if (el === cur) continue;
        const b = el.getBoundingClientRect();
        const bx = b.left + b.width / 2, by = b.top + b.height / 2;
        const dx = bx - ax, dy = by - ay;
        const ok = dir === 'right' ? dx > 4 : dir === 'left' ? dx < -4 : dir === 'down' ? dy > 4 : dy < -4;
        if (!ok) continue;
        // Prefer staying in the same row/column: penalize sideways distance heavily.
        const main = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy);
        const cross = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
        const score = main + cross * 2.5;
        if (score < bestScore) { bestScore = score; best = el; }
      }
      if (best) {
        e.preventDefault();
        best.focus();
        best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Props that make a Pressable a remote-focusable tile on the web. */
export const tvTile = (isDefault = false) => (Platform.OS === 'web' ? ({ dataSet: { tv: '1', ...(isDefault ? { tvDefault: '1' } : {}) }, focusable: true } as any) : {});
