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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" aria-hidden={false}>
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/50 cursor-default"
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
        className="relative bg-white rounded-lg shadow-xl max-w-xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-[#e5e5e5] bg-[#fafafa] flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-lg sm:text-xl font-semibold text-[#0a0a0a]">
              How Investment Score Works
            </h2>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-md p-1 text-[#737373] hover:text-[#0a0a0a] hover:bg-black/5 transition-colors focus:outline-none focus:ring-2 focus:ring-black/30"
              aria-label="Close"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 sm:px-6 py-4 overflow-y-auto flex-1 space-y-5">
          {/* TL;DR */}
          <p id={descId} className="text-sm text-[#525252]">
            A standardized way to compare rental investment potential across U.S. locations, combining <strong>cash-flow yield</strong> with <strong>market demand</strong>.
          </p>

          {/* Score Scale */}
          <div className="rounded-lg border border-[#e5e5e5] p-3 sm:p-4 bg-white">
            <div className="text-xs font-medium text-[#737373] uppercase tracking-wide mb-2">Score Scale</div>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-[#ef4444]" />
                <span className="text-[#525252]"><strong>&lt;95</strong> Below average</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-[#f59e0b]" />
                <span className="text-[#525252]"><strong>95-99</strong> Near median</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-[#22c55e]" />
                <span className="text-[#525252]"><strong>100-129</strong> Above average</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-[#16a34a]" />
                <span className="text-[#525252]"><strong>130+</strong> High yield potential</span>
              </div>
            </div>
            <p className="text-xs text-[#737373] mt-2">100 = median market. Capped at 300.</p>
          </div>

          {/* Two-Part Formula */}
          <div>
            <div className="text-xs font-medium text-[#737373] uppercase tracking-wide mb-2">The Formula</div>
            <div className="text-sm text-[#525252] space-y-3">
              <div className="rounded-lg border border-[#e5e5e5] p-3 bg-[#fafafa]">
                <div className="font-medium text-[#0a0a0a] mb-1">1. Base Score (Net Yield)</div>
                <p className="text-xs leading-relaxed">
                  Calculates how much rent you keep after property taxes, relative to home price. Uses <strong>HUD Fair Market Rent</strong>, <strong>Zillow ZHVI</strong>, and <strong>ACS tax rates</strong>.
                </p>
              </div>
              <div className="rounded-lg border border-[#e5e5e5] p-3 bg-[#fafafa]">
                <div className="font-medium text-[#0a0a0a] mb-1">2. Demand Adjustment</div>
                <p className="text-xs leading-relaxed">
                  Adjusts score based on rental market conditions using <strong>Zillow ZORDI</strong> (metro demand index) and <strong>ZORI</strong> (rent growth). Strong demand can boost scores up to +5%; weak demand can reduce by up to -30%.
                </p>
              </div>
            </div>
          </div>

          {/* Data Sources */}
          <div>
            <div className="text-xs font-medium text-[#737373] uppercase tracking-wide mb-2">Data Sources</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border border-[#e5e5e5] p-2 bg-white">
                <div className="font-medium text-[#0a0a0a]">Rent</div>
                <div className="text-[#737373]">HUD FMR/SAFMR</div>
              </div>
              <div className="rounded border border-[#e5e5e5] p-2 bg-white">
                <div className="font-medium text-[#0a0a0a]">Home Value</div>
                <div className="text-[#737373]">Zillow ZHVI</div>
              </div>
              <div className="rounded border border-[#e5e5e5] p-2 bg-white">
                <div className="font-medium text-[#0a0a0a]">Property Tax</div>
                <div className="text-[#737373]">ACS 5-Year</div>
              </div>
              <div className="rounded border border-[#e5e5e5] p-2 bg-white">
                <div className="font-medium text-[#0a0a0a]">Demand</div>
                <div className="text-[#737373]">Zillow ZORDI/ZORI</div>
              </div>
            </div>
          </div>

          {/* Accordion: Full Math */}
          <div className="border-t border-[#e5e5e5] pt-4">
            <button
              type="button"
              onClick={() => setShowMath((v) => !v)}
              className="w-full flex items-center justify-between text-sm font-medium text-[#0a0a0a] py-1 hover:text-[#525252] transition-colors focus:outline-none focus:ring-2 focus:ring-black/20 rounded"
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
              className="mt-3 space-y-4 text-xs text-[#525252]"
            >
              {/* Net Yield Calculation */}
              <div className="rounded border border-[#e5e5e5] p-3 bg-[#fafafa]">
                <div className="font-semibold text-[#0a0a0a] mb-2">Net Yield Calculation</div>
                <div className="space-y-1 font-mono text-[11px] bg-white p-2 rounded border border-[#e5e5e5]">
                  <div>Annual Rent = FMR × 12</div>
                  <div>Annual Taxes = Property Value × Tax Rate</div>
                  <div>Net Yield = (Rent - Taxes) / Value</div>
                  <div className="pt-1 border-t border-[#e5e5e5] mt-1">Base Score = (Net Yield / Median) × 100</div>
                </div>
              </div>

              {/* Demand Score */}
              <div className="rounded border border-[#e5e5e5] p-3 bg-[#fafafa]">
                <div className="font-semibold text-[#0a0a0a] mb-2">Demand Score (0-100)</div>
                <div className="space-y-1">
                  <div><strong>50%</strong> Demand Level — ZORDI percentile rank</div>
                  <div><strong>30%</strong> Demand Momentum — ZORDI 3-month change</div>
                  <div><strong>20%</strong> Rent Pressure — ZORI year-over-year growth</div>
                </div>
              </div>

              {/* Demand Multiplier */}
              <div className="rounded border border-[#e5e5e5] p-3 bg-[#fafafa]">
                <div className="font-semibold text-[#0a0a0a] mb-2">Demand Multiplier</div>
                <div className="space-y-1">
                  <div><strong>High yield + strong demand:</strong> up to +5% boost</div>
                  <div><strong>High yield + weak demand:</strong> up to -30% penalty</div>
                  <div><strong>Low yield + strong demand:</strong> no change</div>
                  <div><strong>Low yield + weak demand:</strong> up to -30% penalty</div>
                </div>
              </div>

              {/* Quality Controls */}
              <div className="rounded border border-[#e5e5e5] p-3 bg-[#fafafa]">
                <div className="font-semibold text-[#0a0a0a] mb-2">Quality Controls</div>
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
          <div className="text-xs text-[#737373] border-t border-[#e5e5e5] pt-4">
            <strong>Not included:</strong> mortgage costs, insurance, repairs, vacancy, HOA, appreciation. Use as a screening tool, not a complete pro forma.
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-[#e5e5e5] bg-[#fafafa] flex items-center justify-end flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#0a0a0a] text-white text-sm font-medium rounded-md hover:bg-[#262626] transition-colors focus:outline-none focus:ring-2 focus:ring-black/30"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
