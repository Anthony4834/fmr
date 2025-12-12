'use client';

import { useEffect, useRef, useState } from 'react';

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
  deviationFromNatAvg?: number;
  rentPerBedroom1BR?: number | null;
  rentPerBedroom2BR?: number | null;
  rentPerBedroom3BR?: number | null;
  rentPerBedroom4BR?: number | null;
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
  nationalAverages: { [key: number]: number };
}

type DashboardType = 'zip' | 'city' | 'county';
type FetchStatus = 'idle' | 'loading' | 'success' | 'error';

export default function NationwideStats() {
  const [activeType, setActiveType] = useState<DashboardType>('zip');
  const [data, setData] = useState<Insights | null>(null);
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  const forceRefreshTypeRef = useRef<DashboardType | null>(null);
  const cacheRef = useRef<Record<DashboardType, Insights | null>>({
    zip: null,
    city: null,
    county: null,
  });

  useEffect(() => {
    // Immediate UI: show cached data for this tab if we have it; otherwise show skeleton.
    const cached = cacheRef.current[activeType];
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
        const response = await fetch(`/api/stats/insights?type=${activeType}`, {
          signal: abortController.signal,
        });
        const json = await response.json();

        if (abortController.signal.aborted || seq !== requestSeqRef.current) return;

        if (!response.ok) {
          throw new Error(json?.error || 'Failed to load dashboard data');
        }

        cacheRef.current[activeType] = json;
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
  }, [activeType, refreshNonce]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatLocation = (item: Insight) => {
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
      return `${item.cityName}, ${item.stateCode}`;
    }
    if (item.areaName) {
      return `${item.areaName}, ${item.stateCode}`;
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

  const getItemLabel = (item: Insight) => {
    if (item.zipCode) return item.zipCode;
    if (item.cityName) return item.cityName;
    return item.areaName || '';
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

  // Card headers with static labels
  const cardHeaders = [
    { title: 'Most Expensive', subtitle: 'Top 15 by avg FMR' },
    { title: 'Most Affordable', subtitle: 'Top 15 by avg FMR' },
    { title: 'Price Jump Anomalies', subtitle: 'vs National Avg (Top 15)' }
  ];

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

      {/* Non-blocking error banner (keep cards visible if we have data) */}
      {error && !showHardError && (
        <div className="mb-2 sm:mb-3 rounded-md border border-[#fecaca] bg-[#fef2f2] px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs text-[#991b1b]">
          Failed to load dashboard data{error ? `: ${error}` : ''}.
        </div>
      )}

      {showSkeleton && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 flex-1 lg:min-h-0 lg:overflow-hidden items-stretch">
          {cardHeaders.map((header, i) => (
            <div
              key={i}
              className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col max-h-[70vh] sm:max-h-[520px] lg:max-h-none"
            >
              {/* Card Header - Static labels, no skeleton */}
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa] flex-shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">{header.title}</h3>
                  <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full border-2 border-[#d4d4d4] border-t-transparent animate-spin shrink-0" />
                </div>
                <p className="text-xs text-[#737373]">{header.subtitle}</p>
              </div>
              {/* Card Content Skeleton - Only data rows */}
              <div className="divide-y divide-[#e5e5e5] overflow-y-auto flex-1 min-h-0 custom-scrollbar pb-2">
                {[...Array(8)].map((_, j) => (
                  <div key={j} className="px-3 sm:px-4 py-2 sm:py-2.5">
                    <div className="flex items-start justify-between gap-2 sm:gap-3">
                      <div className="flex items-start gap-2 sm:gap-2.5 min-w-0 flex-1">
                        <div className="h-3 bg-[#e5e5e5] rounded w-4 shrink-0 animate-pulse"></div>
                        <div className="min-w-0 flex-1">
                          <div className="h-3.5 sm:h-4 bg-[#e5e5e5] rounded w-20 sm:w-24 mb-1 sm:mb-1.5 animate-pulse"></div>
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
      )}

      {showHardError && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 flex-1 lg:min-h-0 lg:overflow-hidden items-stretch">
          {cardHeaders.map((header, i) => (
            <div
              key={i}
              className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col max-h-[70vh] sm:max-h-[520px] lg:max-h-none"
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
      )}

      {/* Main Dashboard Grid - 3 columns */}
      {!!data && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 flex-1 lg:min-h-0 lg:overflow-hidden items-stretch">
        {/* Top 15 Most Expensive */}
        <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col max-h-[70vh] sm:max-h-[520px] lg:max-h-none">
          <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa] flex-shrink-0">
            <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">Most Expensive</h3>
            <p className="text-xs text-[#737373]">Top 15 by avg FMR</p>
          </div>
          <div className="divide-y divide-[#e5e5e5] overflow-y-auto flex-1 min-h-0 custom-scrollbar pb-2">
            {topItems.slice(0, 15).map((item, index) => {
              const location = formatLocation(item);
              return (
              <div
                key={item.zipCode || item.cityName || item.areaName}
                className="px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-[#fafafa] transition-colors"
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
              </div>
              );
            })}
          </div>
        </div>

        {/* Top 15 Most Affordable */}
        <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col h-full max-h-[70vh] sm:max-h-[520px] lg:max-h-none">
          <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa] flex-shrink-0">
            <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">Most Affordable</h3>
            <p className="text-xs text-[#737373]">Top 15 by avg FMR</p>
          </div>
          <div className="divide-y divide-[#e5e5e5] overflow-y-auto flex-1 min-h-0 custom-scrollbar pb-2">
            {bottomItems.slice(0, 15).map((item, index) => {
              const location = formatLocation(item);
              return (
              <div
                key={item.zipCode || item.cityName || item.areaName}
                className="px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-[#fafafa] transition-colors"
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
              </div>
              );
            })}
          </div>
        </div>

        {/* Anomalies - Compact */}
        <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden flex flex-col max-h-[70vh] sm:max-h-[520px] lg:max-h-none">
          <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#e5e5e5] bg-[#fafafa] flex-shrink-0">
            <h3 className="text-xs sm:text-sm font-semibold text-[#0a0a0a] mb-0.5">Price Jump Anomalies</h3>
            <p className="text-xs text-[#737373]">vs National Avg (Top 15)</p>
          </div>
          <div className="divide-y divide-[#e5e5e5] overflow-y-auto flex-1 min-h-0 custom-scrollbar pb-2">
            {filteredAnomalies.slice(0, 15).map((anomaly, index) => {
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

              return (
                <div
                  key={anomaly.zipCode || anomaly.cityName || anomaly.areaName}
                  className="px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-[#fafafa] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 sm:gap-3">
                    <div className="flex items-start gap-2 sm:gap-2.5 min-w-0 flex-1">
                      <span className="text-xs text-[#a3a3a3] font-medium shrink-0 tabular-nums">#{index + 1}</span>
                      <div className="min-w-0">
                        <div className="font-medium text-[#0a0a0a] text-xs sm:text-sm truncate">{getItemLabel(anomaly)}</div>
                        <div className="text-xs text-[#737373] truncate mt-0.5">{formatLocation(anomaly)}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold text-[#7c3aed] text-xs mb-0.5">
                        {bedroomLabels[anomaly.jumpFrom || 0]}→{bedroomLabels[anomaly.jumpTo || 0]}
                      </div>
                      <div className={`font-semibold text-xs sm:text-sm tabular-nums ${
                        (anomaly.deviationFromNatAvg || 0) > 0 ? 'text-[#dc2626]' : 'text-[#16a34a]'
                      }`}>
                        {anomaly.deviationFromNatAvg && anomaly.deviationFromNatAvg > 0 ? '+' : ''}
                        {anomaly.deviationFromNatAvg?.toFixed(1)}%
                      </div>
                      <div className="text-xs text-[#737373] mt-0.5 tabular-nums">
                        Jump: +{anomaly.jumpPercent?.toFixed(1)}%
                      </div>
                      <div className="text-xs text-[#a3a3a3] mt-0.5 tabular-nums">
                        Avg: {anomaly.nationalAvg?.toFixed(1)}%
                      </div>
                      {fromValue && toValue && (
                        <div className="text-xs text-[#a3a3a3] mt-1 tabular-nums">
                          {formatCurrency(fromValue)}→{formatCurrency(toValue)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
