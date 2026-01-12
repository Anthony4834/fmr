'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, useInView } from 'framer-motion';

interface StatCardV2Props {
  value: number;
  label: string;
  prefix?: string;
  suffix?: string;
  delay?: number;
  isText?: boolean;
}

// Format number with leading zeros to match target digit count
function formatWithLeadingZeros(num: number, targetValue: number): string {
  const targetDigits = targetValue.toString().replace(/,/g, '').length;
  const paddedNum = num.toString().padStart(targetDigits, '0');
  // Add commas every 3 digits from the right
  return paddedNum.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function StatCardV2({ value, label, prefix = '', suffix = '', delay = 0, isText = false }: StatCardV2Props) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  const [displayValue, setDisplayValue] = useState(0);
  const animationRef = useRef<number>();
  const startTimeRef = useRef<number>();
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (!isInView || hasStartedRef.current || isText) return;
    hasStartedRef.current = true;

    const duration = 2000;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // easeOut cubic for smooth deceleration
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.round(value * easedProgress);

      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isInView, value, isText]);

  // Format with leading zeros to match target value's digit count
  const formattedCount = isText ? '' : formatWithLeadingZeros(displayValue, value);
  const displayText = isText ? suffix : `${prefix}${formattedCount}${suffix}`;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      transition={{ duration: 0.5, delay: delay / 1000 }}
      className="text-center"
    >
      <div 
        className="text-xl sm:text-2xl md:text-4xl font-bold mb-0.5 sm:mb-2 tabular-nums"
        style={{ color: 'hsl(192 85% 42%)', fontFamily: "var(--font-sans), system-ui, sans-serif" }}
      >
        {displayText}
      </div>
      <div 
        className="text-[10px] sm:text-xs md:text-sm leading-tight"
        style={{ color: 'hsl(220 15% 45%)', fontFamily: "var(--font-sans), system-ui, sans-serif" }}
      >
        {label}
      </div>
    </motion.div>
  );
}
