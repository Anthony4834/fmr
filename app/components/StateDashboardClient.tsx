'use client';

import { useMemo, useState, useEffect, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { StateCode } from '@/lib/states';
import { STATES } from '@/lib/states';
import { buildCitySlug, buildCountySlug } from '@/lib/location-slugs';
import SearchInput from './SearchInput';
import StateBedroomCurveChart from './StateBedroomCurveChart';
import PercentageBadge from './PercentageBadge';
import Tooltip from './Tooltip';
import ScoreGauge from './ScoreGauge';
import InvestorScoreInfoIcon from './InvestorScoreInfoIcon';

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

type StateMetrics = {
  year: number;
  prevYear: number;
  prev3Year: number;
  byBedroom: Array<{
    br: number;
    medianFMR: number | null;
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
  const [sideTab, setSideTab] = useState<'rising' | 'falling' | 'jumps'>('rising');
  const [countyRankings, setCountyRankings] = useState<CountyRanking[]>([]);
  const [countyRankingsLoading, setCountyRankingsLoading] = useState(true);
  const [stateMedianScore, setStateMedianScore] = useState<number | null>(null);
  const [hoveredCountyFips, setHoveredCountyFips] = useState<string | null>(null);
  const [hoverSource, setHoverSource] = useState<'map' | 'list' | null>(null);
  const [moversData, setMoversData] = useState<MoversData | null>(null);
  const [moversLoading, setMoversLoading] = useState(true);
  const [stateMetrics, setStateMetrics] = useState<StateMetrics | null>(null);
  const [stateMetricsLoading, setStateMetricsLoading] = useState(true);
  const countyAbortRef = useRef<AbortController | null>(null);
  const moversAbortRef = useRef<AbortController | null>(null);
  const metricsAbortRef = useRef<AbortController | null>(null);
  const countyRowRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const lastScrolledFipsRef = useRef<string | null>(null);
  const countyListScrollRef = useRef<HTMLDivElement | null>(null);

  const stateName = STATES.find((s) => s.code === props.stateCode)?.name || props.stateCode;
  const effectiveText = displayYear ? `FY ${displayYear} | Effective Oct 1, ${displayYear}` : 'Loading…';

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

  function getColorForScore(score: number | null): string {
    if (score === null || score === undefined || score < 95) {
      return '#fca5a5'; // Light red: <95 or no data
    }
    if (score >= 130) {
      return '#16a34a'; // Dark green: >= 130
    }
    return '#44e37e'; // Light green: >= 95 and < 130
  }

  function getTextColorForScore(score: number | null): string {
    if (score === null || score === undefined || score < 95) {
      return '#b91c1c'; // Dark red for text: <95 or no data (improved contrast for readability)
    }
    if (score >= 130) {
      return '#14532d'; // Darker green for text: >= 130 (improved legibility for small/bold labels)
    }
    return '#16a34a'; // Darker green for text: >= 95 and < 130 (improved contrast, easier on eyes)
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

            {/* Breadcrumbs (Home / State) */}
            <div className="mb-3 flex items-center gap-1.5 text-xs text-[#737373]">
              <a href="/" className="hover:text-[#0a0a0a] transition-colors">Home</a>
              <span className="text-[#a3a3a3]">/</span>
              <span className="text-[#0a0a0a] font-medium">{props.stateCode}</span>
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
                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-[#e5e5e5] bg-white hover:bg-[#fafafa] transition-colors shrink-0"
                  >
                    ←
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="text-sm sm:text-base font-semibold text-[#0a0a0a] truncate">
                        {stateName} ({props.stateCode})
                      </div>
                      <span className="px-1.5 sm:px-2 py-0.5 rounded text-xs font-medium shrink-0 bg-[#eef2ff] text-[#4f46e5]">
                        STATE
                      </span>
                      <span className={`px-1.5 sm:px-2 py-0.5 rounded text-xs font-semibold shrink-0 ${
                        'safmr' === 'safmr' 
                          ? 'bg-[#f0fdf4] text-[#16a34a]' 
                          : 'bg-[#eff6ff] text-[#2563eb]'
                      }`}>
                        SAFMR
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="text-xs text-[#737373] truncate">State dashboard • ZIP-level medians (SAFMR where required)</div>
                      <span className="text-xs text-[#a3a3a3] shrink-0">•</span>
                      <span className="text-xs text-[#a3a3a3] shrink-0">{effectiveText}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* State Median Score Gauge */}
            {stateMedianScore !== null && (
              <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-[#fafafa] rounded-lg border border-[#e5e5e5] relative">
                <ScoreGauge score={stateMedianScore} maxValue={140} />
                <div className="absolute top-3 right-3">
                  <InvestorScoreInfoIcon />
                </div>
              </div>
            )}

            {/* Statewide ZIP-based metrics */}
            <div className="mb-4 sm:mb-6">
              {stateMetricsLoading ? (
                <>
                  <div className="border border-[#e5e5e5] rounded-lg bg-white overflow-visible">
                    <div className="overflow-x-auto overflow-y-visible">
                      <table className="w-full text-xs sm:text-sm">
                        <thead className="bg-[#fafafa] border-b border-[#e5e5e5]">
                          <tr className="text-left">
                            <th className="px-3 sm:px-4 py-2 text-xs font-semibold text-[#525252]">BR</th>
                            <th className="px-3 sm:px-4 py-2 text-xs font-semibold text-[#525252]">Median rent</th>
                            <th className="px-3 sm:px-4 py-2 text-xs font-semibold text-[#525252]">YoY</th>
                            <th className="px-3 sm:px-4 py-2 text-xs font-semibold text-[#525252]">3Y CAGR</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e5e5e5]">
                          {[...Array(5)].map((_, i) => (
                            <tr key={i}>
                              <td className="px-3 sm:px-4 py-2">
                                <div className="h-4 bg-[#e5e5e5] rounded w-8 animate-pulse" />
                              </td>
                              <td className="px-3 sm:px-4 py-2">
                                <div className="h-4 bg-[#e5e5e5] rounded w-20 animate-pulse" />
                              </td>
                              <td className="px-3 sm:px-4 py-2">
                                <div className="h-4 bg-[#e5e5e5] rounded w-12 animate-pulse" />
                              </td>
                              <td className="px-3 sm:px-4 py-2">
                                <div className="h-4 bg-[#e5e5e5] rounded w-12 animate-pulse" />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {/* Bedroom curve chart skeleton */}
                  <div className="mt-3 sm:mt-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="h-4 bg-[#e5e5e5] rounded w-24 animate-pulse" />
                      <div className="h-3 bg-[#e5e5e5] rounded w-32 animate-pulse" />
                    </div>
                    <div className="rounded-lg border border-[#e5e5e5] bg-white p-3 sm:p-4">
                      <div className="h-48 bg-[#e5e5e5] rounded animate-pulse" />
                    </div>
                  </div>
                </>
              ) : !stateMetrics ? (
                <div className="text-xs text-[#737373] py-2">No statewide metrics available.</div>
              ) : (
                <>
                  <div className="border border-[#e5e5e5] rounded-lg bg-white overflow-visible">
                    <div className="overflow-x-auto overflow-y-visible">
                      <table className="w-full text-xs sm:text-sm">
                        <thead className="bg-[#fafafa] border-b border-[#e5e5e5]">
                          <tr className="text-left">
                            <th className="px-3 sm:px-4 py-2 text-xs font-semibold text-[#525252]">BR</th>
                            <th className="px-3 sm:px-4 py-2 text-xs font-semibold text-[#525252]">Median rent</th>
                            <th className="px-3 sm:px-4 py-2 text-xs font-semibold text-[#525252]">YoY</th>
                            <th className="px-3 sm:px-4 py-2 text-xs font-semibold text-[#525252] overflow-visible">
                              <div className="flex items-center gap-1">
                                3Y CAGR
                                <Tooltip
                                  content={
                                    <span>
                                      Compound Annual Growth Rate over 3 years ({stateMetrics.prev3Year}→{stateMetrics.year})
                                    </span>
                                  }
                                  side="bottom"
                                  align="end"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                    className="w-3.5 h-3.5 text-[#737373] cursor-help"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                </Tooltip>
                              </div>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e5e5e5]">
                          {stateMetrics.byBedroom.map((b) => {
                            const yoy = b.medianYoY;
                            const yoyIcon = yoy === null ? '' : yoy >= 0 ? '▲' : '▼';
                            const yoyClass = yoy === null ? 'text-[#0a0a0a]' : yoy >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]';
                            return (
                              <tr key={b.br}>
                                <td className="px-3 sm:px-4 py-2 font-medium text-[#0a0a0a]">{b.br}</td>
                                <td className="px-3 sm:px-4 py-2 tabular-nums text-[#0a0a0a]">
                                  {b.medianFMR !== null ? formatCurrency(b.medianFMR) : '—'}
                                </td>
                                <td className="px-3 sm:px-4 py-2 tabular-nums">
                                  {yoy !== null ? (
                                    <span className={`${yoyClass} font-semibold`}>
                                      {yoyIcon} {Math.abs(yoy).toFixed(1)}%
                                    </span>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td className="px-3 sm:px-4 py-2 tabular-nums text-[#0a0a0a]">
                                  {b.medianCAGR3 !== null ? `${b.medianCAGR3.toFixed(1)}%` : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Bedroom curve chart below table */}
                  <div className="mt-3 sm:mt-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <h3 className="text-sm font-semibold text-[#0a0a0a]">Bedroom curve</h3>
                      <div className="text-xs text-[#a3a3a3] shrink-0">
                        YoY: {stateMetrics.prevYear}→{stateMetrics.year} • 3Y: {stateMetrics.prev3Year}→{stateMetrics.year}
                      </div>
                    </div>
                    <div className="rounded-lg border border-[#e5e5e5] bg-white p-3 sm:p-4">
                      <StateBedroomCurveChart rows={chartRows} />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Tabbed movers */}
            <div className="mb-4 sm:mb-6">
              <h3 className="text-sm sm:text-base font-semibold text-[#0a0a0a] mb-2 sm:mb-3">Movers</h3>
              <p className="text-xs text-[#737373] mb-3 sm:mb-4">
                Counties with largest YoY changes and price jumps
              </p>
              <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col max-h-[60vh]">
                <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa] flex-shrink-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs text-[#737373]">View:</span>
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
                    let primaryText: (item: any) => ReactNode = () => '';
                    let secondaryText: (item: any) => string | null = () => null;
                    let tertiaryText: (item: any) => string | null = () => null;
                    let tertiaryValue: (item: any) => number | null = () => null;

                    if (sideTab === 'rising') {
                      items = (moversData?.rising || []).slice(0, 15);
                      colorClass = 'text-[#16a34a]';
                      primaryText = (item) => <PercentageBadge value={item.yoyPercent} />;
                      secondaryText = (item) => bedroomLabels[item.yoyBedroom] || `${item.yoyBedroom} BR`;
                      tertiaryValue = (item) => item.bedroom2 ?? null;
                    } else if (sideTab === 'falling') {
                      items = (moversData?.falling || []).slice(0, 15);
                      colorClass = 'text-[#dc2626]';
                      primaryText = (item) => <PercentageBadge value={item.yoyPercent} />;
                      secondaryText = (item) => bedroomLabels[item.yoyBedroom] || `${item.yoyBedroom} BR`;
                      tertiaryValue = (item) => item.bedroom2 ?? null;
                    } else {
                      items = (moversData?.anomalies || []).slice(0, 15);
                      colorClass = 'text-[#7c3aed]';
                      primaryText = (item) => <PercentageBadge value={item.jumpPercent} />;
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

          {/* Secondary cards */}
          <div className="w-full lg:w-96 flex-shrink-0 lg:sticky lg:top-8 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1 custom-scrollbar">
            <div className="flex flex-col gap-3 sm:gap-4">
            {/* Choropleth Map */}
            <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden">
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa] flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">County Map</h3>
                  <p className="text-xs text-[#737373]">Click a county to view details</p>
                </div>
                <div className="text-xs font-medium text-[#737373] flex items-center gap-1.5">
                  Layer: Investment Score
                  <InvestorScoreInfoIcon />
                </div>
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

            {/* County Rankings */}
            <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col max-h-[calc(100vh-24rem)]">
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa] flex-shrink-0">
                <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">Counties</h3>
                <p className="text-xs text-[#737373]">
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
                      <div key={i} className="h-12 bg-[#e5e5e5] rounded animate-pulse" />
                    ))}
                  </div>
                ) : countyRankings.length === 0 ? (
                  <div className="text-xs text-[#737373] py-4 px-3 sm:px-4 text-center">No county data available</div>
                ) : (
                  <div className="divide-y divide-[#e5e5e5]">
                    {countyRankings.map((county, index) => {
                      const isHovered = !!county.countyFips && hoveredCountyFips === county.countyFips;
                      const countyLabel = county.countyName.includes('County')
                        ? county.countyName
                        : `${county.countyName} County`;
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
                            isHovered ? 'bg-[#fafafa] ring-2 ring-inset ring-[#2563eb]/20' : 'hover:bg-[#fafafa]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 sm:gap-3">
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                              <span className="text-xs font-medium text-[#737373] w-4 sm:w-5 tabular-nums shrink-0">
                                {index + 1}
                              </span>
                              <span className="font-medium text-[#0a0a0a] text-xs sm:text-sm truncate">{countyLabel}</span>
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
                                <span className="text-xs text-[#737373]">No data</span>
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


