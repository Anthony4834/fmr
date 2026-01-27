'use client';

import { useMemo } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  color?: string;
  positiveColor?: string;
  negativeColor?: string;
  showArea?: boolean;
  className?: string;
}

/**
 * Lightweight SVG sparkline component for inline trend visualization.
 * Data values should be normalized (0-100) for consistent display.
 */
export default function Sparkline({
  data,
  width = 60,
  height = 20,
  strokeWidth = 1.5,
  color,
  positiveColor = 'var(--change-positive, #16a34a)',
  negativeColor = 'var(--change-negative, #dc2626)',
  showArea = true,
  className = '',
}: SparklineProps) {
  // Calculate the path and determine trend direction
  const { path, areaPath, isPositive, isEmpty } = useMemo(() => {
    if (!data || data.length < 2) {
      return { path: '', areaPath: '', isPositive: true, isEmpty: true };
    }

    const validData = data.filter(v => v !== null && v !== undefined && !isNaN(v));
    if (validData.length < 2) {
      return { path: '', areaPath: '', isPositive: true, isEmpty: true };
    }

    // Determine if trend is positive (last value > first value)
    const first = validData[0];
    const last = validData[validData.length - 1];
    const isPositive = last >= first;

    // Calculate points
    const padding = 2;
    const innerWidth = width - padding * 2;
    const innerHeight = height - padding * 2;
    
    const minVal = Math.min(...validData);
    const maxVal = Math.max(...validData);
    const range = maxVal - minVal || 1;

    const points = validData.map((value, index) => {
      const x = padding + (index / (validData.length - 1)) * innerWidth;
      const y = padding + innerHeight - ((value - minVal) / range) * innerHeight;
      return { x, y };
    });

    // Build SVG path
    const pathParts = points.map((point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`;
      return `L ${point.x} ${point.y}`;
    });
    const linePath = pathParts.join(' ');

    // Build area path (for fill under the line)
    const areaPathParts = [
      ...pathParts,
      `L ${points[points.length - 1].x} ${height - padding}`,
      `L ${points[0].x} ${height - padding}`,
      'Z',
    ];
    const areaPath = areaPathParts.join(' ');

    return { path: linePath, areaPath, isPositive, isEmpty: false };
  }, [data, width, height]);

  if (isEmpty) {
    // Empty state: show a neutral horizontal line
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={`inline-block ${className}`}
        aria-label="No trend data available"
      >
        <line
          x1={2}
          y1={height / 2}
          x2={width - 2}
          y2={height / 2}
          stroke="var(--text-muted)"
          strokeWidth={1}
          strokeDasharray="2,2"
          opacity={0.5}
        />
      </svg>
    );
  }

  const lineColor = color || (isPositive ? positiveColor : negativeColor);
  const areaOpacity = showArea ? 0.15 : 0;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`inline-block ${className}`}
      aria-label={`Trend: ${isPositive ? 'positive' : 'negative'}`}
    >
      {/* Area fill */}
      {showArea && (
        <path
          d={areaPath}
          fill={lineColor}
          opacity={areaOpacity}
        />
      )}
      {/* Line */}
      <path
        d={path}
        fill="none"
        stroke={lineColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Sparkline with tooltip showing percentage change
 */
export function SparklineWithTooltip({
  data,
  percentChange,
  ...props
}: SparklineProps & { percentChange?: number | null }) {
  const changeText = useMemo(() => {
    if (percentChange === null || percentChange === undefined) return null;
    const sign = percentChange >= 0 ? '+' : '';
    return `${sign}${percentChange.toFixed(1)}%`;
  }, [percentChange]);

  return (
    <div className="inline-flex items-center gap-1.5 group relative">
      <Sparkline data={data} {...props} />
      {changeText && (
        <span className={`text-[10px] font-medium tabular-nums ${
          percentChange! >= 0 
            ? 'text-green-600 dark:text-green-400' 
            : 'text-red-600 dark:text-red-400'
        }`}>
          {changeText}
        </span>
      )}
    </div>
  );
}
