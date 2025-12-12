'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SearchInput from './SearchInput';
import FMRResults from './FMRResults';
import NationwideStats from './NationwideStats';
import type { FMRResult, ZIPFMRData } from '@/lib/types';
import ResultAbout from './ResultAbout';

type SearchStatus = 'idle' | 'loading' | 'success' | 'error';

type ZipRanking = { zipCode: string; percentDiff: number; avgFMR: number };

function computeZipRankings(data: FMRResult | null): { rankings: ZipRanking[]; medianAvgFMR: number } | null {
  if (!data?.zipFMRData || data.zipFMRData.length < 2) return null;

  const zipScores = data.zipFMRData.map((zip) => {
    const values = [zip.bedroom0, zip.bedroom1, zip.bedroom2, zip.bedroom3, zip.bedroom4].filter(
      (v) => v !== undefined
    ) as number[];
    const avgFMR = values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
    return { zipCode: zip.zipCode, avgFMR };
  });

  const sorted = [...zipScores].sort((a, b) => a.avgFMR - b.avgFMR);
  const medianIndex = Math.floor(sorted.length / 2);
  const medianAvgFMR =
    sorted.length % 2 === 0 ? (sorted[medianIndex - 1].avgFMR + sorted[medianIndex].avgFMR) / 2 : sorted[medianIndex].avgFMR;

  const rankings: ZipRanking[] = zipScores
    .map((z) => ({
      zipCode: z.zipCode,
      avgFMR: z.avgFMR,
      percentDiff: medianAvgFMR > 0 ? ((z.avgFMR - medianAvgFMR) / medianAvgFMR) * 100 : 0,
    }))
    .sort((a, b) => b.avgFMR - a.avgFMR);

  return { rankings, medianAvgFMR };
}

