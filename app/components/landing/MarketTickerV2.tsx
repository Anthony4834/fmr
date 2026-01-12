'use client';

import { motion } from 'framer-motion';

// Simple icon component
const TrendingUpIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);

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

export function MarketTickerV2() {
  // Double the items for seamless loop
  const items = [...marketData, ...marketData];

  return (
    <div className="relative overflow-hidden py-2 sm:py-4">
      {/* Gradient masks */}
      <div className="absolute left-0 top-0 bottom-0 w-12 sm:w-20 z-10" style={{ background: 'linear-gradient(to right, hsl(210 20% 98%), transparent)' }} />
      <div className="absolute right-0 top-0 bottom-0 w-12 sm:w-20 z-10" style={{ background: 'linear-gradient(to left, hsl(210 20% 98%), transparent)' }} />

      <motion.div
        className="flex"
        animate={{
          x: ['0%', '-50%'],
        }}
        transition={{
          x: {
            repeat: Infinity,
            repeatType: 'loop',
            duration: 40,
            ease: 'linear',
          },
        }}
      >
        {items.map((market, i) => (
          <div
            key={`${market.name}-${i}`}
            className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 whitespace-nowrap"
          >
            <span 
              className="font-medium text-sm sm:text-base" 
              style={{ color: 'hsl(220 30% 12%)' }}
            >
              {market.name}
            </span>
            <span
              className={`text-xs sm:text-sm font-semibold flex items-center gap-1 ${
                market.change >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              <TrendingUpIcon className="w-3 h-3" />
              {market.change >= 0 ? '+' : ''}
              {market.change}%
            </span>
            <span style={{ color: 'hsl(220 15% 85%)' }}>|</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

export function MarketTickerSectionV2() {
  return (
    <section className="py-8 sm:py-10 md:py-12 border-y" style={{ backgroundColor: 'hsl(210 20% 98%)', borderColor: 'hsl(220 15% 90%)' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6 }}
          className="mb-4 sm:mb-6"
        >
          <h2 
            className="font-display text-lg sm:text-xl md:text-2xl font-semibold tracking-tight mb-1 sm:mb-2"
            style={{ color: 'hsl(220 30% 12%)' }}
          >
            Markets are moving. Stay ahead.
          </h2>
          <p 
            className="text-xs sm:text-sm" 
            style={{ color: 'hsl(220 15% 45%)' }}
          >
            Track year-over-year FMR changes across the country
          </p>
        </motion.div>
        <MarketTickerV2 />
      </div>
    </section>
  );
}
