'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Chrome, Settings, DollarSign, Percent } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { ListingCardMockup } from './ListingCardMockup';
import { cn } from '@/lib/utils';

// Fallback theme detection if ThemeProvider is not available
function getEffectiveTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';

  // Check data-theme attribute first (set by ThemeProvider)
  const themeAttr = document.documentElement.getAttribute('data-theme');
  if (themeAttr === 'dark' || themeAttr === 'light') {
    return themeAttr;
  }

  // Fallback to system preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const OPEN_DELAY_MS = 900;
const ENTER_MS = 260;
const EXIT_MS = 200;

type ChromeExtensionModalProps = {
  open?: boolean;
  onClose?: () => void;
  chromeWebStoreUrl?: string;
  images?: {
    badgeOnListing?: string;
    miniView?: string;
    popper?: string;
    customExpenses?: string;
  };
};

const STORAGE_KEYS = {
  NEVER_SHOW: 'chrome-extension-modal-never-show',
  LAST_SHOWN: 'chrome-extension-modal-last-shown',
  VISIT_COUNT: 'homepage-visit-count',
} as const;

function incrementVisitCount(): number {
  if (typeof window === 'undefined') return 0;

  const currentCount = parseInt(localStorage.getItem(STORAGE_KEYS.VISIT_COUNT) || '0', 10);
  const newCount = currentCount + 1;
  localStorage.setItem(STORAGE_KEYS.VISIT_COUNT, newCount.toString());
  return newCount;
}

function getVisitCount(): number {
  if (typeof window === 'undefined') return 0;
  return parseInt(localStorage.getItem(STORAGE_KEYS.VISIT_COUNT) || '0', 10);
}

function shouldShowModal(): boolean {
  return true;
  if (typeof window === 'undefined') return false;

  // Check if user dismissed it permanently
  if (localStorage.getItem(STORAGE_KEYS.NEVER_SHOW) === 'true') {
    return false;
  }

  // Only show if visit count > 5
  const visitCount = getVisitCount();
  if (visitCount <= 5) {
    return false;
  }

  // Check if shown in last week (7 days)
  const lastShown = localStorage.getItem(STORAGE_KEYS.LAST_SHOWN);
  if (lastShown) {
    const lastShownDate = new Date(lastShown);
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    if (lastShownDate > oneWeekAgo) {
      return false; // Shown within last week
    }
  }

  // Check if Chrome desktop (exclude Edge, Opera, etc. that also have Chrome in UA)
  const ua = navigator.userAgent;
  const isChrome = /Chrome/.test(ua) && /Google Inc/.test(navigator.vendor) && !/Edg|OPR|Opera/.test(ua);
  const isDesktop = window.innerWidth >= 768; // Desktop threshold
  if (!isChrome || !isDesktop) {
    return false;
  }

  return true;
}

const CHROME_WEB_STORE_URL =
  'https://chromewebstore.google.com/detail/fmrfyi-%E2%80%93-fair-market-rent/gkemjakehildeolcagbibhmbcddkkflb';

