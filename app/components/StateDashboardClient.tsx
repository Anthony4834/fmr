'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { StateCode } from '@/lib/states';
import { STATES } from '@/lib/states';
import { buildCitySlug, buildCountySlug } from '@/lib/location-slugs';
import SearchInput from './SearchInput';
import StateBedroomCurveChart from './StateBedroomCurveChart';
import PercentageBadge from './PercentageBadge';
import ScoreGauge from './ScoreGauge';
import InvestorScoreInfoIcon from './InvestorScoreInfoIcon';
import AppHeader from './AppHeader';
import FMRTable from './FMRTable';
import VoucherStrengthChart, { type ChartRow } from './VoucherStrengthChart';
import { formatCountyName } from '@/lib/county-utils';

// Dynamically import ChoroplethMap to avoid SSR issues with Leaflet
const ChoroplethMap = dynamic(() => import('./ChoroplethMap'), {
  ssr: false,
  loading: () => (
    <div className="h-40 rounded-lg border border-dashed border-[var(--border-color)] bg-[var(--map-bg)] flex items-center justify-center text-xs text-[var(--text-tertiary)]">
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
  const icon = value > 0 ? '▲' : value < 0 ? '▼' : '';
  return `${icon} ${Math.abs(value).toFixed(1)}%`;
}

type CountyRanking = {
  countyName: string;
  stateCode: string;
  countyFips: string | null;
  medianScore: number | null;
  avgScore: number | null;
  percentDiff: number;
};



type StateMetrics = {
  year: number;
  prevYear: number;
  prev3Year: number;
  byBedroom: Array<{
    br: number;
    medianFMR: number | null;
    minFMR: number | null;
    maxFMR: number | null;
    medianYoY: number | null;
    medianCAGR3: number | null;
    pctPositiveYoY: number | null;
  }>;
  rentCurve: {
    inc1to2: number | null;
    inc2to3: number | null;
    inc3to4: number | null;
    compression4Over1: number | null;
  };
  dispersion2BR: {
    p25YoY: number | null;
    p75YoY: number | null;
    spread: number | null;
    n: number | null;
    nGe5: number | null;
    nGe10: number | null;
  };
};

export default function StateDashboardClient(props: { stateCode: StateCode }) {
  const router = useRouter();
  const [displayYear, setDisplayYear] = useState<number | null>(null);
  const [countyRankings, setCountyRankings] = useState<CountyRanking[]>([]);
  const [countyRankingsLoading, setCountyRankingsLoading] = useState(true);
  const [stateMedianScore, setStateMedianScore] = useState<number | null>(null);
  const [hoveredCountyFips, setHoveredCountyFips] = useState<string | null>(null);
  const [hoverSource, setHoverSource] = useState<'map' | 'list' | null>(null);
  const [stateMetrics, setStateMetrics] = useState<StateMetrics | null>(null);
  const [stateMetricsLoading, setStateMetricsLoading] = useState(true);
  const [alignmentRows, setAlignmentRows] = useState<ChartRow[]>([]);
  const countyAbortRef = useRef<AbortController | null>(null);
  const metricsAbortRef = useRef<AbortController | null>(null);
  const alignmentAbortRef = useRef<AbortController | null>(null);
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
        setStateMedianScore(data.stateMedianScore ?? null);
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

  // Fetch statewide ZIP-based metrics (growth, curve, dispersion)
  useEffect(() => {
    if (metricsAbortRef.current) metricsAbortRef.current.abort();
    const abortController = new AbortController();
    metricsAbortRef.current = abortController;

    setStateMetricsLoading(true);
    fetch(`/api/stats/state-metrics?state=${props.stateCode}`, { signal: abortController.signal })
      .then((res) => res.json())
      .then((data) => {
        if (abortController.signal.aborted) return;
        if (typeof data?.year === 'number') {
          setStateMetrics(data as StateMetrics);
          if (displayYear === null) setDisplayYear(data.year);
        } else {
          setStateMetrics(null);
        }
        setStateMetricsLoading(false);
      })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        console.error('Failed to fetch state metrics:', e);
        setStateMetricsLoading(false);
      });

    return () => {
      if (metricsAbortRef.current === abortController) abortController.abort();
    };
  }, [props.stateCode, displayYear]);

  // Fetch per-ZIP FMR+AMR data for Market Alignment chart
  useEffect(() => {
    if (alignmentAbortRef.current) alignmentAbortRef.current.abort();
    const abortController = new AbortController();
    alignmentAbortRef.current = abortController;

    fetch(`/api/stats/state-alignment?state=${props.stateCode}`, { signal: abortController.signal })
      .then((res) => res.json())
      .then((data) => {
        if (abortController.signal.aborted) return;
        setAlignmentRows(Array.isArray(data.rows) ? data.rows : []);
      })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        console.error('Failed to fetch state alignment data:', e);
      });

    return () => {
      if (alignmentAbortRef.current === abortController) abortController.abort();
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


  // Helper function to get CSS variable value safely
  const getCSSVariable = (variableName: string, fallback: string): string => {
    if (typeof window === 'undefined') return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
    return value || fallback;
  };

  function getColorForScore(score: number | null): string {
    if (score === null || score === undefined || score < 95) {
      return getCSSVariable('--map-color-low', '#fca5a5'); // Light red: <95 or no data
    }
    if (score >= 130) {
      return getCSSVariable('--map-color-high', '#60a5fa'); // Light vibrant blue: >= 130
    }
    return getCSSVariable('--map-color-medium', '#44e37e'); // Light green: 100-129
  }

  function getTextColorForScore(score: number | null): string {
    // Use darker colors for better text contrast
    if (score === null || score === undefined || score < 95) {
      return '#b91c1c'; // Dark red for text
    }
    if (score >= 130) {
      return '#2563eb'; // Lighter blue for text
    }
    return '#16a34a'; // Darker green for text
  }

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

  // Memoize chart rows to prevent unnecessary rerenders when hovering counties
  const chartRows = useMemo(
    () => stateMetrics?.byBedroom.map((b) => ({ br: b.br, medianFMR: b.medianFMR, medianYoY: b.medianYoY })) ?? [],
    [stateMetrics?.byBedroom]
  );

  const alignmentZipCount = useMemo(
    () => new Set(alignmentRows.map((r) => r.zipCode).filter(Boolean)).size,
    [alignmentRows]
  );

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] antialiased">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-10 sm:py-8 md:py-10 lg:py-10">
        {/* Header */}
        <AppHeader
          onTitleClick={handleReset}
          showSearch={true}
          onSearchSelect={handleSearch}
        />

        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 items-start">
          {/* Primary card */}
          <div className="flex-1 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] p-4 sm:p-6 md:p-8 w-full">

            {/* Breadcrumbs (Home / State) */}
            <div className="mb-3 flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
              <a href="/" className="hover:text-[var(--text-primary)] transition-colors">Home</a>
              <span className="text-[var(--text-muted)]">/</span>
              <span className="text-[var(--text-primary)] font-medium">{props.stateCode}</span>
            </div>

            {/* Compact one-line header bar */}
            <div className="mb-4 sm:mb-5 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={handleReset}
                    aria-label="Back"
                    title="Back"
                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] transition-colors shrink-0"
                  >
                    ←
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="text-sm sm:text-base font-semibold text-[var(--text-primary)] truncate">
                        {stateName} ({props.stateCode})
                      </div>
                      <span className="px-1.5 sm:px-2 py-0.5 rounded text-xs font-medium shrink-0 bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-color)]">
                        STATE
                      </span>
                      <span className="px-1.5 sm:px-2 py-0.5 rounded text-xs font-semibold shrink-0 bg-[var(--badge-safmr-bg)] text-[var(--badge-safmr-text)]">
                        SAFMR
                      </span>
                    </div>
                    {alignmentZipCount > 0 && (
                      <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                        Found {alignmentZipCount} ZIP{alignmentZipCount !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* State Median Score Gauge */}
            <div className="mb-4 sm:mb-6">
              <div className="bg-[var(--bg-content)] rounded-lg border border-[var(--border-color)] p-4 sm:p-5 relative">
                {countyRankingsLoading ? (
                  <ScoreGauge loading={true} />
                ) : (
                  <>
                    <ScoreGauge 
                      score={stateMedianScore} 
                      maxValue={140}
                      label="State Median Investment Score"
                      description="Based on median scores across all counties"
                    />
                    <div className="absolute top-4 right-4">
                      <InvestorScoreInfoIcon />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Statewide ZIP-based metrics */}
            <div className="mb-4 sm:mb-6">
              {stateMetricsLoading ? (
                <>
                  <FMRTable
                    data={[]}
                    loading={true}
                  />
                  {/* Bedroom curve chart skeleton */}
                  <div className="mt-3 sm:mt-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="h-4 bg-[var(--border-color)] rounded w-24 animate-pulse" />
                      <div className="h-3 bg-[var(--border-color)] rounded w-32 animate-pulse" />
                    </div>
                    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 sm:p-4">
                      <div className="h-48 bg-[var(--border-color)] rounded animate-pulse" />
                    </div>
                  </div>
                </>
              ) : !stateMetrics ? (
                <div className="text-xs text-[var(--text-tertiary)] py-2">No statewide metrics available.</div>
              ) : (
                <>
                  <FMRTable
                    data={stateMetrics.byBedroom.map((b) => ({
                      br: b.br,
                      rent: b.medianFMR,
                      rentRange: (b.minFMR != null && b.maxFMR != null && b.medianFMR != null)
                        ? { min: b.minFMR, max: b.maxFMR, median: b.medianFMR }
                        : undefined,
                      yoy: b.medianYoY,
                      cagr3: b.medianCAGR3,
                    }))}
                    loading={false}
                    prevYear={stateMetrics.prevYear}
                    prev3Year={stateMetrics.prev3Year}
                    currentYear={stateMetrics.year}
                  />

                </>
              )}

              {/* Market Alignment chart — shown first, more actionable than bedroom curve */}
              {alignmentRows.length > 0 && (
                <div className="mt-3 sm:mt-4">
                  <VoucherStrengthChart rows={alignmentRows} stateCode={props.stateCode} />
                </div>
              )}

              {stateMetrics && (
                <div className="mt-3 sm:mt-4">
                  <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 sm:p-4">
                    <div className="mb-3">
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Bedroom curve</h3>
                    </div>
                    <StateBedroomCurveChart rows={chartRows} />
                  </div>
                </div>
              )}
            </div>

            {/* Explore further — two nav tiles */}
            <div className="mb-4 sm:mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <a
                href={`/explorer?geoTab=county&geoState=${props.stateCode}`}
                className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] p-4 sm:p-5 flex flex-col hover:-translate-y-0.5 hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.1)] transition-all duration-200"
              >
                <div className="text-xs font-semibold text-[var(--text-secondary)]">Rankings</div>
                <h3 className="text-sm sm:text-base font-semibold text-[var(--text-primary)] mt-1">Market Explorer</h3>
                <p className="text-xs sm:text-sm text-[var(--text-tertiary)] mt-1.5">
                  Browse counties, cities, and ZIPs in {stateName} ranked by Investment Score.
                </p>
                <div className="mt-auto pt-3 text-xs sm:text-sm font-medium text-[var(--text-primary)]">Browse rankings →</div>
              </a>
              <a
                href={`/insights?type=zip&state=${props.stateCode}`}
                className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] p-4 sm:p-5 flex flex-col hover:-translate-y-0.5 hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.1)] transition-all duration-200"
              >
                <div className="text-xs font-semibold text-[var(--text-secondary)]">Trends</div>
                <h3 className="text-sm sm:text-base font-semibold text-[var(--text-primary)] mt-1">Market Intelligence</h3>
                <p className="text-xs sm:text-sm text-[var(--text-tertiary)] mt-1.5">
                  Find ZIPs in {stateName} with notable FMR, yield, and home value trends.
                </p>
                <div className="mt-auto pt-3 text-xs sm:text-sm font-medium text-[var(--text-primary)]">View insights →</div>
              </a>
            </div>

          </div>

          {/* Secondary cards */}
          <div className="w-full lg:w-96 flex-shrink-0 lg:sticky lg:top-8 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1 custom-scrollbar">
            <div className="flex flex-col gap-3 sm:gap-4">
            {/* County Rankings - shown first on mobile, after map on desktop */}
            <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] overflow-hidden flex flex-col max-h-[calc(100vh-24rem)] order-1 lg:order-3">
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[var(--border-color)] bg-[var(--bg-tertiary)] flex-shrink-0">
                <h3 className="text-xs sm:text-sm font-semibold text-[var(--text-primary)] mb-0.5">Counties</h3>
                <p className="text-xs text-[var(--text-tertiary)]">
                  Ranked by Investment Score (vs state median)
                </p>
              </div>
              <div
                ref={countyListScrollRef}
                className="flex-1 min-h-0 overflow-y-auto custom-scrollbar"
              >
                {countyRankingsLoading ? (
                  <div className="space-y-2 p-3 sm:p-4">
                    {[...Array(10)].map((_, i) => (
                      <div key={i} className="h-12 bg-[var(--border-color)] rounded animate-pulse" />
                    ))}
                  </div>
                ) : countyRankings.length === 0 ? (
                  <div className="text-xs text-[var(--text-tertiary)] py-4 px-3 sm:px-4 text-center">No county data available</div>
                ) : (
                  <div className="divide-y divide-[var(--border-color)]">
                    {countyRankings.map((county, index) => {
                      const isHovered = !!county.countyFips && hoveredCountyFips === county.countyFips;
                      const countyLabel = formatCountyName(county.countyName, county.stateCode);
                      const href = `/county/${buildCountySlug(county.countyName, county.stateCode)}`;
                      const score = county.medianScore ?? county.avgScore ?? null;
                      const scoreTextColor = getTextColorForScore(score);

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
                            isHovered ? 'bg-[var(--bg-hover)] ring-2 ring-inset ring-[var(--map-stroke-hover)]/20' : 'hover:bg-[var(--bg-hover)]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 sm:gap-3">
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                              <span className="text-xs font-medium text-[var(--text-tertiary)] w-4 sm:w-5 tabular-nums shrink-0">
                                {index + 1}
                              </span>
                              <span className="font-medium text-[var(--text-primary)] text-xs sm:text-sm truncate">{countyLabel}</span>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                              {score !== null ? (
                                <>
                                  <span 
                                    className="font-semibold text-xs tabular-nums"
                                    style={{ color: scoreTextColor }}
                                  >
                                    {Math.round(score)}
                                  </span>
                                  <PercentageBadge value={county.percentDiff} className="text-xs shrink-0" />
                                </>
                              ) : (
                                <span className="text-xs text-[var(--text-tertiary)]">No data</span>
                              )}
                            </div>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Choropleth Map */}
            <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] overflow-hidden order-2 lg:order-2">
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[var(--border-color)] bg-[var(--bg-tertiary)]">
                <h3 className="text-xs sm:text-sm font-semibold text-[var(--text-primary)] mb-0.5">County Map</h3>
                <p className="text-xs text-[var(--text-tertiary)]">Click a county to view details</p>
              </div>
              <div className="p-4">
                <div className="h-40 rounded-lg overflow-hidden bg-[var(--map-bg)]">
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

            </div>
          </div>
        </div>


        <div className="mt-6 sm:mt-8 lg:mt-4 pt-3 sm:pt-4 lg:pt-3 border-t border-[var(--border-color)] flex-shrink-0">
          <div className="mb-2 sm:mb-3 lg:mb-2">
            <p className="text-xs font-medium text-[var(--text-primary)] mb-0.5">fmr.fyi</p>
            <p className="text-xs text-[var(--text-tertiary)]">Fair Market Rent data made simple</p>
          </div>
          <div className="space-y-1 sm:space-y-1.5">
            <p className="text-xs text-[var(--text-tertiary)]">
              Data source:{' '}
              <span className="text-[var(--text-secondary)] font-medium">U.S. Department of Housing and Urban Development (HUD)</span>
            </p>
            <p className="text-xs text-[var(--text-muted)]">Fiscal Year 2026 • Updated October 2025</p>
          </div>
        </div>
      </div>
    </main>
  );
}


