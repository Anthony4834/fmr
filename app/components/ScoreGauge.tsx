'use client';

import { useMemo, useEffect, useState } from 'react';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

type ScoreGaugeProps = {
  score: number | null;
  maxValue?: number;
  label?: string;
  description?: string;
};

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
    return getCSSVariable('--map-color-high', '#16a34a'); // Dark green: >= 130
  }
  return getCSSVariable('--map-color-medium', '#44e37e'); // Light green: >= 95 and < 130
}

function getTextColorForScore(score: number | null, themeKey?: string): string {
  // Use darker, higher contrast colors for text
  if (score === null || score === undefined || score < 95) {
    // Dark red for better contrast
    return themeKey === 'dark' ? '#ef4444' : '#b91c1c';
  }
  if (score >= 130) {
    // Darker green for better contrast
    return themeKey === 'dark' ? '#22c55e' : '#14532d';
  }
  // Medium green for better contrast
  return themeKey === 'dark' ? '#4ade80' : '#16a34a';
}

export default function ScoreGauge({ 
  score, 
  maxValue = 140,
  label = 'State Median Investment Score',
  description = 'Based on median scores across all counties'
}: ScoreGaugeProps) {
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
    
    if (score === null || score === undefined) {
      return {
        datasets: [
          {
            data: [maxValue],
            backgroundColor: [emptyBgColor],
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

  return (
    <div className="flex items-center gap-4">
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
        <div className="text-xs font-semibold text-[var(--text-primary)] mb-1">{label}</div>
        <div className="text-xs text-[var(--text-tertiary)]">{description}</div>
      </div>
    </div>
  );
}

