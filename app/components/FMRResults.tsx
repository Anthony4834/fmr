'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FMRResult } from '@/lib/types';
import HistoricalFMRChart from '@/app/components/HistoricalFMRChart';
import StateBedroomCurveChart from '@/app/components/StateBedroomCurveChart';
import VoucherStrengthChart, { type ChartRow } from '@/app/components/VoucherStrengthChart';
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
  const [areaScore, setAreaScore] = useState<number | null>(null);
  const [scoreMetadata, setScoreMetadata] = useState<{ zhviMonth: string | null; acsVintage: number | null } | null>(null);
  const [scoreConfidence, setScoreConfidence] = useState<{
    confidenceScore: number | null;
    // ZIP/address-level fields
    marketRentMissing?: boolean;
    zordiMetro?: string | null;
    demandScore?: number | null;
    // county/city aggregate fields (0–1 fractions)
    marketRentMissingPct?: number | null;
    demandMissingPct?: number | null;
  } | null>(null);
  const [dataFreshness, setDataFreshness] = useState<{
    zhviLatestMonth: string | null;
    acsLatestVintage: number | null;
    mortgageFetchedAt: string | null;
  } | null>(null);
  // Initialize loading to true if we have data that should trigger a fetch
  const [areaScoreLoading, setAreaScoreLoading] = useState(() => {
    if (!data) return false;
    const shouldFetch = (data.queriedType === 'zip' || data.queriedType === 'address') && data.zipCode
      || (data.queriedType === 'county' && data.countyName && data.stateCode)
      || (data.queriedType === 'city' && data.cityName && data.stateCode);
    return shouldFetch;
  });


  // Fetch investment score for county/city/zip/address views
  useEffect(() => {
    if (!data) {
      setAreaScore(null);
      setAreaScoreLoading(false);
      return;
    }

    // Check if we should fetch before setting loading state
    const shouldFetch = (data.queriedType === 'zip' || data.queriedType === 'address') && data.zipCode
      || (data.queriedType === 'county' && data.countyName && data.stateCode)
      || (data.queriedType === 'city' && data.cityName && data.stateCode);
    
    if (!shouldFetch) {
      setAreaScore(null);
      setAreaScoreLoading(false);
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
          setScoreMetadata({
            zhviMonth: result.zhviMonth ?? null,
            acsVintage: result.acsVintage ?? null,
          });
          if (data.queriedType === 'zip' || data.queriedType === 'address') {
            setScoreConfidence({
              confidenceScore: result.confidenceScore ?? null,
              marketRentMissing: result.marketRentMissing ?? true,
              zordiMetro: result.zordiMetro ?? null,
              demandScore: result.demandScore ?? null,
            });
          } else if (data.queriedType === 'county' || data.queriedType === 'city') {
            setScoreConfidence({
              confidenceScore: result.confidenceScore ?? null,
              marketRentMissingPct: result.marketRentMissingPct ?? null,
              demandMissingPct: result.demandMissingPct ?? null,
            });
          } else {
            setScoreConfidence(null);
          }
        } else {
          setAreaScore(null);
          setScoreMetadata(null);
          setScoreConfidence(null);
        }
        setAreaScoreLoading(false);
      })
      .catch(() => {
        setAreaScore(null);
        setScoreMetadata(null);
        setScoreConfidence(null);
        setAreaScoreLoading(false);
      });
  }, [data]);

  // Reset score metadata when data changes and we won't fetch score
  useEffect(() => {
    const shouldFetchScore = data && (
      ((data.queriedType === 'zip' || data.queriedType === 'address') && data.zipCode) ||
      (data.queriedType === 'county' && data.countyName && data.stateCode) ||
      (data.queriedType === 'city' && data.cityName && data.stateCode)
    );
    if (!shouldFetchScore) {
      setScoreMetadata(null);
      setScoreConfidence(null);
    }
  }, [data]);

  // Fetch data freshness (mortgage, ZHVI, ACS) for last-updated footer
  useEffect(() => {
    if (!data) {
      setDataFreshness(null);
      return;
    }
    fetch('/api/data-freshness')
      .then(res => res.json())
      .then((body) => {
        if (body.mortgageFetchedAt !== undefined || body.zhviLatestMonth !== undefined || body.acsLatestVintage !== undefined) {
          setDataFreshness({
            zhviLatestMonth: body.zhviLatestMonth ?? null,
            acsLatestVintage: body.acsLatestVintage ?? null,
            mortgageFetchedAt: body.mortgageFetchedAt ?? null,
          });
        }
      })
      .catch(() => setDataFreshness(null));
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
          <ScoreGauge loading={true} />
        </div>

        {/* Table Skeleton */}
        <div className="overflow-x-auto overflow-y-visible -mx-1 sm:mx-0">
          <div className="max-h-[240px] overflow-y-auto overflow-x-visible">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-color)]">
                  <th className="text-left py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">BR</th>
                  <th className="text-right py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">FMR</th>
                  <th className="text-right py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">Eff. Rent</th>
                  <th className="hidden sm:table-cell text-right py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">3Y CAGR</th>
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
                      <div className="h-4 bg-[var(--border-color)] rounded w-20 ml-auto animate-pulse"></div>
                    </td>
                    <td className="hidden sm:table-cell py-2.5 sm:py-2 px-2 sm:px-3 text-right">
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

  const FMR_COL_TOOLTIP = 'HUD Fair Market Rent — the published benchmark rent for this bedroom size and area.';
  const EFF_COL_TOOLTIP = 'Effective Rent = min(FMR, market rent). Under HUD\'s rent reasonableness requirements, Section 8 payments may be capped at local market rates.';

  const renderFmrCell = (fmr?: number) => {
    if (fmr == null) return <span className="text-[var(--text-muted)]">—</span>;
    return <span className="font-medium tabular-nums text-[var(--text-primary)]">{formatCurrency(fmr)}</span>;
  };

  const renderEffCell = (fmr?: number, amr?: number) => {
    if (fmr == null || amr == null) return <span className="text-[var(--text-muted)]">—</span>;
    const eff = Math.min(fmr, amr);
    return <span className="font-medium tabular-nums text-[var(--text-primary)]">{formatCurrency(eff)}</span>;
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
      const countyDisplay = formatCountyName(dataNonNull.countyName, dataNonNull.stateCode);
      // County title already shows "King County, WA" — no subtitle needed
      if (dataNonNull.queriedType === 'county') return null;
      // City title already implies the state — omit ", STATE"
      if (dataNonNull.queriedType === 'city') return countyDisplay;
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

  // Representative AMR by BR (for Section 8 payout estimator).
  const amrRepresentative = (() => {
    if (dataNonNull.zipFMRData && dataNonNull.zipFMRData.length > 0) {
      return {
        bedroom0: median(dataNonNull.zipFMRData.map(z => z.marketRent?.bedroom0).filter((v): v is number => v != null)),
        bedroom1: median(dataNonNull.zipFMRData.map(z => z.marketRent?.bedroom1).filter((v): v is number => v != null)),
        bedroom2: median(dataNonNull.zipFMRData.map(z => z.marketRent?.bedroom2).filter((v): v is number => v != null)),
        bedroom3: median(dataNonNull.zipFMRData.map(z => z.marketRent?.bedroom3).filter((v): v is number => v != null)),
        bedroom4: median(dataNonNull.zipFMRData.map(z => z.marketRent?.bedroom4).filter((v): v is number => v != null)),
      };
    }
    return {
      bedroom0: dataNonNull.marketRent?.bedroom0 ?? undefined,
      bedroom1: dataNonNull.marketRent?.bedroom1 ?? undefined,
      bedroom2: dataNonNull.marketRent?.bedroom2 ?? undefined,
      bedroom3: dataNonNull.marketRent?.bedroom3 ?? undefined,
      bedroom4: dataNonNull.marketRent?.bedroom4 ?? undefined,
    };
  })();

  const chartRows = (() => {
    const brKeys = ['bedroom0', 'bedroom1', 'bedroom2', 'bedroom3', 'bedroom4'] as const;
    let rowsForChart: ChartRow[] = [];
    if (dataNonNull.zipFMRData && dataNonNull.zipFMRData.length > 0) {
      for (const zipData of dataNonNull.zipFMRData) {
        brKeys.forEach((key, br) => {
          rowsForChart.push({
            br,
            fmr: zipData[key] ?? null,
            amr: zipData.marketRent?.[key] ?? null,
            zipCode: zipData.zipCode,
          });
        });
      }
      return rowsForChart;
    }
    return [0, 1, 2, 3, 4].map((br) => ({
      br,
      fmr: representative[`bedroom${br}` as keyof typeof representative] ?? null,
      amr: amrRepresentative[`bedroom${br}` as keyof typeof amrRepresentative] ?? null,
    }));
  })();
  const hasChartData = chartRows.some((row) => row.fmr != null && row.amr != null && row.amr > 0);

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

  const yoyTooltip = (pct: number) => {
    const abs = Math.abs(pct);
    if (abs < 0.001) return 'FMR unchanged YoY';
    return pct > 0
      ? `FMR increased ${abs.toFixed(1)}% YoY`
      : `FMR decreased ${abs.toFixed(1)}% YoY`;
  };
  const YoYBadge = ({ bedroomKey }: { bedroomKey: keyof typeof representative }) => {
    const c = yoyChange(bedroomKey);
    if (!c) return <span className="text-xs text-[var(--text-muted)]">—</span>;
    return (
      <Tooltip content={yoyTooltip(c.pct)} side="bottom" align="end">
        <span className="inline-flex">
          <PercentageBadge value={c.pct} iconOnly className="text-xs tabular-nums font-normal" />
        </span>
      </Tooltip>
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
              {(formatLocation() || (dataNonNull.queriedType === 'zip' && zipVsCountyMedianPercent !== null && zipVsCountyMedianPercent !== undefined)) && (
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
                </div>
              )}
              {(dataNonNull.queriedType === 'city' || dataNonNull.queriedType === 'county' || dataNonNull.queriedType === 'address') && zipCodesToShow.length > 0 && (
                <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                  Found {zipCodesToShow.length} ZIP{zipCodesToShow.length !== 1 ? 's' : ''}
                </div>
              )}
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
            <ScoreGauge loading={true} />
          ) : (
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
                confidenceScore={scoreConfidence?.confidenceScore ?? null}
                confidenceReasons={(() => {
                  if (!scoreConfidence) return [];
                  if (dataNonNull.queriedType === 'zip' || dataNonNull.queriedType === 'address') {
                    return [
                      ...(scoreConfidence.marketRentMissing
                        ? ['No market rent data — FMR used as income estimate']
                        : []),
                      ...(scoreConfidence.zordiMetro === null
                        ? ['No rental demand data available for this area']
                        : []),
                    ];
                  }
                  // county / city: reason based on missing-data proportions
                  const reasons: string[] = [];
                  const mrPct = scoreConfidence.marketRentMissingPct ?? 0;
                  const demPct = scoreConfidence.demandMissingPct ?? 0;
                  if (mrPct > 0.5) reasons.push(`Market rent data unavailable for ${Math.round(mrPct * 100)}% of ZIPs`);
                  else if (mrPct > 0) reasons.push(`Market rent data missing for some ZIPs (${Math.round(mrPct * 100)}%)`);
                  if (demPct > 0.5) reasons.push(`Demand data unavailable for ${Math.round(demPct * 100)}% of ZIPs`);
                  else if (demPct > 0) reasons.push(`Demand data missing for some ZIPs (${Math.round(demPct * 100)}%)`);
                  return reasons;
                })()}
              />
              <div className="absolute top-3 right-3">
                <InvestorScoreInfoIcon />
              </div>
            </>
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
              <th className="text-right py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">
                FMR
              </th>
              <th className="text-right py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider overflow-visible">
                <div className="flex items-center justify-end gap-1">
                  Eff. Rent
                  <Tooltip content={EFF_COL_TOOLTIP} side="bottom" align="end">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-[var(--text-tertiary)] cursor-help">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </Tooltip>
                </div>
              </th>
              <th className="hidden sm:table-cell text-right py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider overflow-visible">
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

                const getFmrRange = (fmrValues: number[]) => {
                  if (fmrValues.length === 0) return <span className="text-[var(--text-muted)]">—</span>;
                  const min = Math.min(...fmrValues);
                  const max = Math.max(...fmrValues);
                  const text = min === max ? formatCurrency(min) : `${formatCurrency(min)} – ${formatCurrency(max)}`;
                  return <span className="font-medium tabular-nums text-[var(--text-primary)]">{text}</span>;
                };

                const getEffRange = (fmrValues: number[], amrValues: (number | undefined)[]) => {
                  const effValues = fmrValues
                    .map((fmr, i) => amrValues[i] != null ? Math.min(fmr, amrValues[i]!) : null)
                    .filter((v): v is number => v != null);
                  if (effValues.length === 0) return <span className="text-[var(--text-muted)]">—</span>;
                  const min = Math.min(...effValues);
                  const max = Math.max(...effValues);
                  const text = min === max ? formatCurrency(min) : `${formatCurrency(min)} – ${formatCurrency(max)}`;
                  return <span className="font-medium tabular-nums text-[var(--text-primary)]">{text}</span>;
                };
                const market0 = dataNonNull.zipFMRData?.map(z => z.marketRent?.bedroom0).filter((v): v is number => v != null) as number[];
                const market1 = dataNonNull.zipFMRData?.map(z => z.marketRent?.bedroom1).filter((v): v is number => v != null) as number[];
                const market2 = dataNonNull.zipFMRData?.map(z => z.marketRent?.bedroom2).filter((v): v is number => v != null) as number[];
                const market3 = dataNonNull.zipFMRData?.map(z => z.marketRent?.bedroom3).filter((v): v is number => v != null) as number[];
                const market4 = dataNonNull.zipFMRData?.map(z => z.marketRent?.bedroom4).filter((v): v is number => v != null) as number[];

                return (
                  <>
                    {([
                      { label: '0 BR', fmrVals: bedroom0Values, mktVals: market0, bk: 'bedroom0' as const },
                      { label: '1 BR', fmrVals: bedroom1Values, mktVals: market1, bk: 'bedroom1' as const },
                      { label: '2 BR', fmrVals: bedroom2Values, mktVals: market2, bk: 'bedroom2' as const },
                      { label: '3 BR', fmrVals: bedroom3Values, mktVals: market3, bk: 'bedroom3' as const },
                      { label: '4 BR', fmrVals: bedroom4Values, mktVals: market4, bk: 'bedroom4' as const },
                    ]).map(({ label, fmrVals, mktVals, bk }) => (
                      <tr key={label} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors">
                        <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm font-medium text-[var(--text-primary)]">{label}</td>
                        <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base tabular-nums">
                          <span className="inline-flex items-center justify-end gap-2">
                            {getFmrRange(fmrVals)}
                            <YoYBadge bedroomKey={bk} />
                          </span>
                        </td>
                        <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base tabular-nums">
                          {getEffRange(fmrVals, mktVals)}
                        </td>
                        <td className="hidden sm:table-cell py-2.5 sm:py-2 px-2 sm:px-3 text-right text-xs tabular-nums text-[var(--text-primary)]">
                          {(() => { const cagr = cagr3Year(bk); return cagr ? `${cagr.cagr.toFixed(1)}%` : '—'; })()}
                        </td>
                      </tr>
                    ))}
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
                          yoyBadge = (
                            <Tooltip content={yoyTooltip(pct)} side="bottom" align="end">
                              <span className="inline-flex">
                                <PercentageBadge value={pct} iconOnly className="text-xs tabular-nums font-normal" />
                              </span>
                            </Tooltip>
                          );
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
                            <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base tabular-nums">
                              <span className="inline-flex items-center justify-end gap-2">
                                {renderFmrCell(rate)}
                                {yoyBadge}
                              </span>
                            </td>
                            <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base tabular-nums">
                              <span className="text-[var(--text-muted)]">—</span>
                            </td>
                            <td className="hidden sm:table-cell py-2.5 sm:py-2 px-2 sm:px-3 text-right text-xs tabular-nums text-[var(--text-primary)]">
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
                    {([
                      { label: '0 BR', fmr: dataNonNull.bedroom0, mkt: dataNonNull.marketRent?.bedroom0, bk: 'bedroom0' as const },
                      { label: '1 BR', fmr: dataNonNull.bedroom1, mkt: dataNonNull.marketRent?.bedroom1, bk: 'bedroom1' as const },
                      { label: '2 BR', fmr: dataNonNull.bedroom2, mkt: dataNonNull.marketRent?.bedroom2, bk: 'bedroom2' as const },
                      { label: '3 BR', fmr: dataNonNull.bedroom3, mkt: dataNonNull.marketRent?.bedroom3, bk: 'bedroom3' as const },
                      { label: '4 BR', fmr: dataNonNull.bedroom4, mkt: dataNonNull.marketRent?.bedroom4, bk: 'bedroom4' as const },
                    ]).map(({ label, fmr, mkt, bk }) => (
                      <tr key={label} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors">
                        <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm font-medium text-[var(--text-primary)]">{label}</td>
                        <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base tabular-nums">
                          <span className="inline-flex items-center justify-end gap-2">
                            {renderFmrCell(fmr)}
                            <YoYBadge bedroomKey={bk} />
                          </span>
                        </td>
                        <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base tabular-nums">
                          {renderEffCell(fmr, mkt)}
                        </td>
                        <td className="hidden sm:table-cell py-2.5 sm:py-2 px-2 sm:px-3 text-right text-xs tabular-nums text-[var(--text-primary)]">
                          {(() => { const cagr = cagr3Year(bk); return cagr ? `${cagr.cagr.toFixed(1)}%` : '—'; })()}
                        </td>
                      </tr>
                    ))}
                    {(() => {
                      const base4 = dataNonNull.bedroom4;
                      if (!base4) return null;
                      const currentYear = dataNonNull.year;
                      const prevYear = currentYear - 1;
                      const prevYear4BR = historyByYear?.get(prevYear)?.bedroom4 as number | undefined;
                      return [5, 6, 7, 8].map((bedrooms) => {
                        const multiplier = Math.pow(1.15, bedrooms - 4);
                        const rate = Math.round(base4 * multiplier);
                        let yoyBadge = <span className="text-xs text-[var(--text-muted)]">—</span>;
                        if (prevYear4BR && prevYear4BR > 0) {
                          const prevRate = Math.round(prevYear4BR * multiplier);
                          const pct = ((rate - prevRate) / prevRate) * 100;
                          yoyBadge = (
                            <Tooltip content={yoyTooltip(pct)} side="bottom" align="end">
                              <span className="inline-flex">
                                <PercentageBadge value={pct} iconOnly className="text-xs tabular-nums font-normal" />
                              </span>
                            </Tooltip>
                          );
                        }
                        let cagrCell = '—';
                        const prev3Year4BR = historyByYear?.get(currentYear - 3)?.bedroom4 as number | undefined;
                        if (prev3Year4BR && prev3Year4BR > 0) {
                          const prev3Rate = Math.round(prev3Year4BR * multiplier);
                          const cagr = (Math.pow(rate / prev3Rate, 1 / 3) - 1) * 100;
                          cagrCell = `${cagr.toFixed(1)}%`;
                        }
                        return (
                          <tr key={bedrooms} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors">
                            <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm font-medium text-[var(--text-primary)]">{bedrooms} BR</td>
                            <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base tabular-nums">
                              <span className="inline-flex items-center justify-end gap-2">
                                {renderFmrCell(rate)}
                                {yoyBadge}
                              </span>
                            </td>
                            <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base tabular-nums">
                              <span className="text-[var(--text-muted)]">—</span>
                            </td>
                            <td className="hidden sm:table-cell py-2.5 sm:py-2 px-2 sm:px-3 text-right text-xs tabular-nums text-[var(--text-primary)]">{cagrCell}</td>
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

      {/* Voucher Strength chart */}
      {hasChartData ? (
        <div className="mt-3 sm:mt-4">
          <VoucherStrengthChart rows={chartRows} stateCode={dataNonNull.stateCode} />
        </div>
      ) : (
        <div className="mt-3 sm:mt-4">
          <div className="rounded-lg border border-dashed border-[var(--border-color)] bg-[var(--bg-secondary)] p-5 sm:p-6">
            <div className="flex flex-col items-center text-center gap-2">
              <div className="w-9 h-9 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4.5 h-4.5 text-[var(--text-muted)]">
                  <path d="M15.5 2A1.5 1.5 0 0014 3.5v13a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0016.5 2h-1zM9.5 6A1.5 1.5 0 008 7.5v9A1.5 1.5 0 009.5 18h1a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0010.5 6h-1zM3.5 10A1.5 1.5 0 002 11.5v5A1.5 1.5 0 003.5 18h1A1.5 1.5 0 006 16.5v-5A1.5 1.5 0 004.5 10h-1z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Market Alignment</h3>
                <p className="text-xs text-[var(--text-tertiary)] mt-1 max-w-xs mx-auto leading-relaxed">
                  Not enough rental comps in this area to determine how FMR aligns with current market rates.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bedroom curve chart below table */}
      {dataNonNull.history && dataNonNull.history.length >= 2 && (
        <div className="mt-3 sm:mt-4">
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 sm:p-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Bedroom curve</h3>
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

      {/* Data freshness footer */}
      {(() => {
        const relTime = (d: Date | string | null | undefined): string | null => {
          if (!d) return null;
          const dt = typeof d === 'string' ? new Date(d) : d;
          if (isNaN(dt.getTime())) return null;
          const now = Date.now();
          const diffMs = now - dt.getTime();
          const diffDays = Math.floor(diffMs / 86_400_000);
          if (diffDays < 1) return 'today';
          if (diffDays === 1) return 'yesterday';
          if (diffDays < 7) return `${diffDays} days ago`;
          if (diffDays < 14) return 'last week';
          const diffWeeks = Math.floor(diffDays / 7);
          if (diffDays < 32) return 'last month';
          const diffMonths = Math.round(diffDays / 30.5);
          if (diffMonths < 12) return `${diffMonths} months ago`;
          if (diffMonths < 18) return 'last year';
          return `${Math.round(diffMonths / 12)} years ago`;
        };
        const monthToDate = (s: string | null): Date | null => {
          if (!s) return null;
          const dt = new Date(s + '-15');
          return isNaN(dt.getTime()) ? null : dt;
        };

        const amrDate =
          dataNonNull.amrDataAsOf ??
          (dataNonNull.zipFMRData
            ?.map((z) => z.amrDataAsOf)
            .filter((v): v is string => !!v)
            .sort()
            .at(-1) ?? null);

        const hasMarketRent = !dataNonNull.rentConstraint?.missingMarketRent || !!amrDate;
        const zhvi = scoreMetadata?.zhviMonth ?? dataFreshness?.zhviLatestMonth;
        const acs = scoreMetadata?.acsVintage ?? dataFreshness?.acsLatestVintage;

        const rows: { label: string; age: string }[] = [];
        rows.push({ label: 'FMR', age: `FY${dataNonNull.year}` });
        if (hasMarketRent) rows.push({ label: 'Market rent', age: 'last ~365 days' });
        if (zhvi) { const a = relTime(monthToDate(zhvi)); if (a) rows.push({ label: 'Property value', age: a }); }
        if (acs != null) rows.push({ label: 'Tax rate', age: `${acs} vintage` });
        if (dataFreshness?.mortgageFetchedAt) { const a = relTime(dataFreshness.mortgageFetchedAt); if (a) rows.push({ label: 'Mortgage rate', age: a }); }

        if (rows.length === 0) return null;

        return (
          <div className="mt-8 pt-5 border-t border-[var(--border-color)]/50">
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] mb-2">Data indexed</p>
            <dl className="space-y-1">
              {rows.map((r) => (
                <div key={r.label} className="flex items-baseline gap-1.5">
                  <dt className="text-xs text-[var(--text-secondary)] shrink-0">{r.label}</dt>
                  <div className="flex-1 border-b border-dotted border-[var(--border-color)] mb-0.5" />
                  <dd className="text-xs text-[var(--text-secondary)] tabular-nums shrink-0">{r.age}</dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })()}
    </div>
  );
}


