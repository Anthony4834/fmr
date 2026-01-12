'use client';

import { motion } from 'framer-motion';
import ScreenshotShowcase from '@/app/components/landing/ScreenshotShowcase';
import type React from 'react';

const CheckCircle2Icon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => {
  const strokeColor = style?.color || 'currentColor';
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" style={{ ...style, color: strokeColor }}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} stroke={strokeColor} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
};

function Badge({ variant = 'default', className = '', children, ...props }: any) {
  const styles: Record<string, React.CSSProperties> = {
    default: { backgroundColor: 'hsl(192 85% 42%)', color: '#ffffff' },
    secondary: { backgroundColor: 'hsl(220 15% 94%)', color: 'hsl(220 30% 12%)' },
    outline: { border: '1px solid hsl(220 15% 88%)', backgroundColor: 'transparent' },
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${className}`}
      style={{
        ...styles[variant] || styles.default,
        fontFamily: "var(--font-sans), system-ui, sans-serif",
        fontWeight: 500,
      }}
      {...props}
    >
      {children}
    </span>
  );
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

export default function LandingHeroV2({ isReady = false }: { isReady?: boolean }) {

  return (
    <section className="relative pt-24 pb-12 md:pt-40 md:pb-32 overflow-hidden" style={{ backgroundColor: 'hsl(210 20% 98%)' }}>
      {/* Background grid with gradient overlay */}
      <div className="absolute inset-0 grid-pattern opacity-50" />
      <div 
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to bottom, transparent 0%, transparent 60%, hsl(210 20% 98% / 0.2) 75%, hsl(210 20% 98% / 0.5) 85%, hsl(210 20% 98%) 100%)',
        }}
      />
      {/* Gradient blobs - hidden on mobile */}
      <div className="hidden md:block absolute top-20 right-0 w-[500px] h-[500px] rounded-full blur-3xl" style={{ backgroundColor: 'hsl(192 85% 42% / 0.05)' }} />
      <div className="hidden md:block absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full blur-3xl" style={{ backgroundColor: 'hsl(16 90% 55% / 0.05)' }} />
      
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate={isReady ? "visible" : "hidden"}
          className="max-w-3xl"
        >
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }}>
            <Badge variant="secondary" className="mb-6 px-3 py-1.5 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full mr-2 animate-pulse" style={{ backgroundColor: 'hsl(142 70% 45%)' }} />
              2025 FMR Data Now Available
            </Badge>
          </motion.div>
          
          <motion.h1
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-4 sm:mb-6"
            style={{ color: 'hsl(220 30% 12%)' }}
          >
            Know your markets.{" "}
            <span className="text-gradient">Find your edge.</span>
          </motion.h1>
          
          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-base sm:text-lg md:text-xl leading-relaxed mb-6 sm:mb-10 max-w-2xl"
            style={{ 
              color: 'hsl(220 15% 45%)',
              fontFamily: "var(--font-sans), system-ui, sans-serif",
            }}
          >
            Search HUD Fair Market Rent data across 41,000+ ZIP codes. Analyze Section 8 investment opportunities with precision tools built for serious investors.
          </motion.p>

          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
            style={{ 
              color: 'hsl(220 15% 45%)',
              fontFamily: "var(--font-sans), system-ui, sans-serif",
            }}
          >
            <span className="flex items-center gap-2">
              <CheckCircle2Icon className="w-4 h-4" style={{ color: 'hsl(192 85% 42%)' }} />
              41,000+ ZIP codes
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2Icon className="w-4 h-4" style={{ color: 'hsl(192 85% 42%)' }} />
              FMR & SAFMR data
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2Icon className="w-4 h-4" style={{ color: 'hsl(192 85% 42%)' }} />
              Updated annually
            </span>
          </motion.div>
        </motion.div>

        {/* Screenshot Showcase */}
        <ScreenshotShowcase isReady={isReady} />
      </div>
    </section>
  );
}
