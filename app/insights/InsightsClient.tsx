'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import PercentageBadge from '@/app/components/PercentageBadge';
import InvestorScoreInfoButton from '@/app/components/InvestorScoreInfoButton';
import SearchInput from '@/app/components/SearchInput';
import { buildCitySlug, buildCountySlug } from '@/lib/location-slugs';

interface Insight {
  zipCode?: string;
  cityName?: string;
  areaName?: string;
  countyName?: string;
  stateCode: string;
  stateName?: string;
  avgFMR?: number;
  bedroom2?: number;
  bedroom1?: number;
  bedroom3?: number;
  bedroom0?: number | null;
  bedroom4?: number | null;
  jumpFrom?: number;
  jumpTo?: number;
  jumpPercent?: number;
  jumpAmount?: number;
  nationalAvg?: number;
  rentPerBedroom1BR?: number | null;
  rentPerBedroom2BR?: number | null;
  rentPerBedroom3BR?: number | null;
  rentPerBedroom4BR?: number | null;
  zipCount?: number;
}

interface RisingFallingInsight {
  zipCode?: string;
  cityName?: string;
  areaName?: string;
  countyName?: string;
  stateCode: string;
  stateName?: string;
  bedroom0?: number | null;
  bedroom1?: number | null;
  bedroom2?: number | null;
  bedroom3?: number | null;
  bedroom4?: number | null;
  yoyPercent: number;
  yoyBedroom: number;
  zipCount?: number;
}

interface Insights {
  type: 'zip' | 'city' | 'county';
  topZips?: Insight[];
  bottomZips?: Insight[];
  topCities?: Insight[];
  bottomCities?: Insight[];
  topCounties?: Insight[];
  bottomCounties?: Insight[];
  anomalies: Insight[];
  rising?: RisingFallingInsight[];
  falling?: RisingFallingInsight[];
  nationalAverages: { [key: number]: number };
}

type GeoType = 'zip' | 'city' | 'county';
type FetchStatus = 'idle' | 'loading' | 'success' | 'error';

const STATE_OPTIONS = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
];

