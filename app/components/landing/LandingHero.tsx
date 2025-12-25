'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Single digit wheel - tracks its own position for smooth transitions
function DigitWheel({ targetDigit, delay, isFirstAnimation }: {
  targetDigit: number;
  delay: number;
  isFirstAnimation: boolean;
}) {
  // Position 0 = X, positions 1-10 = digits 0-9
  const [position, setPosition] = useState(0); // Start at X
  const isFirstRef = useRef(true);

  useEffect(() => {
    if (isFirstAnimation && isFirstRef.current) {
      // First animation: from X to target
      isFirstRef.current = false;
      const timer = setTimeout(() => {
        setPosition(targetDigit + 1);
      }, delay);
      return () => clearTimeout(timer);
    } else if (!isFirstRef.current) {
      // Subsequent changes: animate directly to new target
      setPosition(targetDigit + 1);
    }
  }, [targetDigit, delay, isFirstAnimation]);

  const items = ['X', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div
      className="relative h-[1.1em] overflow-hidden inline-block"
      style={{ width: '0.6em' }}
    >
      <div
        className="transition-transform duration-[1200ms]"
        style={{
          transform: `translateY(-${position * 1.1}em)`,
          transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {items.map((item, i) => (
          <div key={i} className="h-[1.1em] flex items-center justify-center">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

// Animated rent value display with number wheel effect
function AnimatedRentValue({ value, label, delay, isUpdating, showPlaceholder, animationEnabled }: {
  value: number;
  label: string;
  delay: number;
  isUpdating?: boolean;
  showPlaceholder?: boolean;
  animationEnabled?: boolean;
}) {
  const [isFirstAnimation, setIsFirstAnimation] = useState(false);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    if (animationEnabled && !showPlaceholder && value > 0 && !hasAnimatedRef.current) {
      hasAnimatedRef.current = true;
      const timer = setTimeout(() => setIsFirstAnimation(true), 100);
      return () => clearTimeout(timer);
    }
  }, [animationEnabled, showPlaceholder, value]);

  // Format as X,XXX - always 4 digits with comma
  // Pad number to ensure 4 digits, then insert comma
  const paddedNum = Math.max(0, value).toString().padStart(4, '0');
  const formatted = paddedNum.slice(0, 1) + ',' + paddedNum.slice(1);
  const chars = formatted.split('');

  return (
    <div className={`text-left transition-opacity duration-300 ${isUpdating ? 'opacity-80' : 'opacity-100'}`}>
      <div className="text-3xl sm:text-4xl md:text-5xl font-light text-white tabular-nums tracking-tight flex">
        <span>$</span>
        {chars.map((char, i) => (
          /\d/.test(char) ? (
            <DigitWheel
              key={i}
              targetDigit={parseInt(char, 10)}
              delay={delay + i * 50}
              isFirstAnimation={isFirstAnimation}
            />
          ) : (
            <span key={i}>{char}</span>
          )
        ))}
      </div>
      <div className="text-xs sm:text-sm text-white/40 mt-1.5 font-light">{label}</div>
    </div>
  );
}

// Default FMR values (1BR, 2BR, 3BR) - placeholder values
const DEFAULT_FMR = {
  oneBr: 0,
  twoBr: 0,
  threeBr: 0,
};

// Validate zip code (5 digits)
function isValidZip(zip: string): boolean {
  return /^\d{5}$/.test(zip.trim());
}

interface LandingHeroProps {
  isLoadingComplete?: boolean;
}

export default function LandingHero({ isLoadingComplete = false }: LandingHeroProps) {
  const router = useRouter();
  const [animationsReady, setAnimationsReady] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const heroRef = useRef<HTMLDivElement>(null);

  // Delay animations until loading screen is complete
  useEffect(() => {
    if (isLoadingComplete) {
      // Add a small delay after loading completes to ensure smooth transition
      const timer = setTimeout(() => setAnimationsReady(true), 300);
      return () => clearTimeout(timer);
    }
  }, [isLoadingComplete]);

  // Search and FMR state
  const [zipInput, setZipInput] = useState('');
  const [fmrValues, setFmrValues] = useState(DEFAULT_FMR);
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentZip, setCurrentZip] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const isValidInput = isValidZip(zipInput);



  // Parallax effect on mouse move
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!heroRef.current) return;
      const rect = heroRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      setMousePosition({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Fetch FMR data for a zip code
  const fetchFmrData = useCallback(async (zip: string) => {
    setIsUpdating(true);
    setError(null);
    setHasSearched(true);

    try {
      const response = await fetch(`/api/search/fmr?zip=${encodeURIComponent(zip)}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'ZIP code not found');
      }

      const data = await response.json();
      const fmrData = data.data;

      if (fmrData) {
        // Reset to 0 first, then animate to actual values
        setFmrValues({
          oneBr: 0,
          twoBr: 0,
          threeBr: 0,
        });
        // Small delay to ensure reset is visible, then set actual values
        setTimeout(() => {
          setFmrValues({
            oneBr: fmrData.bedroom1 || 0,
            twoBr: fmrData.bedroom2 || 0,
            threeBr: fmrData.bedroom3 || 0,
          });
        }, 50);
        setCurrentZip(zip);
      } else {
        setError('No FMR data available for this ZIP');
        setFmrValues({
          oneBr: 0,
          twoBr: 0,
          threeBr: 0,
        });
        setCurrentZip(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'ZIP code not found';
      setError(errorMessage);
      setFmrValues({
        oneBr: 0,
        twoBr: 0,
        threeBr: 0,
      });
      setCurrentZip(null);
    } finally {
      setIsUpdating(false);
    }
  }, []);

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isValidInput) return;

    fetchFmrData(zipInput.trim());
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 5);
    setZipInput(value);
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && isValidInput) {
      e.preventDefault();
      fetchFmrData(zipInput.trim());
    }
  };

  const handleViewDetails = () => {
    if (currentZip) {
      router.push(`/zip/${currentZip}`);
    }
  };

  return (
    <section
      ref={heroRef}
      className="relative min-h-screen flex flex-col items-center justify-start sm:justify-center overflow-hidden pt-20 pb-12 sm:pt-0 sm:pb-0"
      style={{
        background: 'linear-gradient(180deg, #0a0a0a 0%, #141414 100%)',
      }}
    >
      {/* Animated gradient overlay */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background: 'radial-gradient(ellipse at 50% 50%, rgba(22, 163, 74, 0.15) 0%, transparent 70%)',
          transform: `translate(${mousePosition.x * 30}px, ${mousePosition.y * 30}px)`,
          transition: 'transform 0.3s ease-out',
        }}
      />


      {/* Navigation */}
      <nav className={`absolute top-0 left-0 right-0 z-20 transition-all duration-700 ${animationsReady ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-white tracking-tight">
            fmr.fyi
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/insights"
              className="text-sm text-white/70 hover:text-white transition-colors hidden sm:block"
            >
              Insights
            </Link>
            <Link
              href="/explorer"
              className="text-sm text-white/70 hover:text-white transition-colors hidden sm:block"
            >
              Explorer
            </Link>
            <a
              href="https://chromewebstore.google.com/detail/fmrfyi-%E2%80%93-fair-market-rent/gkemjakehildeolcagbibhmbcddkkflb"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 text-sm font-normal rounded-lg bg-white/[0.06] text-white/80 hover:text-white hover:bg-white/10 transition-colors border border-white/10"
            >
              Get Extension
            </a>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <div className={`relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-left mt-[10vh] sm:mt-0 transition-all duration-1000 ${animationsReady ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 mb-4 sm:mb-10">
          <span className="w-1.5 h-1.5 rounded-sm bg-[#16a34a]" />
          <span className="text-xs sm:text-sm text-white/50 font-light tracking-wide">FY 2026 Data Available</span>
        </div>

        {/* Headline */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-medium text-white tracking-tight leading-[1.1] mb-4 sm:mb-8">
          Fair Market Rent,{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#16a34a] to-[#44e37e]">
            Made Simple
          </span>
        </h1>

        {/* Subheadline */}
        <p className="text-base sm:text-lg md:text-xl text-white/50 font-light max-w-xl mb-8 sm:mb-14 leading-relaxed">
          Instantly access HUD FMR data, calculate cash flow, and discover
          the best markets for Section 8 investing.
        </p>

        {/* Animated rent values */}
        <div className={`flex flex-wrap justify-start gap-6 sm:gap-10 md:gap-14 mb-2 sm:mb-4 transition-all duration-1000 delay-300 ${animationsReady ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <AnimatedRentValue value={fmrValues.oneBr} label="1 Bedroom" delay={0} isUpdating={isUpdating} showPlaceholder={!hasSearched && fmrValues.oneBr === 0} animationEnabled={animationsReady} />
          <AnimatedRentValue value={fmrValues.twoBr} label="2 Bedroom" delay={200} isUpdating={isUpdating} showPlaceholder={!hasSearched && fmrValues.twoBr === 0} animationEnabled={animationsReady} />
          <AnimatedRentValue value={fmrValues.threeBr} label="3 Bedroom" delay={400} isUpdating={isUpdating} showPlaceholder={!hasSearched && fmrValues.threeBr === 0} animationEnabled={animationsReady} />
        </div>

        {/* Current ZIP indicator - expands to fit content */}
        <div className={`min-h-[24px] sm:min-h-[32px] mb-4 sm:mb-6 flex items-center justify-start transition-all duration-300 ${currentZip ? 'mb-5 sm:mb-8' : ''}`}>
          {currentZip && (
            <button
              onClick={handleViewDetails}
              className="text-xs sm:text-sm text-[#44e37e]/80 hover:text-[#44e37e] transition-colors flex items-center gap-2 font-light"
            >
              <span>FMR for ZIP {currentZip}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="sm:w-4 sm:h-4">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {error && (
            <span className="text-xs sm:text-sm text-red-400/80 font-light">{error}</span>
          )}
        </div>

        {/* Search input */}
        <form onSubmit={handleSearchSubmit} className={`max-w-md transition-all duration-1000 delay-500 ${animationsReady ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="relative">
            <div className="relative flex items-center bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-colors">
              <div className="pl-4 text-white/40">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={zipInput}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Enter ZIP code"
                className="flex-1 bg-transparent px-4 py-4 sm:py-5 text-white placeholder:text-white/40 focus:outline-none text-base sm:text-lg"
              />
              <button
                type="submit"
                disabled={!isValidInput || isUpdating}
                className={`m-1.5 px-6 py-2.5 sm:py-3 font-medium rounded-lg text-sm sm:text-base transition-all ${
                  isValidInput && !isUpdating
                    ? 'bg-white text-[#0a0a0a] hover:bg-white/90 cursor-pointer'
                    : 'bg-white/10 text-white/30 cursor-not-allowed'
                }`}
              >
                {isUpdating ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </span>
                ) : (
                  'Search'
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Scroll indicator */}
        <div className={`mt-12 sm:mt-16 transition-all duration-1000 delay-1000 ${animationsReady ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex items-center gap-3 text-white/30">
            <div className="w-8 h-[1px] bg-white/20" />
            <span className="text-xs font-light tracking-wider uppercase">Scroll</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-bounce">
              <path d="M12 5v14M19 12l-7 7-7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

    </section>
  );
}
