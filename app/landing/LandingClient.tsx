'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

// V2 Components
import NavV2 from '@/app/components/landing/NavV2';
import LandingHeroV2 from '@/app/components/landing/LandingHeroV2';
import { MarketTickerSectionV2 } from '@/app/components/landing/MarketTickerV2';
import FeaturesV2 from '@/app/components/landing/FeaturesV2';
import HowItWorksV2 from '@/app/components/landing/HowItWorksV2';
import { StatCardV2 } from '@/app/components/landing/StatCardV2';
import CTAV2 from '@/app/components/landing/CTAV2';
import FooterV2 from '@/app/components/landing/FooterV2';
import SearchPreview from '@/app/components/landing/SearchPreview';
import MapConnector from '@/app/components/landing/MapConnector';
import CalculatorConnector from '@/app/components/landing/CalculatorConnector';

import CalculatorShowcaseV2 from '@/app/components/landing/CalculatorShowcaseV2';
import type { LandingCalculatorExample } from '@/app/components/landing/CalculatorShowcaseV2';

// Lazy load the map component for performance
const MapShowcase = dynamic(
  () => import('@/app/components/landing/MapShowcase'),
  {
    ssr: false,
    loading: () => (
      <section className="py-20" style={{ backgroundColor: 'hsl(210 20% 98%)' }}>
        <div className="max-w-6xl mx-auto px-6">
          <div 
            className="h-[500px] rounded-2xl border flex items-center justify-center relative overflow-hidden"
            style={{ 
              backgroundColor: 'hsl(220 15% 96%)',
              borderColor: 'hsl(220 15% 90%)',
            }}
          >
            <div className="flex items-center gap-3" style={{ color: 'hsl(220 15% 55%)' }}>
              <svg 
                className="w-5 h-5 animate-spin"
                fill="none" 
                viewBox="0 0 24 24"
              >
                <circle 
                  className="opacity-25" 
                  cx="12" 
                  cy="12" 
                  r="10" 
                  stroke="currentColor" 
                  strokeWidth="4"
                />
                <path 
                  className="opacity-75" 
                  fill="currentColor" 
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span 
                className="text-sm font-medium"
                style={{ fontFamily: 'var(--font-sans), system-ui, sans-serif' }}
              >
                Loading investment map...
              </span>
            </div>
          </div>
        </div>
      </section>
    )
  }
);

interface LandingClientProps {
  calculatorExample?: LandingCalculatorExample | null;
}

// Data points for loading animation
const dataPoints = [
  { label: "ZIP Codes", value: "41,247", delay: 0 },
  { label: "Counties", value: "3,143", delay: 0.2 },
  { label: "FMR Records", value: "206,235", delay: 0.4 },
  { label: "Investment Scores", value: "41,247", delay: 0.6 },
];

// Grid items for background animation
const gridItems = Array.from({ length: 48 }, (_, i) => ({
  id: i,
  delay: Math.random() * 0.8,
  duration: 0.5 + Math.random() * 0.5,
}));

