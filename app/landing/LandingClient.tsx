'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import LandingHero from '@/app/components/landing/LandingHero';
import LiveDataPreview from '@/app/components/landing/LiveDataPreview';
import InvestmentShowcase, { type LandingCalculatorExample } from '@/app/components/landing/InvestmentShowcase';
import ExtensionShowcase from '@/app/components/landing/ExtensionShowcase';
import FeaturesGrid from '@/app/components/landing/FeaturesGrid';
import FinalCTA from '@/app/components/landing/FinalCTA';

// Lazy load the map component for performance
const MapShowcase = dynamic(
  () => import('@/app/components/landing/MapShowcase'),
  {
    ssr: false,
    loading: () => (
      <section className="py-20 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-[500px] bg-white rounded-xl border border-[#e5e5e5] animate-pulse flex items-center justify-center">
            <div className="text-[#737373]">Loading map...</div>
          </div>
        </div>
      </section>
    )
  }
);

interface LandingClientProps {
  calculatorExample?: LandingCalculatorExample | null;
}

// Loading overlay component
function LoadingOverlay({ progress, message }: { progress: number; message: string }) {
  return (
    <div className="fixed inset-0 z-[100] bg-[#0a0a0a] flex flex-col items-center justify-center transition-opacity duration-500">
      {/* Animated logo/brand */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-2">
          fmr.fyi
        </h1>
        <p className="text-white/60 text-sm sm:text-base">Fair Market Rent, Made Simple</p>
      </div>

      {/* Loading spinner */}
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-full border-2 border-white/10" />
        <div
          className="absolute inset-0 w-16 h-16 rounded-full border-2 border-transparent border-t-[#16a34a] animate-spin"
          style={{ animationDuration: '1s' }}
        />
        {/* Inner pulsing dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-[#16a34a] animate-pulse" />
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-48 sm:w-64 h-1 bg-white/10 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-gradient-to-r from-[#16a34a] to-[#44e37e] rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Status message */}
      <p className="text-white/50 text-sm">{message}</p>

      {/* Floating particles background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-white/5"
            style={{
              left: `${10 + (i * 12)}%`,
              top: `${20 + (i % 3) * 25}%`,
              animation: `float ${3 + i * 0.5}s ease-in-out infinite`,
              animationDelay: `${i * 0.3}s`,
            }}
          />
        ))}
      </div>

      <style jsx>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0) translateX(0);
            opacity: 0.3;
          }
          50% {
            transform: translateY(-20px) translateX(10px);
            opacity: 0.6;
          }
        }
      `}</style>
    </div>
  );
}

export default function LandingClient({ calculatorExample }: LandingClientProps) {
  const [isReady, setIsReady] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('Initializing...');
  const [mapReady, setMapReady] = useState(false);
  const isMountedRef = useRef(true);

  // Callback when map is ready
  const handleMapReady = useCallback(() => {
    if (isMountedRef.current) {
      setMapReady(true);
    }
  }, []);

  // Handle map ready state changes
  useEffect(() => {
    if (!mapReady) return;

    setProgress(100);
    setLoadingMessage('Ready!');

    // Start fade out
    const fadeTimer = setTimeout(() => {
      if (isMountedRef.current) {
        setIsFadingOut(true);
      }
    }, 200);

    // Remove overlay and enable scrolling
    const readyTimer = setTimeout(() => {
      if (isMountedRef.current) {
        setIsReady(true);
      }
      // Always restore overflow, even if unmounted
      document.body.style.overflow = '';
    }, 700);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(readyTimer);
      document.body.style.overflow = '';
    };
  }, [mapReady]);

  // Lock scroll on mount, simulate loading progress
  useEffect(() => {
    isMountedRef.current = true;

    // Lock scrolling immediately
    document.body.style.overflow = 'hidden';

    // Simulate progress stages
    const stages = [
      { progress: 15, message: 'Loading fun visuals...', delay: 100 },
      { progress: 35, message: 'The actual app isn\'t this slow...', delay: 400 },
      { progress: 55, message: 'Processing data...', delay: 800 },
      { progress: 75, message: 'Rendering map (this is the slow part)...', delay: 1200 },
      { progress: 90, message: 'Almost ready...', delay: 1800 },
    ];

    const timers: NodeJS.Timeout[] = [];

    stages.forEach(({ progress, message, delay }) => {
      const timer = setTimeout(() => {
        if (isMountedRef.current) {
          setProgress(prev => Math.max(prev, progress));
          setLoadingMessage(message);
        }
      }, delay);
      timers.push(timer);
    });

    // Cleanup on unmount - ALWAYS restore scrolling
    return () => {
      isMountedRef.current = false;
      timers.forEach(clearTimeout);
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <>
      {/* Loading overlay */}
      {!isReady && (
        <div
          className={`transition-opacity duration-500 ${isFadingOut ? 'opacity-0' : 'opacity-100'}`}
        >
          <LoadingOverlay progress={progress} message={loadingMessage} />
        </div>
      )}

      <main className="min-h-screen">
        {/* Hero Section - Dark */}
        <LandingHero />

        {/* Live Data Preview - Light */}
        <LiveDataPreview />

        {/* Map Section - Light */}
        <MapShowcase onReady={handleMapReady} />

        {/* Investment Metrics - Dark */}
        <InvestmentShowcase initialExample={calculatorExample} />

        {/* Extension Showcase - Dark Gradient */}
        <ExtensionShowcase />

        {/* Features Grid - Light */}
        <FeaturesGrid />

        {/* Final CTA - Dark Gradient */}
        <FinalCTA />
      </main>
    </>
  );
}
