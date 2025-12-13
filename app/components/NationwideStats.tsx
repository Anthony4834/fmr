'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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

type DashboardType = 'zip' | 'city' | 'county';
type FetchStatus = 'idle' | 'loading' | 'success' | 'error';

type PopularItem = {
  query: string;
  count: number;
  lastSeen?: string;
  countyName?: string | null;
  stateCode?: string | null;
  zipCount?: number | null;
  bedroom0?: number | null;
  bedroom2?: number | null;
  bedroom4?: number | null;
  rentPerBedroom2BR?: number | null;
};

export default function NationwideStats() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const normalizeDashboardType = (input: string | null): DashboardType => {
    return input === 'city' || input === 'county' || input === 'zip' ? input : 'zip';
  };

  const STATE_OPTIONS = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
    'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
    'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
    'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
  ];

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

  // Persist selected tab in URL (?dash=zip|city|county) so refresh/back/forward doesn't reset.
  const [activeType, setActiveType] = useState<DashboardType>(() => normalizeDashboardType(searchParams.get('dash')));
  const year = searchParams.get('year') ? parseInt(searchParams.get('year')!, 10) : 2026;
  const [stateFilter, setStateFilter] = useState<string>(() => normalizeStateCode(searchParams.get('state')));
  const [bedroomFilter, setBedroomFilter] = useState<number | null>(() => normalizeBedroom(searchParams.get('bedroom')));
  const [data, setData] = useState<Insights | null>(null);
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [popular, setPopular] = useState<PopularItem[] | null>(null);
  const [popularStatus, setPopularStatus] = useState<FetchStatus>('idle');
  const [popularError, setPopularError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  const forceRefreshTypeRef = useRef<DashboardType | null>(null);
  const cacheRef = useRef<Record<string, Insights | null>>({});

  const popularAbortRef = useRef<AbortController | null>(null);
  const popularSeqRef = useRef(0);
  const popularCacheRef = useRef<Record<DashboardType, PopularItem[] | null>>({
    zip: null,
    city: null,
    county: null,
  });

  // Keep local state in sync if URL changes (back/forward).
  useEffect(() => {
    const next = normalizeDashboardType(searchParams.get('dash'));
    if (next !== activeType) setActiveType(next);
    const nextState = normalizeStateCode(searchParams.get('state'));
    if (nextState !== stateFilter) setStateFilter(nextState);
    const nextBedroom = normalizeBedroom(searchParams.get('bedroom'));
    if (nextBedroom !== bedroomFilter) setBedroomFilter(nextBedroom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Update URL when user changes tabs (use replace to avoid spamming history).
  useEffect(() => {
    const current = searchParams.get('dash');
    if (current === activeType) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('dash', activeType);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType, pathname, router]);

  // Update URL when user changes filters (use replace to avoid spamming history).
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

  useEffect(() => {
    const cacheKey = `${activeType}:${year}:${stateFilter || 'all'}:${bedroomFilter !== null ? bedroomFilter : 'all'}`;
    // Immediate UI: show cached data for this tab if we have it; otherwise show skeleton.
    const cached = cacheRef.current[cacheKey];
    setData(cached);
    setError(null);

    const forceRefresh = forceRefreshTypeRef.current === activeType;
    // If we already have data for this tab and we're not explicitly refreshing it, do not refetch.
    if (cached && !forceRefresh) {
      setStatus('success');
      return;
    }

    setStatus('loading');

    // Cancel any in-flight request (prevents races on fast tab switching).
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
          throw new Error(json?.error || 'Failed to load dashboard data');
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
        setError(e instanceof Error ? e.message : 'Failed to load dashboard data');
        setStatus('error');
        if (forceRefreshTypeRef.current === activeType) {
          forceRefreshTypeRef.current = null;
        }
      }
    })();

    return () => {
      // Only abort if this effect owns the current controller
      if (abortRef.current === abortController) {
        abortController.abort();
      }
    };
  }, [activeType, year, stateFilter, bedroomFilter, refreshNonce]);

  useEffect(() => {
    // Show cached popular searches immediately if present.
    const cached = popularCacheRef.current[activeType];
    setPopular(cached);
    setPopularError(null);

    // Cancel any in-flight request.
    if (popularAbortRef.current) {
      popularAbortRef.current.abort();
    }
    const abortController = new AbortController();
    popularAbortRef.current = abortController;
    const seq = ++popularSeqRef.current;

    setPopularStatus('loading');

    (async () => {
      try {
        const res = await fetch(`/api/stats/popular-searches?type=${activeType}&days=30&limit=10`, {
          signal: abortController.signal,
        });
        const json = await res.json();
        if (abortController.signal.aborted || seq !== popularSeqRef.current) return;
        if (!res.ok) throw new Error(json?.error || 'Failed to load popular searches');
        const rawItems: PopularItem[] = (json.items || []).map((it: any) => ({
          query: String(it.query || ''),
          count: Number(it.count || 0),
          lastSeen: it.lastSeen,
          countyName: it.countyName ?? null,
          stateCode: it.stateCode ?? null,
          zipCount: it.zipCount ?? null,
          bedroom0: it.bedroom0 ?? null,
          bedroom2: it.bedroom2 ?? null,
          bedroom4: it.bedroom4 ?? null,
          rentPerBedroom2BR: it.bedroom2 ? Number(it.bedroom2) / 2.0 : null,
        }));
        // Defensive de-dupe by query (also protects React keys from instability).
        const seen = new Set<string>();
        const items = rawItems.filter((it) => {
          const k = it.query;
          if (!k) return false;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        popularCacheRef.current[activeType] = items;
        setPopular(items);
        setPopularStatus('success');
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
        if (abortController.signal.aborted || seq !== popularSeqRef.current) return;
        setPopularError(e instanceof Error ? e.message : 'Failed to load popular searches');
        setPopularStatus('error');
      }
    })();

    return () => {
      if (popularAbortRef.current === abortController) {
        abortController.abort();
      }
    };
  }, [activeType]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatLocation = (item: Insight | RisingFallingInsight) => {
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
      // For city rows, show county + state (city itself is the primary label).
      if (item.countyName && item.stateCode) {
        const county = item.countyName.includes('County')
          ? item.countyName
          : `${item.countyName} County`;
        return `${county}, ${item.stateCode}`;
      }
      return item.stateCode ? `${item.stateCode}` : '';
    }
    if (item.areaName) {
      // For county rows, show just the state (county itself is the primary label).
      return item.stateCode ? `${item.stateCode}` : '';
    }
    return '';
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

  // Keep tabs visible during loading - only show skeleton for content
  const tabsContent = (
    <div className="flex gap-0.5 sm:gap-1 border-b border-[#e5e5e5] flex-shrink-0 mb-3 sm:mb-4 overflow-x-auto -mx-1 sm:mx-0 px-1 sm:px-0">
      <button
        onClick={() => setActiveType('zip')}
        className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors relative whitespace-nowrap shrink-0 ${
          activeType === 'zip'
            ? 'text-[#0a0a0a]'
            : 'text-[#737373] hover:text-[#0a0a0a]'
        }`}
      >
        ZIP Codes
        {activeType === 'zip' && (
          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0a0a0a]"></span>
        )}
      </button>
      <button
        onClick={() => setActiveType('city')}
        className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors relative whitespace-nowrap shrink-0 ${
          activeType === 'city'
            ? 'text-[#0a0a0a]'
            : 'text-[#737373] hover:text-[#0a0a0a]'
        }`}
      >
        Cities
        {activeType === 'city' && (
          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0a0a0a]"></span>
        )}
      </button>
      <button
        onClick={() => setActiveType('county')}
        className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors relative whitespace-nowrap shrink-0 ${
          activeType === 'county'
            ? 'text-[#0a0a0a]'
            : 'text-[#737373] hover:text-[#0a0a0a]'
        }`}
      >
        Counties
        {activeType === 'county' && (
          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0a0a0a]"></span>
        )}
      </button>
    </div>
  );

  const popularLinkFor = (type: DashboardType, query: string) => {
    if (type === 'zip') {
      const zip = query.match(/\b(\d{5})\b/)?.[1];
      return zip ? `/zip/${zip}` : null;
    }
    if (type === 'city') {
      const [city, state] = query.split(',').map((s) => s.trim());
      if (!city || !state || state.length !== 2) return null;
      return `/city/${buildCitySlug(city, state)}`;
    }
    const [county, state] = query.split(',').map((s) => s.trim());
    if (!county || !state || state.length !== 2) return null;
    return `/county/${buildCountySlug(county, state)}`;
  };

  const popularSubtitle =
    activeType === 'zip'
      ? 'Top 10 ZIP codes (last 30 days)'
      : activeType === 'city'
        ? 'Top 10 cities (last 30 days)'
        : 'Top 10 counties (last 30 days)';

  const showSkeleton = status === 'loading' && !data;
  const showHardError = status === 'error' && !data;

  const topItems = getTopItems();
  const bottomItems = getBottomItems();
  
  // Filter anomalies based on active type
  const filteredAnomalies = (data?.anomalies || []).filter(anomaly => {
    if (activeType === 'zip') return !!anomaly.zipCode;
    if (activeType === 'city') return !!anomaly.cityName && !anomaly.zipCode;
    if (activeType === 'county') return !!anomaly.areaName && !anomaly.zipCode && !anomaly.cityName;
    return true;
  });

  return (
    <div className="h-full flex flex-col lg:overflow-hidden">
      {/* Type Tabs - Always visible */}
      {tabsContent}

      {/* Filters */}
      <div className="mb-2 sm:mb-3 flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold text-[#525252]">State</div>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="h-8 px-2.5 rounded-md border border-[#e5e5e5] bg-white text-xs text-[#0a0a0a]"
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
            className="h-8 px-2.5 rounded-md border border-[#e5e5e5] bg-white text-xs text-[#0a0a0a]"
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

      {/* Non-blocking error banner (keep cards visible if we have data) */}
      {error && !showHardError && (
        <div className="mb-2 sm:mb-3 rounded-md border border-[#fecaca] bg-[#fef2f2] px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs text-[#991b1b]">
          Failed to load dashboard data{error ? `: ${error}` : ''}.
        </div>
      )}

      {showSkeleton && (
        <div className="flex flex-col gap-3 sm:gap-4 flex-1 lg:min-h-0 lg:overflow-hidden">
          {/* Row 1 (3 cards) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 items-stretch">
            {[
              { title: 'Most Expensive', subtitle: 'Top 15 by avg FMR' },
              { title: 'Most Affordable', subtitle: 'Top 15 by avg FMR' },
              { title: 'Popular Searches', subtitle: popularSubtitle },
            ].map((header, i) => (
              <div
                key={i}
                className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col max-h-[56vh] sm:max-h-[416px] lg:max-h-[56vh]"
              >
                <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa] flex-shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">{header.title}</h3>
                    <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full border-2 border-[#d4d4d4] border-t-transparent animate-spin shrink-0" />
                  </div>
                  <p className="text-xs text-[#737373]">{header.subtitle}</p>
                </div>
                <div className="divide-y divide-[#e5e5e5] overflow-y-auto flex-1 min-h-0 custom-scrollbar pb-2">
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

          {/* Row 2 (Anomalies, Rising, Falling - 3 columns) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 items-stretch">
            {/* Price Jump Anomalies */}
            <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col max-h-[56vh] sm:max-h-[416px] lg:max-h-[56vh]">
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa] flex-shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">Largest Price Jumps</h3>
                  <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full border-2 border-[#d4d4d4] border-t-transparent animate-spin shrink-0" />
                </div>
                <p className="text-xs text-[#737373]">Top 15 per BR price jumps</p>
              </div>
              <div className="divide-y divide-[#e5e5e5] overflow-y-auto flex-1 min-h-0 custom-scrollbar pb-2">
                {[...Array(8)].map((_, j) => (
                  <div key={j} className="px-3 sm:px-4 py-2 sm:py-2.5">
                    <div className="flex items-start justify-between gap-2 sm:gap-3">
                      <div className="flex items-start gap-2 sm:gap-2.5 min-w-0 flex-1">
                        <div className="h-3 bg-[#e5e5e5] rounded w-4 shrink-0 animate-pulse"></div>
                        <div className="min-w-0 flex-1">
                          <div className="h-3.5 sm:h-4 bg-[#e5e5e5] rounded w-28 sm:w-36 mb-1 sm:mb-1.5 animate-pulse"></div>
                          <div className="h-3 bg-[#e5e5e5] rounded w-32 sm:w-44 animate-pulse"></div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="h-3 bg-[#e5e5e5] rounded w-12 sm:w-16 ml-auto mb-1 animate-pulse"></div>
                        <div className="h-3.5 sm:h-4 bg-[#e5e5e5] rounded w-10 sm:w-12 ml-auto mb-0.5 animate-pulse"></div>
                        <div className="h-3 bg-[#e5e5e5] rounded w-12 sm:w-14 ml-auto animate-pulse"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rising */}
            <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col max-h-[56vh] sm:max-h-[416px] lg:max-h-[56vh]">
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa] flex-shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">Rising</h3>
                  <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full border-2 border-[#d4d4d4] border-t-transparent animate-spin shrink-0" />
                </div>
                <p className="text-xs text-[#737373]">Top 15 highest YoY increases</p>
              </div>
              <div className="divide-y divide-[#e5e5e5] overflow-y-auto flex-1 min-h-0 custom-scrollbar pb-2">
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

            {/* Falling */}
            <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col max-h-[56vh] sm:max-h-[416px] lg:max-h-[56vh]">
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa] flex-shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">Falling</h3>
                  <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full border-2 border-[#d4d4d4] border-t-transparent animate-spin shrink-0" />
                </div>
                <p className="text-xs text-[#737373]">Top 15 highest YoY decreases</p>
              </div>
              <div className="divide-y divide-[#e5e5e5] overflow-y-auto flex-1 min-h-0 custom-scrollbar pb-2">
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
        </div>
      )}

      {showHardError && (
        <div className="flex flex-col gap-3 sm:gap-4 flex-1 lg:min-h-0 lg:overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 items-stretch">
            {[
              { title: 'Most Expensive', subtitle: 'Top 15 by avg FMR' },
              { title: 'Most Affordable', subtitle: 'Top 15 by avg FMR' },
              { title: 'Popular Searches', subtitle: popularSubtitle },
            ].map((header, i) => (
              <div
                key={i}
                className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col max-h-[56vh] sm:max-h-[416px] lg:max-h-[56vh]"
              >
                <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa] flex-shrink-0">
                  <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">{header.title}</h3>
                  <p className="text-xs text-[#737373]">{header.subtitle}</p>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center text-xs sm:text-sm text-[#737373] gap-2 sm:gap-3 py-6 sm:py-8">
                  <div>Failed to load</div>
                  <button
                    type="button"
                    onClick={() => {
                      forceRefreshTypeRef.current = activeType;
                      cacheRef.current[activeType] = null;
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 items-stretch">
            {[
              { title: 'Largest Price Jumps', subtitle: 'Top 15 per BR price jumps' },
              { title: 'Rising', subtitle: 'Top 15 highest YoY increases' },
              { title: 'Falling', subtitle: 'Top 15 highest YoY decreases' },
            ].map((header, i) => (
              <div
                key={i}
                className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col max-h-[56vh] sm:max-h-[416px] lg:max-h-[56vh]"
              >
                <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa] flex-shrink-0">
                  <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">{header.title}</h3>
                  <p className="text-xs text-[#737373]">{header.subtitle}</p>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center text-xs sm:text-sm text-[#737373] gap-2 sm:gap-3 py-6 sm:py-8">
                  <div>Failed to load</div>
                  <button
                    type="button"
                    onClick={() => {
                      forceRefreshTypeRef.current = activeType;
                      cacheRef.current[activeType] = null;
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
        </div>
      )}

      {/* Main Dashboard Grid */}
      {!!data && (
      <div className="flex flex-col gap-3 sm:gap-4 flex-1 lg:min-h-0 lg:overflow-hidden">
        {/* Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 items-stretch">
          {/* Top 15 Most Expensive */}
          <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col max-h-[56vh] sm:max-h-[416px] lg:max-h-[56vh]">
          <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa] flex-shrink-0">
            <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">Most Expensive</h3>
            <p className="text-xs text-[#737373]">Top 15 by avg FMR</p>
          </div>
          <div className="divide-y divide-[#e5e5e5] overflow-y-auto flex-1 min-h-0 custom-scrollbar pb-2">
            {topItems.slice(0, 15).map((item, index) => {
              const location = formatLocation(item);
              const href = hrefForInsight(item);
              return (
              <a
                key={`${activeType}:${item.zipCode || item.cityName || item.areaName}:${index}`}
                href={href || undefined}
                className="block px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-[#fafafa] transition-colors"
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

          {/* Top 15 Most Affordable */}
          <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col h-full max-h-[56vh] sm:max-h-[416px] lg:max-h-[56vh]">
          <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa] flex-shrink-0">
            <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">Most Affordable</h3>
            <p className="text-xs text-[#737373]">Top 15 by avg FMR</p>
          </div>
          <div className="divide-y divide-[#e5e5e5] overflow-y-auto flex-1 min-h-0 custom-scrollbar pb-2">
            {bottomItems.slice(0, 15).map((item, index) => {
              const location = formatLocation(item);
              const href = hrefForInsight(item);
              return (
              <a
                key={`${activeType}:${item.zipCode || item.cityName || item.areaName}:${index}`}
                href={href || undefined}
                className="block px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-[#fafafa] transition-colors"
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

          {/* Popular Searches (Card) */}
          <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col max-h-[56vh] sm:max-h-[416px] lg:max-h-[56vh]">
            <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa] flex-shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">Popular Searches</h3>
                  <p className="text-xs text-[#737373]">{popularSubtitle}</p>
                </div>
                {popularStatus === 'loading' && (
                  <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full border-2 border-[#d4d4d4] border-t-transparent animate-spin shrink-0" />
                )}
              </div>
            </div>
            <div className="divide-y divide-[#e5e5e5] overflow-y-auto flex-1 min-h-0 custom-scrollbar pb-2">
              {popularError && (
                <div className="px-3 sm:px-4 py-2.5 text-xs text-[#991b1b]">
                  Failed to load popular searches{popularError ? `: ${popularError}` : ''}.
                </div>
              )}
              {!popularError && popularStatus === 'loading' && (popular?.length || 0) === 0 && (
                [...Array(6)].map((_, j) => (
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
                        <div className="h-3 bg-[#e5e5e5] rounded w-10 sm:w-12 ml-auto animate-pulse"></div>
                      </div>
                    </div>
                  </div>
                ))
              )}
              {!popularError && popularStatus !== 'loading' && (popular?.length || 0) === 0 && (
                <div className="px-3 sm:px-4 py-2.5 text-xs text-[#737373]">
                  No search data yet — run a few searches to populate this list.
                </div>
              )}
              {!popularError && (popular?.length || 0) > 0 && (
                popular!.slice(0, 10).map((item, index) => {
                  const href = popularLinkFor(activeType, item.query);
                  if (!href) return null;

                  // Match the other cards: primary label + secondary location line + right-side rent stats.
                  let line1: ReactNode = item.query;
                  let line2: string | null = null;

                  if (activeType === 'zip') {
                    line1 = item.query;
                    if (item.countyName && item.stateCode) {
                      const county = item.countyName.includes('County') ? item.countyName : `${item.countyName} County`;
                      line2 = `${county}, ${item.stateCode}`;
                    }
                  } else {
                    const [left, right] = item.query.split(',').map((s) => s.trim());
                    if (left && right && right.length === 2) {
                      if (activeType === 'county') {
                        const county = left.toLowerCase().endsWith(' county') ? left : `${left} County`;
                        line1 = county;
                        line2 = right.toUpperCase();
                      } else if (activeType === 'city') {
                        // For city popular rows, show county + state as the hint (city itself is line1).
                        line1 = left;
                        if (item.countyName && item.stateCode) {
                          const county = item.countyName.includes('County') ? item.countyName : `${item.countyName} County`;
                          line2 = `${county}, ${item.stateCode}`;
                        } else {
                          line2 = right.toUpperCase();
                        }
                      } else {
                        line1 = left;
                        line2 = right.toUpperCase();
                      }
                    }
                  }

                  return (
                    <a
                      key={`${activeType}:popular:${item.query}:${index}`}
                      href={href}
                      className="block px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-[#fafafa] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 sm:gap-3">
                        <div className="flex items-start gap-2 sm:gap-2.5 min-w-0 flex-1">
                          <span className="text-xs text-[#a3a3a3] font-medium shrink-0 tabular-nums">#{index + 1}</span>
                          <div className="min-w-0">
                            <div className="font-medium text-[#0a0a0a] text-xs sm:text-sm truncate">{line1}</div>
                            {line2 && <div className="text-xs text-[#737373] truncate mt-0.5">{line2}</div>}
                            {!!item.zipCount && activeType !== 'zip' && (
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
                })
              )}
            </div>
          </div>
        </div>

          {/* Row 2 (Anomalies, Rising, Falling - 3 columns) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 items-stretch">
            {/* Price Jump Anomalies */}
            <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col max-h-[56vh] sm:max-h-[416px] lg:max-h-[56vh]">
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa] flex-shrink-0">
                <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">Largest Price Jumps</h3>
                <p className="text-xs text-[#737373]">Top 15 per BR price jumps</p>
              </div>
              <div className="divide-y divide-[#e5e5e5] overflow-y-auto flex-1 min-h-0 custom-scrollbar pb-2">
                {filteredAnomalies && filteredAnomalies.length > 0 ? (
                  filteredAnomalies.slice(0, 15).map((anomaly, index) => {
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
                    const jumpText = jump === null || jump === undefined ? '—' : `+${jump.toFixed(1)}%`;
                    const natAvg = anomaly.nationalAvg;
                    const natAvgText = natAvg === null || natAvg === undefined ? '—' : `Avg: ${natAvg.toFixed(1)}%`;
                    const fmrText = fromValue && toValue ? `${formatCurrency(fromValue)}→${formatCurrency(toValue)}` : '—';

                    return (
                      <a
                        key={`${activeType}:${anomaly.zipCode || anomaly.cityName || anomaly.areaName}:${index}`}
                        href={href || undefined}
                        className="block px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-[#fafafa] transition-colors"
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
                ) : (
                  <div className="px-3 sm:px-4 py-2 sm:py-2.5 text-xs text-[#737373]">No data available</div>
                )}
              </div>
            </div>

            {/* Rising */}
            <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col max-h-[56vh] sm:max-h-[416px] lg:max-h-[56vh]">
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa] flex-shrink-0">
                <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">Rising</h3>
                <p className="text-xs text-[#737373]">Top 15 highest YoY increases</p>
              </div>
              <div className="divide-y divide-[#e5e5e5] overflow-y-auto flex-1 min-h-0 custom-scrollbar pb-2">
                {data.rising && data.rising.length > 0 ? (
                  data.rising.slice(0, 15).map((item, index) => {
                  const location = formatLocation(item);
                  const href = hrefForInsight(item);
                  const bedroomLabels = ['0BR', '1BR', '2BR', '3BR', '4BR'];
                  const bedroomLabel = bedroomLabels[item.yoyBedroom] || `${item.yoyBedroom}BR`;
                  return (
                    <a
                      key={`rising:${activeType}:${item.zipCode || item.cityName || item.areaName}:${index}`}
                      href={href || undefined}
                      className="block px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-[#fafafa] transition-colors"
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
                          <div className="font-semibold text-[#16a34a] text-xs sm:text-sm tabular-nums">
                            +{item.yoyPercent.toFixed(1)}%
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
                  <div className="px-3 sm:px-4 py-2 sm:py-2.5 text-xs text-[#737373]">No data available</div>
                )}
              </div>
            </div>

            {/* Falling */}
            <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col max-h-[56vh] sm:max-h-[416px] lg:max-h-[56vh]">
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa] flex-shrink-0">
                <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">Falling</h3>
                <p className="text-xs text-[#737373]">Top 15 highest YoY decreases</p>
              </div>
              <div className="divide-y divide-[#e5e5e5] overflow-y-auto flex-1 min-h-0 custom-scrollbar pb-2">
                {data.falling && data.falling.length > 0 ? (
                  data.falling.slice(0, 15).map((item, index) => {
                  const location = formatLocation(item);
                  const href = hrefForInsight(item);
                  const bedroomLabels = ['0BR', '1BR', '2BR', '3BR', '4BR'];
                  const bedroomLabel = bedroomLabels[item.yoyBedroom] || `${item.yoyBedroom}BR`;
                  return (
                    <a
                      key={`falling:${activeType}:${item.zipCode || item.cityName || item.areaName}:${index}`}
                      href={href || undefined}
                      className="block px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-[#fafafa] transition-colors"
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
                  <div className="px-3 sm:px-4 py-2 sm:py-2.5 text-xs text-[#737373]">No data available</div>
                )}
              </div>
            </div>
          </div>
      </div>
      )}
    </div>
  );
}
