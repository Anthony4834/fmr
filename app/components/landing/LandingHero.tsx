'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCountUp } from '@/app/hooks/useCountUp';

// Floating particle component
function FloatingParticle({ delay, duration, size, startX, startY }: {
  delay: number;
  duration: number;
  size: number;
  startX: number;
  startY: number;
}) {
  return (
    <div
      className="absolute rounded-full bg-white/5 pointer-events-none"
      style={{
        width: size,
        height: size,
        left: `${startX}%`,
        top: `${startY}%`,
        animation: `float ${duration}s ease-in-out ${delay}s infinite`,
      }}
    />
  );
}

// Format number with commas, padding with zeros to match target length
function formatWithPlaceholder(num: number, targetValue: number): string {
  const targetStr = targetValue.toLocaleString();
  const numStr = num.toLocaleString();
  
  // If current number has fewer digits, pad with leading zeros
  if (numStr.length < targetStr.length) {
    // Count how many digit positions we need
    const targetDigits = targetStr.replace(/,/g, '').length;
    const currentDigits = numStr.replace(/,/g, '').length;
    const padding = targetDigits - currentDigits;
    
    if (padding > 0) {
      // Pad with zeros and add commas appropriately
      const paddedNum = num.toString().padStart(targetDigits, '0');
      // Add commas every 3 digits from the right
      return paddedNum.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
  }
  
  return numStr;
}

// Animated rent value display with smooth transitions between values
function AnimatedRentValue({ value, label, delay, isUpdating, isInitial, showPlaceholder }: {
  value: number;
  label: string;
  delay: number;
  isUpdating?: boolean;
  isInitial?: boolean;
  showPlaceholder?: boolean;
}) {
  const prevValueRef = useRef<number>(0);
  const [displayValue, setDisplayValue] = useState(0);
  const [showingPlaceholder, setShowingPlaceholder] = useState(true);
  const animationRef = useRef<number>();
  const startTimeRef = useRef<number>();
  
  useEffect(() => {
    if (showPlaceholder) {
      setDisplayValue(0);
      prevValueRef.current = 0;
      setShowingPlaceholder(true);
      return;
    }

    // Start animation from 0
    const startValue = 0;
    const endValue = value;
    const duration = 800;
    
    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }
      
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      
      // easeOut cubic
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.round(startValue + (endValue - startValue) * easedProgress);
      
      // Only hide placeholder once we have a non-zero value to show
      if (currentValue > 0 && showingPlaceholder) {
        setShowingPlaceholder(false);
      }
      
      setDisplayValue(currentValue);
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        prevValueRef.current = endValue;
      }
    };
    
    startTimeRef.current = undefined;
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, showPlaceholder, showingPlaceholder]);

  // Show "X,XXX" until animation produces a non-zero value, then show the animated number
  const formattedValue = (showPlaceholder || showingPlaceholder)
    ? 'X,XXX' 
    : formatWithPlaceholder(displayValue, value);

  return (
    <div className={`text-center transition-opacity duration-300 ${isUpdating ? 'opacity-80' : 'opacity-100'}`}>
      <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tabular-nums">
        ${formattedValue}
      </div>
      <div className="text-xs sm:text-sm text-white/60 mt-1">{label}</div>
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

export default function LandingHero() {
  const router = useRouter();
  const [isLoaded, setIsLoaded] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const heroRef = useRef<HTMLDivElement>(null);

  // Search and FMR state
  const [zipInput, setZipInput] = useState('');
  const [fmrValues, setFmrValues] = useState(DEFAULT_FMR);
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentZip, setCurrentZip] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasAnimatedOnce, setHasAnimatedOnce] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const isValidInput = isValidZip(zipInput);
  
  // Mark initial animation as complete after first render
  useEffect(() => {
    const timer = setTimeout(() => setHasAnimatedOnce(true), 3500);
    return () => clearTimeout(timer);
  }, []);

  // Generate particles on mount
  const particles = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => ({
      id: i,
      delay: Math.random() * 5,
      duration: 15 + Math.random() * 10,
      size: 4 + Math.random() * 8,
      startX: Math.random() * 100,
      startY: Math.random() * 100,
    }));
  }, []);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

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

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden">
        {particles.map((p) => (
          <FloatingParticle key={p.id} {...p} />
        ))}
      </div>

      {/* Navigation */}
      <nav className={`absolute top-0 left-0 right-0 z-20 transition-all duration-700 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
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
              className="px-4 py-2 text-sm font-medium rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors backdrop-blur-sm border border-white/10"
            >
              Get Extension
            </a>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <div className={`relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center mt-[10vh] sm:mt-0 transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 mb-3 sm:mb-8">
          <span className="w-2 h-2 rounded-full bg-[#16a34a] animate-pulse" />
          <span className="text-xs sm:text-sm text-white/70">FY 2026 Data Available</span>
        </div>

        {/* Headline */}
        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white tracking-tight leading-[1.1] mb-3 sm:mb-6">
          Fair Market Rent,{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#16a34a] to-[#44e37e]">
            Made Simple
          </span>
        </h1>

        {/* Subheadline */}
        <p className="text-base sm:text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-5 sm:mb-12">
          Instantly access HUD FMR data, calculate cash flow, and discover
          the best markets for Section 8 investing.
        </p>

        {/* Animated rent values */}
        <div className={`flex flex-wrap justify-center gap-4 sm:gap-8 md:gap-12 lg:gap-16 mb-2 sm:mb-3 transition-all duration-1000 delay-300 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <AnimatedRentValue value={fmrValues.oneBr} label="1 Bedroom" delay={500} isUpdating={isUpdating} isInitial={!hasSearched && !hasAnimatedOnce} showPlaceholder={!hasSearched && fmrValues.oneBr === 0} />
          <AnimatedRentValue value={fmrValues.twoBr} label="2 Bedroom" delay={700} isUpdating={isUpdating} isInitial={!hasSearched && !hasAnimatedOnce} showPlaceholder={!hasSearched && fmrValues.twoBr === 0} />
          <AnimatedRentValue value={fmrValues.threeBr} label="3 Bedroom" delay={900} isUpdating={isUpdating} isInitial={!hasSearched && !hasAnimatedOnce} showPlaceholder={!hasSearched && fmrValues.threeBr === 0} />
        </div>

        {/* Current ZIP indicator - expands to fit content */}
        <div className={`min-h-[24px] sm:min-h-[32px] mb-3 sm:mb-4 flex items-center justify-center transition-all duration-300 ${currentZip ? 'mb-4 sm:mb-6' : ''}`}>
          {currentZip && (
            <button
              onClick={handleViewDetails}
              className="text-xs sm:text-sm text-[#44e37e] hover:text-[#16a34a] transition-colors flex items-center gap-2"
            >
              <span>FMR for ZIP {currentZip}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="sm:w-4 sm:h-4">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {error && (
            <span className="text-xs sm:text-sm text-red-400">{error}</span>
          )}
        </div>

        {/* Search input */}
        <form onSubmit={handleSearchSubmit} className={`max-w-md mx-auto transition-all duration-1000 delay-500 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-[#16a34a]/10 to-[#0ea5e9]/10 rounded-xl blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative flex items-center bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden hover:border-white/15 transition-colors">
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
                className={`m-2 px-6 py-2.5 sm:py-3 font-semibold rounded-lg text-sm sm:text-base transition-all ${
                  isValidInput && !isUpdating
                    ? 'bg-white text-[#0a0a0a] hover:bg-white/90 cursor-pointer'
                    : 'bg-white/20 text-white/40 cursor-not-allowed'
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
        <div className={`mt-8 sm:mt-12 transition-all duration-1000 delay-1000 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex flex-col items-center gap-2 text-white/40">
            <span className="text-xs">Scroll to explore</span>
            <div className="w-6 h-10 rounded-full border-2 border-white/20 flex justify-center pt-2">
              <div className="w-1 h-3 bg-white/40 rounded-full animate-bounce" />
            </div>
          </div>
        </div>
      </div>

      {/* CSS for floating animation */}
      <style jsx>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0) translateX(0);
            opacity: 0.3;
          }
          25% {
            transform: translateY(-20px) translateX(10px);
            opacity: 0.6;
          }
          50% {
            transform: translateY(-10px) translateX(-5px);
            opacity: 0.4;
          }
          75% {
            transform: translateY(-30px) translateX(5px);
            opacity: 0.5;
          }
        }
      `}</style>
    </section>
  );
}
