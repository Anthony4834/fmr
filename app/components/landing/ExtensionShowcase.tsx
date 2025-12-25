'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useIntersectionObserver } from '@/app/hooks/useIntersectionObserver';

type ExtensionMode = 'cashFlow' | 'fmr';

export default function ExtensionShowcase() {
  const { ref, hasBeenInView } = useIntersectionObserver<HTMLElement>({ threshold: 0.4, mobileThreshold: 0.5 });
  const [mode, setMode] = useState<ExtensionMode>('cashFlow');
  const [isExploded, setIsExploded] = useState(false);
  const [isZoomedHovered, setIsZoomedHovered] = useState(false);

  const screenshots = {
    cashFlow: '/extension-cash-flow-mode.png',
    fmr: '/extension-fmr-mode.png',
  };

  const zoomedScreenshots = {
    cashFlow: '/extension-cash-flow-mode-zoomed.png',
    fmr: '/extension-fmr-mode-zoomed.png',
  };

  const features = [
    'See FMR data on any property listing',
    <>Full <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[#f59e0b] to-[#f97316]">fmr.fyi</span> data, one click away</>,
    'Works on Zillow and Redfin — more sites coming soon',
  ];

  useEffect(() => {
    if (hasBeenInView && !isExploded) {
      const timer = setTimeout(() => setIsExploded(true), 600);
      return () => clearTimeout(timer);
    }
  }, [hasBeenInView, isExploded]);

  const handleModeChange = (newMode: ExtensionMode) => {
    if (newMode !== mode) {
      setMode(newMode);
    }
  };

  return (
    <section
      ref={ref}
      className="py-16 sm:py-24 md:py-32 overflow-hidden relative"
      style={{
        background: 'linear-gradient(180deg, #0a0a0a 0%, #111111 50%, #0a0a0a 100%)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-14 lg:gap-20 items-center">
          {/* Left: Text content */}
          <div className={`transition-all duration-700 ${hasBeenInView ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#f59e0b]/[0.08] border border-[#f59e0b]/15 mb-8">
              <Image
                src="/chrome.png"
                alt="Chrome"
                width={14}
                height={14}
                className="rounded-sm"
              />
              <span className="text-sm font-normal text-[#f59e0b]/90">Chrome Extension</span>
            </div>

            <h2 className="text-2xl sm:text-3xl md:text-4xl font-medium text-white mb-5 sm:mb-6 tracking-tight">
              Analyze Any Listing.
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f59e0b] to-[#f97316]">
                Instantly.
              </span>
            </h2>

            <p className="text-base sm:text-lg text-white/50 font-light mb-8 sm:mb-10 leading-relaxed">
              Our Chrome extension overlays FMR data and cash flow analysis directly
              on property listings. No more switching between tabs.
            </p>

            <ul className="space-y-4 sm:space-y-5 mb-8 sm:mb-10">
              {features.map((feature, i) => (
                <li
                  key={i}
                  className={`flex items-start gap-3 transition-all duration-500 ${
                    hasBeenInView ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
                  }`}
                  style={{ transitionDelay: `${300 + i * 150}ms` }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-[#22c55e]/80 shrink-0 mt-0.5">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-white/60 font-light">{feature}</span>
                </li>
              ))}
            </ul>

            <a
              href="https://chromewebstore.google.com/detail/fmrfyi-%E2%80%93-fair-market-rent/gkemjakehildeolcagbibhmbcddkkflb"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-5 py-2.5 bg-white text-[#0a0a0a] font-medium rounded-lg hover:bg-white/95 transition-colors text-sm"
            >
              <Image
                src="/chrome.png"
                alt="Chrome"
                width={20}
                height={20}
                className="rounded"
              />
              Add to Chrome — It&apos;s Free
            </a>
          </div>

          {/* Right: Extension Screenshot */}
          <div className={`transition-all duration-700 delay-200 ${hasBeenInView ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}>
            {/* Mode toggle */}
            <div className="flex justify-center sm:justify-end mb-5 sm:mb-8">
              <div className="inline-flex rounded-xl bg-white/[0.03] border border-white/[0.06] p-1">
                <button
                  onClick={() => handleModeChange('cashFlow')}
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-normal rounded-lg transition-all duration-300 ${
                    mode === 'cashFlow'
                      ? 'bg-white text-[#0a0a0a]'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  Cash Flow
                </button>
                <button
                  onClick={() => handleModeChange('fmr')}
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-normal rounded-lg transition-all duration-300 ${
                    mode === 'fmr'
                      ? 'bg-white text-[#0a0a0a]'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  FMR
                </button>
              </div>
            </div>

            {/* Mobile: Simple stacked view */}
            <div className="lg:hidden space-y-4">
              <div className="rounded-2xl overflow-hidden border border-white/[0.06]">
                <Image
                  src={mode === 'cashFlow' ? screenshots.cashFlow : screenshots.fmr}
                  alt={`Extension ${mode === 'cashFlow' ? 'Cash Flow' : 'FMR'} Mode`}
                  width={2611}
                  height={1355}
                  className="block w-full h-auto"
                  priority
                />
              </div>

              <div className="relative rounded-2xl overflow-hidden border border-white/[0.06] inline-block">
                <Image
                  src={mode === 'cashFlow' ? zoomedScreenshots.cashFlow : zoomedScreenshots.fmr}
                  alt={`Extension ${mode === 'cashFlow' ? 'Cash Flow' : 'FMR'} Mode - Detail`}
                  width={679}
                  height={599}
                  className="block w-full h-auto max-w-[280px]"
                  priority
                />
                <div className="absolute top-2 right-2">
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#22c55e]/90">
                    <div className="w-1 h-1 rounded-sm bg-white animate-pulse" />
                    <span className="text-[10px] font-medium text-white">LIVE</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop: Exploded View */}
            <div
              className="hidden lg:block relative"
              style={{ perspective: '1200px' }}
            >
              {/* Connection Line - Animated dashed line flowing toward zoomed card */}
              <svg
                className="absolute pointer-events-none z-10"
                style={{
                  left: '350px',
                  top: '180px',
                  width: '320px',
                  height: '180px',
                  opacity: isExploded ? 1 : 0,
                  transition: 'opacity 0.4s ease-out 0.2s',
                  overflow: 'visible',
                }}
              >
                <defs>
                  <linearGradient id="connectorGradient" x1="100%" y1="100%" x2="0%" y2="0%">
                    <stop offset="0%" stopColor="#fb923c" />
                    <stop offset="50%" stopColor="#f97316" />
                    <stop offset="100%" stopColor="#ea580c" />
                  </linearGradient>
                  {/* Glow filter for better visibility */}
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                  {/* Shadow filter */}
                  <filter id="lineShadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#000000" floodOpacity="0.6"/>
                  </filter>
                </defs>
                {/* Background stroke for contrast - dark outline */}
                <line
                  x1="0"
                  y1="0"
                  x2="-250"
                  y2="-113"
                  stroke="rgba(0, 0, 0, 0.7)"
                  strokeWidth="2.5"
                  strokeDasharray="12 10"
                  strokeLinecap="round"
                  className="animate-dash-flow"
                  style={{ filter: 'url(#lineShadow)' }}
                />
                {/* Animated dashed line - dashes flow toward the zoomed card */}
                <line
                  x1="0"
                  y1="0"
                  x2="-250"
                  y2="-113"
                  stroke="url(#connectorGradient)"
                  strokeWidth="2"
                  strokeDasharray="12 10"
                  strokeLinecap="round"
                  className="animate-dash-flow"
                  style={{ filter: 'url(#glow)' }}
                />
                {/* End point - orange indicator with glow */}
                <circle cx="-250" cy="-113" r="4.5" fill="rgba(0, 0, 0, 0.5)" />
                <circle cx="-250" cy="-113" r="4" fill="#fb923c" fillOpacity="0.8" style={{ filter: 'url(#glow)' }} />
                <circle cx="-250" cy="-113" r="2.5" fill="#f97316" style={{ filter: 'url(#glow)' }} />
              </svg>

              {/* CSS for dash animation */}
              <style jsx>{`
                @keyframes dashFlow {
                  0% {
                    stroke-dashoffset: 0;
                  }
                  100% {
                    stroke-dashoffset: -44;
                  }
                }
                .animate-dash-flow {
                  animation: dashFlow 2.5s linear infinite;
                }
              `}</style>

              {/* Zoomed Detail Card */}
              <div
                className="absolute z-20 cursor-pointer"
                onMouseEnter={() => setIsZoomedHovered(true)}
                onMouseLeave={() => setIsZoomedHovered(false)}
                style={{
                  top: isExploded ? '-30px' : '40px',
                  left: isExploded ? '-10px' : '60px',
                  opacity: hasBeenInView ? (isExploded ? 1 : 0.4) : 0,
                  transform: isExploded
                    ? isZoomedHovered
                      ? 'scale(1.04)'
                      : 'scale(1)'
                    : 'scale(0.85)',
                  transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{
                    boxShadow: isZoomedHovered
                      ? '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(34, 197, 94, 0.3)'
                      : '0 20px 40px -10px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(34, 197, 94, 0.2)',
                    transition: 'box-shadow 0.3s ease-out',
                  }}
                >
                  <Image
                    src={mode === 'cashFlow' ? zoomedScreenshots.cashFlow : zoomedScreenshots.fmr}
                    alt={`Extension ${mode === 'cashFlow' ? 'Cash Flow' : 'FMR'} Mode - Detail`}
                    width={679}
                    height={599}
                    className="block"
                    priority
                    style={{ width: '220px', height: 'auto' }}
                  />
                </div>

                {/* LIVE badge */}
                <div
                  className="absolute -top-2 -right-2"
                  style={{
                    opacity: isExploded ? 1 : 0,
                    transform: isExploded ? 'scale(1)' : 'scale(0.8)',
                    transition: 'all 0.4s ease-out 0.3s',
                  }}
                >
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#22c55e]/90">
                    <div className="w-1 h-1 rounded-sm bg-white animate-pulse" />
                    <span className="text-[10px] font-medium text-white">LIVE</span>
                  </div>
                </div>
              </div>

              {/* Main screenshot card */}
              <div
                className="relative"
                style={{
                  transform: hasBeenInView
                    ? isExploded
                      ? 'rotateY(-6deg) rotateX(2deg) translateX(10px) translateY(5px)'
                      : 'rotateY(-6deg) rotateX(2deg)'
                    : 'rotateY(-12deg) rotateX(4deg)',
                  transformStyle: 'preserve-3d',
                  transition: 'transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 20px 40px -10px rgba(0, 0, 0, 0.4)',
                  }}
                >
                  {/* Browser toolbar */}
                  <div
                    className="flex items-center gap-3 px-4 py-2.5"
                    style={{
                      background: 'linear-gradient(180deg, #2a2a2a 0%, #222 100%)',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <div className="flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                      <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                      <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                    </div>

                    <div
                      className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-md"
                      style={{
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-white/30 shrink-0">
                        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke="currentColor" strokeWidth="2" />
                      </svg>
                      <span className="text-xs text-white/40 truncate">zillow.com/homedetails/...</span>
                    </div>

                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                      style={{
                        background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                      }}
                    >
                      <span className="text-[8px] font-bold text-white">FMR</span>
                    </div>
                  </div>

                  {/* Screenshot */}
                  <div className="relative">
                    <Image
                      src={mode === 'cashFlow' ? screenshots.cashFlow : screenshots.fmr}
                      alt={`Extension ${mode === 'cashFlow' ? 'Cash Flow' : 'FMR'} Mode`}
                      width={2611}
                      height={1355}
                      className="block"
                      priority
                      style={{ width: '580px', height: 'auto' }}
                    />
                  </div>
                </div>

                {/* Shadow */}
                <div
                  className="absolute -bottom-4 left-4 right-4 h-8 bg-black/20 rounded-xl blur-xl -z-10"
                  style={{
                    transform: isExploded ? 'translateX(5px)' : 'translateX(0)',
                    transition: 'transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
