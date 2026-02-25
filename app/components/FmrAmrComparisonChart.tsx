'use client';

import { useEffect, useRef, memo, useState } from 'react';
import Chart from 'chart.js/auto';

export type FmrAmrRow = {
  br: number;
  fmr: number | null;
  amr: number | null;
};

function formatCurrencyShort(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function getCSSVariable(variableName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value || fallback;
}

function FmrAmrComparisonChart(props: { rows: FmrAmrRow[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const [themeKey, setThemeKey] = useState<string>('light');

  const labels = props.rows.map((r) => `${r.br}`);
  const fmrData = props.rows.map((r) => (r.fmr != null ? r.fmr : null));
  const amrData = props.rows.map((r) => (r.amr != null ? r.amr : null));
  const fmr90Data = props.rows.map((r) => (r.fmr != null ? Math.round(r.fmr * 0.9) : null));
  const fmr110Data = props.rows.map((r) => (r.fmr != null ? Math.round(r.fmr * 1.1) : null));

  useEffect(() => {
    const getTheme = () => {
      if (typeof window === 'undefined') return 'light';
      return document.documentElement.getAttribute('data-theme') || 'light';
    };
    setThemeKey(getTheme());
    const observer = new MutationObserver(() => setThemeKey(getTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const legendColor = getCSSVariable('--text-primary', '#0a0a0a');
    const gridColor = getCSSVariable('--border-color', '#f5f5f5');
    const tickColor = getCSSVariable('--text-tertiary', '#737373');

    chartRef.current = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'FMR',
            data: fmrData,
            backgroundColor: 'rgba(37, 99, 235, 0.7)',
            borderColor: '#2563eb',
            borderWidth: 1,
            order: 2,
          },
          {
            label: 'AMR',
            data: amrData,
            backgroundColor: 'rgba(22, 163, 74, 0.7)',
            borderColor: '#16a34a',
            borderWidth: 1,
            order: 2,
          },
          {
            label: '90% FMR',
            data: fmr90Data,
            type: 'line',
            borderColor: 'rgba(37, 99, 235, 0.4)',
            borderDash: [4, 2],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
            order: 1,
          },
          {
            label: '110% FMR',
            data: fmr110Data,
            type: 'line',
            borderColor: 'rgba(37, 99, 235, 0.4)',
            borderDash: [4, 2],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              usePointStyle: true,
              boxWidth: 10,
              padding: 8,
              color: legendColor,
              font: { size: 11, weight: 600 },
            },
          },
          tooltip: {
            callbacks: {
              title: (items) => {
                const br = items?.[0]?.label ?? '';
                return `${br} BR`;
              },
              label: (ctx) => {
                const v = ctx.parsed?.y;
                if (v === null || v === undefined || Number.isNaN(v)) return `${ctx.dataset.label}: —`;
                return `${ctx.dataset.label}: ${formatCurrencyShort(v)}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: tickColor, maxRotation: 0 },
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: tickColor,
              callback: (value) => {
                const n = Number(value);
                if (!Number.isFinite(n)) return '';
                return `$${Math.round(n / 100) * 100}`;
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
  }, [labels.join(','), fmrData.join(','), amrData.join(','), fmr90Data.join(','), fmr110Data.join(','), themeKey]);

  return (
    <div className="h-48 sm:h-52">
      <canvas ref={canvasRef} />
    </div>
  );
}

export default memo(FmrAmrComparisonChart, (prev, next) => {
  if (prev.rows.length !== next.rows.length) return false;
  return prev.rows.every((r, i) => {
    const o = next.rows[i];
    return r.br === o.br && r.fmr === o.fmr && r.amr === o.amr;
  });
});
