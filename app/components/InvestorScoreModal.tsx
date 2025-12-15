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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" aria-hidden={false}>
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
        className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#e5e5e5] bg-[#fafafa] flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-xl font-semibold text-[#0a0a0a]">
                Investor Score
              </h2>
              <p className="text-sm text-[#737373] mt-1">
                A quick way to compare rental cash-flow potential across locations.
              </p>
            </div>

            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-md p-1 text-[#737373] hover:text-[#0a0a0a] hover:bg-black/5 transition-colors focus:outline-none focus:ring-2 focus:ring-black/30"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {/* One-sentence explanation */}
          <p id={descId} className="text-sm text-[#525252] mb-6">
            The Investor Score estimates how much rent you can earn <strong>after property taxes</strong>,
            relative to the <strong>home price</strong>, then compares that result to the typical (median) market.
          </p>

          {/* Section 1 */}
          <section className="mb-6">
            <h3 className="text-base font-semibold text-[#0a0a0a] mb-3">What the score means</h3>
            <p className="text-sm text-[#525252] mb-3">
              Think of it like a “value rating” for rental investing. It’s based on an estimated net yield using:
            </p>
            <ul className="space-y-2 text-sm text-[#525252] ml-4 list-disc">
              <li><strong>Rent (estimated):</strong> Section 8 Fair Market Rent (FMR)</li>
              <li><strong>Home price (estimated):</strong> Zillow Home Value Index (ZHVI)</li>
              <li><strong>Taxes (estimated):</strong> local effective property tax rate (ACS)</li>
            </ul>
            <p className="text-sm text-[#525252] mt-3">
              So <strong>higher score = more rent for the price, after taxes</strong>.
            </p>
          </section>

          {/* Section 2 */}
          <section className="mb-6">
            <h3 className="text-base font-semibold text-[#0a0a0a] mb-3">How to read it</h3>

            <div className="rounded-md border border-[#e5e5e5] p-4 bg-white">
              <ul className="space-y-2 text-sm text-[#525252]">
                <li><strong>100</strong> = typical market (median)</li>

                <li className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded bg-[#fca5a5]" aria-hidden="true" />
                  <span><strong>Below 95</strong> → Below average cash-flow potential</span>
                </li>

                <li className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded bg-[#44e37e]" aria-hidden="true" />
                  <span><strong>95–129</strong> → Above average</span>
                </li>

                <li className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded bg-[#16a34a]" aria-hidden="true" />
                  <span><strong>130+</strong> → Strong opportunity</span>
                </li>

                <li><strong>Up to 300</strong> → Scores are capped at 300 to avoid extreme outliers</li>
              </ul>

              <p className="text-sm text-[#525252] mt-3">
                <strong>Example:</strong> A score of 150 means the estimated net yield is about 50% higher than the median.
              </p>
            </div>
          </section>

          {/* Section 3 */}
          <section className="mb-6">
            <h3 className="text-base font-semibold text-[#0a0a0a] mb-3">What’s included (and what’s not)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-md border border-[#e5e5e5] p-4 bg-[#fafafa]">
                <h4 className="text-sm font-semibold text-[#0a0a0a] mb-2">Included</h4>
                <ul className="space-y-1 text-sm text-[#525252] ml-4 list-disc">
                  <li>Estimated rent using HUD FMR (ZIP-level when available)</li>
                  <li>Estimated property value using Zillow ZHVI</li>
                  <li>Estimated property taxes using ACS tax rates</li>
                </ul>
              </div>

              <div className="rounded-md border border-[#e5e5e5] p-4 bg-[#fafafa]">
                <h4 className="text-sm font-semibold text-[#0a0a0a] mb-2">Not included</h4>
                <ul className="space-y-1 text-sm text-[#525252] ml-4 list-disc">
                  <li>Mortgage/interest rate</li>
                  <li>Insurance, repairs, vacancy, management, HOA</li>
                  <li>Appreciation, block-level neighborhood nuances</li>
                </ul>
              </div>
            </div>
            <p className="text-sm text-[#525252] mt-3 italic">
              Use this as a starting point, not a full pro forma.
            </p>
          </section>

          {/* Section 4: Accordion */}
          <section className="mb-6">
            <button
              type="button"
              onClick={() => setShowMath((v) => !v)}
              className="w-full flex items-center justify-between text-sm font-semibold text-[#0a0a0a] rounded-md px-3 py-2 hover:bg-black/5 transition-colors focus:outline-none focus:ring-2 focus:ring-black/30"
              aria-expanded={showMath}
              aria-controls={mathId}
            >
              <span>See the math</span>
              <svg
                className={`w-5 h-5 transition-transform ${showMath ? 'rotate-180' : ''}`}
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
              className="mt-3 pl-4 border-l-2 border-[#e5e5e5] space-y-4 text-sm text-[#525252]"
            >
              <div>
                <h4 className="font-semibold text-[#0a0a0a] mb-2">Step 1: Estimate annual rent and taxes</h4>
                <ul className="space-y-1 ml-4 list-disc">
                  <li>Annual Gross Rent = 12 × FMR (monthly)</li>
                  <li>Annual Property Taxes = Property Value × Tax Rate</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-[#0a0a0a] mb-2">Step 2: Net Yield</h4>
                <p className="font-mono bg-[#fafafa] p-2 rounded border border-[#e5e5e5]">
                  Net Yield = (Annual Rent − Annual Taxes) ÷ Property Value
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-[#0a0a0a] mb-2">Step 3: Turn yield into a score (normalized)</h4>
                <ul className="space-y-1 ml-4 list-disc">
                  <li>Raw Score = (Net Yield ÷ Median Net Yield) × 100</li>
                  <li>Final Score = min(Raw Score, 300)</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section className="mb-6">
            <h3 className="text-base font-semibold text-[#0a0a0a] mb-3">Data reliability safeguards</h3>
            <p className="text-sm text-[#525252] mb-3">
              We apply quality controls to prevent “too good to be true” scores:
            </p>
            <ul className="space-y-2 text-sm text-[#525252] ml-4 list-disc">
              <li><strong>Low-price ZIP blending:</strong> if ZIP value is under $150k, we blend 60% ZIP + 40% county median (when available).</li>
              <li><strong>Price floor:</strong> property value can’t go below $100,000.</li>
              <li><strong>Rent-to-price cap:</strong> annual rent can’t exceed 18% of home value.</li>
              <li><strong>Score cap:</strong> maximum score is 300.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="mb-6">
            <h3 className="text-base font-semibold text-[#0a0a0a] mb-3">Bedroom choice</h3>
            <p className="text-sm text-[#525252]">
              We use the most representative bedroom size available, prioritized: <strong>3BR → 2BR → 4BR</strong> (we skip areas that only have 0BR/1BR).
            </p>
          </section>

          {/* Footer/CTA inside content */}
          <section className="border-t border-[#e5e5e5] pt-4">
            <h3 className="text-base font-semibold text-[#0a0a0a] mb-2">How to use this score</h3>
            <ul className="space-y-1 text-sm text-[#525252] ml-4 list-disc mb-4">
              <li>Compare ZIP codes/cities on a consistent scale</li>
              <li>Find high-yield areas faster</li>
              <li>Then click into a location to review local details</li>
            </ul>

            <div className="flex items-start gap-2 text-xs text-[#737373]">
              <svg className="w-4 h-4 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>
                <strong>Why Section 8 rents?</strong> FMR is a standardized rent benchmark across the U.S., making locations easier to compare consistently.
              </p>
            </div>
          </section>
        </div>

        {/* Footer buttons */}
        <div className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex items-center justify-between flex-shrink-0">
          <a
            href="/methodology#data-sources"
            className="text-sm text-[#525252] hover:text-[#0a0a0a] transition-colors underline underline-offset-2"
          >
            View data sources
          </a>

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
