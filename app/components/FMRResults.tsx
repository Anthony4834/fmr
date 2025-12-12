'use client';

import { useEffect, useState } from 'react';
import type { FMRResult } from '@/lib/types';

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
          <table className="w-full border-collapse">
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

  // Get ZIP codes to display
  const zipCodesToShow = dataNonNull.zipCodes && dataNonNull.zipCodes.length > 0 
    ? dataNonNull.zipCodes 
    : (dataNonNull.zipCode ? [dataNonNull.zipCode] : []);
  
  const hasManyZips = zipCodesToShow.length > 10;
  const zipDisplayLimit = 8;

  return (
    <div className="mt-4 sm:mt-6">
      {/* Breadcrumbs (drilldown) */}
      {breadcrumbs && onBreadcrumbBack && (
        <div className="mb-3 sm:mb-4 flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-[#737373] min-w-0 flex-1">
            <button
              type="button"
              onClick={onBreadcrumbBack}
              className="hover:text-[#0a0a0a] font-medium transition-colors truncate"
            >
              {breadcrumbs.parentLabel}
            </button>
            <span className="text-[#a3a3a3] shrink-0">/</span>
            <span className="text-[#0a0a0a] font-semibold truncate">{breadcrumbs.zipCode}</span>
          </div>
          <button
            type="button"
            onClick={onBreadcrumbBack}
            className="text-xs font-semibold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-[#e5e5e5] bg-white hover:bg-[#fafafa] transition-colors shrink-0"
          >
            Back
          </button>
        </div>
      )}

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
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[#e5e5e5]">
              <th className="text-left py-2 px-2 sm:px-3 font-medium text-[#737373] text-xs uppercase tracking-wider">Bedroom</th>
              <th className="text-right py-2 px-2 sm:px-3 font-medium text-[#737373] text-xs uppercase tracking-wider">Rent</th>
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
                  const median = sorted.length % 2 === 0
                    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
                    : sorted[Math.floor(sorted.length / 2)];
                  
                  if (min === max) {
                    return <span>{formatCurrency(min)}</span>;
                  }
                  
                  // For large datasets, show range with median
                  if (values.length > 15) {
                    return (
                      <span className="flex flex-col items-end gap-0.5">
                        <span>{formatCurrency(min)} - {formatCurrency(max)}</span>
                        <span className="text-xs text-[#737373] font-normal">Median: {formatCurrency(median)}</span>
                      </span>
                    );
                  }
                  
                  return <span>{formatCurrency(min)} - {formatCurrency(max)}</span>;
                };

                return (
                  <>
                    <tr className="border-b border-[#e5e5e5] hover:bg-[#fafafa] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[#0a0a0a]">0 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[#0a0a0a] font-semibold tabular-nums">
                        {formatRange(bedroom0Values)}
                      </td>
                    </tr>
                    <tr className="border-b border-[#e5e5e5] hover:bg-[#fafafa] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[#0a0a0a]">1 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[#0a0a0a] font-semibold tabular-nums">
                        {formatRange(bedroom1Values)}
                      </td>
                    </tr>
                    <tr className="border-b border-[#e5e5e5] hover:bg-[#fafafa] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[#0a0a0a]">2 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[#0a0a0a] font-semibold tabular-nums">
                        {formatRange(bedroom2Values)}
                      </td>
                    </tr>
                    <tr className="border-b border-[#e5e5e5] hover:bg-[#fafafa] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[#0a0a0a]">3 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[#0a0a0a] font-semibold tabular-nums">
                        {formatRange(bedroom3Values)}
                      </td>
                    </tr>
                    <tr className="hover:bg-[#fafafa] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[#0a0a0a]">4 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[#0a0a0a] font-semibold tabular-nums">
                        {formatRange(bedroom4Values)}
                      </td>
                    </tr>
                  </>
                );
                  } else {
                    // Single FMR data (county FMR or single ZIP)
                    return (
                  <>
                    <tr className="border-b border-[#e5e5e5] hover:bg-[#fafafa] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[#0a0a0a]">0 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[#0a0a0a] font-semibold tabular-nums">{formatCurrency(dataNonNull.bedroom0)}</td>
                    </tr>
                    <tr className="border-b border-[#e5e5e5] hover:bg-[#fafafa] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[#0a0a0a]">1 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[#0a0a0a] font-semibold tabular-nums">{formatCurrency(dataNonNull.bedroom1)}</td>
                    </tr>
                    <tr className="border-b border-[#e5e5e5] hover:bg-[#fafafa] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[#0a0a0a]">2 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[#0a0a0a] font-semibold tabular-nums">{formatCurrency(dataNonNull.bedroom2)}</td>
                    </tr>
                    <tr className="border-b border-[#e5e5e5] hover:bg-[#fafafa] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[#0a0a0a]">3 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[#0a0a0a] font-semibold tabular-nums">{formatCurrency(dataNonNull.bedroom3)}</td>
                    </tr>
                    <tr className="hover:bg-[#fafafa] transition-colors">
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[#0a0a0a]">4 BR</td>
                      <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[#0a0a0a] font-semibold tabular-nums">{formatCurrency(dataNonNull.bedroom4)}</td>
                    </tr>
                  </>
                );
              }
            })()}
          </tbody>
        </table>
      </div>

      <div className="mt-3 sm:mt-4 pt-2 sm:pt-3 border-t border-[#e5e5e5]">
        <p className="text-xs text-[#a3a3a3] leading-relaxed">
          {dataNonNull.source === 'safmr' 
            ? 'Small Area Fair Market Rent (SAFMR) - ZIP code level rates for designated metropolitan areas'
            : 'Fair Market Rent (FMR) - County/metropolitan area level rates'}
        </p>
      </div>
    </div>
  );
}


