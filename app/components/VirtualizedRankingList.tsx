'use client';

import { useRef, useEffect, useMemo } from 'react';
import { buildCitySlug, buildCountySlug } from '@/lib/location-slugs';
import { STATES } from '@/lib/states';
import { formatCountyName } from '@/lib/county-utils';
import Tooltip from './Tooltip';

interface RankingItem {
  rank: number;
  stateCode?: string;
  stateName?: string;
  countyName?: string;
  countyFips?: string;
  cityName?: string;
  zipCode?: string;
  medianScore: number | null;
  zipCount: number;
  // New V2 fields
  netYield?: number | null;
  medianFMR?: number | null;
  medianPropertyValue?: number | null;
  medianTaxRate?: number | null;
  cashFlowEstimate?: number | null;
  affordabilityIndex?: number | null;
  marketHeatScore?: number | null;
  demandScore?: number | null;
  zhviTrend?: number[];
  flags?: {
    highYield?: boolean;
    undervalued?: boolean;
    hotMarket?: boolean;
    affordableEntry?: boolean;
    taxFriendly?: boolean;
  };
}

type SortField = 'score' | 'yield' | 'cashFlow' | 'appreciation' | 'affordability' | 'heat' | 'fmr' | 'name';

interface VirtualizedRankingListProps {
  type: 'state' | 'county' | 'city' | 'zip';
  items: RankingItem[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  error: string | null;
  // V2 mode with enhanced display
  enhancedMode?: boolean;
  sortField?: SortField;
  sortDirection?: 'asc' | 'desc';
  onSort?: (field: SortField) => void;
}

const STATE_NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  STATES.map((s) => [s.code, s.name])
);