export default function HomeClient(props: {
  initialQuery?: string | null;
  initialType?: 'zip' | 'city' | 'county' | 'address' | null;
  initialData?: FMRResult | null;
  initialError?: string | null;
}) {
  const router = useRouter();
  const mainCardRef = useRef<HTMLDivElement | null>(null);
  const [zipCardHeight, setZipCardHeight] = useState<number | null>(null);

  const computeInitial = () => {
    const q = props.initialQuery?.trim() || '';
    const t = props.initialType || null;
    const hasQuery = !!q && !!t;

    if (!hasQuery) {
      return {
        searchStatus: 'idle' as SearchStatus,
        rootFmrData: null as FMRResult | null,
        viewFmrData: null as FMRResult | null,
        error: null as string | null,
        zipRankings: null as ZipRanking[] | null,
        zipMedianAvgFMR: null as number | null,
      };
    }

    if (props.initialError) {
      return {
        searchStatus: 'error' as SearchStatus,
        rootFmrData: null,
        viewFmrData: null,
        error: props.initialError,
        zipRankings: null,
        zipMedianAvgFMR: null,
      };
    }

    if (props.initialData) {
      const computed = computeZipRankings(props.initialData);
      return {
        searchStatus: 'success' as SearchStatus,
        rootFmrData: props.initialData,
        viewFmrData: props.initialData,
        error: null,
        zipRankings: computed?.rankings || null,
        zipMedianAvgFMR: computed?.medianAvgFMR ?? null,
      };
    }

    return {
      searchStatus: 'loading' as SearchStatus,
      rootFmrData: null,
      viewFmrData: null,
      error: null,
      zipRankings: null,
      zipMedianAvgFMR: null,
    };
  };

  const [searchStatus, setSearchStatus] = useState<SearchStatus>(() => computeInitial().searchStatus);
  const [rootFmrData, setRootFmrData] = useState<FMRResult | null>(() => computeInitial().rootFmrData);
  const [viewFmrData, setViewFmrData] = useState<FMRResult | null>(() => computeInitial().viewFmrData);
  const [error, setError] = useState<string | null>(() => computeInitial().error);
  const [zipRankings, setZipRankings] = useState<ZipRanking[] | null>(() => computeInitial().zipRankings);
  const [zipMedianAvgFMR, setZipMedianAvgFMR] = useState<number | null>(() => computeInitial().zipMedianAvgFMR);
  const [drilldownZip, setDrilldownZip] = useState<string | null>(null);

  const appliedKeyRef = useRef<string>('');

  // Apply server-provided initial state for SEO / direct loads and for client navigations
  // that update searchParams.
  useEffect(() => {
    const q = props.initialQuery?.trim() || '';
    const t = props.initialType || null;
    const key = `${t || ''}|${q}`;
    if (appliedKeyRef.current === key) {
      return;
    }
    appliedKeyRef.current = key;

    if (!q || !t) {
      setSearchStatus('idle');
      setRootFmrData(null);
      setViewFmrData(null);
      setError(null);
      setZipRankings(null);
      setZipMedianAvgFMR(null);
      setDrilldownZip(null);
      return;
    }

    if (props.initialError) {
      setSearchStatus('error');
      setRootFmrData(null);
      setViewFmrData(null);
      setError(props.initialError);
      setZipRankings(null);
      setZipMedianAvgFMR(null);
      setDrilldownZip(null);
      return;
    }

    if (props.initialData) {
      setSearchStatus('success');
      setError(null);
      setRootFmrData(props.initialData);
      setViewFmrData(props.initialData);
      const computed = computeZipRankings(props.initialData);
      setZipRankings(computed?.rankings || null);
      setZipMedianAvgFMR(computed?.medianAvgFMR ?? null);
      setDrilldownZip(null);
      return;
    }

    // If we have params but no data/error, treat as loading (should be rare).
    setSearchStatus('loading');
    setError(null);
    setRootFmrData(null);
    setViewFmrData(null);
    setZipRankings(null);
    setZipMedianAvgFMR(null);
    setDrilldownZip(null);
  }, [props.initialQuery, props.initialType, props.initialData, props.initialError]);

  // Make ZIP card match main card height (lg+), without forcing main card to stretch.
  useEffect(() => {
    const el = mainCardRef.current;
    if (!el) return;
    if (!zipRankings || zipRankings.length === 0) {
      setZipCardHeight(null);
      return;
    }

    let raf = 0 as any;
    const measure = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const isLg = window.matchMedia('(min-width: 1024px)').matches;
        if (!isLg) {
          setZipCardHeight(null);
          return;
        }
        const rect = el.getBoundingClientRect();
        // Guard against 0 during initial layout.
        const h = Math.max(0, Math.round(rect.height));
        setZipCardHeight(h > 0 ? h : null);
      });
    };

    measure();

    const ro = new ResizeObserver(() => measure());
    ro.observe(el);

    window.addEventListener('resize', measure);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, [zipRankings]);

  const isSearching = searchStatus === 'loading';

  const handleSearch = (value: string, type: 'zip' | 'city' | 'county' | 'address') => {
    // Primary view is the existing query-param view. Navigating updates SSR + metadata.
    const params = new URLSearchParams();
    params.set('q', value);
    params.set('type', type);
    setSearchStatus('loading');
    setError(null);
    setDrilldownZip(null);
    router.push(`/?${params.toString()}`, { scroll: false });
  };

  const handleReset = () => {
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
    const zipRow = rootFmrData.zipFMRData.find((z) => z.zipCode === zipCode);
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
      queriedType: 'zip',
    });
  };

  const handleBackToRoot = () => {
    if (!rootFmrData) return;
    setDrilldownZip(null);
    setViewFmrData(rootFmrData);
  };

  const drilldownPercentDiff = useMemo(() => {
    if (!drilldownZip || !zipRankings) return null;
    const hit = zipRankings.find((z) => z.zipCode === drilldownZip);
    return hit?.percentDiff ?? null;
  }, [drilldownZip, zipRankings]);

  const showResults = useMemo(() => {
    // Once the user has initiated a search (or URL params did), show results states.
    // "idle" means no search yet, so show the dashboard.
    return searchStatus !== 'idle';
  }, [searchStatus]);

  return (
    <main className="min-h-screen bg-[#fafafa] antialiased">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-10 sm:py-8 md:py-10 lg:py-10">
        {/* Header */}
        <div className="mb-4 sm:mb-6 lg:mb-4 flex-shrink-0">
          <div className="mb-2 sm:mb-3 lg:mb-2">
            <button onClick={handleReset} className="text-left hover:opacity-70 transition-opacity">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#0a0a0a] mb-1 tracking-tight">
                fmr.fyi
              </h1>
              <p className="text-xs text-[#737373] font-medium tracking-wide uppercase">Fair Market Rent Data</p>
            </button>
          </div>
          <p className="text-sm sm:text-base text-[#525252] max-w-2xl">
            Search HUD Fair Market Rent data by address, city, ZIP code, or county
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 items-start">
          {/* Main Results Card */}
          <div
            ref={mainCardRef}
            className="flex-1 bg-white rounded-lg border border-[#e5e5e5] p-4 sm:p-6 md:p-8 w-full"
          >
            <div className="flex-shrink-0 mb-4 sm:mb-6">
              <SearchInput onSelect={handleSearch} />
            </div>
            <div>
              {showResults ? (
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
                          zipCode: drilldownZip,
                        }
                      : null
                  }
                  onBreadcrumbBack={drilldownZip ? handleBackToRoot : undefined}
                />
              ) : (
                <div className="h-full">
                  <NationwideStats />
                  {/* Minimal internal linking (slugs redirect to the primary view) */}
                  <div className="mt-6 pt-4 border-t border-[#e5e5e5]">
                    <h2 className="text-xs font-semibold text-[#0a0a0a] tracking-wide uppercase mb-2">
                      Popular searches
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      <a className="text-xs px-2.5 py-1 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#fafafa]" href="/city/bellingham-wa">
                        Bellingham, WA
                      </a>
                      <a className="text-xs px-2.5 py-1 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#fafafa]" href="/county/whatcom-county-wa">
                        Whatcom County, WA
                      </a>
                      <a className="text-xs px-2.5 py-1 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#fafafa]" href="/zip/98225">
                        98225
                      </a>
                      <a className="text-xs px-2.5 py-1 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#fafafa]" href="/city/seattle-wa">
                        Seattle, WA
                      </a>
                      <a className="text-xs px-2.5 py-1 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#fafafa]" href="/city/los-angeles-ca">
                        Los Angeles, CA
                      </a>
                      <a className="text-xs px-2.5 py-1 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#fafafa]" href="/city/new-york-ny">
                        New York, NY
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ZIP Code Ranking Card - To the right */}
          {zipRankings && zipRankings.length > 0 && (
            <div
              className="w-full lg:w-80 flex-shrink-0 bg-white rounded-lg border border-[#e5e5e5] p-4 sm:p-6 md:p-8 flex flex-col"
              style={zipCardHeight ? { height: `${zipCardHeight}px` } : undefined}
            >
              <div className="mb-4 sm:mb-6 flex-shrink-0">
                <h3 className="text-base sm:text-lg font-semibold text-[#0a0a0a] mb-1">ZIP Codes</h3>
                <p className="text-xs text-[#737373]">Ranked by average FMR (vs county median)</p>
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
                        <span className="font-medium text-[#0a0a0a] text-sm">{zip.zipCode}</span>
                      </div>
                      <span
                        className={`text-xs sm:text-sm font-medium tabular-nums shrink-0 ${
                          isPositive
                            ? 'text-[#16a34a]'
                            : isNegative
                              ? 'text-[#dc2626]'
                              : 'text-[#525252]'
                        }`}
                      >
                        {isPositive ? '+' : ''}
                        {zip.percentDiff.toFixed(1)}%
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 sm:mt-6 text-xs text-[#737373] pt-3 sm:pt-4 border-t border-[#e5e5e5] flex-shrink-0 leading-relaxed">
                <p>Percent compares each ZIP’s average FMR to the county median average FMR.</p>
              </div>
            </div>
          )}
        </div>

        {/* Outside the main content card(s): SEO/help content + related links */}
        {showResults && viewFmrData && (
          <div className="mt-6 sm:mt-8">
            <ResultAbout data={viewFmrData} />
          </div>
        )}

        <div className="mt-6 sm:mt-8 lg:mt-4 pt-3 sm:pt-4 lg:pt-3 border-t border-[#e5e5e5] flex-shrink-0">
          <div className="mb-2 sm:mb-3 lg:mb-2">
            <p className="text-xs font-medium text-[#0a0a0a] mb-0.5">fmr.fyi</p>
            <p className="text-xs text-[#737373]">Fair Market Rent data made simple</p>
          </div>
          <div className="space-y-1 sm:space-y-1.5">
            <p className="text-xs text-[#737373]">
              Data source:{' '}
              <span className="text-[#525252] font-medium">U.S. Department of Housing and Urban Development (HUD)</span>
            </p>
            <p className="text-xs text-[#a3a3a3]">Fiscal Year 2026 • Updated October 2025</p>
          </div>
        </div>
      </div>
    </main>
  );
}

