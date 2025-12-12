'use client';

import { useMemo, useRef, useState, useLayoutEffect } from 'react';
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

type SearchStatus = 'idle' | 'loading' | 'success' | 'error';

type ZipRanking = { zipCode: string; percentDiff: number; avgFMR: number };

function computeZipRankings(data: FMRResult | null): { rankings: ZipRanking[]; medianAvgFMR: number } | null {
  if (!data?.zipFMRData || data.zipFMRData.length < 2) return null;

  const zipScores = data.zipFMRData.map(zip => {
    const values = [zip.bedroom0, zip.bedroom1, zip.bedroom2, zip.bedroom3, zip.bedroom4].filter(
      v => v !== undefined
    ) as number[];
    const avgFMR = values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
    return { zipCode: zip.zipCode, avgFMR };
  });

  const sorted = [...zipScores].sort((a, b) => a.avgFMR - b.avgFMR);
  const medianIndex = Math.floor(sorted.length / 2);
  const medianAvgFMR =
    sorted.length % 2 === 0 ? (sorted[medianIndex - 1].avgFMR + sorted[medianIndex].avgFMR) / 2 : sorted[medianIndex].avgFMR;

  const rankings: ZipRanking[] = zipScores
    .map(z => ({
      zipCode: z.zipCode,
      avgFMR: z.avgFMR,
      percentDiff: medianAvgFMR > 0 ? ((z.avgFMR - medianAvgFMR) / medianAvgFMR) * 100 : 0
    }))
    .sort((a, b) => b.avgFMR - a.avgFMR);

  return { rankings, medianAvgFMR };
}

