'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DigitWheel } from '@/app/components/landing/DigitWheel';
import SearchInput from '@/app/components/SearchInput';
import { formatCountyName } from '@/lib/county-utils';
import { buildCitySlug, buildCountySlug } from '@/lib/location-slugs';
import Link from 'next/link';
import type React from 'react';

// Icon components
const TrendingUpIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);

const ArrowRightIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
  </svg>
);

const MapPinIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

interface FMRData {
  source?: 'fmr' | 'safmr';
  bedroom0?: number;
  bedroom1?: number;
  bedroom2?: number;
  bedroom3?: number;
  bedroom4?: number;
  cityName?: string;
  stateCode?: string;
  countyName?: string;
  areaName?: string;
  zipCode?: string;
  zipCodes?: string[];
  zipFMRData?: Array<{
    zipCode: string;
    bedroom0?: number;
    bedroom1?: number;
    bedroom2?: number;
    bedroom3?: number;
    bedroom4?: number;
  }>;
}

// Animated rent display component - rolls from current value to new value
function AnimatedRentDisplay({ 
  value, 
  previousValue,
  instanceId,
}: { 
  value: number; 
  previousValue?: number;
  instanceId: string; // Unique ID for this display instance
}) {
  // Format value
  const formatted = value.toLocaleString();
  const prevFormatted = previousValue?.toLocaleString() || '';
  
  // Pad to same length for consistent animation
  const maxLen = Math.max(formatted.length, prevFormatted.length);
  const paddedCurrent = formatted.padStart(maxLen, ' ');
  const paddedPrev = prevFormatted.padStart(maxLen, ' ');

  return (
    <div 
      className="text-3xl font-bold tabular-nums tracking-tight flex"
      style={{ 
        fontFamily: 'var(--font-display), system-ui, sans-serif',
        color: 'hsl(220 30% 12%)',
      }}
    >
      <span>$</span>
      {paddedCurrent.split('').map((char, i) => {
        const prevChar = paddedPrev[i];
        const prevDigit = prevChar && /\d/.test(prevChar) ? parseInt(prevChar, 10) : undefined;
        
        if (/\d/.test(char)) {
          return (
            <DigitWheel
              key={`${instanceId}-${i}`}
              targetDigit={parseInt(char, 10)}
              previousDigit={prevDigit}
              delay={i * 50}
            />
          );
        } else if (char === ',') {
          return <span key={`${instanceId}-sep-${i}`}>,</span>;
        } else {
          // Space - render empty for alignment
          return <span key={`${instanceId}-space-${i}`} style={{ width: '0.6em' }} />;
        }
      })}
    </div>
  );
}

