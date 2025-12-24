'use client';

import { useEffect, useMemo, useRef, memo, useState } from 'react';
import Chart from 'chart.js/auto';

type Row = {
  br: number;
  medianFMR: number | null;
  medianYoY: number | null;
};

function formatCurrencyShort(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Helper function to get CSS variable value safely
function getCSSVariable(variableName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value || fallback;
}

function StateBedroomCurveChart(props: { rows: Row[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const [themeKey, setThemeKey] = useState<string>('light');

  const labels = useMemo(() => props.rows.map((r) => `${r.br}`), [props.rows]);
  const rent = useMemo(() => props.rows.map((r) => (typeof r.medianFMR === 'number' ? r.medianFMR : null)), [props.rows]);
  const yoy = useMemo(() => props.rows.map((r) => (typeof r.medianYoY === 'number' ? r.medianYoY : null)), [props.rows]);

  // Track theme changes to trigger rerender
  useEffect(() => {
    // Get initial theme
    const getTheme = () => {
      if (typeof window === 'undefined') return 'light';
      const themeAttr = document.documentElement.getAttribute('data-theme');
      return themeAttr || 'light';
    };
    
    setThemeKey(getTheme());
    
    // Watch for theme changes via MutationObserver
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          setThemeKey(getTheme());
        }
      });
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    // Get theme-aware colors
    const legendColor = getCSSVariable('--text-primary', '#0a0a0a');
    const gridColor = getCSSVariable('--border-color', '#f5f5f5');
    const tickColor = getCSSVariable('--text-tertiary', '#737373');

    chartRef.current = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Median rent',
            data: rent,
            yAxisID: 'yRent',
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.10)',
            pointBackgroundColor: '#2563eb',
            pointRadius: 3,
            pointHoverRadius: 5,
            borderWidth: 2.5,
            tension: 0.25,
            spanGaps: true,
          },
          {
            label: 'YoY %',
            data: yoy,
            yAxisID: 'yPct',
            borderColor: '#16a34a',
            backgroundColor: 'rgba(22, 163, 74, 0.08)',
            pointBackgroundColor: '#16a34a',
            pointRadius: 3,
            pointHoverRadius: 5,
            borderWidth: 2.25,
            tension: 0.25,
            spanGaps: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              usePointStyle: true,
              boxWidth: 10,
              padding: 10,
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
                if (ctx.dataset.yAxisID === 'yRent') return `${ctx.dataset.label}: ${formatCurrencyShort(v)}`;
                return `${ctx.dataset.label}: ${v.toFixed(1)}%`;
              },
            },
          },
        },
        scales: {
          x: {
            title: { display: false },
            grid: { color: gridColor },
            ticks: { color: tickColor },
          },
          yRent: {
            position: 'left',
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
          yPct: {
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: {
              color: tickColor,
              callback: (value) => {
                const n = Number(value);
                if (!Number.isFinite(n)) return '';
                return `${n}%`;
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
  }, [labels, rent, yoy, themeKey]);

  return (
    <div className="h-40 sm:h-44">
      <canvas ref={canvasRef} />
    </div>
  );
}

// Memoize component to prevent rerenders when parent rerenders but rows haven't changed
export default memo(StateBedroomCurveChart, (prevProps, nextProps) => {
  // Deep comparison of rows array
  if (prevProps.rows.length !== nextProps.rows.length) return false;
  return prevProps.rows.every((prevRow, index) => {
    const nextRow = nextProps.rows[index];
    return (
      prevRow.br === nextRow.br &&
      prevRow.medianFMR === nextRow.medianFMR &&
      prevRow.medianYoY === nextRow.medianYoY
    );
  });
});


