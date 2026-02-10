'use client';

import { useState, useEffect, useRef } from 'react';
import { formatCountyName } from '@/lib/county-utils';
import Tooltip from './Tooltip';

export interface ExplorerTopListItem {
  rank: number;
  zipCode: string;
  cityName: string;
  countyName: string;
  stateCode: string;
  value: number;
  valueLabel: string;
  valueSub?: string;
}

export interface ExplorerTopListsData {
  fmrValue: { highest: ExplorerTopListItem[]; lowest: ExplorerTopListItem[] };
  fmrYoy: { increase: ExplorerTopListItem[]; decrease: ExplorerTopListItem[] };
  yieldYoy: { increase: ExplorerTopListItem[]; decrease: ExplorerTopListItem[] };
  /** Top 20 across all BR steps */
  priceJump: ExplorerTopListItem[];
}

interface ExplorerTopListsProps {
  year?: number;
  stateFilter?: string;
  minPrice?: string;
  maxPrice?: string;
  minYieldPct?: string;
}

function formatLocation(item: ExplorerTopListItem): string {
  const parts: string[] = [];
  if (item.countyName) {
    parts.push(formatCountyName(item.countyName, item.stateCode));
  }
  if (item.stateCode) parts.push(item.stateCode);
  return parts.join(', ');
}

const SEGMENT_ACTIVE = 'bg-[var(--text-secondary)] text-[var(--bg-primary)]';
const SEGMENT_INACTIVE = 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]';

