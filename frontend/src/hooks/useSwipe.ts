import { useRef, type TouchEvent } from "react";

const MIN_DISTANCE = 50; // px

/**
 * Horizontal swipe handlers to spread on an element. Touch events only, so mouse and
 * trackpad never trigger them; mostly-vertical drags (page scroll) are ignored.
 */
export function useSwipe(onLeft: () => void, onRight: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => {
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchCancel: () => {
      start.current = null;
    },
    onTouchEnd: (e: TouchEvent) => {
      const from = start.current;
      start.current = null;
      if (!from) return;
      const dx = e.changedTouches[0].clientX - from.x;
      const dy = e.changedTouches[0].clientY - from.y;
      if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      (dx < 0 ? onLeft : onRight)();
    },
  };
}
