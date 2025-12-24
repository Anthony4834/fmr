'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useIntersectionObserver } from '@/app/hooks/useIntersectionObserver';

type ExtensionMode = 'cashFlow' | 'fmr';

export default function ExtensionShowcase() {
  const { ref, hasBeenInView } = useIntersectionObserver<HTMLElement>({ threshold: 0.3, mobileThreshold: 0.4 });
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
    'Works on Zillow, Redfin, Realtor.com, and more',
  ];

  // Trigger explosion only once when component comes into view
  useEffect(() => {
    if (hasBeenInView && !isExploded) {
      const timer = setTimeout(() => setIsExploded(true), 600);
      return () => clearTimeout(timer);
    }
  }, [hasBeenInView, isExploded]);

  // Mode change just swaps images - no animation replay
  const handleModeChange = (newMode: ExtensionMode) => {
    if (newMode !== mode) {
      setMode(newMode);
    }
  };

  return (
    <section
      ref={ref}
      className="py-12 sm:py-20 md:py-28 overflow-hidden relative"
      style={{
        background: 'linear-gradient(180deg, #0a0a0a 0%, #111111 50%, #0a0a0a 100%)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-16 items-center">
          {/* Left: Text content */}
          <div className={`transition-all duration-700 ${hasBeenInView ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f59e0b]/10 border border-[#f59e0b]/20 mb-6">
              <Image
                src="/chrome.png"
                alt="Chrome"
                width={16}
                height={16}
                className="rounded-sm"
              />
              <span className="text-sm font-medium text-[#f59e0b]">Chrome Extension</span>
            </div>

            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4 sm:mb-6">
              Analyze Any Listing.
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f59e0b] to-[#f97316]">
                Instantly.
              </span>
            </h2>

            <p className="text-base sm:text-lg text-white/60 mb-6 sm:mb-8">
              Our Chrome extension overlays FMR data and cash flow analysis directly
              on property listings. No more switching between tabs.
            </p>

            <ul className="space-y-3 sm:space-y-4 mb-6 sm:mb-8">
              {features.map((feature, i) => (
                <li
                  key={i}
                  className={`flex items-start gap-3 transition-all duration-500 ${
                    hasBeenInView ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
                  }`}
                  style={{ transitionDelay: `${300 + i * 150}ms` }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#22c55e] shrink-0 mt-0.5">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-white/80">{feature}</span>
                </li>
              ))}
            </ul>

            <a
              href="https://chromewebstore.google.com/detail/fmrfyi-%E2%80%93-fair-market-rent/gkemjakehildeolcagbibhmbcddkkflb"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-6 py-3 bg-white text-[#0a0a0a] font-semibold rounded-lg hover:bg-white/90 transition-colors"
            >
              <Image
                src="/chrome.png"
                alt="Chrome"
                width={24}
                height={24}
                className="rounded"
              />
              Add to Chrome — It&apos;s Free
            </a>
          </div>

          {/* Right: Extension Screenshot - Simplified for mobile */}
          <div className={`transition-all duration-700 delay-200 ${hasBeenInView ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}>
            {/* Mode toggle */}
            <div className="flex justify-center sm:justify-end mb-4 sm:mb-6">
              <div className="inline-flex rounded-lg bg-white/[0.03] border border-white/[0.08] p-1">
                <button
                  onClick={() => handleModeChange('cashFlow')}
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-md transition-all duration-300 ${
                    mode === 'cashFlow'
                      ? 'bg-white text-[#0a0a0a]'
                      : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  Cash Flow
                </button>
                <button
                  onClick={() => handleModeChange('fmr')}
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-md transition-all duration-300 ${
                    mode === 'fmr'
                      ? 'bg-white text-[#0a0a0a]'
                      : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  FMR
                </button>
              </div>
            </div>

            {/* Mobile: Simple stacked view */}
            <div className="lg:hidden space-y-4">
              {/* Main screenshot */}
              <div className="relative rounded-xl overflow-hidden bg-[#1a1a1a] border border-white/10">
                <div className="relative" style={{ aspectRatio: '3356 / 1742' }}>
                  <Image
                    src={screenshots.cashFlow}
                    alt="Extension Cash Flow Mode"
                    fill
                    className={`object-cover object-top transition-opacity duration-300 ${
                      mode === 'cashFlow' ? 'opacity-100' : 'opacity-0'
                    }`}
                    priority
                  />
                  <Image
                    src={screenshots.fmr}
                    alt="Extension FMR Mode"
                    fill
                    className={`object-cover object-top transition-opacity duration-300 ${
                      mode === 'fmr' ? 'opacity-100' : 'opacity-0'
                    }`}
                    priority
                  />
                </div>
              </div>
              
              {/* Zoomed detail */}
              <div className="relative rounded-xl overflow-hidden bg-[#1a1a1a] border border-white/10">
                <div className="relative" style={{ aspectRatio: '912 / 864' }}>
                  <Image
                    src={zoomedScreenshots.cashFlow}
                    alt="Extension Cash Flow Mode - Detail"
                    fill
                    className={`object-cover transition-opacity duration-300 ${
                      mode === 'cashFlow' ? 'opacity-100' : 'opacity-0'
                    }`}
                    priority
                  />
                  <Image
                    src={zoomedScreenshots.fmr}
                    alt="Extension FMR Mode - Detail"
                    fill
                    className={`object-cover transition-opacity duration-300 ${
                      mode === 'fmr' ? 'opacity-100' : 'opacity-0'
                    }`}
                    priority
                  />
                </div>
                <div className="absolute top-2 right-2">
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#22c55e] shadow-lg">
                    <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    <span className="text-[10px] font-semibold text-white">LIVE</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop: 3D Exploded View Container */}
            <div
              className="hidden lg:block relative"
              style={{
                perspective: '1200px',
              }}
            >
              {/* Connection Line */}
              <div
                className="absolute pointer-events-none z-10"
                style={{
                  left: '210px',
                  top: '175px',
                  width: '100px',
                  height: '70px',
                  opacity: isExploded ? 1 : 0,
                  transition: 'opacity 0.4s ease-out 0.2s',
                }}
              >
                <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
                  <defs>
                    <linearGradient id="connectorGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#22c55e" />
                      <stop offset="100%" stopColor="#16a34a" />
                    </linearGradient>
                  </defs>
                  <line x1="0" y1="0" x2="100" y2="70" stroke="white" strokeWidth="3" strokeLinecap="round" opacity="0.15" />
                  <line x1="0" y1="0" x2="100" y2="70" stroke="url(#connectorGradient)" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="100" cy="70" r="5" fill="#22c55e" fillOpacity="0.25" />
                  <circle cx="100" cy="70" r="3" fill="#22c55e" />
                  <circle cx="100" cy="70" r="1.5" fill="white" />
                </svg>
              </div>

              {/* Zoomed Detail Card - image has skew baked in (+2deg X, -6deg Y) */}
              <div
                className="absolute z-20 cursor-pointer"
                onMouseEnter={() => setIsZoomedHovered(true)}
                onMouseLeave={() => setIsZoomedHovered(false)}
                style={{
                  top: isExploded ? '-90px' : '20px',
                  left: isExploded ? '-70px' : '40px',
                  opacity: hasBeenInView ? (isExploded ? 1 : 0.4) : 0,
                  transform: isExploded
                    ? isZoomedHovered
                      ? 'scale(1.04)'
                      : 'scale(1)'
                    : 'scale(0.85)',
                  transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                {/* Image container - no skew needed, baked into image */}
                <div
                  className="relative overflow-hidden rounded-xl"
                  style={{
                    width: '280px',
                    boxShadow: isZoomedHovered
                      ? `
                        0 35px 60px -15px rgba(0, 0, 0, 0.6),
                        0 0 0 2px rgba(34, 197, 94, 0.4),
                        0 0 40px rgba(34, 197, 94, 0.2)
                      `
                      : `
                        0 25px 50px -12px rgba(0, 0, 0, 0.5),
                        0 0 0 1px rgba(34, 197, 94, 0.3)
                      `,
                    transition: 'box-shadow 0.3s ease-out',
                  }}
                >
                  <div className="relative" style={{ aspectRatio: '912 / 864' }}>
                    <Image
                      src={zoomedScreenshots.cashFlow}
                      alt="Extension Cash Flow Mode - Detail"
                      fill
                      className={`object-cover transition-opacity duration-300 ${
                        mode === 'cashFlow' ? 'opacity-100' : 'opacity-0'
                      }`}
                      priority
                    />
                    <Image
                      src={zoomedScreenshots.fmr}
                      alt="Extension FMR Mode - Detail"
                      fill
                      className={`object-cover transition-opacity duration-300 ${
                        mode === 'fmr' ? 'opacity-100' : 'opacity-0'
                      }`}
                      priority
                    />
                  </div>
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
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#22c55e] shadow-lg">
                    <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    <span className="text-[10px] font-semibold text-white">LIVE</span>
                  </div>
                </div>
              </div>

              {/* Main screenshot card - subtle shift when exploded */}
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
                  className="rounded-xl overflow-hidden bg-[#1a1a1a]"
                  style={{
                    boxShadow: `
                      0 0 0 1px rgba(255,255,255,0.08),
                      0 25px 50px -12px rgba(0, 0, 0, 0.5)
                    `,
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

                  {/* Screenshot with crossfade */}
                  <div className="relative" style={{ aspectRatio: '3356 / 1742' }}>
                    <Image
                      src={screenshots.cashFlow}
                      alt="Extension Cash Flow Mode"
                      fill
                      className={`object-cover object-top transition-opacity duration-300 ${
                        mode === 'cashFlow' ? 'opacity-100' : 'opacity-0'
                      }`}
                      priority
                    />
                    <Image
                      src={screenshots.fmr}
                      alt="Extension FMR Mode"
                      fill
                      className={`object-cover object-top transition-opacity duration-300 ${
                        mode === 'fmr' ? 'opacity-100' : 'opacity-0'
                      }`}
                      priority
                    />

                    {/* Highlight zone */}
                    <div
                      className="absolute rounded pointer-events-none"
                      style={{
                        left: 'calc(58.5% - 76.5px)',
                        top: 'calc(58% - 73px)',
                        width: '153px',
                        height: '146px',
                        opacity: isExploded ? 1 : 0,
                        border: '3px solid white',
                        boxShadow: `
                          0 0 0 1px rgba(34, 197, 94, 0.5),
                          inset 0 0 0 1px rgba(34, 197, 94, 0.3),
                          0 0 30px rgba(34, 197, 94, 0.4)
                        `,
                        transition: 'opacity 0.5s ease-out 0.2s',
                      }}
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
