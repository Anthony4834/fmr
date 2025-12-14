'use client';

import { useEffect, useMemo, useRef } from 'react';
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

export default function StateBedroomCurveChart(props: { rows: Row[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  const labels = useMemo(() => props.rows.map((r) => `${r.br}`), [props.rows]);
  const rent = useMemo(() => props.rows.map((r) => (typeof r.medianFMR === 'number' ? r.medianFMR : null)), [props.rows]);
  const yoy = useMemo(() => props.rows.map((r) => (typeof r.medianYoY === 'number' ? r.medianYoY : null)), [props.rows]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

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
              color: '#0a0a0a',
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
            grid: { color: '#f5f5f5' },
            ticks: { color: '#737373' },
          },
          yRent: {
            position: 'left',
            grid: { color: '#f5f5f5' },
            ticks: {
              color: '#737373',
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
              color: '#737373',
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
  }, [labels, rent, yoy]);

  return (
    <div className="h-40 sm:h-44">
      <canvas ref={canvasRef} />
    </div>
  );
}