export default function InsightsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const normalizeGeoType = (input: string | null): GeoType => {
    return input === 'city' || input === 'county' || input === 'zip' ? input : 'zip';
  };

  const normalizeStateCode = (input: string | null): string => {
    const v = (input || '').toUpperCase().trim();
    if (!v) return '';
    return STATE_OPTIONS.includes(v) ? v : '';
  };

  const normalizeBedroom = (input: string | null): number | null => {
    if (!input) return null;
    const n = parseInt(input, 10);
    return Number.isFinite(n) && n >= 0 && n <= 4 ? n : null;
  };

  // State management
  const [activeType, setActiveType] = useState<GeoType>(() => normalizeGeoType(searchParams.get('type')));
  const year = searchParams.get('year') ? parseInt(searchParams.get('year')!, 10) : 2026;
  const [stateFilter, setStateFilter] = useState<string>(() => normalizeStateCode(searchParams.get('state')));
  const [bedroomFilter, setBedroomFilter] = useState<number | null>(() => normalizeBedroom(searchParams.get('bedroom')));
  const [data, setData] = useState<Insights | null>(null);
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [sideTab, setSideTab] = useState<'rising' | 'falling' | 'jumps'>('rising');

  const abortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  const forceRefreshTypeRef = useRef<GeoType | null>(null);
  const cacheRef = useRef<Record<string, Insights | null>>({});

  // Keep local state in sync if URL changes (back/forward)
  useEffect(() => {
    const next = normalizeGeoType(searchParams.get('type'));
    if (next !== activeType) setActiveType(next);
    const nextState = normalizeStateCode(searchParams.get('state'));
    if (nextState !== stateFilter) setStateFilter(nextState);
    const nextBedroom = normalizeBedroom(searchParams.get('bedroom'));
    if (nextBedroom !== bedroomFilter) setBedroomFilter(nextBedroom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Update URL when user changes type
  useEffect(() => {
    const current = searchParams.get('type');
    if (current === activeType) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('type', activeType);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType, pathname, router]);

  // Update URL when user changes filters
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const currentState = normalizeStateCode(params.get('state'));
    const currentBedroom = normalizeBedroom(params.get('bedroom'));

    let changed = false;
    if (currentState !== stateFilter) {
      if (stateFilter) params.set('state', stateFilter);
      else params.delete('state');
      changed = true;
    }
    if (currentBedroom !== bedroomFilter) {
      if (bedroomFilter !== null) params.set('bedroom', String(bedroomFilter));
      else params.delete('bedroom');
      changed = true;
    }

    if (changed) {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateFilter, bedroomFilter, pathname, router]);

  // Data fetching with caching
  useEffect(() => {
    const cacheKey = `${activeType}:${year}:${stateFilter || 'all'}:${bedroomFilter !== null ? bedroomFilter : 'all'}`;
    const cached = cacheRef.current[cacheKey];
    setData(cached);
    setError(null);

    const forceRefresh = forceRefreshTypeRef.current === activeType;
    if (cached && !forceRefresh) {
      setStatus('success');
      return;
    }

    setStatus('loading');

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const abortController = new AbortController();
    abortRef.current = abortController;
    const seq = ++requestSeqRef.current;

    (async () => {
      try {
        const sp = new URLSearchParams();
        sp.set('type', activeType);
        sp.set('year', String(year));
        if (stateFilter) sp.set('state', stateFilter);
        if (bedroomFilter !== null) sp.set('bedroom', String(bedroomFilter));

        const response = await fetch(`/api/stats/insights?${sp.toString()}`, {
          signal: abortController.signal,
        });
        const json = await response.json();

        if (abortController.signal.aborted || seq !== requestSeqRef.current) return;

        if (!response.ok) {
          throw new Error(json?.error || 'Failed to load insights data');
        }

        cacheRef.current[cacheKey] = json;
        setData(json);
        setStatus('success');
        if (forceRefreshTypeRef.current === activeType) {
          forceRefreshTypeRef.current = null;
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
        if (abortController.signal.aborted || seq !== requestSeqRef.current) return;
        setError(e instanceof Error ? e.message : 'Failed to load insights data');
        setStatus('error');
        if (forceRefreshTypeRef.current === activeType) {
          forceRefreshTypeRef.current = null;
        }
      }
    })();

    return () => {
      if (abortRef.current === abortController) {
        abortController.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType, year, stateFilter, bedroomFilter, refreshNonce]);

  // Helper functions
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatLocation = (item: Insight | RisingFallingInsight): string => {
    if (item.zipCode) {
      if (item.countyName && item.stateCode) {
        const county = item.countyName.includes('County')
          ? item.countyName
          : `${item.countyName} County`;
        return `${county}, ${item.stateCode}`;
      }
      return '';
    }
    if (item.cityName) {
      if (item.countyName && item.stateCode) {
        const county = item.countyName.includes('County')
          ? item.countyName
          : `${item.countyName} County`;
        return `${county}, ${item.stateCode}`;
      }
      return item.stateCode ? `${item.stateCode}` : '';
    }
    if (item.areaName) {
      return item.stateCode ? `${item.stateCode}` : '';
    }
    return '';
  };

  const getItemLabel = (item: Insight | RisingFallingInsight) => {
    if (item.zipCode) return item.zipCode;
    if (item.cityName) return item.cityName;
    return item.areaName || '';
  };

  const hrefForInsight = (item: Insight | RisingFallingInsight): string | null => {
    if (activeType === 'zip') {
      const zip = item.zipCode?.match(/\b(\d{5})\b/)?.[1];
      return zip ? `/zip/${zip}` : null;
    }
    if (activeType === 'city') {
      if (!item.cityName || !item.stateCode) return null;
      return `/city/${buildCitySlug(item.cityName, item.stateCode)}`;
    }
    // county
    if (!item.areaName || !item.stateCode) return null;
    return `/county/${buildCountySlug(item.areaName, item.stateCode)}`;
  };

  const getTopItems = () => {
    if (!data) return [];
    if (activeType === 'zip') return data.topZips || [];
    if (activeType === 'city') return data.topCities || [];
    return data.topCounties || [];
  };

  const getBottomItems = () => {
    if (!data) return [];
    if (activeType === 'zip') return data.bottomZips || [];
    if (activeType === 'city') return data.bottomCities || [];
    return data.bottomCounties || [];
  };

  const filteredAnomalies = (data?.anomalies || []).filter(anomaly => {
    if (activeType === 'zip') return !!anomaly.zipCode;
    if (activeType === 'city') return !!anomaly.cityName && !anomaly.zipCode;
    if (activeType === 'county') return !!anomaly.areaName && !anomaly.zipCode && !anomaly.cityName;
    return true;
  });

  const topItems = getTopItems();
  const bottomItems = getBottomItems();
  const showSkeleton = status === 'loading' && !data;
  const showHardError = status === 'error' && !data;

  const getTabLabel = (type: GeoType) => {
    if (type === 'zip') return 'ZIP Codes';
    if (type === 'city') return 'Cities';
    return 'Counties';
  };

  const handleSearch = (value: string, type: 'zip' | 'city' | 'county' | 'address' | 'state') => {
    if (type === 'state') {
      const state = (value || '').trim().toUpperCase();
      if (state && state.length === 2) {
        router.push(`/state/${state}`);
        return;
      }
    }

    if (type === 'zip') {
      const zip = value.trim().match(/\b(\d{5})\b/)?.[1];
      if (zip) {
        fetch('/api/track/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type, query: zip, canonicalPath: `/zip/${zip}` }),
          keepalive: true,
        }).catch(() => {});
        router.push(`/zip/${zip}`);
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
        router.push(`/city/${slug}`);
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
        router.push(`/county/${slug}`);
        return;
      }
    }

    const params = new URLSearchParams();
    params.set('q', value);
    params.set('type', type);
    router.push(`/?${params.toString()}`);
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://fmr.fyi/' },
      { '@type': 'ListItem', position: 2, name: 'Insights', item: 'https://fmr.fyi/insights' },
    ],
  };

  return (
    <main className="min-h-screen bg-[#fafafa]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 sm:py-8 md:py-10 lg:py-10">
        {/* Header (match homepage) */}
        <div className="mb-4 sm:mb-6 lg:mb-4">
          <div className="mb-2 sm:mb-3 lg:mb-2">
            <a href="/" className="block hover:opacity-70 transition-opacity">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#0a0a0a] mb-1 tracking-tight">
                fmr.fyi
              </h1>
              <p className="text-xs text-[#737373] font-medium tracking-wide uppercase">Fair Market Rent Data</p>
            </a>
          </div>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm sm:text-base text-[#525252] max-w-2xl">
              Search HUD Fair Market Rent data by address, city, ZIP code, or county
            </p>
            <InvestorScoreInfoButton />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:gap-3">
          {/* Main search (same as homepage) */}
          <div className="bg-white rounded-lg border border-[#e5e5e5] p-4 sm:p-6">
            <SearchInput onSelect={handleSearch} />
          </div>

          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-[#737373] flex-wrap">
            <a href="/" className="hover:text-[#0a0a0a] transition-colors">
              Home
            </a>
            <span className="text-[#a3a3a3]">/</span>
            <span aria-current="page" className="text-[#0a0a0a] font-medium">
              Insights
            </span>
          </nav>

          <h2 className="sr-only">Market Intelligence</h2>

          {/* Type Tabs */}
          <div className="flex gap-0.5 sm:gap-1 border-b border-[#e5e5e5] mb-2 overflow-x-auto">
          {(['zip', 'city', 'county'] as GeoType[]).map((type) => (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors relative whitespace-nowrap shrink-0 ${
                activeType === type
                  ? 'text-[#0a0a0a]'
                  : 'text-[#737373] hover:text-[#0a0a0a]'
              }`}
            >
              {getTabLabel(type)}
              {activeType === type && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0a0a0a]"></span>
              )}
            </button>
          ))}
          </div>

          {/* Filters */}
          <div className="mb-3 flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold text-[#525252]">State</div>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="h-8 px-2.5 rounded-md border border-[#e5e5e5] bg-white text-xs text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
            >
              <option value="">All</option>
              {STATE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold text-[#525252]">BR</div>
            <select
              value={bedroomFilter === null ? '' : String(bedroomFilter)}
              onChange={(e) => setBedroomFilter(e.target.value === '' ? null : parseInt(e.target.value, 10))}
              className="h-8 px-2.5 rounded-md border border-[#e5e5e5] bg-white text-xs text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
            >
              <option value="">All</option>
              <option value="0">0</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          </div>
        </div>

          {/* Non-blocking error banner */}
          {error && !showHardError && (
            <div className="-mt-2 rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-xs text-[#991b1b]">
              Failed to load insights data{error ? `: ${error}` : ''}.
            </div>
          )}

          {/* Loading Skeleton */}
          {showSkeleton && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-stretch lg:min-h-[800px] lg:h-[calc(100vh-280px)]">
            {/* Left Column Skeleton */}
            <div className="flex flex-col gap-4 h-full min-h-0">
              {[
                { title: 'Most Expensive', subtitle: 'Top 15 by avg FMR' },
                { title: 'Most Affordable', subtitle: 'Top 15 by avg FMR' },
              ].map((header, i) => (
                <div
                  key={i}
                  className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col flex-1 min-h-0"
                >
                  <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa]">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">{header.title}</h3>
                      <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full border-2 border-[#d4d4d4] border-t-transparent animate-spin shrink-0" />
                    </div>
                    <p className="text-xs text-[#737373]">{header.subtitle}</p>
                  </div>
                  <div className="divide-y divide-[#e5e5e5]">
                    {[...Array(8)].map((_, j) => (
                      <div key={j} className="px-3 sm:px-4 py-2 sm:py-2.5">
                        <div className="flex items-start justify-between gap-2 sm:gap-3">
                          <div className="flex items-start gap-2 sm:gap-2.5 min-w-0 flex-1">
                            <div className="h-3 bg-[#e5e5e5] rounded w-4 shrink-0 animate-pulse"></div>
                            <div className="min-w-0 flex-1">
                              <div className="h-3.5 sm:h-4 bg-[#e5e5e5] rounded w-28 sm:w-36 mb-1 sm:mb-1.5 animate-pulse"></div>
                              <div className="h-3 bg-[#e5e5e5] rounded w-24 sm:w-32 animate-pulse"></div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="h-3.5 sm:h-4 bg-[#e5e5e5] rounded w-12 sm:w-16 ml-auto mb-1 animate-pulse"></div>
                            <div className="h-3 bg-[#e5e5e5] rounded w-16 sm:w-20 ml-auto animate-pulse"></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Right Column Skeleton */}
            <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col h-full min-h-0">
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa]">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a]">Movers</h3>
                  <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full border-2 border-[#d4d4d4] border-t-transparent animate-spin shrink-0" />
                </div>
              </div>
              <div className="divide-y divide-[#e5e5e5] overflow-hidden flex-1 min-h-0">
                {[...Array(8)].map((_, j) => (
                  <div key={j} className="px-3 sm:px-4 py-2 sm:py-2.5">
                    <div className="flex items-start justify-between gap-2 sm:gap-3">
                      <div className="flex items-start gap-2 sm:gap-2.5 min-w-0 flex-1">
                        <div className="h-3 bg-[#e5e5e5] rounded w-4 shrink-0 animate-pulse"></div>
                        <div className="min-w-0 flex-1">
                          <div className="h-3.5 sm:h-4 bg-[#e5e5e5] rounded w-28 sm:w-36 mb-1 sm:mb-1.5 animate-pulse"></div>
                          <div className="h-3 bg-[#e5e5e5] rounded w-24 sm:w-32 animate-pulse"></div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="h-3.5 sm:h-4 bg-[#e5e5e5] rounded w-12 sm:w-16 ml-auto mb-1 animate-pulse"></div>
                        <div className="h-3 bg-[#e5e5e5] rounded w-16 sm:w-20 ml-auto animate-pulse"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          )}

          {/* Hard Error State */}
          {showHardError && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-stretch lg:min-h-[800px] lg:h-[calc(100vh-280px)]">
            {/* Left Column Error */}
            <div className="flex flex-col gap-4 h-full min-h-0">
              {[
                { title: 'Most Expensive', subtitle: 'Top 15 by avg FMR' },
                { title: 'Most Affordable', subtitle: 'Top 15 by avg FMR' },
              ].map((header, i) => (
                <div
                  key={i}
                  className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col flex-1 min-h-0"
                >
                  <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa]">
                    <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">{header.title}</h3>
                    <p className="text-xs text-[#737373]">{header.subtitle}</p>
                  </div>
                  <div className="flex-1 flex flex-col items-center justify-center text-xs sm:text-sm text-[#737373] gap-2 sm:gap-3 py-6 sm:py-8">
                    <div>Failed to load</div>
                    <button
                      type="button"
                      onClick={() => {
                        forceRefreshTypeRef.current = activeType;
                        cacheRef.current = {};
                        setRefreshNonce((n) => n + 1);
                      }}
                      className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md border border-[#e5e5e5] bg-white text-[#0a0a0a] text-xs font-medium hover:bg-[#fafafa]"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Right Column Error */}
            <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col h-full min-h-0">
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa]">
                <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a]">Movers</h3>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center text-xs sm:text-sm text-[#737373] gap-2 sm:gap-3 py-6 sm:py-8">
                <div>Failed to load</div>
                <button
                  type="button"
                  onClick={() => {
                    forceRefreshTypeRef.current = activeType;
                    cacheRef.current = {};
                    setRefreshNonce((n) => n + 1);
                  }}
                  className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md border border-[#e5e5e5] bg-white text-[#0a0a0a] text-xs font-medium hover:bg-[#fafafa]"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
          )}

          {/* Main Content - 2-Column Layout */}
          {!!data && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-stretch lg:min-h-[800px] lg:h-[calc(100vh-280px)]">
            {/* Left Column: Most Expensive + Most Affordable stacked */}
            <div className="flex flex-col gap-4 h-full min-h-0">
              {/* Most Expensive */}
              <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col flex-1 min-h-0">
                <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa]">
                  <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">Most Expensive</h3>
                  <p className="text-xs text-[#737373]">Top 15 by avg FMR</p>
                </div>
                <div className="divide-y divide-[#e5e5e5] overflow-y-auto flex-1 min-h-0 custom-scrollbar">
                  {topItems.slice(0, 15).map((item, index) => {
                    const location = formatLocation(item);
                    const href = hrefForInsight(item);
                    return (
                      <a
                        key={`${activeType}:${item.zipCode || item.cityName || item.areaName}:${index}`}
                        href={href || undefined}
                        className="block px-3 sm:px-4 py-1.5 sm:py-2 hover:bg-[#fafafa] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2 sm:gap-3">
                          <div className="flex items-start gap-2 sm:gap-2.5 min-w-0 flex-1">
                            <span className="text-xs text-[#a3a3a3] font-medium shrink-0 tabular-nums">#{index + 1}</span>
                            <div className="min-w-0">
                              <div className="font-medium text-[#0a0a0a] text-xs sm:text-sm truncate">{getItemLabel(item)}</div>
                              {location && (
                                <div className="text-xs text-[#737373] truncate mt-0.5">{location}</div>
                              )}
                              {item.zipCount && (
                                <div className="text-xs text-[#a3a3a3] mt-0.5">{item.zipCount} ZIPs</div>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {item.rentPerBedroom2BR ? (
                              <div className="font-semibold text-[#0a0a0a] text-xs sm:text-sm tabular-nums">${item.rentPerBedroom2BR.toFixed(0)}/br</div>
                            ) : (
                              <div className="font-semibold text-[#0a0a0a] text-xs sm:text-sm tabular-nums">2BR: {formatCurrency(item.bedroom2 || 0)}</div>
                            )}
                            {item.bedroom0 && item.bedroom4 && (
                              <div className="text-xs text-[#737373] mt-0.5 tabular-nums">
                                {formatCurrency(item.bedroom0)} - {formatCurrency(item.bedroom4)}
                              </div>
                            )}
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>

              {/* Most Affordable */}
              <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col flex-1 min-h-0">
                <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa]">
                  <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">Most Affordable</h3>
                  <p className="text-xs text-[#737373]">Top 15 by avg FMR</p>
                </div>
                <div className="divide-y divide-[#e5e5e5] overflow-y-auto flex-1 min-h-0 custom-scrollbar">
                  {bottomItems.slice(0, 15).map((item, index) => {
                    const location = formatLocation(item);
                    const href = hrefForInsight(item);
                    return (
                      <a
                        key={`${activeType}:${item.zipCode || item.cityName || item.areaName}:${index}`}
                        href={href || undefined}
                        className="block px-3 sm:px-4 py-1.5 sm:py-2 hover:bg-[#fafafa] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2 sm:gap-3">
                          <div className="flex items-start gap-2 sm:gap-2.5 min-w-0 flex-1">
                            <span className="text-xs text-[#a3a3a3] font-medium shrink-0 tabular-nums">#{index + 1}</span>
                            <div className="min-w-0">
                              <div className="font-medium text-[#0a0a0a] text-xs sm:text-sm truncate">{getItemLabel(item)}</div>
                              {location && (
                                <div className="text-xs text-[#737373] truncate mt-0.5">{location}</div>
                              )}
                              {item.zipCount && (
                                <div className="text-xs text-[#a3a3a3] mt-0.5">{item.zipCount} ZIPs</div>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {item.rentPerBedroom2BR ? (
                              <div className="font-semibold text-[#0a0a0a] text-xs sm:text-sm tabular-nums">${item.rentPerBedroom2BR.toFixed(0)}/br</div>
                            ) : (
                              <div className="font-semibold text-[#0a0a0a] text-xs sm:text-sm tabular-nums">2BR: {formatCurrency(item.bedroom2 || 0)}</div>
                            )}
                            {item.bedroom0 && item.bedroom4 && (
                              <div className="text-xs text-[#737373] mt-0.5 tabular-nums">
                                {formatCurrency(item.bedroom0)} - {formatCurrency(item.bedroom4)}
                              </div>
                            )}
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column: Movers (full height) */}
            <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col h-full min-h-0">
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa]">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a]">Movers</h3>
                  <div className="flex gap-1">
                    {['rising', 'falling', 'jumps'].map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setSideTab(tab as 'rising' | 'falling' | 'jumps')}
                        className={`px-2 py-1 rounded-md text-xs font-semibold border transition-colors ${
                          sideTab === tab
                            ? 'bg-white border-[#d4d4d4] text-[#0a0a0a]'
                            : 'bg-[#fafafa] border-[#e5e5e5] text-[#737373] hover:text-[#0a0a0a]'
                        }`}
                      >
                        {tab === 'jumps' ? 'Jumps' : tab === 'rising' ? 'Rising' : 'Falling'}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-[#737373]">
                  {sideTab === 'jumps' ? 'Top 20 per BR price jumps' : sideTab === 'rising' ? 'Top 20 highest YoY increases' : 'Top 20 highest YoY decreases'}
                </p>
              </div>
              <div className="divide-y divide-[#e5e5e5] overflow-y-auto flex-1 min-h-0 custom-scrollbar">
                {sideTab === 'jumps' && filteredAnomalies && filteredAnomalies.length > 0 ? (
                  filteredAnomalies.slice(0, 20).map((anomaly, index) => {
                    const getBedroomValue = (size: number) => {
                      if (size === 0) return anomaly.bedroom0;
                      if (size === 1) return anomaly.bedroom1;
                      if (size === 2) return anomaly.bedroom2;
                      if (size === 3) return anomaly.bedroom3;
                      if (size === 4) return anomaly.bedroom4;
                      return null;
                    };

                    const fromValue = getBedroomValue(anomaly.jumpFrom || 0);
                    const toValue = getBedroomValue(anomaly.jumpTo || 0);
                    const bedroomLabels = ['0BR', '1BR', '2BR', '3BR', '4BR'];
                    const href = hrefForInsight(anomaly);
                    const stepLabel = `${bedroomLabels[anomaly.jumpFrom || 0]}→${bedroomLabels[anomaly.jumpTo || 0]}`;
                    const jump = anomaly.jumpPercent;
                    const jumpText = jump === null || jump === undefined ? '—' : <PercentageBadge value={jump} />;
                    const natAvg = anomaly.nationalAvg;
                    const natAvgText = natAvg === null || natAvg === undefined ? '—' : `Avg: ${natAvg.toFixed(1)}%`;
                    const fmrText = fromValue && toValue ? `${formatCurrency(fromValue)}→${formatCurrency(toValue)}` : '—';

                    return (
                      <a
                        key={`${activeType}:${anomaly.zipCode || anomaly.cityName || anomaly.areaName}:${index}`}
                        href={href || undefined}
                        className="block px-3 sm:px-4 py-1.5 sm:py-2 hover:bg-[#fafafa] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2 sm:gap-3">
                          <div className="flex items-start gap-2 sm:gap-2.5 min-w-0 flex-1">
                            <span className="text-xs text-[#a3a3a3] font-medium shrink-0 tabular-nums">#{index + 1}</span>
                            <div className="min-w-0">
                              <div className="font-medium text-[#0a0a0a] text-xs sm:text-sm truncate">{getItemLabel(anomaly)}</div>
                              {anomaly.countyName && (
                                <div className="text-xs text-[#737373] truncate mt-0.5">
                                  {anomaly.countyName.includes('County') ? anomaly.countyName : `${anomaly.countyName} County`}
                                  {anomaly.stateCode && `, ${anomaly.stateCode}`}
                                </div>
                              )}
                              {!anomaly.countyName && (
                                <div className="text-xs text-[#737373] truncate mt-0.5">{formatLocation(anomaly)}</div>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-semibold text-[#7c3aed] text-xs sm:text-sm tabular-nums">{stepLabel}</div>
                            <div className="font-semibold text-[#16a34a] text-xs sm:text-sm tabular-nums mt-0.5">
                              {jumpText}
                            </div>
                            <div className="text-xs text-[#a3a3a3] mt-0.5 tabular-nums">{natAvgText}</div>
                            {fmrText !== '—' && (
                              <div className="text-xs text-[#a3a3a3] mt-0.5 tabular-nums">{fmrText}</div>
                            )}
                          </div>
                        </div>
                      </a>
                    );
                  })
                ) : sideTab === 'rising' && data.rising && data.rising.length > 0 ? (
                  data.rising.slice(0, 20).map((item, index) => {
                    const location = formatLocation(item);
                    const href = hrefForInsight(item);
                    const bedroomLabels = ['0BR', '1BR', '2BR', '3BR', '4BR'];
                    const bedroomLabel = bedroomLabels[item.yoyBedroom] || `${item.yoyBedroom}BR`;
                    return (
                      <a
                        key={`rising:${activeType}:${item.zipCode || item.cityName || item.areaName}:${index}`}
                        href={href || undefined}
                        className="block px-3 sm:px-4 py-1.5 sm:py-2 hover:bg-[#fafafa] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2 sm:gap-3">
                          <div className="flex items-start gap-2 sm:gap-2.5 min-w-0 flex-1">
                            <span className="text-xs text-[#a3a3a3] font-medium shrink-0 tabular-nums">#{index + 1}</span>
                            <div className="min-w-0">
                              <div className="font-medium text-[#0a0a0a] text-xs sm:text-sm truncate">{getItemLabel(item)}</div>
                              {item.countyName && (
                                <div className="text-xs text-[#737373] truncate mt-0.5">
                                  {item.countyName.includes('County') ? item.countyName : `${item.countyName} County`}
                                  {item.stateCode && `, ${item.stateCode}`}
                                </div>
                              )}
                              {!item.countyName && location && (
                                <div className="text-xs text-[#737373] truncate mt-0.5">{location}</div>
                              )}
                              {item.zipCount && (
                                <div className="text-xs text-[#a3a3a3] mt-0.5">{item.zipCount} ZIPs</div>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs sm:text-sm">
                              <PercentageBadge value={item.yoyPercent} />
                            </div>
                            <div className="text-xs text-[#737373] mt-0.5">{bedroomLabel}</div>
                            {item.bedroom0 && item.bedroom4 && (
                              <div className="text-xs text-[#a3a3a3] mt-0.5 tabular-nums">
                                {formatCurrency(item.bedroom0)} - {formatCurrency(item.bedroom4)}
                              </div>
                            )}
                          </div>
                        </div>
                      </a>
                    );
                  })
                ) : sideTab === 'falling' && data.falling && data.falling.length > 0 ? (
                  data.falling.slice(0, 20).map((item, index) => {
                    const location = formatLocation(item);
                    const href = hrefForInsight(item);
                    const bedroomLabels = ['0BR', '1BR', '2BR', '3BR', '4BR'];
                    const bedroomLabel = bedroomLabels[item.yoyBedroom] || `${item.yoyBedroom}BR`;
                    return (
                      <a
                        key={`falling:${activeType}:${item.zipCode || item.cityName || item.areaName}:${index}`}
                        href={href || undefined}
                        className="block px-3 sm:px-4 py-1.5 sm:py-2 hover:bg-[#fafafa] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2 sm:gap-3">
                          <div className="flex items-start gap-2 sm:gap-2.5 min-w-0 flex-1">
                            <span className="text-xs text-[#a3a3a3] font-medium shrink-0 tabular-nums">#{index + 1}</span>
                            <div className="min-w-0">
                              <div className="font-medium text-[#0a0a0a] text-xs sm:text-sm truncate">{getItemLabel(item)}</div>
                              {item.countyName && (
                                <div className="text-xs text-[#737373] truncate mt-0.5">
                                  {item.countyName.includes('County') ? item.countyName : `${item.countyName} County`}
                                  {item.stateCode && `, ${item.stateCode}`}
                                </div>
                              )}
                              {!item.countyName && location && (
                                <div className="text-xs text-[#737373] truncate mt-0.5">{location}</div>
                              )}
                              {item.zipCount && (
                                <div className="text-xs text-[#a3a3a3] mt-0.5">{item.zipCount} ZIPs</div>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-semibold text-[#dc2626] text-xs sm:text-sm tabular-nums">
                              {item.yoyPercent.toFixed(1)}%
                            </div>
                            <div className="text-xs text-[#737373] mt-0.5">{bedroomLabel}</div>
                            {item.bedroom0 && item.bedroom4 && (
                              <div className="text-xs text-[#a3a3a3] mt-0.5 tabular-nums">
                                {formatCurrency(item.bedroom0)} - {formatCurrency(item.bedroom4)}
                              </div>
                            )}
                          </div>
                        </div>
                      </a>
                    );
                  })
                ) : (
                  <div className="px-3 sm:px-4 py-6 sm:py-8 text-xs text-[#737373] text-center">No data available</div>
                )}
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    </main>
  );
}
