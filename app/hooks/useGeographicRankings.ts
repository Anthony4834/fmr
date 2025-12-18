'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useDebounce } from 'use-debounce';

interface RankingItem {
  rank: number;
  stateCode?: string;
  stateName?: string;
  countyName?: string;
  countyFips?: string;
  cityName?: string;
  zipCode?: string;
  medianScore: number | null;
  avgScore: number | null;
  zipCount: number;
}

interface UseGeographicRankingsOptions {
  type: 'state' | 'county' | 'city' | 'zip';
  year: number;
  search?: string;
  stateFilter?: string;
  limit?: number;
}

export function useGeographicRankings({
  type,
  year,
  search = '',
  stateFilter = '',
  limit = 100,
}: UseGeographicRankingsOptions) {
  const [items, setItems] = useState<RankingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Record<string, RankingItem[]>>({});

  // Debounce search to avoid excessive API calls
  const [debouncedSearch] = useDebounce(search, 300);

  // Reset when filters change
  useEffect(() => {
    setItems([]);
    setOffset(0);
    setHasMore(true);
    setError(null);
  }, [type, year, debouncedSearch, stateFilter]);

  // Fetch geographic rankings data
  useEffect(() => {
    const cacheKey = `${type}:${year}:${debouncedSearch}:${stateFilter}:${offset}`;
    const cached = cacheRef.current[cacheKey];

    if (cached) {
      setItems((prev) => (offset === 0 ? cached : [...prev, ...cached]));
      setLoading(false);
      return;
    }

    setLoading(true);

    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const params = new URLSearchParams({
      type,
      year: String(year),
      offset: String(offset),
      limit: String(limit),
    });

    if (debouncedSearch) params.set('search', debouncedSearch);
    if (stateFilter) params.set('state', stateFilter);

    fetch(`/api/stats/geo-rankings?${params}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch rankings');
        return res.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;

        const newItems = data.items || [];
        cacheRef.current[cacheKey] = newItems;

        setItems((prev) => (offset === 0 ? newItems : [...prev, ...newItems]));
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
  }, [type, year, debouncedSearch, stateFilter, offset, limit]);

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
  };
}