// Loading overlay component - V2 design with animations
function LoadingOverlay({ 
  progress, 
  phase,
  isComplete,
}: { 
  progress: number; 
  phase: 'grid' | 'data' | 'complete';
  isComplete: boolean;
}) {
  return (
    <AnimatePresence>
      {!isComplete && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
          style={{ backgroundColor: 'hsl(210 20% 98%)' }}
        >
          {/* Animated grid background */}
          <div className="absolute inset-0 grid grid-cols-8 grid-rows-6 gap-1 p-4 opacity-[0.15]">
            {gridItems.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ 
                  opacity: 0.3,
                  scale: 1,
                }}
                transition={{
                  delay: item.delay,
                  duration: item.duration,
                }}
                className="rounded-md"
                style={{ backgroundColor: 'hsl(192 85% 42%)' }}
              />
            ))}
          </div>

          {/* Radial gradient overlay */}
          <div 
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(circle at center, transparent 0%, hsl(210 20% 98% / 0.5) 50%, hsl(210 20% 98%) 100%)',
            }}
          />

          {/* Main content */}
          <div className="relative z-10 flex flex-col items-center">
            {/* Animated logo/icon */}
            <div className="relative mb-10">
              {/* Outer rotating ring */}
              <motion.div
                initial={{ rotate: 0 }}
                animate={{ rotate: 360 }}
                transition={{ duration: 2, ease: 'easeOut' }}
                className="absolute -inset-8 rounded-full"
                style={{ border: '2px dashed hsl(192 85% 42% / 0.3)' }}
              />
              
              {/* Middle pulsing ring */}
              <motion.div
                initial={{ scale: 1, opacity: 0.3 }}
                animate={{ scale: 1.15, opacity: 0.6 }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="absolute -inset-4 rounded-full"
                style={{ backgroundColor: 'hsl(192 85% 42% / 0.1)' }}
              />

              {/* Inner ring with rotating segments */}
              <svg className="absolute -inset-6 w-[calc(100%+48px)] h-[calc(100%+48px)]" viewBox="0 0 120 120">
                {[0, 1, 2, 3].map((i) => (
                  <motion.circle
                    key={i}
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="hsl(192 85% 42%)"
                    strokeWidth="2"
                    strokeDasharray="20 60"
                    strokeLinecap="round"
                    initial={{ rotate: i * 90 }}
                    animate={{ rotate: i * 90 + 360 }}
                    transition={{ duration: 1.5, delay: i * 0.1, ease: 'easeOut' }}
                    style={{ transformOrigin: '60px 60px' }}
                  />
                ))}
              </svg>

              {/* House icon assembling */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="relative w-20 h-20 flex items-center justify-center"
              >
                <svg viewBox="0 0 64 64" className="w-full h-full">
                  {/* House outline */}
                  <motion.path
                    d="M32 8 L56 28 L52 28 L52 56 L12 56 L12 28 L8 28 Z"
                    fill="none"
                    stroke="hsl(192 85% 42%)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.5, ease: 'easeInOut' }}
                  />
                  {/* Door */}
                  <motion.rect
                    x="26"
                    y="38"
                    width="12"
                    height="18"
                    fill="none"
                    stroke="hsl(192 85% 42%)"
                    strokeWidth="2"
                    initial={{ opacity: 0, scaleY: 0 }}
                    animate={{ opacity: 1, scaleY: 1 }}
                    transition={{ delay: 1, duration: 0.4 }}
                    style={{ transformOrigin: '32px 56px' }}
                  />
                  {/* Windows */}
                  <motion.rect
                    x="16"
                    y="32"
                    width="8"
                    height="8"
                    fill="hsl(192 85% 42%)"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 1.2, duration: 0.3 }}
                  />
                  <motion.rect
                    x="40"
                    y="32"
                    width="8"
                    height="8"
                    fill="hsl(192 85% 42%)"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 1.4, duration: 0.3 }}
                  />
                </svg>
              </motion.div>
            </div>

            {/* Brand */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="mb-8"
            >
              <h1 
                className="font-display text-3xl sm:text-4xl font-bold tracking-tight"
                style={{ color: 'hsl(220 30% 12%)' }}
              >
                fmr<span style={{ color: 'hsl(192 85% 42%)' }}>.fyi</span>
              </h1>
            </motion.div>

            {/* Data collection animation */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: phase === 'data' || phase === 'complete' ? 1 : 0.4 }}
              transition={{ duration: 0.5 }}
              className="grid grid-cols-2 gap-3 mb-10"
            >
              {dataPoints.map((point, i) => (
                <motion.div
                  key={point.label}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: point.delay + 0.5, duration: 0.4 }}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-lg"
                  style={{ 
                    backgroundColor: 'hsl(0 0% 100%)',
                    border: '1px solid hsl(220 15% 90%)',
                  }}
                >
                  <motion.div
                    animate={{ 
                      backgroundColor: progress > 30 + i * 15 
                        ? 'hsl(192 85% 42%)' 
                        : 'hsl(220 15% 85%)'
                    }}
                    transition={{ duration: 0.3 }}
                    className="w-2 h-2 rounded-full"
                  />
                  <div>
                    <div 
                      className="text-xs"
                      style={{ 
                        color: 'hsl(220 15% 55%)',
                        fontFamily: 'var(--font-sans), system-ui, sans-serif',
                      }}
                    >
                      {point.label}
                    </div>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: progress > 30 + i * 15 ? 1 : 0.3 }}
                      className="font-mono text-sm font-semibold"
                      style={{ color: 'hsl(220 30% 12%)' }}
                    >
                      {point.value}
                    </motion.div>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Progress bar */}
            <div className="w-64 mb-4">
              <div 
                className="h-1.5 rounded-full overflow-hidden"
                style={{ backgroundColor: 'hsl(220 15% 90%)' }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: 'hsl(192 85% 42%)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(progress, 100)}%` }}
                  transition={{ duration: 0.2 }}
                />
              </div>
            </div>

            {/* Status text */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-sm flex items-center gap-2"
              style={{ 
                color: progress >= 100 ? 'hsl(142 70% 45%)' : 'hsl(220 15% 55%)',
                fontFamily: 'var(--font-sans), system-ui, sans-serif',
              }}
            >
              {progress < 100 ? (
                <motion.div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: 'hsl(192 85% 42%)' }}
                  animate={{ 
                    scale: [1, 1.2, 1],
                    opacity: [0.6, 1, 0.6],
                  }}
                  transition={{ 
                    duration: 1.5, 
                    ease: 'easeInOut',
                  }}
                />
              ) : (
                <svg 
                  className="w-4 h-4"
                  style={{ color: 'hsl(142 70% 45%)' }}
                  fill="none" 
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              <span>
                {progress < 25 && "Connecting to data sources..."}
                {progress >= 25 && progress < 50 && "Loading FMR records..."}
                {progress >= 50 && progress < 75 && "Processing investment scores..."}
                {progress >= 75 && progress < 95 && "Rendering map data..."}
                {progress >= 95 && progress < 100 && "Finalizing..."}
                {progress >= 100 && "Ready!"}
              </span>
            </motion.div>

            {/* Floating data particles */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {Array.from({ length: 12 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 rounded-full"
                  style={{ backgroundColor: 'hsl(192 85% 42% / 0.6)' }}
                  initial={{
                    x: Math.random() * 400 - 200,
                    y: 200,
                    opacity: 0,
                  }}
                  animate={{
                    y: -200,
                    opacity: [0, 1, 0],
                  }}
                  transition={{
                    duration: 3 + Math.random() * 2,
                    delay: Math.random() * 3,
                    ease: 'easeOut',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Corner decorations */}
          <div 
            className="absolute top-6 left-6 w-16 h-16 rounded-tl-xl"
            style={{ borderLeft: '2px solid hsl(192 85% 42% / 0.2)', borderTop: '2px solid hsl(192 85% 42% / 0.2)' }}
          />
          <div 
            className="absolute top-6 right-6 w-16 h-16 rounded-tr-xl"
            style={{ borderRight: '2px solid hsl(192 85% 42% / 0.2)', borderTop: '2px solid hsl(192 85% 42% / 0.2)' }}
          />
          <div 
            className="absolute bottom-6 left-6 w-16 h-16 rounded-bl-xl"
            style={{ borderLeft: '2px solid hsl(192 85% 42% / 0.2)', borderBottom: '2px solid hsl(192 85% 42% / 0.2)' }}
          />
          <div 
            className="absolute bottom-6 right-6 w-16 h-16 rounded-br-xl"
            style={{ borderRight: '2px solid hsl(192 85% 42% / 0.2)', borderBottom: '2px solid hsl(192 85% 42% / 0.2)' }}
          />

          {/* Scanning line effect */}
          <motion.div
            key="scan-line"
            className="absolute left-0 right-0 h-px"
            style={{
              background: 'linear-gradient(to right, transparent, hsl(192 85% 42% / 0.5), transparent)',
            }}
            initial={{ y: -100 }}
            animate={{ y: 800 }}
            transition={{ duration: 2.5, ease: 'linear' }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function LandingClient({ calculatorExample }: LandingClientProps) {
  const [isReady, setIsReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'grid' | 'data' | 'complete'>('grid');
  const [mapReady, setMapReady] = useState(false);
  const isMountedRef = useRef(true);

  // Callback when map is ready
  const handleMapReady = useCallback(() => {
    if (isMountedRef.current) {
      setMapReady(true);
    }
  }, []);

  // Progress simulation
  useEffect(() => {
    isMountedRef.current = true;
    document.body.style.overflow = 'hidden';

    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 95) {
          // Don't go past 95 until map is ready
          return mapReady ? Math.min(p + 2, 100) : 95;
        }
        return p + Math.random() * 3 + 1;
      });
    }, 50);

    return () => {
      clearInterval(interval);
      isMountedRef.current = false;
      document.body.style.overflow = '';
    };
  }, [mapReady]);

  // Phase transitions
  useEffect(() => {
    if (progress > 35 && phase === 'grid') {
      setPhase('data');
    }
    if (progress >= 100 && phase !== 'complete') {
      setPhase('complete');
      // Delay before removing overlay
      setTimeout(() => {
        if (isMountedRef.current) {
          setIsReady(true);
          document.body.style.overflow = '';
        }
      }, 600);
    }
  }, [progress, phase]);

  // When map is ready, accelerate to 100%
  useEffect(() => {
    if (mapReady && progress >= 95) {
      setProgress(100);
    }
  }, [mapReady, progress]);

  return (
    <div className="min-h-screen w-full overflow-x-hidden" style={{ backgroundColor: 'hsl(210 20% 98%)' }}>
      {/* Loading overlay */}
      <LoadingOverlay 
        progress={progress} 
        phase={phase}
        isComplete={isReady}
      />

      {/* Navigation */}
      <NavV2 isReady={isReady} />

      <main className="relative w-full">
        {/* Hero Section */}
        <LandingHeroV2 isReady={isReady} />

        {/* Market Ticker */}
        <MarketTickerSectionV2 />

        {/* Features Grid */}
        <FeaturesV2 />

        {/* Map Section */}
        <MapShowcase onReady={handleMapReady} />

        {/* Connector between Interactive Maps feature and Map section - background element */}
        <MapConnector />

        {/* Calculator Demo */}
        <CalculatorShowcaseV2 initialExample={calculatorExample} />

        {/* Connector between Cash Flow Calculator feature and Calculator section - background element */}
        <CalculatorConnector />

        {/* How It Works */}
        <HowItWorksV2 />

        {/* Stats Section */}
        <StatsSectionV2 />

        {/* CTA */}
        <CTAV2 />

        {/* Search Preview */}
        <SearchPreview isReady={isReady} />
      </main>

      {/* Footer */}
      <FooterV2 />
    </div>
  );
}

function StatsSectionV2() {
  const stats = [
    { value: 41000, label: "ZIP codes", suffix: "+" },
    { value: 50, label: "States", suffix: "" },
    { value: 10, label: "Years data", suffix: "+" },
    { value: 0, label: "Updates", suffix: "Daily", isText: true },
  ];

  return (
    <section 
      className="py-8 sm:py-12 md:py-20 border-t sm:border-t-0"
      style={{ backgroundColor: 'hsl(210 20% 98%)', borderColor: 'hsl(220 15% 90%)' }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Section Title */}
        <div className="text-center mb-6 sm:mb-10">
          <h2 
            className="font-display text-xl sm:text-2xl md:text-3xl font-bold tracking-tight mb-2 sm:mb-3"
            style={{ color: 'hsl(220 30% 12%)' }}
          >
            Built on{' '}
            <span style={{ color: 'hsl(192 85% 42%)' }}>real data</span>
          </h2>
          <p 
            className="text-xs sm:text-sm"
            style={{ color: 'hsl(220 15% 45%)', fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            Coverage you can trust for Section 8 investing.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-2 sm:gap-4 lg:gap-8">
          {stats.map((stat, i) => (
            <div key={i} className="relative">
              {i < stats.length - 1 && (
                <div 
                  className="hidden lg:block absolute -right-4 top-0 bottom-0 w-px"
                  style={{ backgroundColor: 'hsl(220 15% 88% / 0.3)' }}
                />
              )}
              <StatCardV2
                value={stat.value}
                label={stat.label}
                suffix={stat.suffix}
                delay={i * 80}
                isText={stat.isText}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
