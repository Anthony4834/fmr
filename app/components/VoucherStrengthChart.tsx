'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import BaseModal from '@/app/components/BaseModal';
import type { ZipEntry } from '@/app/components/ZipMap';

const ZipMap = dynamic(() => import('@/app/components/ZipMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center">
      <span className="text-xs text-[var(--text-tertiary)]">Loading map…</span>
    </div>
  ),
});

export interface ChartRow {
  br: number;
  fmr: number | null;
  amr: number | null;
  zipCode?: string;
}

interface Props {
  rows: ChartRow[];
  stateCode?: string;
}

interface DotInfo {
  br: number;
  ratio: number;
  fmr: number;
  amr: number;
  leftPct: number;
  zipCode?: string;
}

interface DensityIsland {
  key: string;
  br: number;
  leftPct: number;
  ratioMid: number;
  minRatio: number;
  maxRatio: number;
  count: number;
  medianFmr: number;
  medianAmr: number;
  sampleZips: string[];
  moreZips: number;
  allRows: ChartRow[];
}

const BR_LABELS: Record<number, string> = {
  0: 'Studio',
  1: '1 BR',
  2: '2 BR',
  3: '3 BR',
  4: '4 BR',
};

const AXIS_MIN = 0.60;
const AXIS_MAX = 1.40;
const ZONE_LO = 0.90;
const ZONE_HI = 1.10;
const TICKS = [0.70, 0.80, 0.90, 1.00, 1.10, 1.20, 1.30];
const MAX_ZIP_SAMPLES = 4;

// Single-dot track dimensions
const SINGLE_TRACK_H = 24;
const SINGLE_BAND_H  = 12;
const SINGLE_DOT_PX  = 12;
const SINGLE_HIT_PAD = 10;

// Island track dimensions (needs headroom for larger bubbles)
const ISLAND_TRACK_H = 32;
const ISLAND_BAND_H  = 14;
const ISLAND_HIT_PAD = 6;