export default function ChromeExtensionModal({
  open: openProp,
  onClose: onCloseProp,
  chromeWebStoreUrl = CHROME_WEB_STORE_URL,
  images,
}: ChromeExtensionModalProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [activeMode, setActiveMode] = useState<'cashflow' | 'fmr'>('cashflow');
  const [isDark, setIsDark] = useState(false);
  const openTimeoutRef = useRef<number | null>(null);

  // Detect theme with fallback
  useEffect(() => {
    setIsDark(getEffectiveTheme() === 'dark');

    // Watch for theme changes
    const observer = new MutationObserver(() => {
      setIsDark(getEffectiveTheme() === 'dark');
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    // Also listen to system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      setIsDark(getEffectiveTheme() === 'dark');
    };
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  const openWithAnimation = (delayMs = OPEN_DELAY_MS) => {
    if (openTimeoutRef.current) window.clearTimeout(openTimeoutRef.current);
    openTimeoutRef.current = window.setTimeout(() => {
      setOpen(true);
      requestAnimationFrame(() => setIsAnimating(true));
    }, delayMs);
  };

  // Increment visit count when on homepage
  useEffect(() => {
    if (pathname === '/') {
      incrementVisitCount();
    }
  }, [pathname]);

  // Check if we should show the modal
  useEffect(() => {
    // Only show on home page (root path)
    if (pathname !== '/') {
      setOpen(false);
      setIsAnimating(false);
      return;
    }

    // Use prop if provided, otherwise check conditions
    if (openProp !== undefined) {
      if (openProp) {
        openWithAnimation();
      } else {
        setOpen(false);
        setIsAnimating(false);
      }
    } else {
      // Check conditions and show with delay if should show
      const shouldShow = shouldShowModal();
      if (shouldShow) {
        openWithAnimation();
      } else {
        setOpen(false);
        setIsAnimating(false);
      }
    }

    return () => {
      if (openTimeoutRef.current) window.clearTimeout(openTimeoutRef.current);
    };
  }, [pathname, openProp]);

  // Mark as shown when modal opens
  useEffect(() => {
    if (open) {
      localStorage.setItem(STORAGE_KEYS.LAST_SHOWN, new Date().toISOString());
    }
  }, [open]);

  const handleClose = (permanent = false) => {
    setIsAnimating(false);
    window.setTimeout(() => {
      setOpen(false);
      if (permanent) {
        localStorage.setItem(STORAGE_KEYS.NEVER_SHOW, 'true');
      }
      onCloseProp?.();
    }, EXIT_MS);
  };

  const miniViewImg = images?.miniView ?? '/fmr-fyi-mini-view.png';

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose(false);
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Don't render if not open (but keep in DOM for animation)
  if (!open && !isAnimating) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-end md:items-center justify-center md:p-4"
            onClick={() => handleClose(false)}
          >
            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              className="bg-[var(--bg-secondary)] w-full max-w-4xl h-full md:h-[650px] md:max-h-[90vh] md:rounded-xl shadow-2xl overflow-hidden overflow-x-hidden flex flex-col md:flex-row border border-[var(--border-color)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Mobile Close Button (Fixed on top right for mobile) */}
              <button
                onClick={() => handleClose(false)}
                className="absolute top-4 right-4 z-50 p-2 bg-[var(--bg-secondary)]/80 backdrop-blur rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] md:hidden shadow-sm border border-[var(--border-color)]"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Mobile: Single scrollable column, Desktop: Left column */}
              <div className="w-full md:w-2/5 flex flex-col relative bg-[var(--bg-secondary)] z-10 border-b md:border-b-0 md:border-r border-[var(--border-color)] flex-shrink-0 overflow-x-hidden">
                {/* Mobile: Scrollable content area */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                  <div className="p-6 md:p-8 pt-12 md:pt-8">
                    <div>
                      <h2 className="text-2xl md:text-3xl font-display font-bold text-[var(--text-primary)] leading-tight mb-3 md:mb-4">
                        Analyze listings in {' '}
                        <span className="text-[var(--primary-blue)]">real time.</span>
                      </h2>

                      <p className="text-[var(--text-secondary)] mb-6 text-sm leading-relaxed">
                        Stop switching tabs. Get Cash Flow estimates and FMR data overlaid directly on
                        Zillow or Redfin.
                      </p>

                      {/* Desktop: Features list */}
                      <div className="space-y-6 hidden md:block">
                        <div>
                          <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 mb-3">
                            <Check className="w-4 h-4 text-[var(--primary-blue)]" />
                            Key Features
                          </h3>
                          <ul className="space-y-2.5">
                            {[
                              'Instant Cash Flow calculation',
                              'FMR/SAFMR data',
                              'Works on Map & List views',
                              'One-click deep dive analysis',
                            ].map((item, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2.5 text-xs font-medium text-[var(--text-secondary)]"
                              >
                                <div className="w-4 h-4 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)]" />
                                </div>
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 mb-3">
                            <Settings className="w-4 h-4 text-[var(--primary-blue)]" />
                            Fully Customizable
                          </h3>
                          <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-2">
                            Tailor the extension to your strategy. Adjust down payments, management fees, and expense
                            assumptions in the settings panel.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Mobile: Listing card section - scrolls below heading */}
                  <div className="md:hidden px-6 pb-6">
                    <div className="relative w-full max-w-[320px] mx-auto">
                      <div className="mb-4 flex justify-center gap-3">
                        <button
                          onClick={() => setActiveMode('cashflow')}
                          className={cn(
                            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm border',
                            activeMode === 'cashflow'
                              ? 'bg-[var(--bg-secondary)] border-[var(--accent-success)] text-[var(--accent-success-dark)] ring-2 ring-[var(--accent-success)]/20'
                              : 'bg-[var(--bg-secondary)]/50 border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
                          )}
                        >
                          <DollarSign className="w-3 h-3" />
                          Cash Flow Mode
                        </button>
                        <button
                          onClick={() => setActiveMode('fmr')}
                          className={cn(
                            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm border',
                            activeMode === 'fmr'
                              ? 'bg-[var(--bg-secondary)] border-[var(--primary-blue)]/30 text-[var(--primary-blue)] ring-2 ring-[var(--primary-blue)]/20'
                              : 'bg-[var(--bg-secondary)]/50 border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
                          )}
                        >
                          <Percent className="w-3 h-3" />
                          FMR Mode
                        </button>
                      </div>

                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                        className="relative"
                      >
                        <ListingCardMockup mode={activeMode} />
                      </motion.div>
                    </div>

                    {/* Mobile: Detailed Analysis Image */}
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                      className="w-full mt-6"
                    >
                      <div className="bg-[var(--bg-secondary)] rounded-lg shadow-xl border border-[var(--border-color)] overflow-hidden ring-1 ring-black/5 group">
                        <div className="relative">
                          <Image
                            src={miniViewImg}
                            alt="Detailed FMR Analysis"
                            width={2048}
                            height={1394}
                            className="w-full h-auto object-cover opacity-90 transition-opacity group-hover:opacity-100"
                          />
                        </div>
                        <div className="p-4 bg-[var(--bg-tertiary)]/50 border-t border-[var(--border-color)]">
                          <h4 className="font-bold text-[var(--text-primary)] text-sm mb-1">Deep Dive Data</h4>
                          <p className="text-xs text-[var(--text-secondary)]">
                            View complete breakdown by bedroom count, investment scores, and historical trends.
                          </p>
                        </div>
                      </div>
                    </motion.div>

                    {/* Mobile: CTA at bottom */}
                    <div className="w-full pt-6 border-t border-[var(--border-color)] mt-6">
                      <a
                        href={chromeWebStoreUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-[var(--primary-blue)] hover:bg-[var(--primary-blue-hover)] text-white font-semibold h-11 rounded-lg shadow-md shadow-[var(--primary-blue)]/10 mb-3 flex items-center justify-center gap-2 transition-colors"
                      >
                        <Chrome className="w-4 h-4" />
                        Add to Chrome
                      </a>

                      <button
                        onClick={() => handleClose(true)}
                        className="w-full text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        Don't show this again
                      </button>
                    </div>
                  </div>
                </div>

                {/* Desktop: CTA at bottom of left column */}
                <div className="hidden md:block p-4 md:p-6 border-t border-[var(--border-color)] bg-[var(--bg-tertiary)]/50 mt-auto">
                  <a
                    href={chromeWebStoreUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-[var(--primary-blue)] hover:bg-[var(--primary-blue-hover)] text-white font-semibold h-11 rounded-lg shadow-md shadow-[var(--primary-blue)]/10 mb-3 flex items-center justify-center gap-2 transition-colors"
                  >
                    <Chrome className="w-4 h-4" />
                    Add to Chrome
                  </a>

                  <button
                    onClick={() => handleClose(true)}
                    className="w-full text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Don't show this again
                  </button>
                </div>
              </div>

              {/* Desktop: Right Column: Visuals */}
              <div className="hidden md:flex w-full md:w-3/5 bg-[var(--bg-tertiary)]/50 relative flex-col overflow-x-hidden">
                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                  <div className="p-8 md:p-12 pb-12 md:pb-24 min-h-full flex flex-col items-center justify-center md:justify-start overflow-x-hidden">
                    {/* Background decorative elements */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                    <div className="absolute top-[40%] left-0 w-64 h-64 bg-green-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

                    {/* Grid Pattern */}
                    <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

                    {/* Close Button Desktop */}
                    <button
                      onClick={() => handleClose(false)}
                      className="hidden md:flex absolute top-6 right-6 p-2 rounded-lg bg-[var(--bg-secondary)]/50 hover:bg-[var(--bg-secondary)] backdrop-blur-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all z-20 border border-[var(--border-color)]"
                    >
                      <X className="w-5 h-5" />
                    </button>

                    {/* Live Mockup Section */}
                    <div className="relative w-full max-w-[320px] md:max-w-[380px] perspective-1000 z-10 mb-6 md:mb-12 mt-0 md:mt-0">
                      <div className="mb-4 md:mb-6 flex justify-center gap-3">
                        <button
                          onClick={() => setActiveMode('cashflow')}
                          className={cn(
                            'flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-semibold transition-all shadow-sm border',
                            activeMode === 'cashflow'
                              ? 'bg-[var(--bg-secondary)] border-[var(--accent-success)] text-[var(--accent-success-dark)] ring-2 ring-[var(--accent-success)]/20'
                              : 'bg-[var(--bg-secondary)]/50 border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
                          )}
                        >
                          <DollarSign className="w-3 h-3 md:w-4 md:h-4" />
                          Cash Flow Mode
                        </button>
                        <button
                          onClick={() => setActiveMode('fmr')}
                          className={cn(
                            'flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-semibold transition-all shadow-sm border',
                            activeMode === 'fmr'
                              ? 'bg-[var(--bg-secondary)] border-[var(--primary-blue)]/30 text-[var(--primary-blue)] ring-2 ring-[var(--primary-blue)]/20'
                              : 'bg-[var(--bg-secondary)]/50 border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
                          )}
                        >
                          <Percent className="w-3 h-3 md:w-4 md:h-4" />
                          FMR Mode
                        </button>
                      </div>

                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                        className="relative"
                      >
                        <ListingCardMockup mode={activeMode} />
                      </motion.div>
                    </div>

                    {/* Detailed Analysis Section (Hidden on small mobile) */}
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                      className="w-full max-w-[420px] z-10 hidden md:block"
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <div className="h-px bg-[var(--border-color)] flex-1" />
                        <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-tertiary)]">
                          Detailed Analysis
                        </span>
                        <div className="h-px bg-[var(--border-color)] flex-1" />
                      </div>

                      <div className="bg-[var(--bg-secondary)] rounded-lg shadow-xl border border-[var(--border-color)] overflow-hidden ring-1 ring-black/5 hover:ring-[var(--primary-blue)]/20 transition-all duration-500 group">
                        <div className="relative">
                          <Image
                            src={miniViewImg}
                            alt="Detailed FMR Analysis"
                            width={2048}
                            height={1394}
                            className="w-full h-auto object-cover opacity-90 transition-opacity group-hover:opacity-100"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center p-6">
                            <p className="text-white font-medium text-sm drop-shadow-md">
                              Click any badge to open detailed view
                            </p>
                          </div>
                        </div>
                        <div className="p-4 bg-[var(--bg-tertiary)]/50 border-t border-[var(--border-color)]">
                          <h4 className="font-bold text-[var(--text-primary)] text-sm mb-1">Deep Dive Data</h4>
                          <p className="text-xs text-[var(--text-secondary)]">
                            View complete breakdown by bedroom count, investment scores, and historical trends.
                          </p>
                        </div>
                      </div>
                    </motion.div>

                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
