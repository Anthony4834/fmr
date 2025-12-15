'use client';

import { useMemo } from 'react';
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

function getColorForScore(score: number | null): string {
  if (score === null || score === undefined || score < 95) {
    return '#fca5a5'; // Light red: <95 or no data
  }
  if (score >= 130) {
    return '#16a34a'; // Dark green: >= 130
  }
  return '#44e37e'; // Light green: >= 95 and < 130
}

function getTextColorForScore(score: number | null): string {
  if (score === null || score === undefined || score < 95) {
    return '#b91c1c'; // Dark red for text: <95 or no data (improved contrast for readability)
  }
  if (score >= 130) {
    return '#14532d'; // Darker green for text: >= 130 (improved legibility for small/bold labels)
  }
  return '#16a34a'; // Darker green for text: >= 95 and < 130 (improved contrast, easier on eyes)
}

export default function ScoreGauge({ 
  score, 
  maxValue = 140,
  label = 'State Median Investment Score',
  description = 'Based on median scores across all counties'
}: ScoreGaugeProps) {
  const chartData = useMemo(() => {
    if (score === null || score === undefined) {
      return {
        datasets: [
          {
            data: [maxValue],
            backgroundColor: ['#e5e5e5'],
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
          backgroundColor: [scoreColor, '#f3f4f6'],
          borderWidth: 0,
          cutout: '75%',
        },
      ],
    };
  }, [score, maxValue]);

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
        <Doughnut data={chartData} options={options} />
        <div className="absolute inset-0 flex items-end justify-center pb-1">
          <div className="text-center">
            {displayScore !== null ? (
              <>
                <div 
                  className="text-2xl font-bold leading-none"
                  style={{ color: getTextColorForScore(score) }}
                >
                  {displayScore}
                </div>
              </>
            ) : (
              <div className="text-lg font-semibold text-[#737373]">—</div>
            )}
          </div>
        </div>
      </div>
      <div className="flex-1">
        <div className="text-xs font-semibold text-[#0a0a0a] mb-1">{label}</div>
        <div className="text-xs text-[#737373]">{description}</div>
      </div>
    </div>
  );
}