export default function Home() {
  const router = useRouter();
  
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle');
  const [rootFmrData, setRootFmrData] = useState<FMRResult | null>(null);
  const [viewFmrData, setViewFmrData] = useState<FMRResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zipRankings, setZipRankings] = useState<ZipRanking[] | null>(null);
  const [zipMedianAvgFMR, setZipMedianAvgFMR] = useState<number | null>(null);
  const [drilldownZip, setDrilldownZip] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchRequestIdRef = useRef(0);

  const isSearching = searchStatus === 'loading';

  const handleSearch = async (value: string, type: 'zip' | 'city' | 'county' | 'address', updateUrl: boolean = true) => {
    // Cancel any in-flight search request (prevents stale responses overwriting state)
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const abortController = new AbortController();
    searchAbortRef.current = abortController;
    const requestId = ++searchRequestIdRef.current;

    setSearchStatus('loading');
    setError(null);
    setRootFmrData(null);
    setViewFmrData(null);
    setZipRankings(null);
    setZipMedianAvgFMR(null);
    setDrilldownZip(null);

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

      const response = await fetch(url, { signal: abortController.signal });
      const result = await response.json();

      // Ignore stale/aborted responses
      if (abortController.signal.aborted || requestId !== searchRequestIdRef.current) {
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch FMR data');
      }

      setRootFmrData(result.data);
      setViewFmrData(result.data);
      const computed = computeZipRankings(result.data);
      setZipRankings(computed?.rankings || null);
      setZipMedianAvgFMR(computed?.medianAvgFMR ?? null);
      setSearchStatus('success');
    } catch (err) {
      if (abortController.signal.aborted || requestId !== searchRequestIdRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : 'An error occurred');
      setSearchStatus('error');
    } finally {
      if (abortController.signal.aborted || requestId !== searchRequestIdRef.current) {
        return;
      }
      // status is set explicitly on success/error; keep as-is here
    }
  };

  const handleReset = () => {
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    setRootFmrData(null);
    setViewFmrData(null);
    setError(null);
    setZipRankings(null);
    setZipMedianAvgFMR(null);
    setDrilldownZip(null);
    setSearchStatus('idle');
    router.push('/', { scroll: false });
  };

  const handleZipDrilldown = (zipCode: string) => {
    if (!rootFmrData?.zipFMRData || rootFmrData.zipFMRData.length === 0) return;
    const zipRow = rootFmrData.zipFMRData.find(z => z.zipCode === zipCode);
    if (!zipRow) return;

    setDrilldownZip(zipCode);
    setViewFmrData({
      source: 'safmr',
      zipCode,
      areaName: rootFmrData.areaName,
      stateCode: rootFmrData.stateCode,
      countyName: rootFmrData.countyName,
      year: rootFmrData.year,
      effectiveDate: rootFmrData.effectiveDate,
      bedroom0: zipRow.bedroom0,
      bedroom1: zipRow.bedroom1,
      bedroom2: zipRow.bedroom2,
      bedroom3: zipRow.bedroom3,
      bedroom4: zipRow.bedroom4,
      queriedLocation: zipCode,
      queriedType: 'zip'
    });
  };

  const handleBackToRoot = () => {
    if (!rootFmrData) return;
    setDrilldownZip(null);
    setViewFmrData(rootFmrData);
  };

  const drilldownPercentDiff = useMemo(() => {
    if (!drilldownZip || !zipRankings) return null;
    const hit = zipRankings.find(z => z.zipCode === drilldownZip);
    return hit?.percentDiff ?? null;
  }, [drilldownZip, zipRankings]);

  // Check URL params synchronously on mount - before paint to prevent flash
  useLayoutEffect(() => {
    // Check URL params immediately (synchronously)
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');
    const type = params.get('type') as 'zip' | 'city' | 'county' | 'address' | null;
    
    if (query && type) {
      // We have URL params - trigger search (race-safe)
      setIsInitialized(true); // Mark as initialized so we can render results state
      const value = query.split('|')[0];
      handleSearch(value, type, false);
    } else {
      // No URL params - mark as initialized immediately (no loading state)
      setIsInitialized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showResults = useMemo(() => {
    // Once the user has initiated a search (or URL params did), show results states.
    // "idle" means no search yet, so show the dashboard.
    return searchStatus !== 'idle';
  }, [searchStatus]);

  return (
    <main className="min-h-screen bg-[#fafafa] antialiased lg:h-screen lg:overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-10 sm:py-8 md:py-10 lg:py-10 lg:h-full lg:flex lg:flex-col">
        {/* Header */}
        <div className="mb-4 sm:mb-6 lg:mb-4 flex-shrink-0">
          <div className="mb-2 sm:mb-3 lg:mb-2">
            <button
              onClick={handleReset}
              className="text-left hover:opacity-70 transition-opacity"
            >
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#0a0a0a] mb-1 tracking-tight">
                fmr.fyi
              </h1>
              <p className="text-xs text-[#737373] font-medium tracking-wide uppercase">
                Fair Market Rent Data
              </p>
            </button>
          </div>
          <p className="text-sm sm:text-base text-[#525252] max-w-2xl">
            Search HUD Fair Market Rent data by address, city, ZIP code, or county
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 items-start lg:flex-1 lg:min-h-0 lg:overflow-hidden">
          {/* Main Results Card */}
          <div className="flex-1 bg-white rounded-lg border border-[#e5e5e5] p-4 sm:p-6 md:p-8 w-full lg:h-full lg:flex lg:flex-col lg:overflow-hidden">
            <div className="flex-shrink-0 mb-4 sm:mb-6">
              <SearchInput onSelect={handleSearch} />
            </div>
            <div className="flex-1 lg:min-h-0 lg:overflow-hidden">
              {!isInitialized ? (
                // Don't render anything until we've checked URL params
                <div className="h-full" />
              ) : showResults ? (
                // Show results state machine (loading/success/error)
                <FMRResults 
                  data={viewFmrData} 
                  loading={isSearching} 
                  error={error}
                  zipVsCountyMedianPercent={drilldownPercentDiff}
                  breadcrumbs={
                    drilldownZip && rootFmrData
                      ? {
                          parentLabel: rootFmrData.queriedLocation || rootFmrData.areaName,
                          parentType: rootFmrData.queriedType || 'county',
                          zipCode: drilldownZip
                        }
                      : null
                  }
                  onBreadcrumbBack={drilldownZip ? handleBackToRoot : undefined}
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
            <div className="w-full lg:w-80 flex-shrink-0 bg-white rounded-lg border border-[#e5e5e5] p-4 sm:p-6 md:p-8 flex flex-col lg:h-full lg:overflow-hidden">
              <div className="mb-4 sm:mb-6 flex-shrink-0">
                <h3 className="text-base sm:text-lg font-semibold text-[#0a0a0a] mb-1">
                  ZIP Codes
                </h3>
                <p className="text-xs text-[#737373]">
                  Ranked by average FMR (vs county median)
                </p>
              </div>
              <div className="space-y-1 overflow-y-auto flex-1 min-h-0 pr-2 -mr-2 custom-scrollbar">
                {zipRankings.map((zip, index) => {
                  const isPositive = zip.percentDiff > 0;
                  const isNegative = zip.percentDiff < 0;
                  const isSelected = drilldownZip === zip.zipCode;
                  
                  return (
                    <button
                      key={zip.zipCode}
                      type="button"
                      onClick={() => handleZipDrilldown(zip.zipCode)}
                      className={`w-full flex items-center justify-between py-2 sm:py-2.5 px-2.5 sm:px-3 rounded-md border transition-colors group text-left ${
                        isSelected
                          ? 'bg-[#fafafa] border-[#d4d4d4]'
                          : 'border-transparent hover:bg-[#fafafa] hover:border-[#e5e5e5]'
                      }`}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <span className="text-xs font-medium text-[#737373] w-4 sm:w-5 tabular-nums shrink-0">
                          {index + 1}
                        </span>
                        <span className="font-medium text-[#0a0a0a] text-sm">
                          {zip.zipCode}
                        </span>
                      </div>
                      <span className={`text-xs sm:text-sm font-medium tabular-nums shrink-0 ${
                        isPositive 
                          ? 'text-[#16a34a]' 
                          : isNegative 
                          ? 'text-[#dc2626]' 
                          : 'text-[#525252]'
                      }`}>
                        {isPositive ? '+' : ''}{zip.percentDiff.toFixed(1)}%
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 sm:mt-6 text-xs text-[#737373] pt-3 sm:pt-4 border-t border-[#e5e5e5] flex-shrink-0 leading-relaxed">
                <p>Percent compares each ZIP’s average FMR to the county median.</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 sm:mt-8 lg:mt-4 pt-3 sm:pt-4 lg:pt-3 border-t border-[#e5e5e5] flex-shrink-0">
          <div className="mb-2 sm:mb-3 lg:mb-2">
            <p className="text-xs font-medium text-[#0a0a0a] mb-0.5">fmr.fyi</p>
            <p className="text-xs text-[#737373]">
              Fair Market Rent data made simple
            </p>
          </div>
          <div className="space-y-1 sm:space-y-1.5">
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