function ResultCard({
  bedrooms,
  rentValue,
  previousValue,
  change,
  isRange = false,
  rangeMin,
  rangeMax,
  rangeMedian,
  delay = 0,
  isLoading = false,
  cardId,
}: {
  bedrooms: string;
  rentValue?: number;
  previousValue?: number;
  change: string;
  isRange?: boolean;
  rangeMin?: number;
  rangeMax?: number;
  rangeMedian?: number;
  delay?: number;
  isLoading?: boolean;
  cardId: string;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, delay }}
      className="relative p-6 rounded-xl border bg-white transition-all duration-200 hover:shadow-md"
      style={{
        borderColor: 'hsl(220 15% 90%)',
      }}
    >
      {/* Loading overlay */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-white/80 backdrop-blur-[1px] rounded-xl flex items-center justify-center z-10"
          >
            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: 'hsl(192 85% 42% / 0.3)', borderTopColor: 'transparent' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div 
        className="text-sm font-medium mb-3"
        style={{ 
          color: 'hsl(220 15% 45%)', 
          fontFamily: "var(--font-sans), system-ui, sans-serif" 
        }}
      >
        {bedrooms}
      </div>
      
      {isRange && rangeMin !== undefined && rangeMax !== undefined ? (
        <div>
          {rangeMin === rangeMax ? (
            <div 
              className="text-3xl font-bold tracking-tight tabular-nums"
              style={{ 
                color: 'hsl(220 30% 12%)',
                fontFamily: 'var(--font-display), system-ui, sans-serif',
              }}
            >
              ${rangeMin.toLocaleString()}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <div 
                className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums"
                style={{ 
                  color: 'hsl(220 30% 12%)',
                  fontFamily: 'var(--font-display), system-ui, sans-serif',
                }}
              >
                ${rangeMin.toLocaleString()} - ${rangeMax.toLocaleString()}
              </div>
              {rangeMedian !== undefined && (
                <div 
                  className="text-sm font-medium"
                  style={{ 
                    color: 'hsl(220 15% 55%)',
                    fontFamily: "var(--font-sans), system-ui, sans-serif",
                  }}
                >
                  Median: ${rangeMedian.toLocaleString()}
                </div>
              )}
            </div>
          )}
        </div>
      ) : rentValue !== undefined ? (
        <AnimatedRentDisplay 
          value={rentValue} 
          previousValue={previousValue}
          instanceId={cardId}
        />
      ) : null}
      
      <div className="flex items-center gap-2 mt-3">
        <span 
          className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
          style={{ 
            backgroundColor: 'hsl(142 70% 45% / 0.08)',
            color: 'hsl(142 70% 40%)',
            fontFamily: "var(--font-sans), system-ui, sans-serif" 
          }}
        >
          <TrendingUpIcon className="w-2.5 h-2.5" />
          {change}
        </span>
        <span 
          className="text-[10px]"
          style={{ 
            color: 'hsl(220 15% 60%)', 
            fontFamily: "var(--font-sans), system-ui, sans-serif" 
          }}
        >
          YoY
        </span>
      </div>
    </motion.div>
  );
}

// Curated list of interesting ZIP codes from different markets
const SAMPLE_ZIPS = [
  '30318', // Atlanta, GA
  '78702', // Austin, TX  
  '85004', // Phoenix, AZ
  '33127', // Miami, FL
  '37203', // Nashville, TN
  '28202', // Charlotte, NC
  '46204', // Indianapolis, IN
  '43215', // Columbus, OH
  '32801', // Orlando, FL
  '85281', // Tempe, AZ
  '80202', // Denver, CO
  '30316', // Atlanta, GA
  '78201', // San Antonio, TX
  '33132', // Miami, FL
  '75201', // Dallas, TX
];

// Get a random ZIP code for initial state
function getRandomZip(): string {
  return SAMPLE_ZIPS[Math.floor(Math.random() * SAMPLE_ZIPS.length)];
}

