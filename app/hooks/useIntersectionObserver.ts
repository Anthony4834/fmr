'use client';

import { useState, useEffect, useRef, MutableRefObject } from 'react';

interface UseIntersectionObserverOptions {
  threshold?: number | number[];
  rootMargin?: string;
  triggerOnce?: boolean;
  enabled?: boolean;
  /** Higher threshold for mobile (narrower viewports where elements are taller relative to screen) */
  mobileThreshold?: number | number[];
  /** Root margin for mobile - use negative values to require more visibility */
  mobileRootMargin?: string;
}

interface UseIntersectionObserverReturn<T> {
  ref: MutableRefObject<T | null>;
  isInView: boolean;
  hasBeenInView: boolean;
}

// Breakpoint for mobile detection (matches Tailwind's sm breakpoint)
const MOBILE_BREAKPOINT = 640;

export function useIntersectionObserver<T extends HTMLElement = HTMLDivElement>({
  threshold = 0.1,
  rootMargin = '0px',
  triggerOnce = true,
  enabled = true,
  mobileThreshold,
  mobileRootMargin,
}: UseIntersectionObserverOptions = {}): UseIntersectionObserverReturn<T> {
  const ref = useRef<T | null>(null);
  const [isInView, setIsInView] = useState(false);
  const [hasBeenInView, setHasBeenInView] = useState(false);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const element = ref.current;
    if (!element) return;

    // Detect if we're on mobile and should use mobile-specific settings
    const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
    const effectiveThreshold = isMobile && mobileThreshold !== undefined ? mobileThreshold : threshold;
    const effectiveRootMargin = isMobile && mobileRootMargin !== undefined ? mobileRootMargin : rootMargin;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const inView = entry.isIntersecting;
        setIsInView(inView);

        if (inView) {
          setHasBeenInView(true);

          if (triggerOnce) {
            observer.unobserve(element);
          }
        }
      },
      { threshold: effectiveThreshold, rootMargin: effectiveRootMargin }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin, triggerOnce, enabled, mobileThreshold, mobileRootMargin]);

  return { ref, isInView, hasBeenInView };
}

export default useIntersectionObserver;
