'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { StateCode } from '@/lib/states';
import { STATES } from '@/lib/states';
import { buildCitySlug, buildCountySlug } from '@/lib/location-slugs';
import SearchInput from './SearchInput';

// Dynamically import ChoroplethMap to avoid SSR issues with Leaflet
const ChoroplethMap = dynamic(() => import('./ChoroplethMap'), {
  ssr: false,
  loading: () => (
    <div className="h-40 rounded-lg border border-dashed border-[#d4d4d4] bg-[#fafafa] flex items-center justify-center text-xs text-[#737373]">
      Loading map...
    </div>
  ),
});

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPct(value: number) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

type CountyRanking = {
  countyName: string;
  stateCode: string;
  countyFips: string | null;
  avgFMR: number;
  percentDiff: number;
};

type MoversData = {
  rising?: Array<{
    areaName: string;
    stateCode: string;
    yoyPercent: number;
    yoyBedroom: number;
    bedroom0?: number | null;
    bedroom1?: number | null;
    bedroom2?: number | null;
    bedroom3?: number | null;
    bedroom4?: number | null;
  }>;
  falling?: Array<{
    areaName: string;
    stateCode: string;
    yoyPercent: number;
    yoyBedroom: number;
    bedroom0?: number | null;
    bedroom1?: number | null;
    bedroom2?: number | null;
    bedroom3?: number | null;
    bedroom4?: number | null;
  }>;
  anomalies?: Array<{
    areaName: string;
    stateCode: string;
    jumpFrom: number;
    jumpTo: number;
    jumpPercent: number;
    nationalAvg?: number | null;
    bedroom0?: number | null;
    bedroom1?: number | null;
    bedroom2?: number | null;
    bedroom3?: number | null;
    bedroom4?: number | null;
  }>;
};

