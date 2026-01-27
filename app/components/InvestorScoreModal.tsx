'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [isDark, setIsDark] = useState(false);

  const titleId = useId();
  const descId = useId();
  const mathId = useId();

  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastActiveElRef = useRef<HTMLElement | null>(null);

  // Check theme
  useEffect(() => {
    const checkTheme = () => {
      const theme = document.documentElement.getAttribute('data-theme');
      setIsDark(theme === 'dark');
    };
    
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    
    return () => observer.disconnect();
  }, []);

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

  // Standardized dark mode colors
  const bgOverlay = isDark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.5)';
  const cardBg = isDark ? 'hsl(220 15% 12%)' : '#ffffff';
  const borderColor = isDark ? 'hsl(0 0% 20%)' : 'hsl(220 15% 88%)';
  const textForeground = isDark ? 'hsl(0 0% 98%)' : 'hsl(220 30% 12%)';
  const textMuted = isDark ? 'hsl(0 0% 60%)' : 'hsl(220 15% 45%)';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto"
          aria-hidden={false}
          style={{ backgroundColor: bgOverlay }}
        >
          {/* Backdrop */}
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 cursor-default"
            style={{ backgroundColor: bgOverlay }}
            aria-label="Close modal"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative rounded-lg shadow-xl max-w-xl w-full max-h-[85vh] sm:max-h-[80vh] my-4 sm:my-0 overflow-hidden flex flex-col"
            style={{
              backgroundColor: cardBg,
              borderColor: borderColor,
              borderWidth: '1px',
              borderStyle: 'solid',
            }}
            onClick={(e) => e.stopPropagation()}
          >
        {/* Header */}
        <div 
          className="px-4 sm:px-6 py-3 border-b flex-shrink-0 flex items-center justify-between gap-3"
          style={{
            borderColor: borderColor,
            backgroundColor: cardBg,
          }}
        >
          <h2 id={titleId} className="text-lg font-semibold" style={{ color: textForeground }}>
            How Investment Score Works
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 transition-colors hover:opacity-70 focus:outline-none focus:ring-2 focus:ring-opacity-20"
            style={{
              color: textMuted,
            }}
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-4 sm:px-6 py-3 overflow-y-auto flex-1 space-y-3" style={{ backgroundColor: cardBg }}>
          {/* TL;DR */}
          <p id={descId} className="text-sm" style={{ color: textMuted }}>
            A standardized way to compare rental investment potential across U.S. locations, combining <strong style={{ color: textForeground }}>cash-flow yield</strong> with <strong style={{ color: textForeground }}>market demand</strong>.
          </p>

          {/* Score Scale */}
          <div className="rounded-lg border p-3 sm:p-4" style={{ borderColor: borderColor, backgroundColor: isDark ? 'hsl(220 15% 15%)' : 'hsl(220 15% 98%)' }}>
            <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: textMuted }}>Score Scale</div>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-[#ef4444]" />
                <span style={{ color: textMuted }}><strong style={{ color: textForeground }}>&lt;95</strong> Below average</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-[#f59e0b]" />
                <span style={{ color: textMuted }}><strong style={{ color: textForeground }}>95-99</strong> Near median</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-[#22c55e]" />
                <span style={{ color: textMuted }}><strong style={{ color: textForeground }}>100-129</strong> Above average</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-[#60a5fa]" />
                <span style={{ color: textMuted }}><strong style={{ color: textForeground }}>130+</strong> High yield potential</span>
              </div>
            </div>
            <p className="text-xs mt-2" style={{ color: textMuted }}>100 = median market. Capped at 300.</p>
          </div>

          {/* Two-Part Formula */}
          <div>
            <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: textMuted }}>The Formula</div>
            <div className="text-sm space-y-2" style={{ color: textMuted }}>
              <div className="rounded-lg border p-2.5" style={{ borderColor: borderColor, backgroundColor: isDark ? 'hsl(220 15% 15%)' : 'hsl(220 15% 98%)' }}>
                <div className="font-medium mb-1" style={{ color: textForeground }}>1. Base Score (Net Yield)</div>
                <p className="text-xs leading-relaxed" style={{ color: textMuted }}>
                  Calculates how much rent you keep after property taxes, relative to home price. Uses <strong style={{ color: textForeground }}>HUD Fair Market Rent</strong>, <strong style={{ color: textForeground }}>Zillow ZHVI</strong>, and <strong style={{ color: textForeground }}>ACS tax rates</strong>.
                </p>
              </div>
              <div className="rounded-lg border p-2.5" style={{ borderColor: borderColor, backgroundColor: isDark ? 'hsl(220 15% 15%)' : 'hsl(220 15% 98%)' }}>
                <div className="font-medium mb-1" style={{ color: textForeground }}>2. Demand Adjustment</div>
                <p className="text-xs leading-relaxed" style={{ color: textMuted }}>
                  Adjusts score based on rental market conditions using <strong style={{ color: textForeground }}>Zillow ZORDI</strong> (metro demand index) and <strong style={{ color: textForeground }}>ZORI</strong> (rent growth). Strong demand can boost scores up to +5%; weak demand can reduce by up to -30%.
                </p>
              </div>
            </div>
          </div>

          {/* Data Sources */}
          <div>
            <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: textMuted }}>Data Sources</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border p-2" style={{ borderColor: borderColor, backgroundColor: isDark ? 'hsl(220 15% 15%)' : 'hsl(220 15% 98%)' }}>
                <div className="font-medium" style={{ color: textForeground }}>Rent</div>
                <div style={{ color: textMuted }}>HUD FMR/SAFMR</div>
              </div>
              <div className="rounded border p-2" style={{ borderColor: borderColor, backgroundColor: isDark ? 'hsl(220 15% 15%)' : 'hsl(220 15% 98%)' }}>
                <div className="font-medium" style={{ color: textForeground }}>Home Value</div>
                <div style={{ color: textMuted }}>Zillow ZHVI</div>
              </div>
              <div className="rounded border p-2" style={{ borderColor: borderColor, backgroundColor: isDark ? 'hsl(220 15% 15%)' : 'hsl(220 15% 98%)' }}>
                <div className="font-medium" style={{ color: textForeground }}>Property Tax</div>
                <div style={{ color: textMuted }}>ACS 5-Year</div>
              </div>
              <div className="rounded border p-2" style={{ borderColor: borderColor, backgroundColor: isDark ? 'hsl(220 15% 15%)' : 'hsl(220 15% 98%)' }}>
                <div className="font-medium" style={{ color: textForeground }}>Demand</div>
                <div style={{ color: textMuted }}>Zillow ZORDI/ZORI</div>
              </div>
            </div>
          </div>

          {/* Accordion: Full Math */}
          <div className="border-t pt-3" style={{ borderColor: borderColor }}>
            <button
              type="button"
              onClick={() => setShowMath((v) => !v)}
              className="w-full flex items-center justify-between text-sm font-medium py-1 transition-colors focus:outline-none focus:ring-2 focus:ring-opacity-20 rounded"
              style={{ 
                color: textForeground,
              }}
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
              className="mt-2 space-y-3 text-xs"
              style={{ color: textMuted }}
            >
              {/* Net Yield Calculation */}
              <div className="rounded border p-3" style={{ borderColor: borderColor, backgroundColor: isDark ? 'hsl(220 15% 15%)' : 'hsl(220 15% 98%)' }}>
                <div className="font-semibold mb-2" style={{ color: textForeground }}>Net Yield Calculation</div>
                <div className="space-y-1 font-mono text-[11px] p-2 rounded border" style={{ backgroundColor: cardBg, borderColor: borderColor, color: textMuted }}>
                  <div>Annual Rent = FMR × 12</div>
                  <div>Annual Taxes = Property Value × Tax Rate</div>
                  <div>Net Yield = (Rent - Taxes) / Value</div>
                  <div className="pt-1 border-t mt-1" style={{ borderColor: borderColor }}>Base Score = (Net Yield / Median) × 100</div>
                </div>
              </div>

              {/* Demand Score */}
              <div className="rounded border p-3" style={{ borderColor: borderColor, backgroundColor: isDark ? 'hsl(220 15% 15%)' : 'hsl(220 15% 98%)' }}>
                <div className="font-semibold mb-2" style={{ color: textForeground }}>Demand Score (0-100)</div>
                <div className="space-y-1">
                  <div><strong style={{ color: textForeground }}>50%</strong> Demand Level — ZORDI percentile rank</div>
                  <div><strong style={{ color: textForeground }}>30%</strong> Demand Momentum — ZORDI 3-month change</div>
                  <div><strong style={{ color: textForeground }}>20%</strong> Rent Pressure — ZORI year-over-year growth</div>
                </div>
              </div>

              {/* Demand Multiplier */}
              <div className="rounded border p-3" style={{ borderColor: borderColor, backgroundColor: isDark ? 'hsl(220 15% 15%)' : 'hsl(220 15% 98%)' }}>
                <div className="font-semibold mb-2" style={{ color: textForeground }}>Demand Multiplier</div>
                <div className="space-y-1">
                  <div><strong style={{ color: textForeground }}>High yield + strong demand:</strong> up to +5% boost</div>
                  <div><strong style={{ color: textForeground }}>High yield + weak demand:</strong> up to -30% penalty</div>
                  <div><strong style={{ color: textForeground }}>Low yield + strong demand:</strong> no change</div>
                  <div><strong style={{ color: textForeground }}>Low yield + weak demand:</strong> up to -30% penalty</div>
                </div>
              </div>

              {/* Quality Controls */}
              <div className="rounded border p-3" style={{ borderColor: borderColor, backgroundColor: isDark ? 'hsl(220 15% 15%)' : 'hsl(220 15% 98%)' }}>
                <div className="font-semibold mb-2" style={{ color: textForeground }}>Quality Controls</div>
                <ul className="space-y-1 ml-3 list-disc" style={{ color: textMuted }}>
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
          <div className="text-xs border-t pt-3" style={{ color: textMuted, borderColor: borderColor }}>
            <strong style={{ color: textForeground }}>Not included:</strong> mortgage costs, insurance, repairs, vacancy, HOA, appreciation. Use as a screening tool, not a complete pro forma.
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-2.5 border-t flex items-center justify-end flex-shrink-0" style={{ borderColor: borderColor, backgroundColor: cardBg }}>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-opacity-20"
            style={{
              backgroundColor: 'hsl(192 85% 42%)',
              color: '#ffffff',
            }}
          >
            Got it
          </button>
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}




