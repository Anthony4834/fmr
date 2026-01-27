'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useDebounce } from 'use-debounce';

type SortField = 'score' | 'yield' | 'cashFlow' | 'appreciation' | 'affordability' | 'heat' | 'fmr' | 'name';
type AffordabilityTier = 'all' | 'affordable' | 'midMarket' | 'premium';
type YieldRange = 'all' | 'low' | 'moderate' | 'high';

interface RankingItem {
  rank: number;
  stateCode?: string;
  stateName?: string;
  countyName?: string;
  countyFips?: string;
  cityName?: string;
  zipCode?: string;
  medianScore: number | null;
  avgScore?: number | null;
  zipCount: number;
  // V2 enhanced fields
  netYield?: number | null;
  grossYield?: number | null;
  medianFMR?: number | null;
  medianPropertyValue?: number | null;
  medianTaxRate?: number | null;
  cashFlowEstimate?: number | null;
  affordabilityIndex?: number | null;
  marketHeatScore?: number | null;
  demandScore?: number | null;
  appreciation1Y?: number | null;
  rentGrowth1Y?: number | null;
  zhviTrend?: number[];
  flags?: {
    highYield?: boolean;
    undervalued?: boolean;
    hotMarket?: boolean;
    affordableEntry?: boolean;
    taxFriendly?: boolean;
  };
}

interface Summary {
  totalCount: number;
  avgScore: number | null;
  medianYield: number | null;
  avgCashFlow: number | null;
  topMarket: { name: string; score: number } | null;
  mostAffordable: { name: string; value: number } | null;
  avgAppreciation1Y: number | null;
}

interface UseGeographicRankingsOptions {
  type: 'state' | 'county' | 'city' | 'zip';
  year: number;
  search?: string;
  stateFilter?: string;
  sort?: SortField;
  sortDirection?: 'asc' | 'desc';
  affordabilityTier?: AffordabilityTier;
  yieldRange?: YieldRange;
  minScore?: number | null;
  bedroom?: number | 'all';
  limit?: number;
}

export function useGeographicRankings({
  type,
  year,
  search = '',
  stateFilter = '',
  sort = 'score',
  sortDirection = 'desc',
  affordabilityTier = 'all',
  yieldRange = 'all',
  minScore = null,
  bedroom = 3,
  limit = 100,
}: UseGeographicRankingsOptions) {
  const [items, setItems] = useState<RankingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Record<string, { items: RankingItem[]; summary: Summary | null }>>({});

  // Debounce search to avoid excessive API calls
  const [debouncedSearch] = useDebounce(search, 300);

  // Reset when filters change
  useEffect(() => {
    setItems([]);
    setOffset(0);
    setHasMore(true);
    setError(null);
    setSummary(null);
  }, [type, year, debouncedSearch, stateFilter, sort, sortDirection, affordabilityTier, yieldRange, minScore, bedroom]);

  // Fetch geographic rankings data
  useEffect(() => {
    const cacheKey = `${type}:${year}:${debouncedSearch}:${stateFilter}:${sort}:${sortDirection}:${affordabilityTier}:${yieldRange}:${minScore}:${bedroom}:${offset}`;
    const cached = cacheRef.current[cacheKey];

    if (cached) {
      setItems((prev) => (offset === 0 ? cached.items : [...prev, ...cached.items]));
      if (cached.summary) setSummary(cached.summary);
      setLoading(false);
      return;
    }

    setLoading(true);

    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    // Build URL for the new explorer-metrics API
    const params = new URLSearchParams({
      type,
      year: String(year),
      offset: String(offset),
      limit: String(limit),
      sort,
      sortDirection,
      bedroom: String(bedroom),
    });

    if (debouncedSearch) params.set('search', debouncedSearch);
    if (stateFilter) params.set('state', stateFilter);
    if (affordabilityTier !== 'all') params.set('affordabilityTier', affordabilityTier);
    if (yieldRange !== 'all') params.set('yieldRange', yieldRange);
    if (minScore !== null) params.set('minScore', String(minScore));

    fetch(`/api/stats/explorer-metrics?${params}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch rankings');
        return res.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;

        // Map API response to RankingItem format
        const newItems: RankingItem[] = (data.items || []).map((item: any) => ({
          rank: item.rank,
          stateCode: item.stateCode,
          stateName: item.name,
          countyName: item.countyName || item.name,
          countyFips: item.countyFips,
          cityName: item.cityName || item.name,
          zipCode: item.zipCode,
          medianScore: item.score,
          zipCount: item.zipCount || 1,
          // V2 fields
          netYield: item.netYield,
          grossYield: item.grossYield,
          medianFMR: item.medianFMR,
          medianPropertyValue: item.medianPropertyValue,
          medianTaxRate: item.medianTaxRate,
          cashFlowEstimate: item.cashFlowEstimate,
          affordabilityIndex: item.affordabilityIndex,
          marketHeatScore: item.marketHeatScore,
          demandScore: item.demandScore,
          appreciation1Y: item.appreciation1Y,
          rentGrowth1Y: item.rentGrowth1Y,
          zhviTrend: item.zhviTrend,
          flags: item.flags,
        }));

        // Extract summary
        const summaryData: Summary | null = data.summary ? {
          totalCount: data.summary.totalCount || data.total || 0,
          avgScore: data.summary.avgScore,
          medianYield: data.summary.medianYield,
          avgCashFlow: data.summary.avgCashFlow,
          topMarket: data.summary.topMarket,
          mostAffordable: data.summary.mostAffordable,
          avgAppreciation1Y: data.summary.avgAppreciation1Y,
        } : null;

        // Cache the results
        cacheRef.current[cacheKey] = { items: newItems, summary: summaryData };

        setItems((prev) => (offset === 0 ? newItems : [...prev, ...newItems]));
        if (summaryData) setSummary(summaryData);
        setHasMore(data.hasMore || false);
        setLoading(false);
        setError(null);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Fetch rankings error:', err);
        setError('Failed to load rankings');
        setLoading(false);
      });

    return () => {
      if (abortRef.current === controller) {
        controller.abort();
      }
    };
  }, [type, year, debouncedSearch, stateFilter, sort, sortDirection, affordabilityTier, yieldRange, minScore, bedroom, offset, limit]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      setOffset((prev) => prev + limit);
    }
  }, [loading, hasMore, limit]);

  return {
    items,
    loading,
    hasMore,
    error,
    loadMore,
    summary,
  };
}
