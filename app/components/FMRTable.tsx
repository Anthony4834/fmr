'use client';

import { ReactNode } from 'react';
import Tooltip from './Tooltip';
import PercentageBadge from './PercentageBadge';

type BedroomData = {
  br: number;
  rent: number | null;
  rentRange?: {
    min: number;
    max: number;
    median: number;
  };
  yoy?: number | null;
  cagr3?: number | null;
};

type FMRTableProps = {
  data: BedroomData[];
  loading?: boolean;
  prevYear?: number;
  prev3Year?: number;
  currentYear?: number;
  showExtendedBR?: boolean;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatBRLabel(br: number): string {
  return `${br} BR`;
}

function yoyTooltip(pct: number): string {
  const abs = Math.abs(pct);
  if (abs < 0.001) return 'FMR unchanged YoY';
  return pct > 0 ? `FMR increased ${abs.toFixed(1)}% YoY` : `FMR decreased ${abs.toFixed(1)}% YoY`;
}

export default function FMRTable({
  data,
  loading = false,
  prevYear,
  prev3Year,
  currentYear,
  showExtendedBR = false,
}: FMRTableProps) {
  if (loading) {
    return (
      <div className="overflow-x-auto overflow-y-visible -mx-1 sm:mx-0">
        <div className="overflow-x-visible">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-color)]">
                <th className="text-left py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">
                  BR
                </th>
                <th className="text-right py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">
                  Rent
                </th>
                <th className="hidden sm:table-cell text-right py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider overflow-visible">
                  3Y CAGR
                </th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4].map((br) => (
                <tr key={br} className="border-b border-[var(--border-color)]">
                  <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm font-medium text-[var(--text-primary)]">
                    {formatBRLabel(br)}
                  </td>
                  <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                    <div className="h-4 bg-[var(--border-color)] rounded w-24 animate-pulse inline-block" />
                  </td>
                  <td className="hidden sm:table-cell py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                    <div className="h-4 bg-[var(--border-color)] rounded w-16 animate-pulse inline-block ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const renderRentCell = (bedroom: BedroomData): ReactNode => {
    const hasYoY = bedroom.yoy !== null && bedroom.yoy !== undefined;

    if (bedroom.rent === null) {
      return <span className="text-[var(--text-muted)]">—</span>;
    }

    if (bedroom.rentRange) {
      const { min, max, median } = bedroom.rentRange;
      if (min === max) {
        return (
          <span className="inline-flex items-center justify-end gap-2">
            <span>{formatCurrency(min)}</span>
            {hasYoY && (
            <Tooltip content={yoyTooltip(bedroom.yoy!)} side="bottom" align="end">
              <span className="inline-flex">
                <PercentageBadge value={bedroom.yoy!} iconOnly className="text-xs tabular-nums font-normal" />
              </span>
            </Tooltip>
          )}
          </span>
        );
      }
      return (
        <span className="flex flex-col items-end gap-0.5">
          <span className="inline-flex items-center gap-2">
            <span className="text-[var(--text-primary)]">
              {formatCurrency(min)} - {formatCurrency(max)}
            </span>
            {hasYoY && (
            <Tooltip content={yoyTooltip(bedroom.yoy!)} side="bottom" align="end">
              <span className="inline-flex">
                <PercentageBadge value={bedroom.yoy!} iconOnly className="text-xs tabular-nums font-normal" />
              </span>
            </Tooltip>
          )}
          </span>
          <span className="text-xs text-[var(--text-tertiary)] font-normal font-sans">
            Median: {formatCurrency(median)}
          </span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center justify-end gap-2">
        <span>{formatCurrency(bedroom.rent)}</span>
        {hasYoY && (
            <Tooltip content={yoyTooltip(bedroom.yoy!)} side="bottom" align="end">
              <span className="inline-flex">
                <PercentageBadge value={bedroom.yoy!} iconOnly className="text-xs tabular-nums font-normal" />
              </span>
            </Tooltip>
          )}
      </span>
    );
  };

  const renderCAGRCell = (bedroom: BedroomData): ReactNode => {
    if (bedroom.cagr3 === null || bedroom.cagr3 === undefined) {
      return <span className="text-xs text-[var(--text-muted)]">—</span>;
    }
    return (
      <span className="text-xs tabular-nums text-[var(--text-primary)]">
        {bedroom.cagr3.toFixed(1)}%
      </span>
    );
  };

  const base4BR = data.find((d) => d.br === 4);
  const extendedRows: ReactNode[] = [];

  if (showExtendedBR && base4BR && base4BR.rent !== null && base4BR.rent > 0) {
    for (const bedrooms of [5, 6, 7, 8]) {
      const multiplier = Math.pow(1.15, bedrooms - 4);
      const rate = Math.round(base4BR.rent * multiplier);

      const yoyBadge =
        base4BR.yoy !== null && base4BR.yoy !== undefined && prevYear && currentYear ? (
          <Tooltip content={yoyTooltip(base4BR.yoy)} side="bottom" align="end">
            <span className="inline-flex">
              <PercentageBadge value={base4BR.yoy} iconOnly className="text-xs tabular-nums font-normal" />
            </span>
          </Tooltip>
        ) : null;

      const cagrCell =
        base4BR.cagr3 !== null && base4BR.cagr3 !== undefined ? (
          <span className="text-xs tabular-nums text-[var(--text-primary)]">
            {base4BR.cagr3.toFixed(1)}%
          </span>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">—</span>
        );

      extendedRows.push(
        <tr
          key={bedrooms}
          className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm font-medium text-[var(--text-primary)]">
            {formatBRLabel(bedrooms)}
          </td>
          <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[var(--text-primary)] font-semibold tabular-nums">
            <span className="inline-flex items-center justify-end gap-2">
              <span>{formatCurrency(rate)}</span>
              {yoyBadge}
            </span>
          </td>
          <td className="hidden sm:table-cell py-2.5 sm:py-2 px-2 sm:px-3 text-right">
            {cagrCell}
          </td>
        </tr>
      );
    }
  }

  return (
    <div className="overflow-x-auto overflow-y-visible -mx-1 sm:mx-0">
      <div className={showExtendedBR ? 'max-h-[360px] overflow-y-auto overflow-x-visible custom-scrollbar' : 'overflow-x-visible'}>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-color)]">
              <th className="text-left py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">
                BR
              </th>
              <th className="text-right py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">
                Rent
              </th>
              <th className="hidden sm:table-cell text-right py-2 px-2 sm:px-3 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider overflow-visible">
                <div className="flex items-center justify-end gap-1">
                  3Y CAGR
                  <Tooltip
                    content={
                      prev3Year && currentYear
                        ? `Compound Annual Growth Rate over 3 years (${prev3Year}→${currentYear})`
                        : 'Compound Annual Growth Rate over 3 years'
                    }
                    side="bottom"
                    align="end"
                  >
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
            {data.map((bedroom) => (
              <tr
                key={bedroom.br}
                className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-sm font-medium text-[var(--text-primary)]">
                  {formatBRLabel(bedroom.br)}
                </td>
                <td className="py-2.5 sm:py-2 px-2 sm:px-3 text-right font-mono text-sm sm:text-base text-[var(--text-primary)] font-semibold tabular-nums">
                  {renderRentCell(bedroom)}
                </td>
                <td className="hidden sm:table-cell py-2.5 sm:py-2 px-2 sm:px-3 text-right">
                  {renderCAGRCell(bedroom)}
                </td>
              </tr>
            ))}
            {extendedRows}
          </tbody>
        </table>
      </div>
    </div>
  );
}
