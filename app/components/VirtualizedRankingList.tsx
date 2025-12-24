'use client';

import { useRef, useEffect } from 'react';
import { buildCitySlug, buildCountySlug } from '@/lib/location-slugs';
import { STATES } from '@/lib/states';
import { formatCountyName } from '@/lib/county-utils';

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
}

interface VirtualizedRankingListProps {
  type: 'state' | 'county' | 'city' | 'zip';
  items: RankingItem[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  error: string | null;
}

const STATE_NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  STATES.map((s) => [s.code, s.name])
);

export default function VirtualizedRankingList({
  type,
  items,
  loading,
  hasMore,
  onLoadMore,
  error,
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
    if (type === 'state') return item.stateCode;
    if (type === 'county') return item.stateCode;
    if (type === 'city') {
      const county = item.countyName ? formatCountyName(item.countyName, item.stateCode) : '';
      return `${county}, ${item.stateCode}`.trim().replace(/^,\s*/, '');
    }
    const county = item.countyName ? formatCountyName(item.countyName, item.stateCode) : '';
    return `${county}, ${item.stateCode}`.trim().replace(/^,\s*/, '');
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
    if (score === null || score < 0) return '#737373';
    if (score < 95) return '#b91c1c';
    if (score >= 130) return '#14532d';
    return '#16a34a';
  };

  // Error state
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-xs text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  // Loading state (initial)
  if (loading && items.length === 0) {
    return (
      <div className="flex-1 divide-y divide-[var(--border-color)] overflow-y-auto custom-scrollbar">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="px-3 sm:px-4 py-2 sm:py-2.5">
            <div className="flex items-start justify-between gap-2 sm:gap-3">
              <div className="flex items-start gap-2 sm:gap-2.5 min-w-0 flex-1">
                <div className="h-3 bg-[var(--border-color)] rounded w-4 shrink-0 animate-pulse"></div>
                <div className="min-w-0 flex-1">
                  <div className="h-3.5 sm:h-4 bg-[var(--border-color)] rounded w-28 sm:w-36 mb-1 sm:mb-1.5 animate-pulse"></div>
                  <div className="h-3 bg-[var(--border-color)] rounded w-24 sm:w-32 animate-pulse"></div>
                </div>
              </div>
              <div className="h-3.5 sm:h-4 bg-[var(--border-color)] rounded w-12 sm:w-16 ml-auto animate-pulse"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (!loading && items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-xs text-[var(--text-tertiary)]">
        No results found
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      {items.map((item) => {
        const scoreColor = getScoreColor(item.medianScore);

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
          className="px-3 sm:px-4 py-2 sm:py-2.5 text-center"
        >
          <div className="h-4 w-4 rounded-full border-2 border-[var(--border-secondary)] border-t-transparent animate-spin mx-auto" />
        </div>
      )}

      {/* End of results */}
      {!hasMore && items.length > 0 && (
        <div className="px-3 sm:px-4 py-2 text-xs text-[var(--text-tertiary)] text-center">
          End of results
        </div>
      )}
    </div>
  );
}
