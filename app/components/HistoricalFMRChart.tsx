'use client';

import { useEffect, useMemo, useRef } from 'react';
import Chart from 'chart.js/auto';
import type { FMRHistoryPoint } from '@/lib/types';

type BedroomKey = 'bedroom0' | 'bedroom1' | 'bedroom2' | 'bedroom3' | 'bedroom4';

const BEDROOMS: { key: BedroomKey; label: string }[] = [
  { key: 'bedroom0', label: '0 BR' },
  { key: 'bedroom1', label: '1 BR' },
  { key: 'bedroom2', label: '2 BR' },
  { key: 'bedroom3', label: '3 BR' },
  { key: 'bedroom4', label: '4 BR' },
];

const BEDROOM_COLORS: Record<BedroomKey, { stroke: string; fill: string }> = {
  bedroom0: { stroke: '#7c3aed', fill: 'rgba(124, 58, 237, 0.12)' }, // violet
  bedroom1: { stroke: '#059669', fill: 'rgba(5, 150, 105, 0.12)' }, // emerald
  bedroom2: { stroke: '#2563eb', fill: 'rgba(37, 99, 235, 0.12)' }, // blue
  bedroom3: { stroke: '#ea580c', fill: 'rgba(234, 88, 12, 0.12)' }, // orange
  bedroom4: { stroke: '#dc2626', fill: 'rgba(220, 38, 38, 0.12)' }, // red
};

function formatCurrencyShort(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function HistoricalFMRChart({
  history,
}: {
  history: FMRHistoryPoint[];
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  const sortedHistory = useMemo(() => [...history].sort((a, b) => a.year - b.year), [history]);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const p of sortedHistory) set.add(p.year);
    return Array.from(set).sort((a, b) => a - b);
  }, [sortedHistory]);

  const minYear = years.length ? years[0] : null;
  const maxYear = years.length ? years[years.length - 1] : null;
  if (!minYear || !maxYear || years.length < 2) return null;

  const historyByYear = useMemo(() => new Map(sortedHistory.map((p) => [p.year, p])), [sortedHistory]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Recreate chart whenever history changes (simple + reliable).
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const labels = years.map((y) => String(y));
    const datasets = BEDROOMS.map((b) => {
      const color = BEDROOM_COLORS[b.key];
      return {
        label: b.label,
        data: years.map((y) => (historyByYear.get(y)?.[b.key] as number | undefined) ?? null),
        borderColor: color.stroke,
        backgroundColor: color.fill,
        pointBackgroundColor: color.stroke,
        pointBorderColor: color.stroke,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2.5,
        tension: 0.25,
        spanGaps: true,
      };
    });

    chartRef.current = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              usePointStyle: true,
              boxWidth: 10,
              padding: 12,
              color: '#0a0a0a',
              font: { size: 12, weight: 600 },
            },
          },
          tooltip: {
            enabled: true,
            callbacks: {
              title: (items) => {
                const label = items?.[0]?.label;
                return label ? `FY ${label}` : '';
              },
              label: (ctx) => {
                const v = ctx.parsed?.y;
                if (v === null || v === undefined || Number.isNaN(v)) return `${ctx.dataset.label}: N/A`;
                return `${ctx.dataset.label}: ${formatCurrencyShort(v)}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: '#f5f5f5' },
            ticks: { color: '#737373' },
          },
          y: {
            grid: { color: '#f5f5f5' },
            ticks: {
              color: '#737373',
              callback: (val) => {
                const num = typeof val === 'number' ? val : Number(val);
                if (!Number.isFinite(num)) return '';
                return formatCurrencyShort(num);
              },
            },
          },
        },
      },
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [historyByYear, years]);

  return (
    <div className="mt-4 sm:mt-5 border border-[#e5e5e5] rounded-xl bg-white p-3 sm:p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold text-[#0a0a0a]">Historical</div>
        <div className="text-xs text-[#737373]">See FMR trends since FY2022</div>
      </div>

      <div className="relative w-full h-[260px]">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

