'use client';

import { useMemo, useEffect, useState } from 'react';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js';
import Tooltip from '@/app/components/Tooltip';

ChartJS.register(ArcElement, ChartTooltip, Legend);

type ScoreGaugeProps = {
  score?: number | null;
  maxValue?: number;
  label?: string;
  description?: string;
  loading?: boolean;
  confidenceScore?: number | null;
  confidenceReasons?: string[];
};

export function ScoreGaugeSkeleton() {
  return (
    <div className="flex items-center gap-4">
      <div className="w-[120px] h-[60px] bg-[var(--border-color)] rounded animate-pulse" />
      <div className="flex-1">
        <div className="h-3 bg-[var(--border-color)] rounded w-32 mb-2 animate-pulse" />
        <div className="h-3 bg-[var(--border-color)] rounded w-48 animate-pulse" />
      </div>
    </div>
  );
}

// Helper function to get CSS variable value safely
function getCSSVariable(variableName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value || fallback;
}

function getColorForScore(score: number | null): string {
  if (score === null || score === undefined || score < 95) {
    return getCSSVariable('--map-color-low', '#fca5a5'); // Light red: <95 or no data
  }
  if (score >= 130) {
    return getCSSVariable('--map-color-high', '#60a5fa'); // Light vibrant blue: >= 130
  }
  return getCSSVariable('--map-color-medium', '#44e37e'); // Light green: 100-129
}

function getTextColorForScore(score: number | null, themeKey?: string): string {
  // Use darker, higher contrast colors for text
  if (score === null || score === undefined || score < 95) {
    // Dark red for better contrast
    return themeKey === 'dark' ? '#ef4444' : '#b91c1c';
  }
  if (score >= 130) {
    // Lighter blue for better contrast
    return themeKey === 'dark' ? '#93c5fd' : '#2563eb';
  }
  // Medium green for better contrast
  return themeKey === 'dark' ? '#4ade80' : '#16a34a';
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 80) return 'var(--map-color-medium)';
  if (confidence >= 60) return '#f59e0b'; // amber
  return 'var(--map-color-low)';
}

export default function ScoreGauge({ 
  score = null, 
  maxValue = 140,
  label = 'State Median Investment Score',
  description = 'Based on median scores across all counties',
  loading = false,
  confidenceScore = null,
  confidenceReasons = [],
}: ScoreGaugeProps) {
  if (loading) {
    return <ScoreGaugeSkeleton />;
  }
  // Track theme changes to trigger rerender
  const [themeKey, setThemeKey] = useState<string>('light');
  
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
  
  const chartData = useMemo(() => {
    const emptyBgColor = getCSSVariable('--border-color', '#e5e5e5');
    // Use a distinct color for the unfilled area that contrasts with the background
    // In dark mode, use border-color for visibility; in light mode, use bg-tertiary
    const unfilledColor = themeKey === 'dark' 
      ? getCSSVariable('--border-color', 'rgba(237, 237, 237, 0.1)')
      : getCSSVariable('--bg-tertiary', '#f5f5f5');
    
    // Insufficient data state: show muted chart with same shape
    if (score === null || score === undefined) {
      // Use a muted gray color with reduced opacity for insufficient data
      const mutedColor = themeKey === 'dark' 
        ? 'rgba(156, 163, 175, 0.3)' // muted gray with opacity for dark mode
        : 'rgba(156, 163, 175, 0.4)'; // muted gray with opacity for light mode
      
      return {
        datasets: [
          {
            data: [maxValue],
            backgroundColor: [mutedColor],
            borderWidth: 0,
            cutout: '75%',
          },
        ],
      };
    }

    // For gauge display, cap at maxValue, but show actual score in text
    const gaugeValue = Math.min(score, maxValue);
    const remaining = maxValue - gaugeValue;
    const scoreColor = getColorForScore(score);

    return {
      datasets: [
        {
          data: [gaugeValue, remaining],
          backgroundColor: [scoreColor, unfilledColor],
          borderWidth: 0,
          cutout: '75%',
        },
      ],
    };
  }, [score, maxValue, themeKey]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: false,
      },
    },
    rotation: -90,
    circumference: 180,
  }), []);

  const displayScore = score !== null && score !== undefined ? Math.round(score) : null;

  const isInsufficientData = score === null || score === undefined;

  return (
    <div className={`flex items-center gap-4 ${isInsufficientData ? 'opacity-60' : ''}`}>
      <div className="relative" style={{ width: '120px', height: '60px' }}>
        <Doughnut key={themeKey} data={chartData} options={options} />
        <div className="absolute inset-0 flex items-end justify-center pb-1">
          <div className="text-center">
            {displayScore !== null ? (
              <>
                <div 
                  className="text-2xl font-bold leading-none"
                  style={{ color: getTextColorForScore(score, themeKey) }}
                >
                  {displayScore}
                </div>
              </>
            ) : (
              <div className="text-lg font-semibold text-[var(--text-muted)]">—</div>
            )}
          </div>
        </div>
      </div>
      <div className="flex-1">
        <div className={`text-xs font-semibold mb-1 ${isInsufficientData ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}`}>
          {label}
        </div>
        <div className="text-xs text-[var(--text-tertiary)]">
          {isInsufficientData ? 'Insufficient data to calculate score' : description}
        </div>
        {confidenceScore !== null && confidenceScore < 100 && !isInsufficientData && (
          <Tooltip
            content={
              <div>
                <div className="font-semibold mb-1">Data Confidence: {Math.round(confidenceScore)}%</div>
                {confidenceReasons.length > 0 ? (
                  <ul className="space-y-0.5">
                    {confidenceReasons.map((reason, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span className="mt-0.5 shrink-0">•</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div>Some data sources are unavailable for this area.</div>
                )}
              </div>
            }
            side="bottom"
            align="start"
          >
            <div className="mt-1.5 inline-flex items-center gap-1 cursor-help">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: getConfidenceColor(confidenceScore) }}
              />
              <span className="text-[11px] text-[var(--text-tertiary)]">
                {Math.round(confidenceScore)}% confidence
              </span>
            </div>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