export default function SearchPreview({ isReady = false }: { isReady?: boolean }) {
  const [fmrData, setFmrData] = useState<FMRData | null>(null);
  const [previousFmrData, setPreviousFmrData] = useState<FMRData | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [initialZip, setInitialZip] = useState<string | null>(null);
  const hasLoadedInitialRef = useRef(false);

  // Load random ZIP on initial render
  useEffect(() => {
    if (isReady && !hasLoadedInitialRef.current) {
      hasLoadedInitialRef.current = true;
      const zip = getRandomZip();
      setInitialZip(zip);
      
      // Search directly with the ZIP
      setPreviousFmrData(null);
      setIsSearching(true);
      setSearchError(null);
      
      (async () => {
        try {
          const response = await fetch(`/api/search/fmr?zip=${encodeURIComponent(zip)}`);
          if (response.ok) {
            const data = await response.json();
            if (data.data) {
              setFmrData(data.data);
            }
          }
        } catch (err) {
          console.error('Error loading initial ZIP:', err);
        } finally {
          setIsSearching(false);
        }
      })();
    }
  }, [isReady]);

  // Handle search selection from SearchInput
  const handleSearchSelect = useCallback(async (
    value: string,
    type: 'zip' | 'city' | 'county' | 'address' | 'state'
  ) => {
    if (type === 'state') {
      setSearchError('Please search for a specific ZIP code, city, or county');
      return;
    }

    setPreviousFmrData(fmrData);
    setIsSearching(true);
    setSearchError(null);

    try {
      let url = '';
      if (type === 'zip' || /^\d{5}$/.test(value)) {
        // ZIP code - extract 5 digits
        const zip = value.match(/\b(\d{5})\b/)?.[1] || value.replace(/-\d{4}$/, '').trim();
        url = `/api/search/fmr?zip=${encodeURIComponent(zip)}`;
      } else if (type === 'city') {
        // City format: "City Name, ST" or "City Name - County, ST"
        const parts = value.split(',').map(s => s.trim());
        const state = parts[parts.length - 1]?.match(/^([A-Z]{2})$/)?.[1];
        const city = parts[0]?.split(' - ')[0]?.trim();
        if (city && state) {
          url = `/api/search/fmr?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}`;
        } else {
          throw new Error('Invalid city format. Please use "City, ST"');
        }
      } else if (type === 'county') {
        // County format: "County Name, ST" or "County Name County, ST"
        const parts = value.split(',').map(s => s.trim());
        const state = parts[parts.length - 1]?.match(/^([A-Z]{2})$/)?.[1];
        // Remove "County" or "Parish" suffix if present
        let county = parts[0]?.trim();
        if (county) {
          county = county.replace(/\s+(County|Parish)$/i, '').trim();
        }
        if (county && state) {
          url = `/api/search/fmr?county=${encodeURIComponent(county)}&state=${encodeURIComponent(state)}`;
        } else {
          throw new Error('Invalid county format. Please use "County, ST"');
        }
      } else if (type === 'address') {
        // Address format may include ZIP: "address|zipCode" or just address
        if (value.includes('|')) {
          const [, zip] = value.split('|');
          url = `/api/search/fmr?zip=${encodeURIComponent(zip.trim())}`;
        } else {
          url = `/api/search/fmr?address=${encodeURIComponent(value)}`;
        }
      }

      if (!url) {
        throw new Error('Invalid search type');
      }

      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Location not found');
      }

      const data = await response.json();
      if (data.data) {
        setFmrData(data.data);
      } else {
        throw new Error('No FMR data available');
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
      setFmrData(null);
    } finally {
      setIsSearching(false);
    }
  }, [fmrData]);

  // Calculate SAFMR ranges if applicable
  const getBedroomRange = (bedroom: 1 | 2 | 3) => {
    if (!fmrData?.zipFMRData || fmrData.zipFMRData.length === 0) return null;
    
    const key = `bedroom${bedroom}` as 'bedroom1' | 'bedroom2' | 'bedroom3';
    const values = fmrData.zipFMRData
      .map(z => z[key])
      .filter((v): v is number => v !== undefined);
    
    if (values.length === 0) return null;
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    
    return { min, max, median };
  };

  // Build URL for "View Full Details" button
  const getDetailsUrl = () => {
    if (!fmrData) return null;
    
    if (fmrData.zipCode) {
      return `/zip/${fmrData.zipCode}${fmrData.stateCode ? `?state=${fmrData.stateCode}` : ''}`;
    } else if (fmrData.cityName && fmrData.stateCode) {
      return `/city/${buildCitySlug(fmrData.cityName, fmrData.stateCode)}`;
    } else if (fmrData.countyName && fmrData.stateCode) {
      return `/county/${buildCountySlug(fmrData.countyName, fmrData.stateCode)}`;
    }
    
    return null;
  };

  const displayLocation = fmrData
    ? fmrData.cityName && fmrData.stateCode
      ? `${fmrData.cityName}, ${fmrData.stateCode}`
      : fmrData.countyName && fmrData.stateCode
      ? `${formatCountyName(fmrData.countyName, fmrData.stateCode)}, ${fmrData.stateCode}`
      : fmrData.zipCode || initialZip || '90210'
    : initialZip || '90210';

  const displayUrl = fmrData
    ? fmrData.zipCode
      ? `fmr.fyi/zip/${fmrData.zipCode}`
      : fmrData.cityName && fmrData.stateCode
      ? `fmr.fyi/city/${buildCitySlug(fmrData.cityName, fmrData.stateCode)}`
      : fmrData.countyName && fmrData.stateCode
      ? `fmr.fyi/county/${buildCountySlug(fmrData.countyName, fmrData.stateCode)}`
      : 'fmr.fyi/search'
    : `fmr.fyi/zip/${initialZip || '90210'}`;

  const isSAFMR = fmrData?.source === 'safmr' && fmrData.zipFMRData && fmrData.zipFMRData.length > 1;
  const bedroom1Range = getBedroomRange(1);
  const bedroom2Range = getBedroomRange(2);
  const bedroom3Range = getBedroomRange(3);

  return (
    <section 
      className="relative py-24 md:py-32 overflow-hidden"
      style={{ backgroundColor: 'hsl(0 0% 100%)' }}
    >
      {/* Subtle background pattern */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-50"
        style={{
          backgroundImage: `radial-gradient(hsl(220 15% 88% / 0.5) 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative max-w-5xl mx-auto px-6">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={isReady ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 0.6, delay: isReady ? 0.2 : 0 }}
          className="text-center mb-12"
        >
          <h2 
            className="font-display text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-4"
            style={{ color: 'hsl(220 30% 12%)' }}
          >
            Try it{' '}
            <span style={{ color: 'hsl(192 85% 42%)' }}>yourself</span>
          </h2>
          <p 
            className="text-lg md:text-xl max-w-2xl mx-auto mb-2"
            style={{ 
              color: 'hsl(220 15% 45%)', 
              fontFamily: "var(--font-sans), system-ui, sans-serif" 
            }}
          >
            See exactly what Section 8 pays — before you invest your time.
          </p>
        </motion.div>

        {/* Search Card */}
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.98 }}
          animate={isReady ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 40, scale: 0.98 }}
          transition={{ duration: 0.7, delay: isReady ? 0.3 : 0 }}
        >
          <div 
            className="rounded-2xl border shadow-2xl overflow-hidden"
            style={{ 
              backgroundColor: 'hsl(0 0% 100%)', 
              borderColor: 'hsl(220 15% 90%)',
              boxShadow: '0 25px 50px -12px hsl(220 30% 12% / 0.08), 0 0 0 1px hsl(220 15% 90% / 0.5)',
            }}
          >
            {/* Browser Chrome */}
            <div 
              className="h-10 border-b flex items-center px-4 gap-3"
              style={{ 
                backgroundColor: 'hsl(220 15% 97%)', 
                borderColor: 'hsl(220 15% 90%)' 
              }}
            >
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'hsl(0 72% 70%)' }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'hsl(45 93% 60%)' }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'hsl(142 70% 55%)' }} />
              </div>
              <div 
                className="flex-1 max-w-md mx-auto h-6 rounded-md flex items-center px-2.5 text-xs relative overflow-hidden"
                style={{ 
                  backgroundColor: 'hsl(0 0% 100%)',
                  border: '1px solid hsl(220 15% 90%)',
                  color: 'hsl(220 15% 60%)',
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                <AnimatePresence mode="wait">
                  {isSearching ? (
                    <motion.span
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-1.5"
                    >
                      <span 
                        className="w-2 h-2 border border-t-transparent rounded-full animate-spin"
                        style={{ borderColor: 'hsl(192 85% 42%)', borderTopColor: 'transparent' }}
                      />
                      <span style={{ color: 'hsl(220 15% 70%)' }}>Loading...</span>
                    </motion.span>
                  ) : (
                    <motion.span
                      key="url"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center"
                    >
                      <span style={{ color: 'hsl(142 70% 50%)' }}>●</span>
                      <span className="ml-1.5">{displayUrl}</span>
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Content Area */}
            <div className="p-6 md:p-8">
              {/* Search Input - Using main SearchInput component */}
              <div className="mb-8">
                <SearchInput
                  onSelect={handleSearchSelect}
                  placeholder="Enter ZIP code, address, or city..."
                  autoFocus={false}
                />
              </div>

              {/* Error State */}
              {searchError ? (
                <div 
                  className="text-center py-12 rounded-xl"
                  style={{ backgroundColor: 'hsl(0 72% 51% / 0.05)' }}
                >
                  <p 
                    className="text-sm font-medium"
                    style={{ 
                      color: 'hsl(0 72% 45%)', 
                      fontFamily: "var(--font-sans), system-ui, sans-serif" 
                    }}
                  >
                    {searchError}
                  </p>
                  <p 
                    className="text-xs mt-1"
                    style={{ 
                      color: 'hsl(0 72% 51% / 0.7)', 
                      fontFamily: "var(--font-sans), system-ui, sans-serif" 
                    }}
                  >
                    Try a different search term
                  </p>
                </div>
              ) : (
                <>
                  {/* Location Badge */}
                  <div className="flex items-center justify-center gap-2 mb-6">
                    <motion.div 
                      layout
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full relative overflow-hidden"
                      style={{ backgroundColor: 'hsl(220 15% 96%)' }}
                    >
                      {/* Loading shimmer */}
                      <AnimatePresence>
                        {isSearching && (
                          <motion.div
                            initial={{ x: '-100%' }}
                            animate={{ x: '100%' }}
                            exit={{ opacity: 0 }}
                            transition={{ 
                              x: { duration: 1, repeat: Infinity, ease: 'linear' },
                              opacity: { duration: 0.2 }
                            }}
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent"
                            style={{ width: '50%' }}
                          />
                        )}
                      </AnimatePresence>
                      
                      <MapPinIcon 
                        className={`w-4 h-4 transition-opacity ${isSearching ? 'opacity-50' : 'opacity-100'}`} 
                        style={{ color: 'hsl(192 85% 42%)' }} 
                      />
                      <span 
                        className={`text-sm font-medium transition-opacity ${isSearching ? 'opacity-50' : 'opacity-100'}`}
                        style={{ 
                          color: 'hsl(220 30% 12%)',
                          fontFamily: "var(--font-sans), system-ui, sans-serif",
                        }}
                      >
                        {displayLocation}
                      </span>
                      {/* Only show county separately if it's not already in displayLocation (i.e., for city/ZIP searches) */}
                      {fmrData?.countyName && fmrData.cityName && !isSearching && (
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="inline-flex items-center gap-2"
                        >
                          <span style={{ color: 'hsl(220 15% 80%)' }}>•</span>
                          <span 
                            className="text-sm"
                            style={{ 
                              color: 'hsl(220 15% 55%)',
                              fontFamily: "var(--font-sans), system-ui, sans-serif",
                            }}
                          >
                            {formatCountyName(fmrData.countyName, fmrData.stateCode)}
                          </span>
                        </motion.span>
                      )}
                      {isSAFMR && !isSearching && (
                        <motion.span
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.1 }}
                          className="inline-flex items-center gap-2"
                        >
                          <span style={{ color: 'hsl(220 15% 80%)' }}>•</span>
                          <span 
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ 
                              backgroundColor: 'hsl(192 85% 42% / 0.1)',
                              color: 'hsl(192 85% 38%)',
                              fontFamily: "var(--font-sans), system-ui, sans-serif",
                            }}
                          >
                            SAFMR ({fmrData.zipCodes?.length || 0} ZIPs)
                          </span>
                        </motion.span>
                      )}
                    </motion.div>
                  </div>

                  {/* Results Grid */}
                  <div className="grid md:grid-cols-3 gap-4 mb-6">
                    {fmrData ? (
                      <>
                        {(isSAFMR && bedroom1Range) ? (
                          <ResultCard
                            key="br1-range"
                            bedrooms="1 Bedroom"
                            isRange={true}
                            rangeMin={bedroom1Range.min}
                            rangeMax={bedroom1Range.max}
                            rangeMedian={bedroom1Range.median}
                            change="+2.8%"
                            isLoading={isSearching}
                            cardId="br1"
                            delay={0}
                          />
                        ) : fmrData.bedroom1 !== undefined ? (
                          <ResultCard
                            key="br1-single"
                            bedrooms="1 Bedroom"
                            rentValue={fmrData.bedroom1}
                            previousValue={previousFmrData?.bedroom1}
                            change="+2.8%"
                            isLoading={isSearching}
                            cardId="br1"
                            delay={0}
                          />
                        ) : null}
                        
                        {(isSAFMR && bedroom2Range) ? (
                          <ResultCard
                            key="br2-range"
                            bedrooms="2 Bedroom"
                            isRange={true}
                            rangeMin={bedroom2Range.min}
                            rangeMax={bedroom2Range.max}
                            rangeMedian={bedroom2Range.median}
                            change="+4.1%"
                            isLoading={isSearching}
                            cardId="br2"
                            delay={0.05}
                          />
                        ) : fmrData.bedroom2 !== undefined ? (
                          <ResultCard
                            key="br2-single"
                            bedrooms="2 Bedroom"
                            rentValue={fmrData.bedroom2}
                            previousValue={previousFmrData?.bedroom2}
                            change="+4.1%"
                            isLoading={isSearching}
                            cardId="br2"
                            delay={0.05}
                          />
                        ) : null}
                        
                        {(isSAFMR && bedroom3Range) ? (
                          <ResultCard
                            key="br3-range"
                            bedrooms="3 Bedroom"
                            isRange={true}
                            rangeMin={bedroom3Range.min}
                            rangeMax={bedroom3Range.max}
                            rangeMedian={bedroom3Range.median}
                            change="+3.5%"
                            isLoading={isSearching}
                            cardId="br3"
                            delay={0.1}
                          />
                        ) : fmrData.bedroom3 !== undefined ? (
                          <ResultCard
                            key="br3-single"
                            bedrooms="3 Bedroom"
                            rentValue={fmrData.bedroom3}
                            previousValue={previousFmrData?.bedroom3}
                            change="+3.5%"
                            isLoading={isSearching}
                            cardId="br3"
                            delay={0.1}
                          />
                        ) : null}
                      </>
                    ) : (
                      <>
                        <ResultCard
                          key="placeholder-br1"
                          bedrooms="1 Bedroom"
                          rentValue={2102}
                          change="+2.8%"
                          isLoading={isSearching}
                          cardId="placeholder-br1"
                          delay={0.05}
                        />
                        <ResultCard
                          key="placeholder-br2"
                          bedrooms="2 Bedroom"
                          rentValue={2645}
                          change="+4.1%"
                          isLoading={isSearching}
                          cardId="placeholder-br2"
                          delay={0.1}
                        />
                        <ResultCard
                          key="placeholder-br3"
                          bedrooms="3 Bedroom"
                          rentValue={2845}
                          change="+3.5%"
                          isLoading={isSearching}
                          cardId="placeholder-br3"
                          delay={0.15}
                        />
                      </>
                    )}
                  </div>

                  {/* CTA Link */}
                  {getDetailsUrl() && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                      className="text-center"
                    >
                      <Link
                        href={getDetailsUrl()!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-200"
                        style={{ 
                          backgroundColor: 'hsl(192 85% 42%)',
                          color: '#ffffff',
                          fontFamily: "var(--font-sans), system-ui, sans-serif",
                          boxShadow: '0 4px 14px hsl(192 85% 42% / 0.25)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'hsl(192 85% 38%)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'hsl(192 85% 42%)';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                        View Full Analysis
                        <ArrowRightIcon className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                      </Link>
                      <p 
                        className="text-xs mt-2"
                        style={{ 
                          color: 'hsl(220 15% 55%)',
                          fontFamily: "var(--font-sans), system-ui, sans-serif",
                        }}
                      >
                        Cash flow, investment scores, and market rankings
                      </p>
                    </motion.div>
                  )}
                </>
              )}
            </div>
          </div>
        </motion.div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isReady ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5, delay: isReady ? 0.5 : 0 }}
          className="text-center mt-10"
        >
          <p 
            className="text-sm"
            style={{ 
              color: 'hsl(220 15% 55%)',
              fontFamily: "var(--font-sans), system-ui, sans-serif",
            }}
          >
            Access FMR data for 41,000+ ZIP codes across all 50 states
          </p>
        </motion.div>
      </div>
    </section>
  );
}
