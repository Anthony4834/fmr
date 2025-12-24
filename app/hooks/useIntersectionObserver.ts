'use client';

import { useState, useEffect, useRef, MutableRefObject } from 'react';

interface UseIntersectionObserverOptions {
  threshold?: number | number[];
  rootMargin?: string;
  triggerOnce?: boolean;
  enabled?: boolean;
}

interface UseIntersectionObserverReturn<T> {
  ref: MutableRefObject<T | null>;
  isInView: boolean;
  hasBeenInView: boolean;
}

export function useIntersectionObserver<T extends HTMLElement = HTMLDivElement>({
  threshold = 0.1,
  rootMargin = '0px',
  triggerOnce = true,
  enabled = true,
}: UseIntersectionObserverOptions = {}): UseIntersectionObserverReturn<T> {
  const ref = useRef<T | null>(null);
  const [isInView, setIsInView] = useState(false);
  const [hasBeenInView, setHasBeenInView] = useState(false);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const element = ref.current;
    if (!element) return;

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
      { threshold, rootMargin }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin, triggerOnce, enabled]);

  return { ref, isInView, hasBeenInView };
}

export default useIntersectionObserver;
