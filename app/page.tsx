'use client';

import { useState, useEffect, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import SearchInput from './components/SearchInput';
import FMRResults from './components/FMRResults';
import NationwideStats from './components/NationwideStats';

interface ZIPFMRData {
  zipCode: string;
  bedroom0?: number;
  bedroom1?: number;
  bedroom2?: number;
  bedroom3?: number;
  bedroom4?: number;
}

interface FMRResult {
  source: 'safmr' | 'fmr';
  zipCode?: string;
  zipCodes?: string[];
  zipFMRData?: ZIPFMRData[];
  areaName: string;
  stateCode: string;
  countyName?: string;
  year: number;
  bedroom0?: number;
  bedroom1?: number;
  bedroom2?: number;
  bedroom3?: number;
  bedroom4?: number;
  effectiveDate?: Date;
  queriedLocation?: string;
  queriedType?: 'zip' | 'city' | 'county' | 'address';
}

export default function Home() {
  const router = useRouter();
  
  const [fmrData, setFmrData] = useState<FMRResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zipRankings, setZipRankings] = useState<Array<{zipCode: string; percentDiff: number}> | null>(null);
  const [hasUrlParams, setHasUrlParams] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isCheckingUrl, setIsCheckingUrl] = useState(true);

  const handleSearch = async (value: string, type: 'zip' | 'city' | 'county' | 'address', updateUrl: boolean = true) => {
    setLoading(true);
    setError(null);
    setFmrData(null);

    // Update URL with search params
    if (updateUrl) {
      const params = new URLSearchParams();
      params.set('q', value);
      params.set('type', type);
      router.push(`?${params.toString()}`, { scroll: false });
    }

    try {
      let url = '/api/search/fmr?';
      
      if (type === 'zip') {
        url += `zip=${encodeURIComponent(value)}`;
      } else if (type === 'address') {
        url += `address=${encodeURIComponent(value)}`;
      } else if (type === 'city') {
        const [city, state] = value.split(',').map(s => s.trim());
        url += `city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}`;
      } else if (type === 'county') {
        const [county, state] = value.split(',').map(s => s.trim());
        url += `county=${encodeURIComponent(county)}&state=${encodeURIComponent(state)}`;
      }

      const response = await fetch(url);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch FMR data');
      }

      setFmrData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFmrData(null);
    setError(null);
    setZipRankings(null);
    router.push('/', { scroll: false });
  };

  // Check URL params synchronously on mount - before paint to prevent flash
  useLayoutEffect(() => {
    // Check URL params immediately (synchronously)
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');
    const type = params.get('type') as 'zip' | 'city' | 'county' | 'address' | null;
    
    if (query && type) {
      // We have URL params - set loading and trigger search
      setHasUrlParams(true);
      setLoading(true);
      setIsInitialized(true); // Mark as initialized so we can render FMRResults
      const value = query.split('|')[0];
      handleSearch(value, type, false);
    } else {
      // No URL params - mark as initialized immediately (no loading state)
      setIsInitialized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-[#fafafa] antialiased lg:h-screen lg:overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 lg:py-4 lg:h-full lg:flex lg:flex-col">
        {/* Header */}
        <div className="mb-6 lg:mb-4 flex-shrink-0">
          <div className="mb-3 lg:mb-2">
            <button
              onClick={handleReset}
              className="text-left hover:opacity-70 transition-opacity"
            >
              <h1 className="text-3xl md:text-4xl font-bold text-[#0a0a0a] mb-1 tracking-tight">
                fmr.fyi
              </h1>
              <p className="text-xs text-[#737373] font-medium tracking-wide uppercase">
                Fair Market Rent Data
              </p>
            </button>
          </div>
          <p className="text-base text-[#525252] max-w-2xl">
            Search HUD Fair Market Rent data by address, city, ZIP code, or county
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start lg:flex-1 lg:min-h-0 lg:overflow-hidden">
          {/* Main Results Card */}
          <div className="flex-1 bg-white rounded-lg border border-[#e5e5e5] shadow-sm p-6 md:p-8 transition-shadow hover:shadow-md w-full lg:h-full lg:flex lg:flex-col lg:overflow-hidden">
            <div className="flex-shrink-0 mb-6">
              <SearchInput onSelect={handleSearch} />
            </div>
            <div className="flex-1 lg:min-h-0 lg:overflow-hidden">
              {!isInitialized ? (
                // Don't render anything until we've checked URL params
                <div className="h-full" />
              ) : hasUrlParams || fmrData || loading || error ? (
                // Show FMRResults if we have URL params, data, loading, or error
                <FMRResults 
                  data={fmrData} 
                  loading={loading} 
                  error={error}
                  onZipRankingsChange={setZipRankings}
                />
              ) : (
                // No URL params and no search - show dashboard
                <div className="h-full">
                  <NationwideStats />
                </div>
              )}
            </div>
          </div>

          {/* ZIP Code Ranking Card - To the right */}
          {zipRankings && zipRankings.length > 0 && (
            <div className="lg:w-80 flex-shrink-0 bg-white rounded-lg border border-[#e5e5e5] shadow-sm p-6 md:p-8 flex flex-col transition-shadow hover:shadow-md lg:h-full lg:overflow-hidden">
              <div className="mb-6 flex-shrink-0">
                <h3 className="text-lg font-semibold text-[#0a0a0a] mb-1">
                  ZIP Codes
                </h3>
                <p className="text-xs text-[#737373]">
                  Ranked by average FMR
                </p>
              </div>
              <div className="space-y-1 overflow-y-auto flex-1 min-h-0 pr-2 -mr-2 custom-scrollbar">
                {zipRankings.map((zip, index) => {
                  const isPositive = zip.percentDiff > 0;
                  const isNegative = zip.percentDiff < 0;
                  
                  return (
                    <div 
                      key={zip.zipCode}
                      className="flex items-center justify-between py-2.5 px-3 rounded-md border border-transparent hover:bg-[#fafafa] hover:border-[#e5e5e5] transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-[#737373] w-5 tabular-nums">
                          {index + 1}
                        </span>
                        <span className="font-medium text-[#0a0a0a] text-sm">
                          {zip.zipCode}
                        </span>
                      </div>
                      <span className={`text-sm font-medium tabular-nums ${
                        isPositive 
                          ? 'text-[#16a34a]' 
                          : isNegative 
                          ? 'text-[#dc2626]' 
                          : 'text-[#525252]'
                      }`}>
                        {isPositive ? '+' : ''}{zip.percentDiff.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 text-xs text-[#737373] pt-4 border-t border-[#e5e5e5] flex-shrink-0 leading-relaxed">
                <p>Percentage shows difference from median FMR across all unit sizes.</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 lg:mt-4 pt-4 lg:pt-3 border-t border-[#e5e5e5] flex-shrink-0">
          <div className="mb-3 lg:mb-2">
            <p className="text-xs font-medium text-[#0a0a0a] mb-0.5">fmr.fyi</p>
            <p className="text-xs text-[#737373]">
              Fair Market Rent data made simple
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-[#737373]">
              Data source: <span className="text-[#525252] font-medium">U.S. Department of Housing and Urban Development (HUD)</span>
            </p>
            <p className="text-xs text-[#a3a3a3]">
              Fiscal Year 2026 • Updated October 2025
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

