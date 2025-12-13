'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SearchInput from './SearchInput';
import FMRResults from './FMRResults';
import NationwideStats from './NationwideStats';
import type { FMRResult, ZIPFMRData } from '@/lib/types';
import ResultAbout from './ResultAbout';
import { buildCitySlug, buildCountySlug } from '@/lib/location-slugs';
import IdealPurchasePriceCard from './IdealPurchasePriceCard';

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
  const trackedSearchKeyRef = useRef<string>('');
  const drilldownHistoryCacheRef = useRef<Map<string, any>>(new Map());
  const addressAbortRef = useRef<AbortController | null>(null);
  const addressReqSeqRef = useRef(0);

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

  // Track location searches for the dashboard “popular searches” (client-only, privacy-friendly).
  useEffect(() => {
    if (searchStatus !== 'success') return;
    if (!viewFmrData?.queriedType || !viewFmrData.queriedLocation) return;
    const type = viewFmrData.queriedType;
    if (type !== 'zip' && type !== 'city' && type !== 'county') return;
    const key = `${type}|${viewFmrData.queriedLocation}`;
    if (trackedSearchKeyRef.current === key) return;
    trackedSearchKeyRef.current = key;

    const canonicalPath =
      type === 'zip'
        ? (() => {
            const zip = String(viewFmrData.queriedLocation).match(/\b(\d{5})\b/)?.[1];
            return zip ? `/zip/${zip}` : null;
          })()
        : type === 'city'
          ? (() => {
              const [city, state] = String(viewFmrData.queriedLocation).split(',').map((s) => s.trim());
              return city && state && state.length === 2 ? `/city/${buildCitySlug(city, state)}` : null;
            })()
          : (() => {
              const [county, state] = String(viewFmrData.queriedLocation).split(',').map((s) => s.trim());
              return county && state && state.length === 2 ? `/county/${buildCountySlug(county, state)}` : null;
            })();

    // Fire-and-forget.
    fetch('/api/track/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, query: viewFmrData.queriedLocation, canonicalPath }),
      keepalive: true,
    }).catch(() => {});
  }, [searchStatus, viewFmrData]);

  // Address searches are not SSR-fetched (privacy + infinite variants),
  // so we need a client fetch when the URL indicates an address query.
  useEffect(() => {
    const q = props.initialQuery?.trim() || '';
    const t = props.initialType || null;
    if (!q || t !== 'address') return;

    // Cancel any in-flight address search
    if (addressAbortRef.current) {
      addressAbortRef.current.abort();
    }
    const abortController = new AbortController();
    addressAbortRef.current = abortController;
    const seq = ++addressReqSeqRef.current;

    setSearchStatus('loading');
    setError(null);
    setRootFmrData(null);
    setViewFmrData(null);
    setZipRankings(null);
    setZipMedianAvgFMR(null);
    setDrilldownZip(null);

    (async () => {
      try {
        const url = `/api/search/fmr?address=${encodeURIComponent(q)}`;
        const res = await fetch(url, { signal: abortController.signal });
        const json = await res.json();
        if (abortController.signal.aborted || seq !== addressReqSeqRef.current) return;
        if (!res.ok) throw new Error(json?.error || 'Failed to fetch FMR data');

        const data = json?.data as FMRResult | undefined;
        if (!data) throw new Error('No data returned');

        setRootFmrData(data);
        setViewFmrData(data);
        const computed = computeZipRankings(data);
        setZipRankings(computed?.rankings || null);
        setZipMedianAvgFMR(computed?.medianAvgFMR ?? null);
        setSearchStatus('success');
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
        if (abortController.signal.aborted || seq !== addressReqSeqRef.current) return;
        setError(e instanceof Error ? e.message : 'Failed to fetch FMR data');
        setSearchStatus('error');
      }
    })();

    return () => {
      if (addressAbortRef.current === abortController) {
        abortController.abort();
      }
    };
  }, [props.initialQuery, props.initialType]);

  const isSearching = searchStatus === 'loading';

  const handleSearch = (value: string, type: 'zip' | 'city' | 'county' | 'address') => {
    setSearchStatus('loading');
    setError(null);
    setDrilldownZip(null);

    // Clean canonical URLs (slugs) for SERP + sharing.
    if (type === 'zip') {
      const zip = value.trim().match(/\b(\d{5})\b/)?.[1];
      if (zip) {
        fetch('/api/track/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type, query: zip, canonicalPath: `/zip/${zip}` }),
          keepalive: true,
        }).catch(() => {});
        router.push(`/zip/${zip}`, { scroll: false });
        return;
      }
    }
    if (type === 'city') {
      const [city, state] = value.split(',').map((s) => s.trim());
      if (city && state && state.length === 2) {
        const q = `${city}, ${state.toUpperCase()}`;
        const slug = buildCitySlug(city, state);
        fetch('/api/track/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type, query: q, canonicalPath: `/city/${slug}` }),
          keepalive: true,
        }).catch(() => {});
        router.push(`/city/${buildCitySlug(city, state)}`, { scroll: false });
        return;
      }
    }
    if (type === 'county') {
      const [county, state] = value.split(',').map((s) => s.trim());
      if (county && state && state.length === 2) {
        const q = `${county}, ${state.toUpperCase()}`;
        const slug = buildCountySlug(county, state);
        fetch('/api/track/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type, query: q, canonicalPath: `/county/${slug}` }),
          keepalive: true,
        }).catch(() => {});
        router.push(`/county/${buildCountySlug(county, state)}`, { scroll: false });
        return;
      }
    }

    // Address (and any fallback): keep the query-param view.
    const params = new URLSearchParams();
    params.set('q', value);
    params.set('type', type);
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
      cityName: rootFmrData.cityName,
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

    // Fetch ZIP-specific historical series so the chart renders on drilldown.
    // Cache per ZIP to avoid repeat requests while browsing the ZIP list.
    const cached = drilldownHistoryCacheRef.current.get(zipCode);
    if (cached) {
      setViewFmrData((prev) => (prev?.zipCode === zipCode ? { ...prev, history: cached } : prev));
      return;
    }

    (async () => {
      try {
        const url = `/api/search/fmr?zip=${encodeURIComponent(zipCode)}&year=${encodeURIComponent(String(rootFmrData.year))}&_t=${Date.now()}`;
        const res = await fetch(url);
        const json = await res.json();
        if (!res.ok) return;
        const hist = json?.data?.history;
        if (!Array.isArray(hist) || hist.length < 2) return;
        drilldownHistoryCacheRef.current.set(zipCode, hist);
        setViewFmrData((prev) => (prev?.zipCode === zipCode ? { ...prev, history: hist } : prev));
      } catch {
        // ignore
      }
    })();
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
                </div>
              )}
            </div>
          </div>

          {/* Ideal Purchase Price Card - To the right */}
          <IdealPurchasePriceCard data={viewFmrData} />

          {/* ZIP Code Ranking Card - To the right (hide when drilled into a ZIP) */}
          {!drilldownZip && zipRankings && zipRankings.length > 0 && (
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




