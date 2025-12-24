'use client';

import { useEffect, useId, useRef, useState } from 'react';

interface InvestorScoreModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function getFocusable(el: HTMLElement) {
  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ];
  return Array.from(el.querySelectorAll<HTMLElement>(selectors.join(',')))
    .filter((node) => !node.hasAttribute('disabled') && !node.getAttribute('aria-hidden'));
}

export default function InvestorScoreModal({ isOpen, onClose }: InvestorScoreModalProps) {
  const [showMath, setShowMath] = useState(false);

  const titleId = useId();
  const descId = useId();
  const mathId = useId();

  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastActiveElRef = useRef<HTMLElement | null>(null);

  // Lock body scroll + store/restore last focused element
  useEffect(() => {
    if (!isOpen) return;

    lastActiveElRef.current = document.activeElement as HTMLElement | null;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the close button after mount
    requestAnimationFrame(() => closeBtnRef.current?.focus());

    return () => {
      document.body.style.overflow = originalOverflow;
      lastActiveElRef.current?.focus?.();
    };
  }, [isOpen]);

  // Escape to close + focus trapping
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;

      const root = modalRef.current;
      if (!root) return;

      const focusables = getFocusable(root);
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto" aria-hidden={false}>
      {/* Backdrop */}
      <button
        type="button"
        className="fixed inset-0 bg-black/50 cursor-default"
        aria-label="Close modal"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative bg-[var(--bg-secondary)] rounded-lg shadow-xl max-w-xl w-full max-h-[85vh] sm:max-h-[80vh] my-4 sm:my-0 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 border-b border-[var(--border-color)] bg-[var(--bg-tertiary)] flex-shrink-0 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold text-[var(--text-primary)]">
            How Investment Score Works
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--text-primary)] focus:ring-opacity-20"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-4 sm:px-6 py-3 overflow-y-auto flex-1 space-y-3">
          {/* TL;DR */}
          <p id={descId} className="text-sm text-[var(--text-secondary)]">
            A standardized way to compare rental investment potential across U.S. locations, combining <strong className="text-[var(--text-primary)]">cash-flow yield</strong> with <strong className="text-[var(--text-primary)]">market demand</strong>.
          </p>

          {/* Score Scale */}
          <div className="rounded-lg border border-[var(--border-color)] p-3 sm:p-4 bg-[var(--bg-secondary)]">
            <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-2">Score Scale</div>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-[#ef4444]" />
                <span className="text-[var(--text-secondary)]"><strong className="text-[var(--text-primary)]">&lt;95</strong> Below average</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-[#f59e0b]" />
                <span className="text-[var(--text-secondary)]"><strong className="text-[var(--text-primary)]">95-99</strong> Near median</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-[#22c55e]" />
                <span className="text-[var(--text-secondary)]"><strong className="text-[var(--text-primary)]">100-129</strong> Above average</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-[#16a34a]" />
                <span className="text-[var(--text-secondary)]"><strong className="text-[var(--text-primary)]">130+</strong> High yield potential</span>
              </div>
            </div>
            <p className="text-xs text-[var(--text-tertiary)] mt-2">100 = median market. Capped at 300.</p>
          </div>

          {/* Two-Part Formula */}
          <div>
            <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-2">The Formula</div>
            <div className="text-sm text-[var(--text-secondary)] space-y-2">
              <div className="rounded-lg border border-[var(--border-color)] p-2.5 bg-[var(--bg-tertiary)]">
                <div className="font-medium text-[var(--text-primary)] mb-1">1. Base Score (Net Yield)</div>
                <p className="text-xs leading-relaxed">
                  Calculates how much rent you keep after property taxes, relative to home price. Uses <strong className="text-[var(--text-primary)]">HUD Fair Market Rent</strong>, <strong className="text-[var(--text-primary)]">Zillow ZHVI</strong>, and <strong className="text-[var(--text-primary)]">ACS tax rates</strong>.
                </p>
              </div>
              <div className="rounded-lg border border-[var(--border-color)] p-2.5 bg-[var(--bg-tertiary)]">
                <div className="font-medium text-[var(--text-primary)] mb-1">2. Demand Adjustment</div>
                <p className="text-xs leading-relaxed">
                  Adjusts score based on rental market conditions using <strong className="text-[var(--text-primary)]">Zillow ZORDI</strong> (metro demand index) and <strong className="text-[var(--text-primary)]">ZORI</strong> (rent growth). Strong demand can boost scores up to +5%; weak demand can reduce by up to -30%.
                </p>
              </div>
            </div>
          </div>

          {/* Data Sources */}
          <div>
            <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-2">Data Sources</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border border-[var(--border-color)] p-2 bg-[var(--bg-secondary)]">
                <div className="font-medium text-[var(--text-primary)]">Rent</div>
                <div className="text-[var(--text-tertiary)]">HUD FMR/SAFMR</div>
              </div>
              <div className="rounded border border-[var(--border-color)] p-2 bg-[var(--bg-secondary)]">
                <div className="font-medium text-[var(--text-primary)]">Home Value</div>
                <div className="text-[var(--text-tertiary)]">Zillow ZHVI</div>
              </div>
              <div className="rounded border border-[var(--border-color)] p-2 bg-[var(--bg-secondary)]">
                <div className="font-medium text-[var(--text-primary)]">Property Tax</div>
                <div className="text-[var(--text-tertiary)]">ACS 5-Year</div>
              </div>
              <div className="rounded border border-[var(--border-color)] p-2 bg-[var(--bg-secondary)]">
                <div className="font-medium text-[var(--text-primary)]">Demand</div>
                <div className="text-[var(--text-tertiary)]">Zillow ZORDI/ZORI</div>
              </div>
            </div>
          </div>

          {/* Accordion: Full Math */}
          <div className="border-t border-[var(--border-color)] pt-3">
            <button
              type="button"
              onClick={() => setShowMath((v) => !v)}
              className="w-full flex items-center justify-between text-sm font-medium text-[var(--text-primary)] py-1 hover:text-[var(--text-secondary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--text-primary)] focus:ring-opacity-20 rounded"
              aria-expanded={showMath}
              aria-controls={mathId}
            >
              <span>Full calculation details</span>
              <svg
                className={`w-4 h-4 transition-transform ${showMath ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <div
              id={mathId}
              hidden={!showMath}
              className="mt-2 space-y-3 text-xs text-[var(--text-secondary)]"
            >
              {/* Net Yield Calculation */}
              <div className="rounded border border-[var(--border-color)] p-3 bg-[var(--bg-tertiary)]">
                <div className="font-semibold text-[var(--text-primary)] mb-2">Net Yield Calculation</div>
                <div className="space-y-1 font-mono text-[11px] bg-[var(--bg-secondary)] p-2 rounded border border-[var(--border-color)]">
                  <div>Annual Rent = FMR × 12</div>
                  <div>Annual Taxes = Property Value × Tax Rate</div>
                  <div>Net Yield = (Rent - Taxes) / Value</div>
                  <div className="pt-1 border-t border-[var(--border-color)] mt-1">Base Score = (Net Yield / Median) × 100</div>
                </div>
              </div>

              {/* Demand Score */}
              <div className="rounded border border-[var(--border-color)] p-3 bg-[var(--bg-tertiary)]">
                <div className="font-semibold text-[var(--text-primary)] mb-2">Demand Score (0-100)</div>
                <div className="space-y-1">
                  <div><strong className="text-[var(--text-primary)]">50%</strong> Demand Level — ZORDI percentile rank</div>
                  <div><strong className="text-[var(--text-primary)]">30%</strong> Demand Momentum — ZORDI 3-month change</div>
                  <div><strong className="text-[var(--text-primary)]">20%</strong> Rent Pressure — ZORI year-over-year growth</div>
                </div>
              </div>

              {/* Demand Multiplier */}
              <div className="rounded border border-[var(--border-color)] p-3 bg-[var(--bg-tertiary)]">
                <div className="font-semibold text-[var(--text-primary)] mb-2">Demand Multiplier</div>
                <div className="space-y-1">
                  <div><strong className="text-[var(--text-primary)]">High yield + strong demand:</strong> up to +5% boost</div>
                  <div><strong className="text-[var(--text-primary)]">High yield + weak demand:</strong> up to -30% penalty</div>
                  <div><strong className="text-[var(--text-primary)]">Low yield + strong demand:</strong> no change</div>
                  <div><strong className="text-[var(--text-primary)]">Low yield + weak demand:</strong> up to -30% penalty</div>
                </div>
              </div>

              {/* Quality Controls */}
              <div className="rounded border border-[var(--border-color)] p-3 bg-[var(--bg-tertiary)]">
                <div className="font-semibold text-[var(--text-primary)] mb-2">Quality Controls</div>
                <ul className="space-y-1 ml-3 list-disc">
                  <li>Price floor: minimum $100k property value</li>
                  <li>Rent cap: max 18% rent-to-price ratio</li>
                  <li>County blending: blend with county median if ZIP value &lt;$150k</li>
                  <li>Score cap: maximum 300</li>
                  <li>Bedroom priority: 3BR → 2BR → 4BR</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Not Included */}
          <div className="text-xs text-[var(--text-tertiary)] border-t border-[var(--border-color)] pt-3">
            <strong className="text-[var(--text-primary)]">Not included:</strong> mortgage costs, insurance, repairs, vacancy, HOA, appreciation. Use as a screening tool, not a complete pro forma.
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-2.5 border-t border-[var(--border-color)] bg-[var(--bg-tertiary)] flex items-center justify-end flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[var(--text-primary)] text-[var(--bg-primary)] text-sm font-medium rounded-md hover:bg-[var(--text-secondary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--text-primary)] focus:ring-opacity-20"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}




