'use client';

import Link from 'next/link';
import ScoreGauge from './ScoreGauge';
import InvestorScoreInfoIcon from './InvestorScoreInfoIcon';
import AppHeader from './AppHeader';
import { formatCountyName } from '@/lib/county-utils';

interface IncompleteGeoViewProps {
  geoType: 'city' | 'county' | 'zip';
  name: string;
  stateCode: string;
  countyName?: string;
  year: number;
  zipCount?: number;
  medianScore: number | null;
  avgYield?: number | null;
  avgPropertyValue?: number | null;
  avgAnnualRent?: number | null;
}

export default function IncompleteGeoView({
  geoType,
  name,
  stateCode,
  countyName,
  year,
  zipCount,
  medianScore,
  avgYield,
  avgPropertyValue,
  avgAnnualRent,
}: IncompleteGeoViewProps) {
  const geoLabel = geoType === 'city' ? 'city' : geoType === 'county' ? 'county' : 'ZIP code';

  const formatCurrency = (value?: number | null) => {
    if (!value) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value?: number | null) => {
    if (!value) return 'N/A';
    return `${(value * 100).toFixed(2)}%`;
  };

  // Build Zillow URL based on location type
  const getZillowUrl = (): string | null => {
    const stateCodeLower = stateCode.toLowerCase();

    if (geoType === 'zip') {
      // For ZIP, use the name directly (assuming it's the ZIP code)
      if (!name || !/^\d{5}$/.test(name)) return null;
      return `https://www.zillow.com/${name}/`;
    }

    if (geoType === 'city') {
      // Format: lowercase, replace spaces with hyphens, remove special chars
      const formatted = name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      return `https://www.zillow.com/${formatted}-${stateCodeLower}/`;
    }

    if (geoType === 'county') {
      // Remove "County" or "Parish" suffix if present, format: lowercase, replace spaces with hyphens
      const cleaned = name.replace(/\s+(county|parish)$/i, '').trim();
      const formatted = cleaned
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      const regionalUnit = stateCode.toUpperCase() === 'LA' ? 'parish' : 'county';
      return `https://www.zillow.com/${formatted}-${regionalUnit}-${stateCodeLower}/`;
    }

    return null;
  };

  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 sm:py-8 md:py-10 lg:py-10">
        {/* Header with Logo and Search */}
        <AppHeader
          showSearch={true}
          className="mb-6"
        />

        <div className="mt-4 sm:mt-6">
      {/* Breadcrumbs */}
      <div className="mb-3 flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] flex-wrap">
        <Link href="/" className="hover:text-[var(--text-primary)] transition-colors">Home</Link>
        <span className="text-[var(--text-muted)]">/</span>
        <Link href={`/state/${stateCode}`} className="hover:text-[var(--text-primary)] transition-colors">{stateCode}</Link>
        <span className="text-[var(--text-muted)]">/</span>
        <span className="text-[var(--text-primary)] font-medium">{name}</span>
      </div>

      {/* Header */}
      <div className="mb-4 sm:mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <Link
              href={`/state/${stateCode}`}
              aria-label="Back"
              title="Back"
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] transition-colors shrink-0"
            >
              ←
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <div className="text-sm sm:text-base font-semibold text-[var(--text-primary)] truncate">
                  {name}, {stateCode}
                </div>
                <span className={`px-1.5 sm:px-2 py-0.5 rounded text-xs font-medium shrink-0 border border-[var(--border-color)] ${
                  geoType === 'city'
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    : geoType === 'county'
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                }`}>
                  {geoType === 'city' ? 'City' : geoType === 'county' ? 'County' : 'ZIP'}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {countyName && (
                  <>
                    <div className="text-xs text-[var(--text-tertiary)] truncate">
                      {formatCountyName(countyName, stateCode)}, {stateCode}
                    </div>
                    <span className="text-xs text-[var(--text-muted)] shrink-0">•</span>
                  </>
                )}
                <span className="text-xs text-[var(--text-muted)] shrink-0">FY {year}</span>
                {zipCount && zipCount > 0 && (
                  <>
                    <span className="text-xs text-[var(--text-muted)] shrink-0">•</span>
                    <span className="text-xs text-[var(--text-muted)] shrink-0">{zipCount} ZIP{zipCount !== 1 ? 's' : ''}</span>
                  </>
                )}
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

      {/* Banner */}
      <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-lg">
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">
            <svg className="w-5 h-5 text-[var(--warning-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--warning-text)] mb-1">Limited Data Available</h3>
            <p className="text-xs text-[var(--warning-text-secondary)]">
              We haven&apos;t fully indexed this {geoLabel} yet. Investment score data is available, but detailed FMR rent limits are not. Check back later for complete data.
            </p>
          </div>
        </div>
      </div>

      {/* Investment Score (if available) */}
      {medianScore !== null && (
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-color)] relative">
          <ScoreGauge
            score={medianScore}
            maxValue={140}
            label={`${geoType === 'city' ? 'City' : geoType === 'county' ? 'County' : 'ZIP'} Median Investment Score`}
            description={`Based on ${zipCount || 0} ZIP code${zipCount !== 1 ? 's' : ''} in this ${geoLabel}`}
          />
          <div className="absolute top-3 right-3">
            <InvestorScoreInfoIcon />
          </div>
        </div>
      )}

      {/* Available Stats */}
      {(avgPropertyValue || avgAnnualRent || avgYield) && (
        <div className="mb-4 sm:mb-6">
          <h3 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">Available Stats</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {avgPropertyValue && (
              <div className="p-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg">
                <div className="text-xs text-[var(--text-tertiary)] mb-1">Avg. Property Value</div>
                <div className="text-lg font-semibold text-[var(--text-primary)]">{formatCurrency(avgPropertyValue)}</div>
              </div>
            )}
            {avgAnnualRent && (
              <div className="p-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg">
                <div className="text-xs text-[var(--text-tertiary)] mb-1">Avg. Annual Rent</div>
                <div className="text-lg font-semibold text-[var(--text-primary)]">{formatCurrency(avgAnnualRent)}</div>
              </div>
            )}
            {avgYield && (
              <div className="p-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg">
                <div className="text-xs text-[var(--text-tertiary)] mb-1">Avg. Net Yield</div>
                <div className="text-lg font-semibold text-[var(--text-primary)]">{formatPercent(avgYield)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FMR Table Placeholder */}
      <div className="opacity-50">
        <div className="overflow-x-auto -mx-1 sm:mx-0">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-color)]">
                <th className="text-left py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">BR</th>
                <th className="text-right py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">Rent</th>
                <th className="hidden sm:table-cell text-right py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">3Y CAGR</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4].map((br) => (
                <tr key={br} className="border-b border-[var(--border-color)]">
                  <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm text-[var(--text-muted)]">{br} BR</td>
                  <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right text-sm text-[var(--text-muted)]">—</td>
                  <td className="hidden sm:table-cell py-2.5 sm:py-2 px-2 sm:px-3 text-right text-sm text-[var(--text-muted)]">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-2 text-center italic">FMR rent data not yet available</p>
      </div>
        </div>
      </div>
    </main>
  );
}