// Format currency values
function formatCurrency(value: number | null | undefined, compact = false): string {
  if (value === null || value === undefined) return '—';
  if (compact) {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${Math.round(value / 1000)}K`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Format percentage values
function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toFixed(decimals)}%`;
}

// Format cash flow with +/- sign
function formatCashFlow(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const sign = value >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(value).toLocaleString()}/mo`;
}

export default function VirtualizedRankingList({
  type,
  items,
  loading,
  hasMore,
  onLoadMore,
  error,
  enhancedMode = true,
  sortField = 'score',
  sortDirection = 'desc',
  onSort,
}: VirtualizedRankingListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          onLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinelRef.current);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, loading, onLoadMore]);

  const getLabel = (item: RankingItem) => {
    if (type === 'state') {
      const code = item.stateCode || '';
      return item.stateName || STATE_NAME_BY_CODE[code] || code;
    }
    if (type === 'county') return item.countyName ? formatCountyName(item.countyName, item.stateCode) : item.countyName;
    if (type === 'city') return item.cityName;
    return item.zipCode;
  };

  const getSubLabel = (item: RankingItem) => {
    if (type === 'state') return ''; // Don't show state code for states since state name is already shown
    if (type === 'county') return item.stateCode;
    if (type === 'city') {
      const county = item.countyName ? formatCountyName(item.countyName, item.stateCode) : '';
      return `${county}, ${item.stateCode}`.trim().replace(/^,\s*/, '');
    }
    const county = item.countyName ? formatCountyName(item.countyName, item.stateCode) : '';
    return `${county}, ${item.stateCode}`.trim().replace(/^,\s*/, '');
  };

  // Get context label explaining aggregation
  const getAggregationLabel = (item: RankingItem) => {
    if (item.zipCount <= 1) return null;
    return `Aggregated from ${item.zipCount} ZIPs`;
  };

  const getHref = (item: RankingItem) => {
    if (type === 'state') return `/state/${item.stateCode}`;
    if (type === 'county' && item.countyName && item.stateCode)
      return `/county/${buildCountySlug(item.countyName, item.stateCode)}`;
    if (type === 'city' && item.cityName && item.stateCode)
      return `/city/${buildCitySlug(item.cityName, item.stateCode)}`;
    return `/zip/${item.zipCode}`;
  };

  const getScoreColor = (score: number | null) => {
    if (score === null || score < 0) return 'var(--text-muted)';
    if (score < 95) return '#b91c1c';
    if (score >= 130) return '#14532d';
    return '#16a34a';
  };

  const getCashFlowColor = (cashFlow: number | null | undefined) => {
    if (cashFlow === null || cashFlow === undefined) return 'var(--text-muted)';
    if (cashFlow < 0) return '#b91c1c'; // red for negative
    if (cashFlow < 200) return '#ca8a04'; // yellow
    return '#16a34a'; // green
  };

  // Memoize header to prevent rerender during loading
  // Only rerender when sort state changes, not when loading/items change
  // MUST be called before any conditional returns (Rules of Hooks)
  const headerElement = useMemo(() => {
    if (!enhancedMode) return null;
    
    const renderHeaderButton = (field: SortField, label: string, tooltipContent?: string) => {
      const isActive = sortField === field;
      const direction = isActive ? sortDirection : 'desc';
      const arrow = direction === 'asc' ? '↑' : '↓';
      
      const buttonContent = (
        <>
          <span>{label}</span>
          {isActive && <span className="text-[10px]">{arrow}</span>}
        </>
      );
      
      if (tooltipContent) {
        return (
          <div className="flex items-center justify-end">
            <button
              onClick={() => onSort?.(field)}
              className={`text-right hover:text-[var(--text-primary)] transition-colors flex items-center gap-1 justify-end ${isActive ? 'text-[var(--text-primary)]' : ''}`}
            >
              {buttonContent}
              <Tooltip content={tooltipContent} side="bottom" align="end">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-3 h-3 text-[var(--text-tertiary)] cursor-help ml-0.5"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
              </Tooltip>
            </button>
          </div>
        );
      }
      
      return (
        <button
          onClick={() => onSort?.(field)}
          className={`text-right hover:text-[var(--text-primary)] transition-colors flex items-center gap-1 justify-end ${isActive ? 'text-[var(--text-primary)]' : ''}`}
        >
          {buttonContent}
        </button>
      );
    };
    
    return (
      <div className="hidden sm:grid grid-cols-[50px_1fr_80px_70px_80px_110px] gap-3 px-4 py-2 bg-[var(--bg-tertiary)] border-b border-[var(--border-color)] text-xs text-[var(--text-muted)] font-medium">
        <div>Rank</div>
        <div>Location</div>
        {renderHeaderButton('score', 'Score', "A standardized benchmark used to compare rental investment potential across U.S. locations, combining cash-flow yield with market demand.")}
        {renderHeaderButton('yield', 'Yield', 'Net yield percentage: (Annual Rent - Annual Property Taxes) / Median Property Value. Represents the annual return on investment after accounting for property taxes, before financing costs.')}
        {renderHeaderButton('fmr', 'FMR')}
        {renderHeaderButton('cashFlow', 'Cash Flow', 'Monthly cash flow estimate based on: 20% down payment, current mortgage rates, 8% vacancy/maintenance allowance, and local property tax rates. Uses FMR rent data and Zillow property values.')}
      </div>
    );
  }, [enhancedMode, sortField, sortDirection, onSort]);

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center p-4 text-xs text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  // Loading state (initial)
  if (loading && items.length === 0) {
    return (
      <div className="divide-y divide-[var(--border-color)]">
        {headerElement}
        {[...Array(10)].map((_, i) => (
          <div key={i} className="px-3 sm:px-4 py-4 sm:py-5">
            <div className="grid grid-cols-[40px_1fr_70px_60px_70px_90px] sm:grid-cols-[50px_1fr_80px_70px_80px_110px] gap-2 sm:gap-3 items-center">
              <div className="h-4 bg-[var(--border-color)] rounded w-8 animate-pulse"></div>
              <div className="min-w-0">
                <div className="h-4 bg-[var(--border-color)] rounded w-32 mb-1.5 animate-pulse"></div>
                <div className="h-3 bg-[var(--border-color)] rounded w-24 animate-pulse"></div>
              </div>
              <div className="h-4 bg-[var(--border-color)] rounded w-12 animate-pulse"></div>
              <div className="h-4 bg-[var(--border-color)] rounded w-10 animate-pulse"></div>
              <div className="h-4 bg-[var(--border-color)] rounded w-14 animate-pulse"></div>
              <div className="h-4 bg-[var(--border-color)] rounded w-20 animate-pulse"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (!loading && items.length === 0) {
    return (
      <div>
        {headerElement}
        <div className="flex items-center justify-center p-8 text-sm text-[var(--text-tertiary)]">
          No results found
        </div>
      </div>
    );
  }

  // Check if we have enhanced data
  const hasEnhancedData = enhancedMode && items.some(item => 
    item.netYield !== undefined || item.cashFlowEstimate !== undefined
  );

  return (
    <div>
      {/* Column headers for enhanced mode */}
      {headerElement}

      {items.map((item) => {
        const scoreColor = getScoreColor(item.medianScore);
        const cashFlowColor = getCashFlowColor(item.cashFlowEstimate);
        const flags = item.flags || {};
        
        // Compute badges once
        const activeBadges: { key: string; label: string; colors: string }[] = [];
        if (flags.highYield) activeBadges.push({ key: 'highYield', label: 'High Yield', colors: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' });
        if (flags.affordableEntry) activeBadges.push({ key: 'affordable', label: 'Affordable', colors: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300' });
        if (flags.taxFriendly) activeBadges.push({ key: 'taxFriendly', label: 'Low Tax', colors: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300' });
        if (flags.hotMarket) activeBadges.push({ key: 'hotMarket', label: 'Hot Market', colors: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300' });
        const badgesToShow = activeBadges.slice(0, 2);

        // Enhanced mode with grid layout
        if (hasEnhancedData) {
          return (
            <a
              key={`${type}-${item.rank}`}
              href={getHref(item)}
              className="block px-3 sm:px-4 py-2.5 sm:py-4 md:py-5 hover:bg-[var(--bg-hover)] transition-all border-b border-[var(--border-color)] group relative"
            >
              {/* Left accent bar on hover */}
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--text-primary)]/0 group-hover:bg-[var(--text-primary)]/20 transition-colors" />
              
              {/* Mobile: Refined card layout */}
              <div className="sm:hidden">
                {/* Identity Block + Score Block */}
                <div className="flex items-start justify-between gap-3 mb-2.5">
                  {/* Identity Block */}
                  <div className="min-w-0 flex-1">
                    {/* ZIP/Location with rank badge */}
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <div className="font-normal text-[13px] text-[var(--text-primary)] leading-tight">
                        {getLabel(item)}
                      </div>
                      {/* Rank as subtle badge */}
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium tabular-nums text-[var(--text-muted)] bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                        #{item.rank}
                      </span>
                      {/* Tags inline with location */}
                      {badgesToShow.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          {badgesToShow.map(badge => (
                            <span key={badge.key} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${badge.colors}`}>
                              {badge.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* County/State */}
                    {getSubLabel(item) && (
                      <div className="text-[10px] text-[var(--text-tertiary)] leading-tight">
                        {getSubLabel(item)}
                      </div>
                    )}
                  </div>

                  {/* Score Block - with label */}
                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-[9px] text-[var(--text-muted)] mb-0.5 leading-none">Score</span>
                    {item.medianScore !== null ? (
                      <span
                        className="font-semibold text-[15px] tabular-nums leading-none"
                        style={{ color: scoreColor }}
                      >
                        {Math.round(item.medianScore)}
                      </span>
                    ) : (
                      <span className="text-[var(--text-tertiary)] text-sm leading-none">—</span>
                    )}
                  </div>
                </div>

                {/* Performance Block - grouped with visual separation */}
                <div className="flex items-end gap-3 pl-0.5 border-l-2 border-[var(--border-color)]/30">
                  {/* Yield */}
                  <div className="flex flex-col pb-0.5">
                    <span className="text-[9px] text-[var(--text-muted)] mb-1 leading-none tracking-tight" style={{ opacity: 0.75 }}>
                      Yield
                    </span>
                    <span className="tabular-nums text-[13px] text-[var(--text-primary)] font-semibold leading-tight">
                      {item.netYield !== null && item.netYield !== undefined 
                        ? formatPercent(item.netYield)
                        : '—'}
                    </span>
                  </div>

                  {/* FMR */}
                  <div className="flex flex-col pb-0.5">
                    <span className="text-[9px] text-[var(--text-muted)] mb-1 leading-none tracking-tight" style={{ opacity: 0.75 }}>
                      FMR
                    </span>
                    <span className="tabular-nums text-[13px] text-[var(--text-primary)] font-semibold leading-tight">
                      {item.medianFMR !== null && item.medianFMR !== undefined
                        ? formatCurrency(item.medianFMR)
                        : '—'}
                    </span>
                  </div>

                  {/* Cash Flow - emphasized but balanced */}
                  <div className="flex flex-col pb-0.5">
                    <span className="text-[9px] text-[var(--text-muted)] mb-1 leading-none tracking-tight" style={{ opacity: 0.75 }}>
                      Cash Flow
                    </span>
                    <span 
                      className="text-[13px] font-bold tabular-nums leading-tight"
                      style={{ color: cashFlowColor }}
                    >
                      {formatCashFlow(item.cashFlowEstimate)}
                    </span>
                  </div>
                </div>

                {/* Aggregation context label */}
                {getAggregationLabel(item) && (
                  <div className="text-[9px] text-[var(--text-muted)] italic mt-1.5">
                    {getAggregationLabel(item)}
                  </div>
                )}
              </div>

              {/* Desktop: Grid layout */}
              <div className="hidden sm:grid grid-cols-[50px_1fr_80px_70px_80px_110px] gap-3 items-center">
                {/* Rank */}
                <span className="text-[11px] text-[var(--text-muted)] font-medium tabular-nums">
                  #{item.rank}
                </span>

                {/* Name and metadata */}
                <div className="min-w-0">
                  <div className="font-medium text-[var(--text-primary)] text-sm truncate">
                    {getLabel(item)}
                  </div>
                  {(getSubLabel(item) || item.medianPropertyValue || badgesToShow.length > 0) && (
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {getSubLabel(item) && (
                        <span className="text-[11px] text-[var(--text-tertiary)]">
                          {getSubLabel(item)}
                        </span>
                      )}
                      {item.medianPropertyValue && (
                        <span className="text-[11px] text-[var(--text-muted)] hidden lg:inline">
                          {getSubLabel(item) ? '· ' : ''}{formatCurrency(item.medianPropertyValue, true)}
                        </span>
                      )}
                      {badgesToShow.map(badge => (
                        <span key={badge.key} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.colors}`}>
                          {badge.label}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Aggregation context label */}
                  {getAggregationLabel(item) && (
                    <div className="text-[10px] text-[var(--text-muted)] italic mt-0.5">
                      {getAggregationLabel(item)}
                    </div>
                  )}
                </div>

                {/* Score */}
                <div className="text-right">
                  {item.medianScore !== null ? (
                    <span
                      className="font-semibold text-sm tabular-nums"
                      style={{ color: scoreColor }}
                    >
                      {Math.round(item.medianScore)}
                    </span>
                  ) : (
                    <span className="text-[var(--text-tertiary)] text-sm">—</span>
                  )}
                </div>

                {/* Yield */}
                <div className="text-right">
                  <span className="text-[11px] sm:text-sm tabular-nums text-[var(--text-secondary)]">
                    {item.netYield !== null && item.netYield !== undefined 
                      ? formatPercent(item.netYield)
                      : '—'}
                  </span>
                </div>

                {/* FMR */}
                <div className="text-right">
                  <span className="text-[11px] sm:text-sm tabular-nums text-[var(--text-secondary)]">
                    {item.medianFMR !== null && item.medianFMR !== undefined
                      ? formatCurrency(item.medianFMR)
                      : '—'}
                  </span>
                </div>

                {/* Cash Flow - emphasized */}
                <div className="text-right">
                  <span 
                    className="text-sm sm:text-base font-semibold tabular-nums"
                    style={{ color: cashFlowColor }}
                  >
                    {formatCashFlow(item.cashFlowEstimate)}
                  </span>
                </div>
              </div>
            </a>
          );
        }

        // Fallback: Simple mode (original layout)
        return (
          <a
            key={`${type}-${item.rank}`}
            href={getHref(item)}
            className="block px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-[var(--bg-hover)] transition-colors border-b border-[var(--border-color)]"
          >
            <div className="flex items-start justify-between gap-2 sm:gap-3">
              <div className="flex items-start gap-2 sm:gap-2.5 min-w-0 flex-1">
                <span className="text-xs text-[var(--text-muted)] font-medium shrink-0 tabular-nums">
                  #{item.rank}
                </span>
                <div className="min-w-0">
                  <div className="font-medium text-[var(--text-primary)] text-xs sm:text-sm truncate">
                    {getLabel(item)}
                  </div>
                  <div className="text-xs text-[var(--text-tertiary)] truncate mt-0.5">
                    {getSubLabel(item)}
                  </div>
                  {item.zipCount > 1 && (
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                      {item.zipCount} ZIPs
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                {item.medianScore !== null ? (
                  <div
                    className="font-semibold text-xs sm:text-sm tabular-nums"
                    style={{ color: scoreColor }}
                  >
                    {Math.round(item.medianScore)}
                  </div>
                ) : (
                  <div className="font-semibold text-[var(--text-tertiary)] text-xs sm:text-sm tabular-nums">
                    —
                  </div>
                )}
              </div>
            </div>
          </a>
        );
      })}

      {/* Infinite scroll sentinel */}
      {hasMore && (
        <div
          ref={sentinelRef}
          className="px-3 sm:px-4 py-3 sm:py-4 text-center"
        >
          <div className="h-5 w-5 rounded-full border-2 border-[var(--border-secondary)] border-t-transparent animate-spin mx-auto" />
        </div>
      )}

      {/* End of results */}
      {!hasMore && items.length > 0 && (
        <div className="px-3 sm:px-4 py-3 text-xs text-[var(--text-tertiary)] text-center">
          End of results
        </div>
      )}
    </div>
  );
}
