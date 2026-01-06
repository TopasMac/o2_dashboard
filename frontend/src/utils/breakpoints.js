// frontend/src/utils/breakpoints.js
import { useEffect, useState } from 'react';

export const BREAKPOINTS = {
  sm: 640,  // phones
  md: 768,  // small tablets
  lg: 1024, // tablets/landscape
  xl: 1280,
};

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const listener = (e) => setMatches(e.matches);
    mql.addEventListener?.('change', listener);
    // Safari fallback
    mql.addListener?.(listener);
    return () => {
      mql.removeEventListener?.('change', listener);
      mql.removeListener?.(listener);
    };
  }, [query]);

  return matches;
}

export function useIsMobile(max = BREAKPOINTS.sm) {
  return useMediaQuery(`(max-width: ${max}px)`);
}

export function useIsTablet(max = BREAKPOINTS.md) {
  return useMediaQuery(`(max-width: ${max}px)`);
}