function ListCard({
  title,
  tooltipContent,
  items,
  getValueLabel,
  getValueColor,
  valueSub,
  headerActions,
  loading,
  error,
  show3BR = false,
  scrollRef,
}: {
  title: string;
  tooltipContent?: string;
  items: ExplorerTopListItem[];
  getValueLabel: (item: ExplorerTopListItem) => string;
  getValueColor?: (item: ExplorerTopListItem) => string | undefined;
  valueSub?: (item: ExplorerTopListItem) => string | undefined;
  headerActions: React.ReactNode;
  loading: boolean;
  error: string | null;
  show3BR?: boolean;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--border-color)] bg-[var(--bg-tertiary)]">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <h4 className="text-xs font-semibold text-[var(--text-primary)]">{title}</h4>
            {tooltipContent && (
              <Tooltip content={tooltipContent} side="bottom" align="start">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-3 h-3 text-[var(--text-tertiary)] cursor-help shrink-0"
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
          {headerActions}
        </div>
      </div>
      <div
        ref={scrollRef}
        className="max-h-[300px] overflow-y-auto custom-scrollbar"
      >
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
                key={`${item.zipCode}-${item.rank}`}
                href={`/zip/${item.zipCode}${item.stateCode ? `?state=${item.stateCode}` : ''}`}
                className="block px-3 py-2 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
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
                      {show3BR && (
                        <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                          3BR
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[var(--text-tertiary)] truncate">
                      {formatLocation(item)}
                    </div>
                  </div>
                  <div className="text-right shrink-0 min-w-[4rem]">
                    <div
                      className="text-xs font-semibold tabular-nums"
                      style={{ color: getValueColor?.(item) ?? 'var(--text-primary)' }}
                    >
                      {getValueLabel(item)}
                    </div>
                    {valueSub && item.valueSub != null && (
                      <div className="text-[10px] text-[var(--text-muted)]">{item.valueSub}</div>
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ExplorerTopLists({ year, stateFilter, minPrice, maxPrice, minYieldPct }: ExplorerTopListsProps) {
  const [data, setData] = useState<ExplorerTopListsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fmrDirection, setFmrDirection] = useState<'highest' | 'lowest'>('highest');
  const [fmrYoyDirection, setFmrYoyDirection] = useState<'increase' | 'decrease'>('increase');
  const [yieldYoyDirection, setYieldYoyDirection] = useState<'increase' | 'decrease'>('increase');

  const rentScrollRef = useRef<HTMLDivElement>(null);
  const fmrYoyScrollRef = useRef<HTMLDivElement>(null);
  const yieldYoyScrollRef = useRef<HTMLDivElement>(null);
  const rentStepScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rentScrollRef.current?.scrollTo({ top: 0 });
  }, [fmrDirection]);
  useEffect(() => {
    fmrYoyScrollRef.current?.scrollTo({ top: 0 });
  }, [fmrYoyDirection]);
  useEffect(() => {
    yieldYoyScrollRef.current?.scrollTo({ top: 0 });
  }, [yieldYoyDirection]);

  const getDeltaValueColor = (item: ExplorerTopListItem): string | undefined =>
    item.value > 0 ? 'var(--change-positive)' : item.value < 0 ? 'var(--change-negative)' : undefined;

  useEffect(() => {
    let abort: AbortController | null = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (year != null) params.set('year', String(year));
    if (stateFilter) params.set('state', stateFilter);
    if (minPrice?.trim()) params.set('min_price', minPrice.trim());
    if (maxPrice?.trim()) params.set('max_price', maxPrice.trim());
    if (minYieldPct?.trim()) params.set('min_yield', minYieldPct.trim());
    fetch(`/api/stats/explorer-top-lists?${params.toString()}`, { signal: abort.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch explorer top lists');
        return res.json();
      })
      .then((json) => {
        if (abort?.signal.aborted) return;
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message || 'Failed to load');
        setLoading(false);
      });
    return () => {
      abort?.abort();
    };
  }, [year, stateFilter, minPrice, maxPrice, minYieldPct]);

  if (error && !loading) {
    return (
      <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] p-4">
        <p className="text-xs text-[var(--text-muted)]">Failed to load top markets</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Market Overview</h3>
        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
          Top ZIPs across key pricing and change metrics
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <ListCard
          title="Fair Market Rent"
          tooltipContent="3BR Fair Market Rent, monthly"
          items={data ? data.fmrValue[fmrDirection] : []}
          getValueLabel={(item) => item.valueLabel}
          headerActions={
            <div className="flex gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setFmrDirection('highest')}
                className={`px-1.5 py-1 sm:py-0.5 text-[11px] sm:text-[10px] font-medium rounded transition-colors ${fmrDirection === 'highest' ? SEGMENT_ACTIVE : SEGMENT_INACTIVE}`}
              >
                High
              </button>
              <button
                type="button"
                onClick={() => setFmrDirection('lowest')}
                className={`px-1.5 py-1 sm:py-0.5 text-[11px] sm:text-[10px] font-medium rounded transition-colors ${fmrDirection === 'lowest' ? SEGMENT_ACTIVE : SEGMENT_INACTIVE}`}
              >
                Low
              </button>
            </div>
          }
          loading={loading}
          error={null}
          show3BR
          scrollRef={rentScrollRef}
        />

        <ListCard
          title="FMR Movement"
          tooltipContent="Year-over-year change in Fair Market Rent (3BR)."
          items={data ? data.fmrYoy[fmrYoyDirection] : []}
          getValueLabel={(item) => item.valueLabel}
          getValueColor={getDeltaValueColor}
          headerActions={
            <div className="flex gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setFmrYoyDirection('increase')}
                className={`px-1.5 py-1 sm:py-0.5 text-[11px] sm:text-[10px] font-medium rounded transition-colors ${fmrYoyDirection === 'increase' ? SEGMENT_ACTIVE : SEGMENT_INACTIVE}`}
              >
                Growth
              </button>
              <button
                type="button"
                onClick={() => setFmrYoyDirection('decrease')}
                className={`px-1.5 py-1 sm:py-0.5 text-[11px] sm:text-[10px] font-medium rounded transition-colors ${fmrYoyDirection === 'decrease' ? SEGMENT_ACTIVE : SEGMENT_INACTIVE}`}
              >
                Decline
              </button>
            </div>
          }
          loading={loading}
          error={null}
          show3BR
          scrollRef={fmrYoyScrollRef}
        />

        <ListCard
          title="Yield Movement"
          tooltipContent="Year-over-year change in gross rent yield (percentage points)."
          items={data ? data.yieldYoy[yieldYoyDirection] : []}
          getValueLabel={(item) => item.valueLabel}
          getValueColor={getDeltaValueColor}
          headerActions={
            <div className="flex gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setYieldYoyDirection('increase')}
                className={`px-1.5 py-1 sm:py-0.5 text-[11px] sm:text-[10px] font-medium rounded transition-colors ${yieldYoyDirection === 'increase' ? SEGMENT_ACTIVE : SEGMENT_INACTIVE}`}
              >
                Growth
              </button>
              <button
                type="button"
                onClick={() => setYieldYoyDirection('decrease')}
                className={`px-1.5 py-1 sm:py-0.5 text-[11px] sm:text-[10px] font-medium rounded transition-colors ${yieldYoyDirection === 'decrease' ? SEGMENT_ACTIVE : SEGMENT_INACTIVE}`}
              >
                Decline
              </button>
            </div>
          }
          loading={loading}
          error={null}
          show3BR
          scrollRef={yieldYoyScrollRef}
        />

        <ListCard
          title="Rent step"
          tooltipContent="Per-bedroom FMR increase from one BR size to the next. Top 20 across 1→2, 2→3, and 3→4 BR steps."
          items={data ? data.priceJump : []}
          getValueLabel={(item) => item.valueLabel}
          getValueColor={getDeltaValueColor}
          valueSub={(item) => item.valueSub}
          headerActions={null}
          loading={loading}
          error={null}
          show3BR
          scrollRef={rentStepScrollRef}
        />
      </div>
    </div>
  );
}
