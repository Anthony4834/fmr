'use client';

import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';
import { buildCitySlug, buildCountySlug } from '@/lib/location-slugs';

// ─── Shared types ──────────────────────────────────────────────────────────────

export type Trend = 'up' | 'flat' | 'down';

export interface ScreenerItem {
  geoKey: string;
  zipCode?: string;
  cityName?: string;
  areaName?: string;
  stateCode: string;
  countyName?: string;
  fmrCurr: number;
  fmrYoy: number;
  zhviCurr: number;
  zhviYoy: number;
  yieldCurr: number;
  yieldDeltaPp: number;
  zipCount?: number;
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

export function trendFromDelta(delta: number, flatBand: number): Trend {
  if (delta > flatBand) return 'up';
  if (delta < -flatBand) return 'down';
  return 'flat';
}

export function deriveRisk(yieldCurr: number): 'Low' | 'Medium' | 'High' {
  const pct = yieldCurr * 100;
  if (pct >= 6.5) return 'Low';
  if (pct <= 4.5) return 'High';
  return 'Medium';
}

function formatUSD(n: number) {
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function formatPct(n: number) {
  return `${n.toFixed(1)}%`;
}

// ─── Shared sub-components ─────────────────────────────────────────────────────

export function TrendPill({ trend }: { trend: Trend }) {
  const cfg =
    trend === 'up'
      ? { icon: TrendingUp, cls: 'pill-up' }
      : trend === 'down'
        ? { icon: TrendingDown, cls: 'pill-down' }
        : { icon: ArrowRight, cls: 'pill-flat' };
  const Icon = cfg.icon;
  const label = trend === 'up' ? 'Up' : trend === 'down' ? 'Down' : 'Flat';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12px] font-medium ${cfg.cls}`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      {label}
    </span>
  );
}

export function RiskPill({ risk }: { risk: 'Low' | 'Medium' | 'High' }) {
  const cls =
    risk === 'Low' ? 'pill-up' : risk === 'High' ? 'pill-down' : 'pill-warning';
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-[12px] font-medium ${cls}`}
    >
      {risk}
    </span>
  );
}

export function SignalCell({
  valueMain,
  delta,
  trend,
  deltaColorClass,
}: {
  valueMain: string;
  delta: number;
  trend: Trend;
  deltaColorClass: string;
}) {
  return (
    <div className="rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] p-1.5 sm:p-3">
      <div className="flex flex-row items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5 sm:block">
          <div className="truncate text-[11px] sm:text-[12px] font-medium text-[var(--text-primary)]">
            {valueMain}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] sm:mt-0.5 sm:text-[11px] shrink-0">
            <span className={`font-medium ${deltaColorClass}`}>
              {delta > 0 ? '+' : ''}
              {formatPct(delta)}
            </span>
            <span className="text-[var(--text-muted)] hidden sm:inline">YoY</span>
          </div>
        </div>
        <TrendPill trend={trend} />
      </div>
    </div>
  );
}

// ─── Main table component ──────────────────────────────────────────────────────

type SortColumn = 'price' | 'fmr' | 'yield';

export interface InsightsScreenerTableProps {
  items: ScreenerItem[];
  loading?: boolean;
  flatBandPct?: number;
  geoType?: 'zip' | 'city' | 'county';
  /** When provided, column headers become clickable sort buttons */
  onSortColumn?: (col: SortColumn) => void;
  activeSortCol?: SortColumn | null;
  sortDir?: 'asc' | 'desc';
}

