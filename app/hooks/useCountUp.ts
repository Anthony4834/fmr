'use client';

import { useState, useEffect, useRef } from 'react';

interface UseCountUpOptions {
  start?: number;
  end: number;
  duration?: number;
  delay?: number;
  enabled?: boolean;
  decimals?: number;
  easing?: 'linear' | 'easeOut' | 'easeInOut';
}

export function useCountUp({
  start = 0,
  end,
  duration = 2000,
  delay = 0,
  enabled = true,
  decimals = 0,
  easing = 'easeOut',
}: UseCountUpOptions) {
  const [count, setCount] = useState(start);
  const [isComplete, setIsComplete] = useState(false);
  const frameRef = useRef<number>();
  const startTimeRef = useRef<number>();

  useEffect(() => {
    if (!enabled) {
      setCount(start);
      setIsComplete(false);
      return;
    }

    const easingFunctions = {
      linear: (t: number) => t,
      easeOut: (t: number) => 1 - Math.pow(1 - t, 3),
      easeInOut: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    };

    const easeFn = easingFunctions[easing];

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp + delay;
      }

      const elapsed = timestamp - startTimeRef.current;

      if (elapsed < 0) {
        frameRef.current = requestAnimationFrame(animate);
        return;
      }

      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeFn(progress);
      const currentValue = start + (end - start) * easedProgress;

      setCount(Number(currentValue.toFixed(decimals)));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setIsComplete(true);
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [start, end, duration, delay, enabled, decimals, easing]);

  const reset = () => {
    setCount(start);
    setIsComplete(false);
    startTimeRef.current = undefined;
  };

  return { count, isComplete, reset };
}

export default useCountUp;
