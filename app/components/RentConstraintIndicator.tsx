'use client';

import type { RentConstraint } from '@/lib/types';
import Tooltip from './Tooltip';

interface RentConstraintIndicatorProps {
  constraint: RentConstraint | null | undefined;
  className?: string;
  /** If true, render as a compact badge; otherwise a short inline message. */
  variant?: 'badge' | 'banner';
  /** BR sizes (0–4) where FMR > AMR. When a subset, shows hybrid message instead of aggregate %. */
  constrainedBedroomSizes?: number[];
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function getGapTooltipText(gapAmount?: number | null, gapPct?: number | null): string {
  if (gapAmount == null) return 'No measurable rent gap for this location.';
  const absAmount = formatCurrency(Math.abs(gapAmount));
  const pctText = gapPct != null ? ` (${Math.abs(gapPct).toFixed(0)}%)` : '';
  if (gapAmount > 0) {
    return `HUD FMR is about ${absAmount}${pctText} above market rent. Under rent reasonableness, payment is limited to the lower of FMR and reasonable market rent.`;
  }
  if (gapAmount < 0) {
    return `Market rent is about ${absAmount}${pctText} above HUD FMR. This is generally favorable for payment limits.`;
  }
  return 'HUD FMR and market rent are about the same.';
}

const BR_LABELS: Record<number, string> = { 0: '0 BR', 1: '1 BR', 2: '2 BR', 3: '3 BR', 4: '4 BR' };

export default function RentConstraintIndicator({
  constraint,
  className = '',
  variant = 'badge',
  constrainedBedroomSizes = [],
}: RentConstraintIndicatorProps) {
  if (!constraint) return null;

  const { isConstrained, missingMarketRent, gapAmount, gapPct } = constraint;
  if (!isConstrained && !missingMarketRent) return null;

  if (variant === 'banner') {
    return (
      <div
        className={`rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-secondary)] ${className}`}
      >
        {missingMarketRent && (
          <p>
            <span className="font-medium text-[var(--text-primary)]">Market rent data unavailable.</span>{' '}
            Using HUD FMR as fallback.
          </p>
        )}
        {isConstrained && !missingMarketRent && (
          <p>
            {constrainedBedroomSizes.length > 0 && constrainedBedroomSizes.length < 5 ? (
             <>
             <span className="font-medium text-[var(--text-primary)]">
               FMR exceeds current market rents for {constrainedBedroomSizes.map((br) => BR_LABELS[br]).join(', ')}.
             </span>{' '}
             Under HUD’s rent reasonableness standards, the approved rent may be reduced if comparable units are priced lower.
           </>
            ) : (
              <>
                <span className="font-medium text-[var(--text-primary)]">
                  FMR trends higher than actual market rates
                  {gapPct != null && ` by ${gapPct.toFixed(0)}%`}.
                </span>{' '}
                Under HUD's rent reasonableness requirement, payment is limited to the lower of FMR and reasonable market rent, so tenants may not receive the full FMR amount.
              </>
            )}
          </p>
        )}
      </div>
    );
  }

  const statusTooltip = missingMarketRent
    ? 'Market-rent data is unavailable for this location. HUD FMR is shown as fallback.'
    : 'HUD FMR is above market rent; under rent reasonableness, payment is limited to the lower of FMR and reasonable market rent.';
  const gapTooltip = getGapTooltipText(gapAmount, gapPct);

  return (
    <Tooltip content={`${statusTooltip} ${gapTooltip}`} side="top" align="center">
      <span
        aria-label="Rent constraint details"
        className={`inline-flex h-4 w-4 items-center justify-center cursor-help ${className}`}
        style={{
          color: missingMarketRent
            ? 'rgb(245 158 11)'
            : isConstrained
              ? 'rgb(234 88 12)'
              : 'var(--text-tertiary)',
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0ZM9 8a1 1 0 1 0 2 0 1 1 0 0 0-2 0Zm2 2a1 1 0 1 0-2 0v3a1 1 0 1 0 2 0v-3Z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    </Tooltip>
  );
}