export default function InsightsScreenerTable({
  items,
  loading = false,
  flatBandPct = 3,
  geoType = 'zip',
  onSortColumn,
  activeSortCol,
  sortDir = 'desc',
}: InsightsScreenerTableProps) {
  function deltaColor(delta: number) {
    if (delta > flatBandPct) return 'text-change-positive';
    if (delta < -flatBandPct) return 'text-change-negative';
    return 'text-[var(--text-muted)]';
  }

  function hrefForItem(item: ScreenerItem): string | null {
    if (geoType === 'zip') {
      const zip = item.zipCode?.match(/\b(\d{5})\b/)?.[1];
      return zip ? `/zip/${zip}` : null;
    }
    if (geoType === 'city' && item.cityName && item.stateCode) {
      return `/city/${buildCitySlug(item.cityName, item.stateCode)}`;
    }
    if (geoType === 'county' && item.areaName && item.stateCode) {
      return `/county/${buildCountySlug(item.areaName, item.stateCode)}`;
    }
    return null;
  }

  function getItemLabel(item: ScreenerItem): string {
    if (item.zipCode) return item.zipCode;
    if (item.cityName) return item.cityName;
    return item.areaName || item.geoKey || '';
  }

  function formatLocation(item: ScreenerItem): string {
    if (item.countyName && item.stateCode) {
      const county = item.countyName.includes('County')
        ? item.countyName
        : `${item.countyName} County`;
      return `${county}, ${item.stateCode}`;
    }
    return item.stateCode || '';
  }

  const ColHeader = ({ col, label }: { col: SortColumn; label: string }) => {
    const isActive = activeSortCol === col;
    if (onSortColumn) {
      return (
        <button
          type="button"
          onClick={() => onSortColumn(col)}
          className="text-left hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
        >
          {label} {isActive && (sortDir === 'desc' ? '↓' : '↑')}
        </button>
      );
    }
    return <div>{label}</div>;
  };

  return (
    <div className="divide-y divide-[var(--border-color)]" aria-busy={loading} aria-live="polite">
      {/* Column headers */}
      <div className="hidden sm:grid grid-cols-[50px_1.5fr_1fr_1fr_1fr_0.8fr] gap-3 px-3 sm:px-4 py-2 bg-[var(--bg-tertiary)] text-xs font-medium text-[var(--text-muted)]">
        <div>Rank</div>
        <div>Location</div>
        <ColHeader col="price" label="Home value" />
        <ColHeader col="fmr" label="FMR" />
        <ColHeader col="yield" label="Yield" />
        <div className="text-right">Risk</div>
      </div>

      {/* Loading skeleton */}
      {loading && items.length === 0 && (
        <>
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="px-3 sm:px-4 py-1.5 sm:py-4 grid grid-cols-1 gap-1.5 sm:gap-3 md:grid-cols-[50px_1.5fr_1fr_1fr_1fr_0.8fr] md:items-center"
            >
              <div className="h-4 w-8 bg-[var(--border-color)] rounded animate-pulse hidden sm:block" aria-hidden />
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-md bg-[var(--border-color)] animate-pulse sm:hidden" aria-hidden />
                <div className="h-4 w-32 bg-[var(--border-color)] rounded animate-pulse" aria-hidden />
              </div>
              <div className="h-10 sm:h-14 bg-[var(--border-color)] rounded-md animate-pulse" aria-hidden />
              <div className="h-10 sm:h-14 bg-[var(--border-color)] rounded-md animate-pulse" aria-hidden />
              <div className="h-10 sm:h-14 bg-[var(--border-color)] rounded-md animate-pulse" aria-hidden />
              <div className="h-6 w-12 bg-[var(--border-color)] rounded animate-pulse hidden md:flex" aria-hidden />
            </div>
          ))}
        </>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <div className="px-4 py-12 text-center">
          <p className="text-sm font-medium text-[var(--text-primary)]">No data available</p>
        </div>
      )}

      {/* Rows */}
      {items.map((m, idx) => {
        const pTrend = trendFromDelta(m.zhviYoy, flatBandPct);
        const rTrend = trendFromDelta(m.fmrYoy, flatBandPct);
        const yTrend = trendFromDelta(m.yieldDeltaPp, flatBandPct);
        const href = hrefForItem(m);
        const risk = deriveRisk(m.yieldCurr);
        return (
          <div
            key={m.geoKey}
            className="group relative px-3 sm:px-4 py-1.5 sm:py-4 hover:bg-[var(--bg-hover)] transition-all"
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--text-primary)]/0 group-hover:bg-[var(--text-primary)]/20 transition-colors"
              aria-hidden
            />
            <div className="grid grid-cols-1 gap-1.5 sm:gap-3 md:grid-cols-[50px_1.5fr_1fr_1fr_1fr_0.8fr] md:items-center">
              <span className="hidden sm:block text-[11px] text-[var(--text-muted)] font-medium tabular-nums">
                #{idx + 1}
              </span>
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-3 md:justify-start">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] text-[11px] font-medium text-[var(--text-muted)] tabular-nums sm:hidden">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        {href ? (
                          <a
                            href={href}
                            className="truncate text-sm font-medium text-[var(--text-primary)] hover:underline"
                          >
                            {getItemLabel(m)}, {m.stateCode}
                          </a>
                        ) : (
                          <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                            {getItemLabel(m)}, {m.stateCode}
                          </span>
                        )}
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                          <span>{formatLocation(m)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="md:hidden">
                    <RiskPill risk={risk} />
                  </div>
                </div>
              </div>
              <SignalCell
                valueMain={formatUSD(m.zhviCurr)}
                delta={m.zhviYoy}
                trend={pTrend}
                deltaColorClass={deltaColor(m.zhviYoy)}
              />
              <SignalCell
                valueMain={`${formatUSD(m.fmrCurr)}/mo`}
                delta={m.fmrYoy}
                trend={rTrend}
                deltaColorClass={deltaColor(m.fmrYoy)}
              />
              <SignalCell
                valueMain={formatPct(m.yieldCurr * 100)}
                delta={m.yieldDeltaPp}
                trend={yTrend}
                deltaColorClass={
                  m.yieldDeltaPp > flatBandPct
                    ? 'text-change-positive'
                    : m.yieldDeltaPp < -flatBandPct
                      ? 'text-change-negative'
                      : 'text-[var(--text-muted)]'
                }
              />
              <div className="hidden md:flex justify-end">
                <RiskPill risk={risk} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