function toAxisPct(ratio: number): number {
  return Math.max(0, Math.min(100, ((ratio - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * 100));
}

const zoneLoPct = toAxisPct(ZONE_LO);
const zoneHiPct = toAxisPct(ZONE_HI);
const refLinePct = toAxisPct(1.00);

function med(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function buildDensityIslands(rows: ChartRow[], br: number): DensityIsland[] {
  if (rows.length === 0) return [];

  // Partition by zone first so no island ever straddles a zone boundary.
  const zoneDefs = [
    { zoneKey: 'below',   min: AXIS_MIN, max: ZONE_LO,  filter: (r: number) => r < ZONE_LO },
    { zoneKey: 'aligned', min: ZONE_LO,  max: ZONE_HI,  filter: (r: number) => r >= ZONE_LO && r <= ZONE_HI },
    { zoneKey: 'above',   min: ZONE_HI,  max: AXIS_MAX,  filter: (r: number) => r > ZONE_HI },
  ];

  const allIslands: DensityIsland[] = [];

  for (const zone of zoneDefs) {
    const zoneRows = rows.filter((row) => zone.filter(row.fmr! / row.amr!));
    if (zoneRows.length === 0) continue;

    // Fixed bin width of 0.05 ratio units — coarser grouping, less visual clutter.
    const BIN_WIDTH = 0.05;
    const bins  = Math.max(1, Math.ceil((zone.max - zone.min) / BIN_WIDTH));
    const binW  = (zone.max - zone.min) / bins;
    const buckets = new Map<number, ChartRow[]>();

    for (const row of zoneRows) {
      const ratio = row.fmr! / row.amr!;
      const idx   = Math.max(0, Math.min(bins - 1, Math.floor((ratio - zone.min) / binW)));
      if (!buckets.has(idx)) buckets.set(idx, []);
      buckets.get(idx)!.push(row);
    }

    for (const [idx, bRows] of Array.from(buckets.entries())) {
      const ratios    = bRows.map((r) => r.fmr! / r.amr!).sort((a, b) => a - b);
      const uniqueZips = Array.from(new Set(bRows.map((r) => r.zipCode).filter(Boolean) as string[]));
      allIslands.push({
        key:       `${br}_${zone.zoneKey}_bin${idx}`,
        br,
        leftPct:   toAxisPct(med(ratios)),
        ratioMid:  med(ratios),
        minRatio:  ratios[0],
        maxRatio:  ratios[ratios.length - 1],
        count:     bRows.length,
        medianFmr: med(bRows.map((r) => r.fmr!)),
        medianAmr: med(bRows.map((r) => r.amr!)),
        sampleZips: uniqueZips.slice(0, MAX_ZIP_SAMPLES),
        moreZips:   Math.max(0, uniqueZips.length - MAX_ZIP_SAMPLES),
        allRows:    bRows,
      });
    }
  }

  return allIslands.sort((a, b) => a.ratioMid - b.ratioMid);
}

function getIslandSizePx(count: number, maxCount: number, active: boolean): number {
  const t = maxCount <= 1 ? 1 : count / maxCount;
  const size = Math.round(8 + (24 - 8) * t);
  return active ? size + 3 : size;
}

function getDotStyle(ratio: number): { bg: string; text: string } {
  if (ratio < 0.90) return { bg: 'bg-amber-400', text: 'text-amber-600 dark:text-amber-400' };
  if (ratio > 1.10) return { bg: 'bg-blue-500',  text: 'text-blue-600 dark:text-blue-400'  };
  return               { bg: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' };
}

function getSummary(ratios: number[]): string {
  const below   = ratios.filter((r) => r < 0.90).length;
  const above   = ratios.filter((r) => r > 1.10).length;
  const aligned = ratios.length - below - above;
  if (below === 0 && above === 0)   return 'Voucher rents are well-aligned with market rents across all bedroom sizes.';
  if (above === 0 && aligned === 0) return 'Voucher rents are below market for all bedroom sizes.';
  if (below === 0 && aligned === 0) return 'HUD benchmarks exceed market rents across all bedroom sizes.';
  if (below > 0 && above > 0)       return 'Voucher alignment varies significantly by bedroom size in this area.';
  if (below > 0)                    return 'Voucher rents are below market for smaller unit sizes.';
  return 'HUD benchmarks exceed market rents for larger unit sizes.';
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function normalizeZip(value: unknown): string | null {
  if (value == null) return null;
  const digits = String(value).match(/\d/g)?.join('') ?? '';
  if (!digits) return null;
  return digits.length >= 5 ? digits.slice(0, 5) : digits.padStart(5, '0');
}

function getTooltipPosition(leftPct: number): { transform: string; caretLeft: string } {
  let x = leftPct < 25 ? Math.max(8, leftPct * 2)
        : leftPct > 75 ? Math.min(92, 50 + (leftPct - 75) * 2)
        : 50;
  return { transform: `translateX(-${x}%)`, caretLeft: `${x}%` };
}

function dotKey(info: DotInfo): string {
  return `${info.br}_${info.zipCode ?? '__single__'}`;
}

// CSS var aliases for tooltip / modal surfaces — defined once in globals.css
const T = {
  bg:        'var(--modal-bg)',
  border:    'var(--modal-border)',
  text:      'var(--modal-text)',
  textMuted: 'var(--modal-text-muted)',
  divider:   'var(--modal-divider)',
  hover:     'var(--modal-hover)',
} as const;

function TooltipCaret({ caretLeft }: { caretLeft: string }) {
  return (
    <div
      className="absolute top-full w-0 h-0 -translate-x-1/2"
      style={{
        left: caretLeft,
        borderLeft: '6px solid transparent',
        borderRight: '6px solid transparent',
        borderTop: `6px solid ${T.border}`,
      }}
    />
  );
}

function DotTooltip({
  info, visible, onMouseEnter, onMouseLeave,
}: { info: DotInfo; visible: boolean; onMouseEnter: () => void; onMouseLeave: () => void }) {
  const gap = info.fmr - info.amr;
  const gapFmt = (gap >= 0 ? '+' : '') + formatCurrency(gap);
  const isAbove = info.ratio > 1.10;
  const isBelow = info.ratio < 0.90;
  const { transform, caretLeft } = getTooltipPosition(info.leftPct);

  return (
    <div
      className={`absolute z-30 bottom-full mb-3 ${visible ? '' : 'pointer-events-none'}`}
      style={{ left: `${info.leftPct}%`, transform }}
      onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
    >
      <div className={`relative transition-[opacity,transform] duration-150 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1 pointer-events-none'}`}>
        <div className="rounded-lg shadow-lg p-3 text-left border w-52" style={{ backgroundColor: T.bg, borderColor: T.border }}>
          <div className="text-xs font-semibold mb-1" style={{ color: T.text }}>
            {BR_LABELS[info.br] ?? `${info.br} BR`}
            {info.zipCode && <span className="ml-1.5 font-normal" style={{ color: T.textMuted }}>· {info.zipCode}</span>}
          </div>
          <div className="text-lg font-bold tabular-nums mb-2" style={{ color: T.text }}>
            {info.ratio.toFixed(2)}
            <span className="text-xs font-normal ml-1" style={{ color: T.textMuted }}>ratio</span>
          </div>
          <div className="space-y-0.5 text-xs">
            <div className="flex justify-between">
              <span style={{ color: T.textMuted }}>FMR</span>
              <span className="font-medium tabular-nums" style={{ color: T.text }}>{formatCurrency(info.fmr)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: T.textMuted }}>Market</span>
              <span className="font-medium tabular-nums" style={{ color: T.text }}>{formatCurrency(info.amr)}</span>
            </div>
            <div className="flex justify-between pt-1 mt-1 border-t" style={{ borderColor: T.divider }}>
              <span style={{ color: T.textMuted }}>vs market</span>
              <span className={`font-medium tabular-nums ${isAbove ? 'text-blue-500' : isBelow ? 'text-amber-500' : 'text-emerald-500'}`}>{gapFmt}</span>
            </div>
            <div className="mt-2 pt-1.5 border-t" style={{ borderColor: T.divider }}>
              <p className="leading-snug" style={{ color: T.textMuted }}>
                {isAbove
                  ? 'FMR exceeds market. Payment is likely to be capped due to rent reasonableness requirements in this area.'
                  : isBelow
                    ? 'FMR falls below market. Section 8 income will likely be below what private tenants pay in this area.'
                    : 'FMR aligns with market rates. Payment is likely to be at or near the FMR in this area.'}
              </p>
            </div>
          </div>
        </div>
        <TooltipCaret caretLeft={caretLeft} />
      </div>
    </div>
  );
}

function IslandTooltip({
  info, visible, onMouseEnter, onMouseLeave,
}: { info: DensityIsland; visible: boolean; onMouseEnter: () => void; onMouseLeave: () => void }) {
  const gap = info.medianFmr - info.medianAmr;
  const gapFmt = (gap >= 0 ? '+' : '') + formatCurrency(gap);
  const isAbove = info.ratioMid > 1.10;
  const isBelow = info.ratioMid < 0.90;
  const { transform, caretLeft } = getTooltipPosition(info.leftPct);
  const ratioLabel = info.minRatio.toFixed(2) === info.maxRatio.toFixed(2)
    ? info.ratioMid.toFixed(2)
    : `${info.minRatio.toFixed(2)}–${info.maxRatio.toFixed(2)}`;

  return (
    <div
      className={`absolute z-30 bottom-full mb-3 ${visible ? '' : 'pointer-events-none'}`}
      style={{ left: `${info.leftPct}%`, transform }}
      onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
    >
      <div className={`relative transition-[opacity,transform] duration-150 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1 pointer-events-none'}`}>
        <div className="rounded-lg shadow-lg p-3 text-left border w-64" style={{ backgroundColor: T.bg, borderColor: T.border }}>
          <div className="text-xs font-semibold mb-1" style={{ color: T.text }}>
            {BR_LABELS[info.br] ?? `${info.br} BR`}
            <span className="ml-1.5 font-normal" style={{ color: T.textMuted }}>· {info.count} ZIP{info.count !== 1 ? 's' : ''}</span>
          </div>
          <div className="text-lg font-bold tabular-nums mb-2" style={{ color: T.text }}>
            {ratioLabel}
            <span className="text-xs font-normal ml-1" style={{ color: T.textMuted }}>{info.count === 1 ? 'ratio' : 'ratio range'}</span>
          </div>
          <div className="space-y-0.5 text-xs">
            <div className="flex justify-between">
              <span style={{ color: T.textMuted }}>{info.count === 1 ? 'FMR' : 'Median FMR'}</span>
              <span className="font-medium tabular-nums" style={{ color: T.text }}>{formatCurrency(info.medianFmr)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: T.textMuted }}>{info.count === 1 ? 'Market' : 'Median Market'}</span>
              <span className="font-medium tabular-nums" style={{ color: T.text }}>{formatCurrency(info.medianAmr)}</span>
            </div>
            <div className="flex justify-between pt-1 mt-1 border-t" style={{ borderColor: T.divider }}>
              <span style={{ color: T.textMuted }}>vs market</span>
              <span className={`font-medium tabular-nums ${isAbove ? 'text-blue-500' : isBelow ? 'text-amber-500' : 'text-emerald-500'}`}>{gapFmt}</span>
            </div>
            <div className="mt-2 pt-1.5 border-t" style={{ borderColor: T.divider }}>
              <p className="leading-snug" style={{ color: T.textMuted }}>
                {isAbove
                  ? 'FMR exceeds market. Payment is likely to be capped due to rent reasonableness requirements in this area.'
                  : isBelow
                    ? 'FMR falls below market. Section 8 income will likely be below what private tenants pay in this area.'
                    : 'FMR aligns with market rates. Payment is likely to be at or near the FMR in this area.'}
              </p>
            </div>
          </div>
        </div>
        <TooltipCaret caretLeft={caretLeft} />
      </div>
    </div>
  );
}

function IslandDetailModal({
  island,
  stateCode,
  onClose,
}: {
  island: DensityIsland | null;
  stateCode?: string;
  onClose: () => void;
}) {
  const [hoveredZip, setHoveredZip] = useState<string | null>(null);
  // Track where the hover originated so we only auto-scroll when the map drives it
  const hoverSourceRef = useRef<'map' | 'list' | null>(null);
  const rowRefsMap     = useRef<Map<string, HTMLElement>>(new Map());

  // Scroll the list to the highlighted row when hover comes from the map
  useEffect(() => {
    if (hoverSourceRef.current === 'map' && hoveredZip) {
      const el = rowRefsMap.current.get(hoveredZip);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [hoveredZip]);

  useEffect(() => {
    setHoveredZip(null);

    hoverSourceRef.current = null;
    rowRefsMap.current.clear();
  }, [island?.key]);

  if (!island) return null;

  const sortedRows = [...island.allRows]
    .filter((r) => r.fmr != null && r.amr != null)
    .sort((a, b) => (a.fmr! / a.amr!) - (b.fmr! / b.amr!));

  const zipEntriesMap = new Map<string, number>();
  for (const row of sortedRows) {
    const normalizedZip = normalizeZip(row.zipCode);
    if (!normalizedZip) continue;
    if (!zipEntriesMap.has(normalizedZip)) {
      zipEntriesMap.set(normalizedZip, row.fmr! / row.amr!);
    }
  }
  const zipEntries: ZipEntry[] = Array.from(zipEntriesMap.entries()).map(([zipCode, ratio]) => ({
    zipCode,
    ratio,
  }));

  const hasMap = !!stateCode && zipEntries.length > 0;

  const label = BR_LABELS[island.br] ?? `${island.br} BR`;
  const rangeLabel =
    island.minRatio.toFixed(2) === island.maxRatio.toFixed(2)
      ? island.ratioMid.toFixed(2)
      : `${island.minRatio.toFixed(2)}–${island.maxRatio.toFixed(2)}`;
  const { text: stateText } = getDotStyle(island.ratioMid);

  return (
    <BaseModal isOpen={!!island} onClose={onClose} maxWidth="580px">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b" style={{ borderColor: T.divider }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold" style={{ color: T.text }}>
              {label} · {island.count} ZIP{island.count !== 1 ? 's' : ''}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>
              Ratio range{' '}
              <span className={`font-medium ${stateText}`}>{rangeLabel}</span>
              {' · '}Median FMR {formatCurrency(island.medianFmr)} · Market{' '}
              {formatCurrency(island.medianAmr)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Map */}
      {hasMap && (
        <div
          className="border-b"
          style={{ height: 220, borderColor: T.divider }}
        >
          <ZipMap
            stateCode={stateCode!}
            zips={zipEntries}
            highlightZip={hoveredZip}
            onZipHover={(zip) => { hoverSourceRef.current = 'map'; setHoveredZip(zip); }}
            onZipHoverEnd={() => { hoverSourceRef.current = null; setHoveredZip(null); }}
          />
        </div>
      )}

      {/* ZIP list */}
      <div className="divide-y max-h-72 overflow-y-auto" style={{ borderColor: T.divider }}>
        {sortedRows.map((row, i) => {
          const ratio  = row.fmr! / row.amr!;
          const gap    = row.fmr! - row.amr!;
          const gapFmt = (gap >= 0 ? '+' : '') + formatCurrency(gap);
          const { text: dotText } = getDotStyle(ratio);
          const normalizedZip = normalizeZip(row.zipCode);
          const hasZip  = !!normalizedZip;
          const isHover = !!normalizedZip && hoveredZip === normalizedZip;

          const inner = (
            <div
              ref={(el) => {
                if (normalizedZip) {
                  if (el) rowRefsMap.current.set(normalizedZip, el);
                  else rowRefsMap.current.delete(normalizedZip);
                }
              }}
              className="flex items-center justify-between gap-3 px-5 py-3 group"
              style={{
                transition: 'background 0.1s',
                backgroundColor: isHover ? T.border : undefined,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = T.hover;
                if (normalizedZip) {
                  hoverSourceRef.current = 'list';
                  setHoveredZip(normalizedZip);
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = isHover ? T.border : '';
                hoverSourceRef.current = null;
                setHoveredZip(null);
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`text-[11px] font-semibold tabular-nums ${dotText}`}>
                  {ratio.toFixed(2)}
                </span>
                <span className="text-sm font-medium truncate" style={{ color: T.text }}>
                  {row.zipCode ?? `Row ${i + 1}`}
                </span>
              </div>
              <div className="flex items-center gap-4 shrink-0 text-xs tabular-nums">
                <span style={{ color: T.textMuted }}>
                  <span className="font-medium" style={{ color: T.text }}>
                    {formatCurrency(row.fmr!)}
                  </span>
                  <span className="mx-1" style={{ color: T.textMuted }}>/</span>
                  {formatCurrency(row.amr!)}
                </span>
                <span className={`font-medium ${dotText}`}>{gapFmt}</span>
                {hasZip && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity"
                    style={{ color: T.textMuted }}
                  >
                    <path
                      fillRule="evenodd"
                      d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
            </div>
          );

          return hasZip ? (
            <a
              key={normalizedZip ?? i}
              href={`/zip/${normalizedZip}`}
              className="block"
              style={{ textDecoration: 'none' }}
            >
              {inner}
            </a>
          ) : (
            <div key={i}>{inner}</div>
          );
        })}
      </div>

      {/* Footer */}
      <div
        className="px-5 py-3 text-[11px]"
        style={{ color: T.textMuted, borderTop: `1px solid ${T.divider}` }}
      >
        Click a ZIP to open its full FMR breakdown.
      </div>
    </BaseModal>
  );
}

export default function VoucherStrengthChart({ rows, stateCode }: Props) {
  const [activeDot,    setActiveDot]    = useState<DotInfo | null>(null);
  const [activeIsland, setActiveIsland] = useState<DensityIsland | null>(null);
  const [detailIsland, setDetailIsland] = useState<DensityIsland | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showDotTooltip = useCallback((info: DotInfo) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setActiveDot(info); setActiveIsland(null); setTooltipVisible(true);
  }, []);

  const showIslandTooltip = useCallback((info: DensityIsland) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setActiveIsland(info); setActiveDot(null); setTooltipVisible(true);
  }, []);

  const scheduleHide = useCallback(() => {
    hideTimer.current = setTimeout(() => setTooltipVisible(false), 100);
  }, []);

  const cancelHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  const validRows = rows.filter((r) => r.fmr != null && r.amr != null && r.amr > 0);
  if (validRows.length === 0) return null;

  const ratios = validRows.map((r) => r.fmr! / r.amr!);

  const brOrder = [0, 1, 2, 3, 4];
  const brGroups = new Map<number, typeof validRows>();
  for (const row of validRows) {
    if (!brGroups.has(row.br)) brGroups.set(row.br, []);
    brGroups.get(row.br)!.push(row);
  }
  const orderedBrs = brOrder.filter((br) => brGroups.has(br));
  if (orderedBrs.length === 0) return null;

  // Use islands whenever any BR track has more than one data point
  const maxDotsPerBr = Math.max(...orderedBrs.map((br) => brGroups.get(br)!.length));
  const useIslands = maxDotsPerBr > 1;

  const islandsByBr = new Map<number, DensityIsland[]>();
  const maxIslandCountByBr = new Map<number, number>();
  if (useIslands) {
    for (const br of orderedBrs) {
      const islands = buildDensityIslands(brGroups.get(br)!, br);
      islandsByBr.set(br, islands);
      maxIslandCountByBr.set(br, Math.max(1, ...islands.map((i) => i.count)));
    }
  }

  const trackH = useIslands ? ISLAND_TRACK_H : SINGLE_TRACK_H;
  const bandH  = useIslands ? ISLAND_BAND_H  : SINGLE_BAND_H;

  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 sm:p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Market Alignment</h3>
        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
          How HUD fair market rents align with the state of the rental market.
        </p>
      </div>

      <div className="relative">
        <div className="space-y-3 mb-2">
          {orderedBrs.map((br) => {
            const allRatios = brGroups.get(br)!.map((r) => r.fmr! / r.amr!);
            const minRatio  = Math.min(...allRatios);
            const maxRatio  = Math.max(...allRatios);
            const isMulti   = allRatios.length > 1;
            const rangeLabel = isMulti
              ? `${minRatio.toFixed(2)}–${maxRatio.toFixed(2)}`
              : allRatios[0].toFixed(2);
            const rangeLabelStyle = isMulti
              ? 'text-[var(--text-tertiary)]'
              : getDotStyle(allRatios[0]).text;

            return (
              <div key={br} className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-secondary)] w-12 shrink-0 font-medium">
                  {BR_LABELS[br] ?? `${br} BR`}
                </span>
                <div className="relative flex-1" style={{ height: `${trackH}px` }}>
                  {/* Track */}
                  <div className="absolute top-1/2 left-0 right-0 h-px bg-[var(--border-color)] -translate-y-1/2" />
                  {/* Aligned band */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 rounded-sm"
                    style={{
                      left: `${zoneLoPct}%`, width: `${zoneHiPct - zoneLoPct}%`, height: `${bandH}px`,
                      backgroundColor: 'color-mix(in srgb, var(--text-tertiary) 12%, transparent)',
                      borderLeft:  '1px solid color-mix(in srgb, var(--text-tertiary) 35%, transparent)',
                      borderRight: '1px solid color-mix(in srgb, var(--text-tertiary) 35%, transparent)',
                    }}
                  />
                  {/* 1.00 reference line */}
                  <div className="absolute top-0 bottom-0 w-px" style={{ left: `${refLinePct}%`, backgroundColor: 'color-mix(in srgb, var(--text-tertiary) 45%, transparent)' }} />

                  {useIslands ? (
                    (islandsByBr.get(br) ?? []).map((island) => {
                      const { bg } = getDotStyle(island.ratioMid);
                      const isActive = tooltipVisible && activeIsland?.key === island.key;
                      const sizePx   = getIslandSizePx(island.count, maxIslandCountByBr.get(br) ?? 1, isActive);
                      return (
                        <div key={island.key}>
                          <IslandTooltip info={island} visible={isActive} onMouseEnter={cancelHide} onMouseLeave={scheduleHide} />
                          <div
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer"
                            style={{ left: `${island.leftPct}%`, padding: `${ISLAND_HIT_PAD}px` }}
                            onMouseEnter={() => showIslandTooltip(island)}
                            onMouseLeave={scheduleHide}
                            onClick={() => setDetailIsland(island)}
                          >
                            <div
                              className={`rounded-full transition-all duration-100 flex items-center justify-center ${bg} ${isActive ? 'ring-2 ring-offset-1 ring-current' : ''}`}
                              style={{ width: `${sizePx}px`, height: `${sizePx}px` }}
                            >
                              {sizePx >= 16 && (
                                <span className="text-[9px] font-semibold text-white tabular-nums leading-none">{island.count}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    brGroups.get(br)!.map((row) => {
                      const ratio   = row.fmr! / row.amr!;
                      const leftPct = toAxisPct(ratio);
                      const { bg }  = getDotStyle(ratio);
                      const dotInfo: DotInfo = { br, ratio, fmr: row.fmr!, amr: row.amr!, leftPct, zipCode: row.zipCode };
                      const key     = dotKey(dotInfo);
                      const isActive = tooltipVisible && activeDot !== null && dotKey(activeDot) === key;
                      return (
                        <div key={key}>
                          <DotTooltip info={dotInfo} visible={isActive} onMouseEnter={cancelHide} onMouseLeave={scheduleHide} />
                          <div
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer"
                            style={{ left: `${leftPct}%`, padding: `${SINGLE_HIT_PAD}px` }}
                            onMouseEnter={() => showDotTooltip(dotInfo)}
                            onMouseLeave={scheduleHide}
                          >
                            <div
                              className={`rounded-full transition-all duration-100 ${bg} ${isActive ? 'ring-2 ring-offset-1 ring-current' : ''}`}
                              style={{ width: `${isActive ? SINGLE_DOT_PX + 4 : SINGLE_DOT_PX}px`, height: `${isActive ? SINGLE_DOT_PX + 4 : SINGLE_DOT_PX}px` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <span className={`text-xs tabular-nums font-medium whitespace-nowrap shrink-0 ${rangeLabelStyle}`}>
                  {rangeLabel}
                </span>
              </div>
            );
          })}
        </div>

        {/* Axis ticks */}
        <div className="relative h-5 ml-14 mr-10">
          {TICKS.map((tick) => (
            <span key={tick} className="absolute text-[10px] text-[var(--text-tertiary)] -translate-x-1/2" style={{ left: `${toAxisPct(tick)}%` }}>
              {tick === 1.00 ? '1.00' : tick.toFixed(2)}
            </span>
          ))}
          <span
            className="absolute text-[9px] text-[var(--text-tertiary)] -translate-x-1/2 top-3.5 whitespace-nowrap opacity-70"
            style={{ left: `${(zoneLoPct + zoneHiPct) / 2}%` }}
          >
            aligned range
          </span>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-[var(--border-color)]">
        <p className="text-xs text-[var(--text-secondary)]">{getSummary(ratios)}</p>
      </div>

      <IslandDetailModal
        island={detailIsland}
        stateCode={stateCode}
        onClose={() => setDetailIsland(null)}
      />
    </div>
  );
}