export default function StateDashboardClient(props: { stateCode: StateCode }) {
  const router = useRouter();
  const [displayYear, setDisplayYear] = useState<number | null>(null);
  const [sideTab, setSideTab] = useState<'rising' | 'falling' | 'jumps'>('rising');
  const [countyRankings, setCountyRankings] = useState<CountyRanking[]>([]);
  const [countyRankingsLoading, setCountyRankingsLoading] = useState(true);
  const [hoveredCountyFips, setHoveredCountyFips] = useState<string | null>(null);
  const [hoverSource, setHoverSource] = useState<'map' | 'list' | null>(null);
  const [moversData, setMoversData] = useState<MoversData | null>(null);
  const [moversLoading, setMoversLoading] = useState(true);
  const countyAbortRef = useRef<AbortController | null>(null);
  const moversAbortRef = useRef<AbortController | null>(null);
  const countyRowRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const lastScrolledFipsRef = useRef<string | null>(null);
  const countyListScrollRef = useRef<HTMLDivElement | null>(null);

  const stateName = STATES.find((s) => s.code === props.stateCode)?.name || props.stateCode;

  // Fetch county rankings
  useEffect(() => {
    if (countyAbortRef.current) countyAbortRef.current.abort();
    const abortController = new AbortController();
    countyAbortRef.current = abortController;

    setCountyRankingsLoading(true);
    const url = `/api/stats/state-counties?state=${props.stateCode}`;
    fetch(url, {
      signal: abortController.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (abortController.signal.aborted) return;
        setCountyRankings(data.rankings || []);
        if (typeof data.year === 'number') setDisplayYear(data.year);
        setCountyRankingsLoading(false);
      })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        console.error('Failed to fetch county rankings:', e);
        setCountyRankingsLoading(false);
      });

    return () => {
      if (countyAbortRef.current === abortController) abortController.abort();
    };
  }, [props.stateCode]);

  // Map-hover should scroll the list to the hovered county
  useEffect(() => {
    if (hoverSource !== 'map') return;
    if (!hoveredCountyFips) return;
    if (lastScrolledFipsRef.current === hoveredCountyFips) return;

    const el = countyRowRefs.current.get(hoveredCountyFips);
    if (!el) return;

    lastScrolledFipsRef.current = hoveredCountyFips;
    requestAnimationFrame(() => {
      try {
        const container = countyListScrollRef.current;
        if (!container) return;
        const containerRect = container.getBoundingClientRect();
        const rowRect = el.getBoundingClientRect();

        // Compute target scrollTop so the row is centered within the list container
        const offsetWithin = rowRect.top - containerRect.top;
        const target =
          container.scrollTop +
          offsetWithin -
          container.clientHeight / 2 +
          el.clientHeight / 2;

        container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
      } catch {
        // ignore
      }
    });
  }, [hoveredCountyFips, hoverSource]);

  // Fetch movers data from dashboard insights
  useEffect(() => {
    if (moversAbortRef.current) moversAbortRef.current.abort();
    const abortController = new AbortController();
    moversAbortRef.current = abortController;

    setMoversLoading(true);
    const url = `/api/stats/insights?type=county&state=${props.stateCode}`;
    fetch(url, {
      signal: abortController.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (abortController.signal.aborted) return;
        setMoversData({
          rising: data.rising || [],
          falling: data.falling || [],
          anomalies: data.anomalies || [],
        });
        if (displayYear === null && typeof data.year === 'number') setDisplayYear(data.year);
        setMoversLoading(false);
      })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        console.error('Failed to fetch movers data:', e);
        setMoversLoading(false);
      });

    return () => {
      if (moversAbortRef.current === abortController) abortController.abort();
    };
  }, [props.stateCode, displayYear]);

  const medianAvgFMR = useMemo(() => {
    if (countyRankings.length === 0) return 0;
    const sorted = [...countyRankings].sort((a, b) => a.avgFMR - b.avgFMR);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1].avgFMR + sorted[mid].avgFMR) / 2
      : sorted[mid].avgFMR;
  }, [countyRankings]);

  const handleSearch = (value: string, type: 'zip' | 'city' | 'county' | 'address' | 'state') => {
    if (type === 'zip') {
      const zip = value.trim().match(/\b(\d{5})\b/)?.[1];
      if (zip) router.push(`/zip/${zip}`);
      return;
    }
    if (type === 'city') {
      const [city, state] = value.split(',').map((s) => s.trim());
      if (city && state && state.length === 2) {
        router.push(`/city/${buildCitySlug(city, state)}`);
        return;
      }
    }
    if (type === 'county') {
      const [county, state] = value.split(',').map((s) => s.trim());
      if (county && state && state.length === 2) {
        router.push(`/county/${buildCountySlug(county, state)}`);
        return;
      }
    }
    if (type === 'state') {
      router.push(`/state/${value}`);
      return;
    }
    const params = new URLSearchParams();
    params.set('q', value);
    params.set('type', type);
    router.push(`/?${params.toString()}`);
  };

  const handleReset = () => {
    router.replace('/');
  };

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
          {/* Primary card */}
          <div className="flex-1 bg-white rounded-lg border border-[#e5e5e5] p-4 sm:p-6 md:p-8 w-full">
            <div className="flex-shrink-0 mb-4 sm:mb-6">
              <SearchInput onSelect={handleSearch} />
            </div>

            {/* Breadcrumbs */}
            <div className="mb-3 sm:mb-4 flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-semibold text-[#525252] min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1 min-w-0">
                  <span className="flex items-center gap-1 min-w-0">
                    <button
                      type="button"
                      onClick={handleReset}
                      className="hover:text-[#0a0a0a] transition-colors truncate"
                    >
                      Home
                    </button>
                  </span>
                  <span className="text-[#a3a3a3] shrink-0">/</span>
                  <span className="text-[#0a0a0a] font-semibold truncate">{stateName}</span>
                </div>
              </div>
              <a
                href="/"
                className="text-xs font-semibold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-[#e5e5e5] bg-white hover:bg-[#fafafa] transition-colors shrink-0"
              >
                Back
              </a>
            </div>

            {/* Compact Header */}
            <div className="mb-4 sm:mb-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 min-w-0">
                    <h2 className="text-base sm:text-xl font-semibold text-[#0a0a0a] tracking-tight leading-tight min-w-0 truncate sm:overflow-visible sm:whitespace-normal sm:text-clip">
                      {stateName}
                    </h2>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 flex-wrap">
                    <span className="text-xs sm:text-sm text-[#737373]">{props.stateCode}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap shrink-0">
                  <span className="px-1.5 sm:px-2 py-0.5 rounded text-xs font-medium shrink-0 bg-[#eef2ff] text-[#4f46e5]">
                    STATE
                  </span>
                </div>
              </div>
              
              <div className="text-xs text-[#a3a3a3]">
                {displayYear ? `FY ${displayYear} • Effective October 1, ${displayYear}` : 'Loading...'}
              </div>
            </div>

            {/* County Rankings */}
            <div className="mb-4 sm:mb-6">
              <h3 className="text-sm sm:text-base font-semibold text-[#0a0a0a] mb-2 sm:mb-3">Counties</h3>
              <p className="text-xs text-[#737373] mb-3 sm:mb-4">
                Ranked by average FMR (vs state median)
              </p>
              {countyRankingsLoading ? (
                <div className="space-y-2">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="h-12 bg-[#e5e5e5] rounded animate-pulse" />
                  ))}
                </div>
              ) : countyRankings.length === 0 ? (
                <div className="text-xs text-[#737373] py-4">No county data available</div>
              ) : (
                <div className="bg-white border border-[#e5e5e5] rounded-lg overflow-hidden">
                  <div
                    ref={countyListScrollRef}
                    className="divide-y divide-[#e5e5e5] max-h-[60vh] overflow-y-auto custom-scrollbar"
                  >
                    {countyRankings.map((county, index) => {
                      const isPositive = county.percentDiff > 0;
                      const isNegative = county.percentDiff < 0;
                      const isHovered = !!county.countyFips && hoveredCountyFips === county.countyFips;
                      const countyLabel = county.countyName.includes('County')
                        ? county.countyName
                        : `${county.countyName} County`;
                      const href = `/county/${buildCountySlug(county.countyName, county.stateCode)}`;

                      return (
                        <a
                          key={`${county.countyName}-${county.stateCode}-${county.countyFips || 'nofips'}`}
                          href={href}
                          ref={(el) => {
                            if (county.countyFips && el) countyRowRefs.current.set(county.countyFips, el);
                          }}
                          onMouseEnter={() => {
                            if (!county.countyFips) return;
                            setHoverSource('list');
                            setHoveredCountyFips(county.countyFips);
                          }}
                          onMouseLeave={() => {
                            if (hoverSource === 'list') {
                              setHoverSource(null);
                              setHoveredCountyFips(null);
                            }
                          }}
                          className={`block px-3 sm:px-4 py-2 sm:py-2.5 transition-colors ${
                            isHovered ? 'bg-[#fafafa] ring-2 ring-inset ring-[#2563eb]/20' : 'hover:bg-[#fafafa]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 sm:gap-3">
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                              <span className="text-xs font-medium text-[#737373] w-4 sm:w-5 tabular-nums shrink-0">
                                {index + 1}
                              </span>
                              <span className="font-medium text-[#0a0a0a] text-sm truncate">{countyLabel}</span>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                              <span className="font-semibold text-[#0a0a0a] text-xs sm:text-sm tabular-nums">
                                {formatCurrency(county.avgFMR)}
                              </span>
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
                                {county.percentDiff.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Secondary cards */}
          <div className="w-full lg:w-96 flex-shrink-0 flex flex-col gap-3 sm:gap-4">
            {/* Choropleth Map */}
            <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden">
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa] flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">County Map</h3>
                  <p className="text-xs text-[#737373]">Click a county to view details</p>
                </div>
                <div className="text-xs font-medium text-[#737373]">Layer: FMR</div>
              </div>
              <div className="p-4">
                <div className="h-40 rounded-lg overflow-hidden">
                  <ChoroplethMap
                    stateCode={props.stateCode}
                    year={displayYear || undefined}
                    highlightFips={hoveredCountyFips || undefined}
                    onCountyHover={(fips) => {
                      setHoverSource('map');
                      setHoveredCountyFips(fips);
                    }}
                    onCountyHoverEnd={(fips) => {
                      if (hoverSource === 'map' && hoveredCountyFips === fips) {
                        setHoverSource(null);
                        setHoveredCountyFips(null);
                      }
                    }}
                    onCountyClick={(countyName, stateCode) => {
                      router.push(`/county/${buildCountySlug(countyName, stateCode)}`);
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Tabbed movers */}
            <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col max-h-[56vh] sm:max-h-[416px]">
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa] flex-shrink-0">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a]">Movers</h3>
                  <div className="flex gap-1">
                    {[
                      { id: 'rising' as const, label: 'Rising' },
                      { id: 'falling' as const, label: 'Falling' },
                      { id: 'jumps' as const, label: 'Jumps' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSideTab(t.id)}
                        className={`px-2 py-1 rounded-md text-xs font-semibold border transition-colors ${
                          sideTab === t.id
                            ? 'bg-white border-[#d4d4d4] text-[#0a0a0a]'
                            : 'bg-[#fafafa] border-[#e5e5e5] text-[#737373] hover:text-[#0a0a0a]'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-[#737373]">Counties with largest YoY changes and price jumps</p>
              </div>
              <div className="divide-y divide-[#e5e5e5] overflow-y-auto flex-1 min-h-0 custom-scrollbar pb-2">
                {moversLoading ? (
                  <>
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="px-3 sm:px-4 py-2 sm:py-2.5">
                        <div className="flex items-start justify-between gap-2 sm:gap-3">
                          <div className="flex items-start gap-2 sm:gap-2.5 min-w-0 flex-1">
                            <div className="h-3 bg-[#e5e5e5] rounded w-4 shrink-0 animate-pulse" />
                            <div className="min-w-0 flex-1">
                              <div className="h-4 bg-[#e5e5e5] rounded w-32 mb-1.5 animate-pulse" />
                              <div className="h-3 bg-[#e5e5e5] rounded w-16 animate-pulse" />
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="h-4 bg-[#e5e5e5] rounded w-12 ml-auto mb-1 animate-pulse" />
                            <div className="h-3 bg-[#e5e5e5] rounded w-16 ml-auto animate-pulse" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (() => {
                  const bedroomLabels = ['0 BR', '1 BR', '2 BR', '3 BR', '4 BR'];
                  let items: any[] = [];
                  let colorClass = '';
                  let primaryText: (item: any) => string = () => '';
                  let secondaryText: (item: any) => string | null = () => null;
                  let tertiaryText: (item: any) => string | null = () => null;
                  let tertiaryValue: (item: any) => number | null = () => null;

                  if (sideTab === 'rising') {
                    items = (moversData?.rising || []).slice(0, 15);
                    colorClass = 'text-[#16a34a]';
                    primaryText = (item) => `+${item.yoyPercent.toFixed(1)}%`;
                    secondaryText = (item) => bedroomLabels[item.yoyBedroom] || `${item.yoyBedroom} BR`;
                    tertiaryValue = (item) => item.bedroom2 ?? null;
                  } else if (sideTab === 'falling') {
                    items = (moversData?.falling || []).slice(0, 15);
                    colorClass = 'text-[#dc2626]';
                    primaryText = (item) => `${item.yoyPercent.toFixed(1)}%`;
                    secondaryText = (item) => bedroomLabels[item.yoyBedroom] || `${item.yoyBedroom} BR`;
                    tertiaryValue = (item) => item.bedroom2 ?? null;
                  } else {
                    items = (moversData?.anomalies || []).slice(0, 15);
                    colorClass = 'text-[#7c3aed]';
                    primaryText = (item) => `+${item.jumpPercent.toFixed(1)}%`;
                    secondaryText = (item) => `${item.jumpFrom}→${item.jumpTo} BR`;
                    tertiaryText = (item) =>
                      typeof item.nationalAvg === 'number' ? `Nat avg ${item.nationalAvg.toFixed(1)}%` : null;
                    // show the destination BR rent if available (e.g. 2BR for 1→2)
                    tertiaryValue = (item) => {
                      const key = `bedroom${item.jumpTo}` as const;
                      return typeof item[key] === 'number' ? item[key] : null;
                    };
                  }

                  if (items.length === 0) {
                    return (
                      <div className="px-3 sm:px-4 py-6 text-center">
                        <p className="text-xs text-[#737373]">No data available</p>
                      </div>
                    );
                  }

                  return items.map((item, index) => {
                    const countyLabel = item.areaName.includes('County')
                      ? item.areaName
                      : `${item.areaName} County`;
                    const href = `/county/${buildCountySlug(item.areaName, item.stateCode)}`;

                    return (
                      <a
                        key={`${sideTab}-${item.areaName}-${item.stateCode}-${index}`}
                        href={href}
                        className="block px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-[#fafafa] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2 sm:gap-3">
                          <div className="flex items-start gap-2 sm:gap-2.5 min-w-0 flex-1">
                            <span className="text-xs text-[#a3a3a3] font-medium shrink-0 tabular-nums">#{index + 1}</span>
                            <div className="min-w-0">
                              <div className="font-medium text-[#0a0a0a] text-xs sm:text-sm truncate">{countyLabel}</div>
                              <div className="text-xs text-[#737373] truncate mt-0.5">{item.stateCode}</div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={`font-semibold text-xs sm:text-sm tabular-nums ${colorClass}`}>
                              {primaryText(item)}
                            </div>
                            {secondaryText(item) && <div className="text-xs text-[#737373] mt-0.5">{secondaryText(item)}</div>}
                            {tertiaryText(item) && <div className="text-xs text-[#a3a3a3] mt-0.5 tabular-nums">{tertiaryText(item)}</div>}
                            {tertiaryValue(item) !== null && (
                              <div className="text-xs text-[#a3a3a3] mt-0.5 tabular-nums">{formatCurrency(tertiaryValue(item) as number)}</div>
                            )}
                          </div>
                        </div>
                      </a>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        </div>


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


