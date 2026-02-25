'use client';

/**
 * Reusable percentage metric badge with consistent spacing and ▲/▼ icons
 */
export default function PercentageBadge(props: {
  value: number;
  className?: string;
  showSign?: boolean; // If true, shows + for positive values (default: false, uses ▲/▼)
  iconOnly?: boolean; // If true, show only the arrow/icon, no percentage value
}) {
  const { value, className = '', showSign = false, iconOnly = false } = props;
  const isPositive = value > 0.0001;
  const isNegative = value < -0.0001;
  const isZero = !isPositive && !isNegative;
  
  const icon = showSign
    ? (isPositive ? '+' : isNegative ? '-' : '')
    : (isPositive ? '▲' : isNegative ? '▼' : isZero ? '—' : '');
  const colorClass = isPositive
    ? 'text-[var(--change-positive)]'
    : isNegative
      ? 'text-[var(--change-negative)]'
      : 'text-[var(--change-neutral)]';

  return (
    <span className={`inline-flex items-center gap-0.5 tabular-nums font-semibold ${colorClass} ${className}`}>
      {icon && <span className={isZero ? 'inline-block' : ''}>{icon}</span>}
      {!iconOnly && <span>{Math.abs(value).toFixed(1)}%</span>}
    </span>
  );
}

