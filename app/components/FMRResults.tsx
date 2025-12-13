'use client';

import { useEffect, useState } from 'react';
import type { FMRResult } from '@/lib/types';
import HistoricalFMRChart from '@/app/components/HistoricalFMRChart';
import { buildCitySlug, buildCountySlug } from '@/lib/location-slugs';

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
  const [showAllZips, setShowAllZips] = useState(false);

  // Reset ZIP display state when data changes
  useEffect(() => {
    setShowAllZips(false);
  }, [data]);

  if (loading) {
    return (
      <div className="mt-6">
        {/* Compact Header Skeleton */}
        <div className="mb-5">
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <div className="h-6 bg-[#e5e5e5] rounded w-48 animate-pulse"></div>
                <div className="h-5 bg-[#e5e5e5] rounded w-16 animate-pulse"></div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="h-4 bg-[#e5e5e5] rounded w-32 animate-pulse"></div>
                <div className="h-4 bg-[#e5e5e5] rounded w-24 animate-pulse"></div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="h-6 bg-[#e5e5e5] rounded w-16 animate-pulse"></div>
              <div className="h-6 bg-[#e5e5e5] rounded w-12 animate-pulse"></div>
            </div>
          </div>
          <div className="h-3 bg-[#e5e5e5] rounded w-40 animate-pulse"></div>
        </div>

        {/* Table Skeleton */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse max-h-[280px] overflow-y-auto">
            <thead>
              <tr className="border-b border-[#e5e5e5]">
                <th className="text-left py-2 px-3 font-medium text-[#737373] text-xs uppercase tracking-wider">Bedroom</th>
                <th className="text-right py-2 px-3 font-medium text-[#737373] text-xs uppercase tracking-wider">Rent</th>
              </tr>
            </thead>
            <tbody>
              {[...Array(5)].map((_, i) => (
                <tr key={i} className="border-b border-[#e5e5e5]">
                  <td className="py-2 px-3">
                    <div className="h-4 bg-[#e5e5e5] rounded w-20 animate-pulse"></div>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <div className="h-4 bg-[#e5e5e5] rounded w-24 ml-auto animate-pulse"></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer Skeleton */}
        <div className="mt-4 pt-3 border-t border-[#e5e5e5]">
          <div className="h-3 bg-[#e5e5e5] rounded w-64 animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 p-4 bg-[#fef2f2] border border-[#fecaca] rounded-lg">
        <p className="text-[#991b1b] font-semibold text-sm mb-1">Error</p>
        <p className="text-[#dc2626] text-sm">{error}</p>
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
        const countyDisplay = dataNonNull.countyName.includes('County') 
          ? dataNonNull.countyName 
          : `${dataNonNull.countyName} County`;
        return `${countyDisplay}, ${dataNonNull.stateCode}`;
      }
      return dataNonNull.stateCode;
    }
    
    // For other query types, show county/state as before
    if (dataNonNull.countyName) {
      // Ensure county name includes "County" suffix if not already present
      const countyDisplay = dataNonNull.countyName.includes('County') 
        ? dataNonNull.countyName 
        : `${dataNonNull.countyName} County`;
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

  const BreadcrumbRow = () => {
    const isDrilldown = !!onBreadcrumbBack;
    const state = dataNonNull.stateCode;
    const county = dataNonNull.countyName;
    const city = dataNonNull.cityName;
    const zip =
      (dataNonNull.queriedType === 'zip' && zipCodesToShow.length > 0 ? zipCodesToShow[0] : null) ||
      (dataNonNull.zipCode ? dataNonNull.zipCode : null);

    const crumbs: { label: string; href?: string; onClick?: () => void }[] = [];

    // Prepend Home only on county-level pages (as requested)
    if (dataNonNull.queriedType === 'county') {
      crumbs.push({ label: 'Home', href: '/' });
    }

    if (county && state) {
      crumbs.push({ label: county.includes('County') ? county : `${county} County`, href: `/county/${buildCountySlug(county, state)}` });
    }
    if (city && state) {
      crumbs.push({ label: `${city}, ${state}`, href: `/city/${buildCitySlug(city, state)}` });
    }

    // Only show ZIP crumb when the user is actually viewing a ZIP/address result.
    // City/county views may carry a representative ZIP internally; don't show it.
    const showZipCrumb = dataNonNull.queriedType === 'zip' || dataNonNull.queriedType === 'address';
    if (showZipCrumb && zip && /^\d{5}$/.test(String(zip))) {
      crumbs.push({ label: String(zip), href: `/zip/${zip}` });
    }

    if (crumbs.length === 0) return null;

    const backHref = !isDrilldown && crumbs.length >= 2 ? crumbs[crumbs.length - 2]?.href : undefined;
    const lastIndex = crumbs.length - 1;

    return (
      <div className="mb-3 sm:mb-4 flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-semibold text-[#525252] min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1 min-w-0">
            {crumbs.map((c, idx) => {
              const isLast = idx === lastIndex;
              return (
                <span key={`${c.label}-${idx}`} className="flex items-center gap-1 min-w-0">
                  {idx > 0 && <span className="text-[#a3a3a3] shrink-0">/</span>}
                  {isLast ? (
                    <span className="text-[#0a0a0a] font-semibold truncate">{c.label}</span>
                  ) : c.onClick ? (
                    <button
                      type="button"
                      onClick={c.onClick}
                      className="hover:text-[#0a0a0a] transition-colors truncate"
                    >
                      {c.label}
                    </button>
                  ) : c.href ? (
                    <a className="hover:text-[#0a0a0a] transition-colors truncate" href={c.href}>
                      {c.label}
                    </a>
                  ) : (
                    <span className="truncate">{c.label}</span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
        {isDrilldown && onBreadcrumbBack ? (
          <button
            type="button"
            onClick={onBreadcrumbBack}
            className="text-xs font-semibold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-[#e5e5e5] bg-white hover:bg-[#fafafa] transition-colors shrink-0"
          >
            Back
          </button>
        ) : backHref ? (
          <a
            className="text-xs font-semibold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-[#e5e5e5] bg-white hover:bg-[#fafafa] transition-colors shrink-0"
            href={backHref}
          >
            Back
          </a>
        ) : null}
      </div>
    );
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
      // Remove "County" suffix if present, format: lowercase, replace spaces with hyphens
      const cleaned = countyName.replace(/\s+county$/i, '').trim();
      const formatted = cleaned
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      return `https://www.zillow.com/${formatted}-county-${stateCodeLower}/`;
    }
    
    // For address queries, try to use county or zip if available
    if (dataNonNull.queriedType === 'address') {
      if (zipCodesToShow.length > 0) {
        return `https://www.zillow.com/${zipCodesToShow[0]}/`;
      }
      if (dataNonNull.countyName) {
        const cleaned = dataNonNull.countyName.replace(/\s+county$/i, '').trim();
        const formatted = cleaned
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim();
        return `https://www.zillow.com/${formatted}-county-${stateCodeLower}/`;
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

  const YoYBadge = ({ bedroomKey }: { bedroomKey: keyof typeof representative }) => {
    const c = yoyChange(bedroomKey);
    if (!c) return <span className="text-xs text-[#a3a3a3]">—</span>;
    const isPositive = c.pct > 0.0001;
    const isNegative = c.pct < -0.0001;
    const cls = isPositive
      ? 'bg-[#f0fdf4] text-[#16a34a]'
      : isNegative
        ? 'bg-[#fef2f2] text-[#dc2626]'
        : 'bg-[#fafafa] text-[#525252]';
    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold tabular-nums ${cls}`}
        title={`YoY change vs FY ${c.prevYear}`}
      >
        {c.pct > 0 ? '+' : ''}
        {c.pct.toFixed(1)}%
      </span>
    );
  };

  return (
    <div className="mt-4 sm:mt-6">
      {/* Breadcrumbs (county -> city -> zip) + Back */}
      <BreadcrumbRow />

      {/* Compact Header */}
      <div className="mb-4 sm:mb-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 min-w-0">
              <h2 className="text-base sm:text-xl font-semibold text-[#0a0a0a] tracking-tight leading-tight min-w-0 truncate sm:overflow-visible sm:whitespace-normal sm:text-clip">
                {getMainTitle()}
              </h2>
              {zipCodesToShow.length > 0 && dataNonNull.queriedType !== 'address' && (
                <span className="px-1.5 sm:px-2 py-0.5 rounded text-xs font-medium bg-[#fafafa] text-[#737373] border border-[#e5e5e5] shrink-0">
                  {zipCodesToShow.length} ZIP{zipCodesToShow.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 flex-wrap">
              <span className="text-xs sm:text-sm text-[#737373]">{formatLocation()}</span>
              {zipCodesToShow.length > 0 && zipCodesToShow.length <= zipDisplayLimit && dataNonNull.queriedType !== 'address' && (
                <span className="text-xs text-[#a3a3a3] break-words">
                  {zipCodesToShow.join(', ')}
                </span>
              )}
              {dataNonNull.queriedType === 'address' && zipCodesToShow.length > 0 && zipCodesToShow.length <= zipDisplayLimit && (
                <span className="text-xs text-[#a3a3a3] break-words">
                  {zipCodesToShow.join(', ')}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap shrink-0">
            {getZillowUrl() && (
              <a
                href={getZillowUrl() || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg border border-[#e5e5e5] bg-white hover:bg-[#fafafa] transition-colors text-xs font-medium text-[#0a0a0a] shrink-0 flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <span className="hidden sm:inline">View on Zillow</span>
                <span className="sm:hidden">Zillow</span>
              </a>
            )}
            {dataNonNull.queriedLocation && (
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
            )}
            {dataNonNull.queriedType === 'zip' && zipVsCountyMedianPercent !== null && zipVsCountyMedianPercent !== undefined && (
              <span
                className={`px-1.5 sm:px-2 py-0.5 rounded text-xs font-semibold tabular-nums shrink-0 ${
                  zipVsCountyMedianPercent > 0
                    ? 'bg-[#f0fdf4] text-[#16a34a]'
                    : zipVsCountyMedianPercent < 0
                    ? 'bg-[#fef2f2] text-[#dc2626]'
                    : 'bg-[#fafafa] text-[#525252]'
                }`}
                title="Compared to the county median average FMR"
              >
                {zipVsCountyMedianPercent > 0 ? '+' : ''}
                {zipVsCountyMedianPercent.toFixed(1)}%
              </span>
            )}
            <span className={`px-1.5 sm:px-2 py-0.5 rounded text-xs font-semibold shrink-0 ${
              dataNonNull.source === 'safmr' 
                ? 'bg-[#f0fdf4] text-[#16a34a]' 
                : 'bg-[#eff6ff] text-[#2563eb]'
            }`}>
              {dataNonNull.source === 'safmr' ? 'SAFMR' : 'FMR'}
            </span>
          </div>
        </div>
        
        {/* ZIP codes display - compact for large datasets */}
        {zipCodesToShow.length > zipDisplayLimit && (
          <div className="mb-3">
            <button
              onClick={() => setShowAllZips(!showAllZips)}
              className="text-xs text-[#525252] hover:text-[#0a0a0a] font-medium transition-colors mb-2 flex items-center gap-1"
            >
              {showAllZips ? 'Hide' : 'Show'} all ZIP codes
              <span className="text-[#a3a3a3]">({zipCodesToShow.length})</span>
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
              <div className="bg-white border border-[#e5e5e5] rounded-lg overflow-hidden">
                <div className="max-h-64 overflow-y-auto p-2 sm:p-3 custom-scrollbar">
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5 sm:gap-2">
                    {zipCodesToShow.map((zip) => (
                      <div
                        key={zip}
                        className="px-2 sm:px-2.5 py-1 sm:py-1.5 bg-[#fafafa] border border-[#e5e5e5] rounded text-xs font-mono text-[#0a0a0a] text-center hover:bg-[#f5f5f5] hover:border-[#d4d4d4] transition-colors"
                      >
                        {zip}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        
        <div className="text-xs text-[#a3a3a3]">
          FY {dataNonNull.year} • Effective {formatDate(dataNonNull.effectiveDate)}
        </div>
      </div>

      {/* Compact Table */}
      <div className="overflow-x-auto -mx-1 sm:mx-0">
        <div className="max-h-[240px] overflow-y-auto custom-scrollbar">
          <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[#e5e5e5]">
              <th className="text-left py-2 px-2 sm:px-3 font-medium text-[#737373] text-xs uppercase tracking-wider">Bedroom</th>
              <th className="text-right py-2 px-2 sm:px-3 font-medium text-[#737373] text-xs uppercase tracking-wider">Rent</th>
              <th className="text-right py-2 px-2 sm:px-3 font-medium text-[#737373] text-xs uppercase tracking-wider">YoY</th>
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
                      <span>{formatCurrency(min)} - {formatCurrency(max)}</span>
                      <span className="text-xs text-[#737373] font-normal font-sans">
                        Median: {formatCurrency(medianValue)}
                      </span>
                    </span>
                  );
                };

                return (
                  <>
                    <tr className="border-b border-[#e5e5e5] hover:bg-[#fafafa] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[#0a0a0a]">0 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[#525252] font-semibold tabular-nums">
                        {formatRange(bedroom0Values)}
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                        <YoYBadge bedroomKey="bedroom0" />
                      </td>
                    </tr>
                    <tr className="border-b border-[#e5e5e5] hover:bg-[#fafafa] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[#0a0a0a]">1 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[#525252] font-semibold tabular-nums">
                        {formatRange(bedroom1Values)}
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                        <YoYBadge bedroomKey="bedroom1" />
                      </td>
                    </tr>
                    <tr className="border-b border-[#e5e5e5] hover:bg-[#fafafa] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[#0a0a0a]">2 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[#525252] font-semibold tabular-nums">
                        {formatRange(bedroom2Values)}
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                        <YoYBadge bedroomKey="bedroom2" />
                      </td>
                    </tr>
                    <tr className="border-b border-[#e5e5e5] hover:bg-[#fafafa] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[#0a0a0a]">3 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[#525252] font-semibold tabular-nums">
                        {formatRange(bedroom3Values)}
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                        <YoYBadge bedroomKey="bedroom3" />
                      </td>
                    </tr>
                    <tr className="border-b border-[#e5e5e5] hover:bg-[#fafafa] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[#0a0a0a]">4 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[#525252] font-semibold tabular-nums">
                        {formatRange(bedroom4Values)}
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                        <YoYBadge bedroomKey="bedroom4" />
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
                        let yoyBadge = <span className="text-xs text-[#a3a3a3]">—</span>;
                        if (prevYear4BR && prevYear4BR > 0) {
                          const prevRate = Math.round(prevYear4BR * multiplier);
                          const delta = rate - prevRate;
                          const pct = (delta / prevRate) * 100;
                          const isPositive = pct > 0.0001;
                          const isNegative = pct < -0.0001;
                          const cls = isPositive
                            ? 'bg-[#f0fdf4] text-[#16a34a]'
                            : isNegative
                              ? 'bg-[#fef2f2] text-[#dc2626]'
                              : 'bg-[#fafafa] text-[#525252]';
                          yoyBadge = (
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold tabular-nums ${cls}`}
                              title={`YoY change vs FY ${prevYear}`}
                            >
                              {pct > 0 ? '+' : ''}
                              {pct.toFixed(1)}%
                            </span>
                          );
                        }
                        
                        return (
                          <tr key={bedrooms} className="border-b border-[#e5e5e5] hover:bg-[#fafafa] transition-colors">
                            <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[#0a0a0a]">{bedrooms} BR</td>
                            <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[#525252] font-semibold tabular-nums">
                              {formatCurrency(rate)}
                            </td>
                            <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                              {yoyBadge}
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
                    <tr className="border-b border-[#e5e5e5] hover:bg-[#fafafa] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[#0a0a0a]">0 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[#525252] font-semibold tabular-nums">
                        {formatCurrency(dataNonNull.bedroom0)}
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                        <YoYBadge bedroomKey="bedroom0" />
                      </td>
                    </tr>
                    <tr className="border-b border-[#e5e5e5] hover:bg-[#fafafa] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[#0a0a0a]">1 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[#525252] font-semibold tabular-nums">
                        {formatCurrency(dataNonNull.bedroom1)}
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                        <YoYBadge bedroomKey="bedroom1" />
                      </td>
                    </tr>
                    <tr className="border-b border-[#e5e5e5] hover:bg-[#fafafa] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[#0a0a0a]">2 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[#525252] font-semibold tabular-nums">
                        {formatCurrency(dataNonNull.bedroom2)}
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                        <YoYBadge bedroomKey="bedroom2" />
                      </td>
                    </tr>
                    <tr className="border-b border-[#e5e5e5] hover:bg-[#fafafa] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[#0a0a0a]">3 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[#525252] font-semibold tabular-nums">
                        {formatCurrency(dataNonNull.bedroom3)}
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                        <YoYBadge bedroomKey="bedroom3" />
                      </td>
                    </tr>
                    <tr className="border-b border-[#e5e5e5] hover:bg-[#fafafa] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[#0a0a0a]">4 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[#525252] font-semibold tabular-nums">
                        {formatCurrency(dataNonNull.bedroom4)}
                      </td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                        <YoYBadge bedroomKey="bedroom4" />
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
                        let yoyBadge = <span className="text-xs text-[#a3a3a3]">—</span>;
                        if (prevYear4BR && prevYear4BR > 0) {
                          const prevRate = Math.round(prevYear4BR * multiplier);
                          const delta = rate - prevRate;
                          const pct = (delta / prevRate) * 100;
                          const isPositive = pct > 0.0001;
                          const isNegative = pct < -0.0001;
                          const cls = isPositive
                            ? 'bg-[#f0fdf4] text-[#16a34a]'
                            : isNegative
                              ? 'bg-[#fef2f2] text-[#dc2626]'
                              : 'bg-[#fafafa] text-[#525252]';
                          yoyBadge = (
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold tabular-nums ${cls}`}
                              title={`YoY change vs FY ${prevYear}`}
                            >
                              {pct > 0 ? '+' : ''}
                              {pct.toFixed(1)}%
                            </span>
                          );
                        }
                        
                        return (
                          <tr key={bedrooms} className="border-b border-[#e5e5e5] hover:bg-[#fafafa] transition-colors">
                            <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[#0a0a0a]">{bedrooms} BR</td>
                            <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[#525252] font-semibold tabular-nums">
                              {formatCurrency(rate)}
                            </td>
                            <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                              {yoyBadge}
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

      <div className="mt-3 sm:mt-4 pt-2 sm:pt-3 border-t border-[#e5e5e5]">
        <p className="text-xs text-[#a3a3a3] leading-relaxed">
          {dataNonNull.source === 'safmr' 
            ? 'Small Area Fair Market Rent (SAFMR) - ZIP code level rates for designated metropolitan areas'
            : 'Fair Market Rent (FMR) - County/metropolitan area level rates'}
          {representative.bedroom4 && (
            <span className="block mt-1.5 text-[#737373]">
              5+ BR rates calculated using HUD formula: +15% per additional bedroom from 4BR rate.
            </span>
          )}
        </p>
      </div>

      {/* Historical (below current section) */}
      {dataNonNull.history && dataNonNull.history.length >= 2 && (
        <HistoricalFMRChart history={dataNonNull.history} />
      )}
    </div>
  );
}


