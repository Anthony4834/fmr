'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FMRResult } from '@/lib/types';
import HistoricalFMRChart from '@/app/components/HistoricalFMRChart';
import StateBedroomCurveChart from '@/app/components/StateBedroomCurveChart';
import PercentageBadge from '@/app/components/PercentageBadge';
import Tooltip from '@/app/components/Tooltip';
import ScoreGauge from '@/app/components/ScoreGauge';
import InvestorScoreInfoIcon from '@/app/components/InvestorScoreInfoIcon';
import { buildCitySlug, buildCountySlug } from '@/lib/location-slugs';
import { formatCountyName } from '@/lib/county-utils';

interface FMRResultsProps {
  data: FMRResult | null;
  loading?: boolean;
  error?: string | null;
  zipVsCountyMedianPercent?: number | null;
  breadcrumbs?: { parentLabel: string; parentType: 'zip' | 'city' | 'county' | 'address'; zipCode: string } | null;
  onBreadcrumbBack?: () => void;
}

export default function FMRResults({
  data,
  loading,
  error,
  zipVsCountyMedianPercent,
  breadcrumbs,
  onBreadcrumbBack
}: FMRResultsProps) {
  const router = useRouter();
  const [showAllZips, setShowAllZips] = useState(false);
  const [areaScore, setAreaScore] = useState<number | null>(null);
  const [areaScoreLoading, setAreaScoreLoading] = useState(false);

  // Reset ZIP display state when data changes
  useEffect(() => {
    setShowAllZips(false);
  }, [data]);

  // Fetch investment score for county/city/zip/address views
  useEffect(() => {
    if (!data) {
      setAreaScore(null);
      return;
    }

    setAreaScoreLoading(true);
    const params = new URLSearchParams();
    
    if ((data.queriedType === 'zip' || data.queriedType === 'address') && data.zipCode) {
      params.set('zip', data.zipCode);
    } else if (data.queriedType === 'county' && data.countyName && data.stateCode) {
      params.set('county', data.countyName);
      params.set('state', data.stateCode);
    } else if (data.queriedType === 'city' && data.cityName && data.stateCode) {
      params.set('city', data.cityName);
      params.set('state', data.stateCode);
    } else {
      setAreaScoreLoading(false);
      return;
    }
    if (data.year) params.set('year', String(data.year));

    fetch(`/api/investment/score?${params.toString()}`)
      .then(res => res.json())
      .then(result => {
        if (result.found) {
          // For ZIP and address views, use score directly; for county/city, use medianScore
          const score = (data.queriedType === 'zip' || data.queriedType === 'address')
            ? (result.score ?? null)
            : (result.medianScore ?? null);
          setAreaScore(score);
        } else {
          setAreaScore(null);
        }
        setAreaScoreLoading(false);
      })
      .catch(() => {
        setAreaScore(null);
        setAreaScoreLoading(false);
      });
  }, [data]);

  if (loading) {
    return (
      <div className="mt-4 sm:mt-6">
        {/* Breadcrumbs Skeleton */}
        <div className="mb-3">
          <div className="h-4 bg-[var(--border-color)] rounded w-48 animate-pulse"></div>
        </div>

        {/* Header Skeleton */}
        <div className="mb-4 sm:mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              {/* Back button skeleton */}
              <div className="h-8 w-8 bg-[var(--border-color)] rounded-lg animate-pulse shrink-0"></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {/* Title skeleton */}
                  <div className="h-5 sm:h-6 bg-[var(--border-color)] rounded w-48 sm:w-64 animate-pulse"></div>
                  {/* Badge skeletons */}
                  <div className="h-5 bg-[var(--border-color)] rounded w-12 animate-pulse"></div>
                  <div className="h-5 bg-[var(--border-color)] rounded w-12 animate-pulse"></div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Location skeleton */}
                  <div className="h-3 bg-[var(--border-color)] rounded w-40 animate-pulse"></div>
                  <div className="h-3 bg-[var(--border-color)] rounded w-1 animate-pulse"></div>
                  <div className="h-3 bg-[var(--border-color)] rounded w-32 animate-pulse"></div>
                </div>
              </div>
            </div>
          </div>
          {/* Zillow button skeleton */}
          <div className="h-8 bg-[var(--border-color)] rounded-lg w-20 sm:w-28 animate-pulse shrink-0"></div>
        </div>

        {/* Investment Score Gauge Skeleton */}
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-[var(--bg-content)] rounded-lg border border-[var(--border-color)]">
          <div className="flex items-center gap-4">
            <div className="w-[120px] h-[60px] bg-[var(--border-color)] rounded animate-pulse" />
            <div className="flex-1">
              <div className="h-3 bg-[var(--border-color)] rounded w-32 mb-2 animate-pulse" />
              <div className="h-3 bg-[var(--border-color)] rounded w-48 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Table Skeleton */}
        <div className="overflow-x-auto overflow-y-visible -mx-1 sm:mx-0">
          <div className="max-h-[240px] overflow-y-auto overflow-x-visible">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-color)]">
                  <th className="text-left py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">BR</th>
                  <th className="text-right py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">Rent</th>
                  <th className="text-right py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">YoY</th>
                  <th className="text-right py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">3Y CAGR</th>
                </tr>
              </thead>
              <tbody>
                {[...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-[var(--border-color)]">
                    <td className="py-2.5 sm:py-2 px-2 sm:px-3">
                      <div className="h-4 bg-[var(--border-color)] rounded w-12 animate-pulse"></div>
                    </td>
                    <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                      <div className="h-4 bg-[var(--border-color)] rounded w-20 ml-auto animate-pulse"></div>
                    </td>
                    <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                      <div className="h-4 bg-[var(--border-color)] rounded w-12 ml-auto animate-pulse"></div>
                    </td>
                    <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                      <div className="h-4 bg-[var(--border-color)] rounded w-12 ml-auto animate-pulse"></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 p-4 bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-lg">
        <p className="text-[var(--warning-text)] font-semibold text-sm mb-1">Error</p>
        <p className="text-[var(--map-color-low)] text-sm">{error}</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  // TypeScript: data is guaranteed to be non-null after the check above
  const dataNonNull = data;

  const median = (values: number[]) => {
    if (values.length === 0) return undefined;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };

  const formatCurrency = (value?: number) => {
    if (!value) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (date?: Date | string) => {
    if (!date) return 'N/A';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  // Get type label for pill
  const getTypeLabel = () => {
    const typeLabels = {
      zip: 'ZIP',
      city: 'City',
      county: 'County',
      address: 'Address'
    };
    return typeLabels[dataNonNull.queriedType || 'address'];
  };

  // Format location display (county, state)
  const formatLocation = () => {
    // For address queries, show the address with county/state info below
    if (dataNonNull.queriedType === 'address' && dataNonNull.queriedLocation) {
      if (dataNonNull.countyName) {
        const countyDisplay = formatCountyName(dataNonNull.countyName, dataNonNull.stateCode);
        return `${countyDisplay}, ${dataNonNull.stateCode}`;
      }
      return dataNonNull.stateCode;
    }
    
    // For other query types, show county/state as before
    if (dataNonNull.countyName) {
      // Format county name with appropriate suffix (County or Parish for LA)
      const countyDisplay = formatCountyName(dataNonNull.countyName, dataNonNull.stateCode);
      return `${countyDisplay}, ${dataNonNull.stateCode}`;
    }
    return `${dataNonNull.stateCode}`;
  };
  
  // Get the main title to display
  const getMainTitle = () => {
    // For address queries, show the full address
    if (dataNonNull.queriedType === 'address' && dataNonNull.queriedLocation) {
      return dataNonNull.queriedLocation;
    }
    // For other types, show queriedLocation or areaName
    return dataNonNull.queriedLocation || dataNonNull.areaName;
  };

  // Get ZIP codes to display
  const zipCodesToShow = dataNonNull.zipCodes && dataNonNull.zipCodes.length > 0 
    ? dataNonNull.zipCodes 
    : (dataNonNull.zipCode ? [dataNonNull.zipCode] : []);
  
  const hasManyZips = zipCodesToShow.length > 10;
  const zipDisplayLimit = 8;

  // Build Zillow URL based on location type
  const getZillowUrl = (): string | null => {
    const stateCodeLower = dataNonNull.stateCode.toLowerCase();
    
    if (dataNonNull.queriedType === 'zip') {
      const zip = zipCodesToShow.length > 0 ? zipCodesToShow[0] : dataNonNull.zipCode;
      if (!zip) return null;
      return `https://www.zillow.com/${zip}/`;
    }
    
    if (dataNonNull.queriedType === 'city') {
      const cityName = dataNonNull.queriedLocation || dataNonNull.areaName;
      if (!cityName) return null;
      // Format: lowercase, replace spaces with hyphens, remove special chars
      const formatted = cityName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      return `https://www.zillow.com/${formatted}-${stateCodeLower}/`;
    }
    
    if (dataNonNull.queriedType === 'county') {
      const countyName = dataNonNull.countyName || dataNonNull.areaName;
      if (!countyName) return null;
      // Remove "County" or "Parish" suffix if present, format: lowercase, replace spaces with hyphens
      const cleaned = countyName.replace(/\s+(county|parish)$/i, '').trim();
      const formatted = cleaned
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      const regionalUnit = stateCode?.toUpperCase() === 'LA' ? 'parish' : 'county';
      return `https://www.zillow.com/${formatted}-${regionalUnit}-${stateCodeLower}/`;
    }
    
    // For address queries, try to use county or zip if available
    if (dataNonNull.queriedType === 'address') {
      if (zipCodesToShow.length > 0) {
        return `https://www.zillow.com/${zipCodesToShow[0]}/`;
      }
      if (dataNonNull.countyName) {
        const cleaned = dataNonNull.countyName.replace(/\s+(county|parish)$/i, '').trim();
        const formatted = cleaned
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim();
        const regionalUnit = stateCode?.toUpperCase() === 'LA' ? 'parish' : 'county';
        return `https://www.zillow.com/${formatted}-${regionalUnit}-${stateCodeLower}/`;
      }
    }
    
    return null;
  };

  // Representative “current year” values used for YoY comparisons.
  // - For SAFMR multi-ZIP results, use median across ZIPs (matches how history is aggregated).
  // - Otherwise, use the current record values directly.
  const representative = (() => {
    if (dataNonNull.zipFMRData && dataNonNull.zipFMRData.length > 0) {
      const b0 = dataNonNull.zipFMRData.map(z => z.bedroom0).filter(v => v !== undefined) as number[];
      const b1 = dataNonNull.zipFMRData.map(z => z.bedroom1).filter(v => v !== undefined) as number[];
      const b2 = dataNonNull.zipFMRData.map(z => z.bedroom2).filter(v => v !== undefined) as number[];
      const b3 = dataNonNull.zipFMRData.map(z => z.bedroom3).filter(v => v !== undefined) as number[];
      const b4 = dataNonNull.zipFMRData.map(z => z.bedroom4).filter(v => v !== undefined) as number[];
      return {
        bedroom0: median(b0),
        bedroom1: median(b1),
        bedroom2: median(b2),
        bedroom3: median(b3),
        bedroom4: median(b4),
      };
    }
    return {
      bedroom0: dataNonNull.bedroom0,
      bedroom1: dataNonNull.bedroom1,
      bedroom2: dataNonNull.bedroom2,
      bedroom3: dataNonNull.bedroom3,
      bedroom4: dataNonNull.bedroom4,
    };
  })();

  const historyByYear = (() => {
    if (!dataNonNull.history) return null;
    return new Map(dataNonNull.history.map((p) => [p.year, p]));
  })();

  const yoyChange = (bedroomKey: keyof typeof representative) => {
    if (!historyByYear) return null;
    const currentYear = dataNonNull.year;
    const prevYear = currentYear - 1;
    const prev = historyByYear.get(prevYear)?.[bedroomKey] as number | undefined;
    const curr = representative[bedroomKey];
    if (curr === undefined || prev === undefined || prev <= 0) return null;
    const delta = curr - prev;
    const pct = (delta / prev) * 100;
    return { prevYear, prev, curr, delta, pct };
  };

  const cagr3Year = (bedroomKey: keyof typeof representative) => {
    if (!historyByYear) return null;
    const currentYear = dataNonNull.year;
    const prev3Year = currentYear - 3;
    const prev3 = historyByYear.get(prev3Year)?.[bedroomKey] as number | undefined;
    const curr = representative[bedroomKey];
    if (curr === undefined || prev3 === undefined || prev3 <= 0) return null;
    // CAGR = ((End Value / Start Value)^(1/Years)) - 1
    const years = 3;
    const ratio = curr / prev3;
    const cagr = (Math.pow(ratio, 1 / years) - 1) * 100;
    return { prev3Year, prev3, curr, cagr };
  };

  const YoYBadge = ({ bedroomKey }: { bedroomKey: keyof typeof representative }) => {
    const c = yoyChange(bedroomKey);
    if (!c) return <span className="text-xs text-[var(--text-muted)]">—</span>;
    return (
      <PercentageBadge 
        value={c.pct} 
        className="text-[11px]"
      />
    );
  };

  // Build breadcrumbs following exact hierarchy: Home / State / County / City / Zip, limited to 3.
  // Rule: construct the full chain (when known), then render the last 3 items.
  const stateCode = dataNonNull.stateCode;
  const fullBreadcrumbs: { label: string; href: string }[] = [];

  fullBreadcrumbs.push({ label: 'Home', href: '/' });

  if (stateCode) {
    fullBreadcrumbs.push({ label: stateCode, href: `/state/${stateCode}` });
  }

  if (dataNonNull.countyName && stateCode) {
    const countyDisplay = formatCountyName(dataNonNull.countyName, dataNonNull.stateCode);
    fullBreadcrumbs.push({
      label: countyDisplay,
      href: `/county/${buildCountySlug(dataNonNull.countyName, stateCode)}`,
    });
  }

  const cityLabel =
    dataNonNull.cityName ||
    (dataNonNull.queriedType === 'city' && dataNonNull.queriedLocation
      ? dataNonNull.queriedLocation.split(',')[0].trim()
      : undefined);

  if (cityLabel && stateCode) {
    fullBreadcrumbs.push({
      label: cityLabel,
      href: `/city/${buildCitySlug(cityLabel, stateCode)}`,
    });
  }

  // Only include ZIP in the hierarchy when the current view is a ZIP view.
  // City/county results may carry a representative zipCode internally (e.g., city FMR fallback),
  // but we should not treat that as navigation context.
  if (dataNonNull.queriedType === 'zip' && dataNonNull.zipCode && stateCode) {
    fullBreadcrumbs.push({
      label: dataNonNull.zipCode,
      href: `/zip/${dataNonNull.zipCode}?state=${stateCode}`,
    });
  }

  const breadcrumbItems = fullBreadcrumbs.slice(-3);
  const backHref =
    fullBreadcrumbs.length >= 2 ? fullBreadcrumbs[fullBreadcrumbs.length - 2].href : '/';

  return (
    <div className="mt-4 sm:mt-6">
      {/* Breadcrumbs */}
      {breadcrumbItems.length > 0 && (
        <div className="mb-3 flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] flex-wrap">
          {breadcrumbItems.map((item, index) => (
            <span key={index} className="flex items-center gap-1.5">
              {index > 0 && <span className="text-[var(--text-muted)]">/</span>}
              {index === breadcrumbItems.length - 1 ? (
                <span className="text-[var(--text-primary)] font-medium">{item.label}</span>
              ) : (
                <a href={item.href} className="hover:text-[var(--text-primary)] transition-colors">
                  {item.label}
                </a>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Compact header bar (single hierarchy line) */}
      <div className="mb-4 sm:mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            {onBreadcrumbBack ? (
              <button
                type="button"
                onClick={onBreadcrumbBack}
                aria-label="Back"
                title="Back"
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] transition-colors shrink-0"
              >
                ←
              </button>
            ) : (
              <a
                href={backHref}
                aria-label="Back"
                title="Back"
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] transition-colors shrink-0"
              >
                ←
              </a>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <div className="text-sm sm:text-base font-semibold text-[var(--text-primary)] truncate">
                  {getMainTitle()}
                </div>
                <span className={`px-1.5 sm:px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                  dataNonNull.queriedType === 'zip'
                    ? 'bg-[#faf5ff] text-[#7c3aed]'
                    : dataNonNull.queriedType === 'city'
                    ? 'bg-[#eff6ff] text-[#2563eb]'
                    : dataNonNull.queriedType === 'county'
                    ? 'bg-[#eef2ff] text-[#4f46e5]'
                    : dataNonNull.queriedType === 'address'
                    ? 'bg-[#fff7ed] text-[#ea580c]'
                    : 'bg-[#fafafa] text-[#525252]'
                }`}>
                  {getTypeLabel()}
                </span>
                <span className={`px-1.5 sm:px-2 py-0.5 rounded text-xs font-semibold shrink-0 ${
                  dataNonNull.source === 'safmr' 
                    ? 'bg-[var(--badge-safmr-bg)] text-[var(--badge-safmr-text)]' 
                    : 'bg-[var(--badge-fmr-bg)] text-[var(--badge-fmr-text)]'
                }`}>
                  {dataNonNull.source === 'safmr' ? 'SAFMR' : 'FMR'}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <div className="text-xs text-[var(--text-tertiary)] truncate">
                  {formatLocation()}
                  {dataNonNull.queriedType === 'zip' && zipVsCountyMedianPercent !== null && zipVsCountyMedianPercent !== undefined
                    ? (
                        <>
                          {' • vs county median '}
                          <PercentageBadge value={zipVsCountyMedianPercent} className="inline" />
                        </>
                      )
                    : ''}
                </div>
                <span className="text-xs text-[var(--text-muted)] shrink-0">•</span>
                <span className="text-xs text-[var(--text-muted)] shrink-0">FY {dataNonNull.year} • Effective Oct 1, {dataNonNull.year - 1}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {getZillowUrl() && (
            <a
              href={getZillowUrl() || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] transition-colors text-xs font-medium text-[var(--text-primary)] shrink-0 flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <span className="hidden sm:inline">View on Zillow</span>
              <span className="sm:hidden">Zillow</span>
            </a>
          )}
        </div>
      </div>

      {/* Investment Score Gauge for County/City/ZIP/Address views */}
      {(dataNonNull.queriedType === 'county' || dataNonNull.queriedType === 'city' || dataNonNull.queriedType === 'zip' || dataNonNull.queriedType === 'address') && (
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-[var(--bg-content)] rounded-lg border border-[var(--border-color)] relative">
          {areaScoreLoading ? (
            <div className="flex items-center gap-4">
              <div className="w-[120px] h-[60px] bg-[var(--border-color)] rounded animate-pulse" />
              <div className="flex-1">
                <div className="h-3 bg-[var(--border-color)] rounded w-32 mb-2 animate-pulse" />
                <div className="h-3 bg-[var(--border-color)] rounded w-48 animate-pulse" />
              </div>
            </div>
          ) : areaScore !== null ? (
            <>
              <ScoreGauge 
                score={areaScore} 
                maxValue={140}
                label={
                  (dataNonNull.queriedType === 'zip' || dataNonNull.queriedType === 'address')
                    ? 'ZIP Investment Score'
                    : dataNonNull.queriedType === 'county'
                      ? dataNonNull.source === 'safmr'
                        ? 'County Median Investment Score'
                        : 'County Investment Score'
                      : dataNonNull.source === 'safmr'
                        ? 'City Median Investment Score'
                        : 'City Investment Score'
                }
                description={
                  (dataNonNull.queriedType === 'zip' || dataNonNull.queriedType === 'address')
                    ? 'Investment Score for this ZIP code'
                    : dataNonNull.source === 'safmr'
                      ? dataNonNull.queriedType === 'county'
                        ? 'Based on median scores across all ZIPs in the county'
                        : 'Based on median scores across all ZIPs in the city'
                      : dataNonNull.queriedType === 'county'
                        ? 'Based on county-level FMR data'
                        : 'Based on city-level FMR data'
                }
              />
              <div className="absolute top-3 right-3">
                <InvestorScoreInfoIcon />
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ZIP codes display - compact for large datasets */}
      {zipCodesToShow.length > zipDisplayLimit && (
        <div className="mb-3">
          <button
            onClick={() => setShowAllZips(!showAllZips)}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium transition-colors mb-2 flex items-center gap-1"
          >
            {showAllZips ? 'Hide' : 'Show'} all ZIP codes
            <span className="text-[var(--text-muted)]">({zipCodesToShow.length})</span>
            <svg
              className={`w-3 h-3 transition-transform ${showAllZips ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showAllZips && (
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg overflow-hidden">
              <div className="max-h-64 overflow-y-auto p-2 sm:p-3 custom-scrollbar">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5 sm:gap-2">
                  {zipCodesToShow.map((zip) => {
                    const zipHref = `/zip/${zip}${dataNonNull.stateCode ? `?state=${dataNonNull.stateCode}` : ''}`;
                    return (
                      <a
                        key={zip}
                        href={zipHref}
                        className="px-2 sm:px-2.5 py-1 sm:py-1.5 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-xs font-mono text-[var(--text-primary)] text-center hover:bg-[var(--bg-hover)] hover:border-[var(--border-secondary)] transition-colors"
                      >
                        {zip}
                      </a>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Compact Table */}
      <div className="overflow-x-auto overflow-y-visible -mx-1 sm:mx-0">
        <div className="max-h-[240px] overflow-y-auto overflow-x-visible custom-scrollbar">
          <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-color)]">
              <th className="text-left py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">BR</th>
              <th className="text-right py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">Rent</th>
              <th className="text-right py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">YoY</th>
              <th className="text-right py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider overflow-visible">
                <div className="flex items-center justify-end gap-1">
                  3Y CAGR
                  <Tooltip content="Compound Annual Growth Rate over 3 years" side="bottom" align="end">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-3.5 h-3.5 text-[var(--text-tertiary)] cursor-help"
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
          <tbody>
            {(() => {
              // Calculate ranges if we have multiple ZIP codes with SAFMR data
              if (dataNonNull.zipFMRData && dataNonNull.zipFMRData.length > 0) {
                const bedroom0Values = dataNonNull.zipFMRData.map(z => z.bedroom0).filter(v => v !== undefined) as number[];
                const bedroom1Values = dataNonNull.zipFMRData.map(z => z.bedroom1).filter(v => v !== undefined) as number[];
                const bedroom2Values = dataNonNull.zipFMRData.map(z => z.bedroom2).filter(v => v !== undefined) as number[];
                const bedroom3Values = dataNonNull.zipFMRData.map(z => z.bedroom3).filter(v => v !== undefined) as number[];
                const bedroom4Values = dataNonNull.zipFMRData.map(z => z.bedroom4).filter(v => v !== undefined) as number[];

                const formatRange = (values: number[]) => {
                  if (values.length === 0) return <span>N/A</span>;
                  const min = Math.min(...values);
                  const max = Math.max(...values);
                  const sorted = [...values].sort((a, b) => a - b);
                  const medianValue = sorted.length % 2 === 0
                    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
                    : sorted[Math.floor(sorted.length / 2)];
                  
                  if (min === max) {
                    return <span>{formatCurrency(min)}</span>;
                  }

                  // Show the range, and put the median on a dedicated line below (SAFMR summary).
                  return (
                    <span className="flex flex-col items-end gap-0.5">
                      <span className="text-[var(--text-primary)]">{formatCurrency(min)} - {formatCurrency(max)}</span>
                      <span className="text-xs text-[var(--text-tertiary)] font-normal font-sans">
                        Median: {formatCurrency(medianValue)}
                      </span>
                    </span>
                  );
                };

                return (
                  <>
                    <tr className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm font-medium text-[var(--text-primary)]">0 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[var(--text-primary)] font-semibold tabular-nums">
                        {formatRange(bedroom0Values)}
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                        <YoYBadge bedroomKey="bedroom0" />
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right text-xs tabular-nums text-[var(--text-primary)]">
                        {(() => {
                          const cagr = cagr3Year('bedroom0');
                          return cagr ? `${cagr.cagr.toFixed(1)}%` : '—';
                        })()}
                      </td>
                    </tr>
                    <tr className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm font-medium text-[var(--text-primary)]">1 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[var(--text-primary)] font-semibold tabular-nums">
                        {formatRange(bedroom1Values)}
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                        <YoYBadge bedroomKey="bedroom1" />
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right text-xs tabular-nums text-[var(--text-primary)]">
                        {(() => {
                          const cagr = cagr3Year('bedroom1');
                          return cagr ? `${cagr.cagr.toFixed(1)}%` : '—';
                        })()}
                      </td>
                    </tr>
                    <tr className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm font-medium text-[var(--text-primary)]">2 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[var(--text-primary)] font-semibold tabular-nums">
                        {formatRange(bedroom2Values)}
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                        <YoYBadge bedroomKey="bedroom2" />
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right text-xs tabular-nums text-[var(--text-primary)]">
                        {(() => {
                          const cagr = cagr3Year('bedroom2');
                          return cagr ? `${cagr.cagr.toFixed(1)}%` : '—';
                        })()}
                      </td>
                    </tr>
                    <tr className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm font-medium text-[var(--text-primary)]">3 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[var(--text-primary)] font-semibold tabular-nums">
                        {formatRange(bedroom3Values)}
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                        <YoYBadge bedroomKey="bedroom3" />
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right text-xs tabular-nums text-[var(--text-primary)]">
                        {(() => {
                          const cagr = cagr3Year('bedroom3');
                          return cagr ? `${cagr.cagr.toFixed(1)}%` : '—';
                        })()}
                      </td>
                    </tr>
                    <tr className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm font-medium text-[var(--text-primary)]">4 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[var(--text-primary)] font-semibold tabular-nums">
                        {formatRange(bedroom4Values)}
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                        <YoYBadge bedroomKey="bedroom4" />
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right text-xs tabular-nums text-[var(--text-primary)]">
                        {(() => {
                          const cagr = cagr3Year('bedroom4');
                          return cagr ? `${cagr.cagr.toFixed(1)}%` : '—';
                        })()}
                      </td>
                    </tr>
                    {(() => {
                      const bedroom4Median = median(bedroom4Values);
                      if (!bedroom4Median) return null;
                      const currentYear = dataNonNull.year;
                      const prevYear = currentYear - 1;
                      const prevYear4BR = historyByYear?.get(prevYear)?.bedroom4 as number | undefined;
                      
                      return [5, 6, 7, 8].map((bedrooms) => {
                        const multiplier = Math.pow(1.15, bedrooms - 4);
                        const rate = Math.round(bedroom4Median * multiplier);
                        
                        // Calculate YoY if we have previous year data
                        let yoyBadge = <span className="text-xs text-[var(--text-muted)]">—</span>;
                        if (prevYear4BR && prevYear4BR > 0) {
                          const prevRate = Math.round(prevYear4BR * multiplier);
                          const delta = rate - prevRate;
                          const pct = (delta / prevRate) * 100;
                          yoyBadge = <PercentageBadge value={pct} className="text-[11px]" />;
                        }
                        
                        // Calculate 3Y CAGR for 5+ BR (using 4BR history)
                        let cagrCell = '—';
                        const prev3Year4BR = historyByYear?.get(currentYear - 3)?.bedroom4 as number | undefined;
                        if (prev3Year4BR && prev3Year4BR > 0) {
                          const prev3Rate = Math.round(prev3Year4BR * multiplier);
                          const ratio = rate / prev3Rate;
                          const cagr = (Math.pow(ratio, 1 / 3) - 1) * 100;
                          cagrCell = `${cagr.toFixed(1)}%`;
                        }

                        return (
                          <tr key={bedrooms} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors">
                            <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm font-medium text-[var(--text-primary)]">{bedrooms} BR</td>
                            <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[var(--text-primary)] font-semibold tabular-nums">
                              {formatCurrency(rate)}
                            </td>
                            <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                              {yoyBadge}
                            </td>
                            <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right text-xs tabular-nums text-[var(--text-primary)]">
                              {cagrCell}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </>
                );
                  } else {
                    // Single FMR data (county FMR or single ZIP)
                    return (
                  <>
                    <tr className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm font-medium text-[var(--text-primary)]">0 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[var(--text-primary)] font-semibold tabular-nums">
                        {formatCurrency(dataNonNull.bedroom0)}
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                        <YoYBadge bedroomKey="bedroom0" />
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right text-xs tabular-nums text-[var(--text-primary)]">
                        {(() => {
                          const cagr = cagr3Year('bedroom0');
                          return cagr ? `${cagr.cagr.toFixed(1)}%` : '—';
                        })()}
                      </td>
                    </tr>
                    <tr className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm font-medium text-[var(--text-primary)]">1 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[var(--text-primary)] font-semibold tabular-nums">
                        {formatCurrency(dataNonNull.bedroom1)}
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                        <YoYBadge bedroomKey="bedroom1" />
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right text-xs tabular-nums text-[var(--text-primary)]">
                        {(() => {
                          const cagr = cagr3Year('bedroom1');
                          return cagr ? `${cagr.cagr.toFixed(1)}%` : '—';
                        })()}
                      </td>
                    </tr>
                    <tr className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm font-medium text-[var(--text-primary)]">2 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[var(--text-primary)] font-semibold tabular-nums">
                        {formatCurrency(dataNonNull.bedroom2)}
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                        <YoYBadge bedroomKey="bedroom2" />
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right text-xs tabular-nums text-[var(--text-primary)]">
                        {(() => {
                          const cagr = cagr3Year('bedroom2');
                          return cagr ? `${cagr.cagr.toFixed(1)}%` : '—';
                        })()}
                      </td>
                    </tr>
                    <tr className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm font-medium text-[var(--text-primary)]">3 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[var(--text-primary)] font-semibold tabular-nums">
                        {formatCurrency(dataNonNull.bedroom3)}
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                        <YoYBadge bedroomKey="bedroom3" />
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right text-xs tabular-nums text-[var(--text-primary)]">
                        {(() => {
                          const cagr = cagr3Year('bedroom3');
                          return cagr ? `${cagr.cagr.toFixed(1)}%` : '—';
                        })()}
                      </td>
                    </tr>
                    <tr className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm font-medium text-[var(--text-primary)]">4 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[var(--text-primary)] font-semibold tabular-nums">
                        {formatCurrency(dataNonNull.bedroom4)}
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                        <YoYBadge bedroomKey="bedroom4" />
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right text-xs tabular-nums text-[var(--text-primary)]">
                        {(() => {
                          const cagr = cagr3Year('bedroom4');
                          return cagr ? `${cagr.cagr.toFixed(1)}%` : '—';
                        })()}
                      </td>
                    </tr>
                    {(() => {
                      const base4 = dataNonNull.bedroom4;
                      if (!base4) return null;
                      const currentYear = dataNonNull.year;
                      const prevYear = currentYear - 1;
                      const prevYear4BR = historyByYear?.get(prevYear)?.bedroom4 as number | undefined;
                      
                      return [5, 6, 7, 8].map((bedrooms) => {
                        const multiplier = Math.pow(1.15, bedrooms - 4);
                        const rate = Math.round(base4 * multiplier);
                        
                        // Calculate YoY if we have previous year data
                        let yoyBadge = <span className="text-xs text-[var(--text-muted)]">—</span>;
                        if (prevYear4BR && prevYear4BR > 0) {
                          const prevRate = Math.round(prevYear4BR * multiplier);
                          const delta = rate - prevRate;
                          const pct = (delta / prevRate) * 100;
                          yoyBadge = <PercentageBadge value={pct} className="text-[11px]" />;
                        }
                        
                        // Calculate 3Y CAGR for 5+ BR (using 4BR history)
                        let cagrCell = '—';
                        const prev3Year4BR = historyByYear?.get(currentYear - 3)?.bedroom4 as number | undefined;
                        if (prev3Year4BR && prev3Year4BR > 0) {
                          const prev3Rate = Math.round(prev3Year4BR * multiplier);
                          const ratio = rate / prev3Rate;
                          const cagr = (Math.pow(ratio, 1 / 3) - 1) * 100;
                          cagrCell = `${cagr.toFixed(1)}%`;
                        }

                        return (
                          <tr key={bedrooms} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors">
                            <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm font-medium text-[var(--text-primary)]">{bedrooms} BR</td>
                            <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[var(--text-primary)] font-semibold tabular-nums">
                              {formatCurrency(rate)}
                            </td>
                            <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                              {yoyBadge}
                            </td>
                            <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right text-xs tabular-nums text-[var(--text-primary)]">
                              {cagrCell}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </>
                );
              }
            })()}
          </tbody>
        </table>
        </div>
      </div>

      {/* Bedroom curve chart below table */}
      {dataNonNull.history && dataNonNull.history.length >= 2 && (
        <div className="mt-3 sm:mt-4">
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 sm:p-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Bedroom curve</h3>
              <div className="text-xs text-[var(--text-tertiary)]">
                YoY: {dataNonNull.year - 1}→{dataNonNull.year} • 3Y: {dataNonNull.year - 3}→{dataNonNull.year}
              </div>
            </div>
            <StateBedroomCurveChart
              rows={[
                { br: 0, medianFMR: representative.bedroom0 || null, medianYoY: yoyChange('bedroom0')?.pct || null },
                { br: 1, medianFMR: representative.bedroom1 || null, medianYoY: yoyChange('bedroom1')?.pct || null },
                { br: 2, medianFMR: representative.bedroom2 || null, medianYoY: yoyChange('bedroom2')?.pct || null },
                { br: 3, medianFMR: representative.bedroom3 || null, medianYoY: yoyChange('bedroom3')?.pct || null },
                { br: 4, medianFMR: representative.bedroom4 || null, medianYoY: yoyChange('bedroom4')?.pct || null },
              ]}
            />
          </div>
        </div>
      )}

      {/* Historical (below current section) */}
      {dataNonNull.history && dataNonNull.history.length >= 2 && (
        <HistoricalFMRChart history={dataNonNull.history} />
      )}
    </div>
  );
}


