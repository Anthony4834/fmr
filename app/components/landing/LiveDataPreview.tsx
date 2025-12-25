'use client';

import { useState, useEffect, useRef } from 'react';
import { useIntersectionObserver } from '@/app/hooks/useIntersectionObserver';

// Mock data for the ticker - in production, fetch from API
const marketData = [
  { name: 'New York, NY', change: 5.2 },
  { name: 'Austin, TX', change: 8.1 },
  { name: 'Miami, FL', change: 3.7 },
  { name: 'Phoenix, AZ', change: 6.4 },
  { name: 'Seattle, WA', change: 4.9 },
  { name: 'Denver, CO', change: 5.8 },
  { name: 'Nashville, TN', change: 7.2 },
  { name: 'Charlotte, NC', change: 4.3 },
  { name: 'Atlanta, GA', change: 5.5 },
  { name: 'Dallas, TX', change: 6.1 },
  { name: 'Portland, OR', change: 3.9 },
  { name: 'San Diego, CA', change: 4.7 },
];

// Format number with leading zeros to match target digit count
function formatWithLeadingZeros(num: number, targetValue: number): string {
  const targetDigits = targetValue.toString().replace(/,/g, '').length;
  const paddedNum = num.toString().padStart(targetDigits, '0');
  // Add commas every 3 digits from the right
  return paddedNum.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function StatCard({ value, label, prefix = '', suffix = '', delay = 0 }: {
  value: number;
  label: string;
  prefix?: string;
  suffix?: string;
  delay?: number;
}) {
  const { ref, hasBeenInView } = useIntersectionObserver<HTMLDivElement>({ threshold: 0.5, mobileThreshold: 0.6 });

  // Use custom animation instead of useCountUp to avoid pauses
  const [displayValue, setDisplayValue] = useState(0);
  const animationRef = useRef<number>();
  const startTimeRef = useRef<number>();
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (!hasBeenInView || hasStartedRef.current) return;
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
  }, [hasBeenInView, value]);

  // Format with leading zeros to match target value's digit count
  const formattedCount = formatWithLeadingZeros(displayValue, value);

  return (
    <div
      ref={ref}
      className={`bg-white rounded-2xl border border-[#e5e5e5]/60 p-6 sm:p-8 text-left transition-all duration-700 ${
        hasBeenInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="text-3xl sm:text-4xl md:text-5xl font-light text-[#0a0a0a] tabular-nums tracking-tight">
        {prefix}{formattedCount}{suffix}
      </div>
      <div className="text-sm sm:text-base text-[#737373]/70 mt-2 font-light">{label}</div>
    </div>
  );
}

function MarketTicker() {
  // Double the items for seamless loop
  const items = [...marketData, ...marketData];

  return (
    <div className="relative overflow-hidden py-4">
      {/* Gradient masks */}
      <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-[#fafafa] to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-[#fafafa] to-transparent z-10" />

      <div className="flex animate-scroll">
        {items.map((market, i) => (
          <div
            key={`${market.name}-${i}`}
            className="flex items-center gap-3 px-6 whitespace-nowrap"
          >
            <span className="font-medium text-[#0a0a0a]">{market.name}</span>
            <span className={`text-sm font-semibold ${market.change >= 0 ? 'text-[var(--change-positive)]' : 'text-[var(--change-negative)]'}`}>
              {market.change >= 0 ? '+' : ''}{market.change}%
            </span>
            <span className="text-[#e5e5e5]">|</span>
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-scroll {
          animation: scroll 40s linear infinite;
        }
        .animate-scroll:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}

export default function LiveDataPreview() {
  const { ref, hasBeenInView } = useIntersectionObserver<HTMLElement>({ threshold: 0.35, mobileThreshold: 0.45 });

  return (
    <section ref={ref} className="py-16 sm:py-24 md:py-32 bg-[#fafafa]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className={`mb-10 sm:mb-14 transition-all duration-700 ${hasBeenInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-medium text-[#0a0a0a] mb-3 sm:mb-4 tracking-tight">
            Markets are moving. Stay ahead.
          </h2>
          <p className="text-base sm:text-lg text-[#737373]/80 font-light max-w-lg">
            Track year-over-year FMR changes across the country
          </p>
        </div>

        {/* Market ticker */}
        <div className={`mb-8 sm:mb-12 md:mb-16 transition-all duration-700 delay-200 ${hasBeenInView ? 'opacity-100' : 'opacity-0'}`}>
          <MarketTicker />
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          <StatCard
            value={41784}
            label="ZIP Codes Indexed"
            delay={0}
          />
          <StatCard
            value={2156}
            prefix="$"
            label="Median 3BR FMR"
            delay={150}
          />
          <StatCard
            value={127}
            suffix="+"
            label="Cash Flowing Markets"
            delay={300}
          />
        </div>
      </div>
    </section>
  );
}
