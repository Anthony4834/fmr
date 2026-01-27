'use client';

import { useState, useEffect } from 'react';
import { formatCountyName } from '@/lib/county-utils';
import Tooltip from './Tooltip';

interface MarketOverviewItem {
  rank: number;
  zipCode: string;
  cityName: string;
  countyName: string;
  stateCode: string;
  bedroomCount: number;
  score: number;
  netYield: number;
  propertyValue: number;
  cashFlowEstimate: number;
  valueRatio?: number;
}

interface MarketOverviewData {
  highestScore: MarketOverviewItem[];
  highestYield: MarketOverviewItem[];
  highestCashFlow: MarketOverviewItem[];
  bestStarters: MarketOverviewItem[];
  bestValue: MarketOverviewItem[];
}

interface MarketOverviewProps {
  year: number;
}

// Format currency compact
function formatCurrencyCompact(value: number | null): string {
  if (value === null) return '—';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${Math.round(value / 1000)}K`;
  return `$${Math.round(value)}`;
}

// Format location string - only County, State
function formatLocation(item: MarketOverviewItem): string {
  const parts: string[] = [];
  if (item.countyName) {
    parts.push(formatCountyName(item.countyName, item.stateCode));
  }
  if (item.stateCode) parts.push(item.stateCode);
  return parts.join(', ');
}

export default function MarketOverview({ year }: MarketOverviewProps) {
  const [data, setData] = useState<MarketOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let abortController = new AbortController();

    setLoading(true);
    setError(null);

    fetch(`/api/stats/market-overview?year=${year}`, { signal: abortController.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch market overview');
        return res.json();
      })
      .then((result) => {
        if (abortController.signal.aborted) return;
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Market overview fetch error:', err);
        setError(err.message || 'Failed to load market overview');
        setLoading(false);
      });

    return () => {
      abortController.abort();
    };
  }, [year]);

  const renderContainer = (
    title: string,
    items: MarketOverviewItem[],
    getValue: (item: MarketOverviewItem) => string | number,
    getValueLabel: (item: MarketOverviewItem) => string,
    headerColor: string,
    tooltipContent?: string
  ) => {
    return (
      <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] overflow-hidden">
        <div className={`px-3 py-2 border-b border-[var(--border-color)] ${headerColor}`}>
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs font-semibold text-[var(--text-primary)]">{title}</h4>
            {tooltipContent && (
              <Tooltip content={tooltipContent} side="bottom" align="start">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-3 h-3 text-[var(--text-tertiary)] cursor-help"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
              </Tooltip>
            )}
          </div>
        </div>
        <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="p-3 space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-[var(--border-color)] rounded animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="p-3 text-xs text-[var(--text-muted)]">{error}</div>
          ) : items.length === 0 ? (
            <div className="p-3 text-xs text-[var(--text-muted)]">No data available</div>
          ) : (
            <div className="divide-y divide-[var(--border-color)]">
              {items.map((item) => (
                <a
                  key={`${item.zipCode}-${item.bedroomCount}-${item.rank}`}
                  href={`/zip/${item.zipCode}${item.stateCode ? `?state=${item.stateCode}` : ''}`}
                  className="block px-3 py-2 hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] font-medium text-[var(--text-muted)] tabular-nums shrink-0">
                          #{item.rank}
                        </span>
                        <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                          {item.zipCode}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                          {item.bedroomCount}BR
                        </span>
                      </div>
                      <div className="text-[10px] text-[var(--text-tertiary)] truncate">
                        {formatLocation(item)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-semibold text-green-600 dark:text-green-400 tabular-nums">
                        {getValueLabel(item)}
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (error && !loading) {
    return (
      <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] p-4">
        <p className="text-xs text-[var(--text-muted)]">Failed to load market overview</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Market Overview</h3>
        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Discover the top markets across the US right now</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {renderContainer(
          'Highest Score',
          data?.highestScore || [],
          (item) => item.score,
          (item) => Math.round(item.score).toString(),
          'bg-[var(--bg-tertiary)]'
        )}

        {renderContainer(
          'Highest Yield',
          data?.highestYield || [],
          (item) => item.netYield,
          (item) => `${(item.netYield * 100).toFixed(1)}%`,
          'bg-[var(--bg-tertiary)]'
        )}

        {renderContainer(
          'Highest Cash Flow',
          data?.highestCashFlow || [],
          (item) => item.cashFlowEstimate,
          (item) => {
            const value = Math.round(item.cashFlowEstimate);
            return value >= 0 ? `+$${value}` : `-$${Math.abs(value)}`;
          },
          'bg-[var(--bg-tertiary)]',
          'Monthly cash flow estimate based on: 20% down payment, current mortgage rates, 8% vacancy/maintenance allowance, and local property tax rates. Uses FMR rent data and Zillow property values.'
        )}

        {renderContainer(
          'Best Starters',
          data?.bestStarters || [],
          (item) => item.cashFlowEstimate,
          (item) => {
            const value = Math.round(item.cashFlowEstimate);
            return value >= 0 ? `+$${value}` : `-$${Math.abs(value)}`;
          },
          'bg-[var(--bg-tertiary)]',
          'Entry-level properties ($90K-$110K) with highest projected cash flow'
        )}
      </div>
    </div>
  );
}
