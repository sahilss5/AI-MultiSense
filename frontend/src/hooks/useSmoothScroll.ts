import { useCallback } from 'react';

/**
 * Industrial-Grade Responsive Scroll Hook
 * 
 * Provides 100% native, instant mouse-wheel & trackpad scrolling (zero artificial lag/damping)
 * while providing smooth, precise programmatic scrolling for navigation, buttons, and hash anchors.
 */
export function useSmoothScroll(_enabled: boolean = true) {
  const scrollTo = useCallback(
    (
      target: number | string | HTMLElement,
      options?: { offset?: number; duration?: number; immediate?: boolean }
    ) => {
      const immediate = options?.immediate ?? false;
      const offset = options?.offset ?? 0;
      const behavior: ScrollBehavior = immediate ? 'auto' : 'smooth';

      if (typeof target === 'number') {
        window.scrollTo({
          top: Math.max(0, target + offset),
          behavior,
        });
      } else if (typeof target === 'string') {
        const el = document.querySelector(target);
        if (el instanceof HTMLElement) {
          const targetY = el.getBoundingClientRect().top + window.scrollY + offset;
          window.scrollTo({
            top: Math.max(0, targetY),
            behavior,
          });
        }
      } else if (target instanceof HTMLElement) {
        const targetY = target.getBoundingClientRect().top + window.scrollY + offset;
        window.scrollTo({
          top: Math.max(0, targetY),
          behavior,
        });
      }
    },
    []
  );

  return { lenis: null, scrollTo };
}
