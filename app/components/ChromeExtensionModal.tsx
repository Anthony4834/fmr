'use client';

import Image from 'next/image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const OPEN_DELAY_MS = 900;  // was 2000
const ENTER_MS = 260;       // open animation
const EXIT_MS = 200;        // close animation

type ChromeExtensionModalProps = {
  open?: boolean;
  onClose?: () => void;

  chromeWebStoreUrl?: string;

  images?: {
    badgeOnListing?: string; // /extension-cash-flow-mode-zoomed.png
    miniView?: string; // /fmr-fyi-mini-view.png
    popper?: string; // /extension-popper.png
    customExpenses?: string; // /extension-popper-custom-expenses.png
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

const CHROME_WEB_STORE_URL = 'https://chromewebstore.google.com/detail/fmrfyi-%E2%80%93-fair-market-rent/gkemjakehildeolcagbibhmbcddkkflb';

export default function ChromeExtensionModal({
  open: openProp,
  onClose: onCloseProp,
  chromeWebStoreUrl = CHROME_WEB_STORE_URL,
  images
}: ChromeExtensionModalProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const openTimeoutRef = useRef<number | null>(null);

  const openWithAnimation = (delayMs = OPEN_DELAY_MS) => {
    if (openTimeoutRef.current) window.clearTimeout(openTimeoutRef.current);
    openTimeoutRef.current = window.setTimeout(() => {
      setOpen(true);
      // One RAF is enough; avoids the "double-RAF" stutter.
      requestAnimationFrame(() => setIsAnimating(true));
    }, delayMs);
  };

  // Detect theme
  useEffect(() => {
    setIsDark(getEffectiveTheme() === 'dark');
    
    // Watch for theme changes
    const observer = new MutationObserver(() => {
      setIsDark(getEffectiveTheme() === 'dark');
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
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

  const handleClose = () => {
    setIsAnimating(false);
    window.setTimeout(() => {
      setOpen(false);
      onCloseProp?.();
    }, EXIT_MS);
  };

  const handleNeverShow = () => {
    localStorage.setItem(STORAGE_KEYS.NEVER_SHOW, 'true');
    handleClose();
  };

  const img = useMemo(
    () => ({
      badgeOnListing: images?.badgeOnListing ?? '/extension-cash-flow-mode-zoomed.png',
      miniView: images?.miniView ?? '/fmr-fyi-mini-view.png',
      popper: images?.popper ?? '/extension-popper.png',
      customExpenses: images?.customExpenses ?? '/extension-popper-custom-expenses.png'
    }),
    [images]
  );

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
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
    <div 
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-x-hidden transition-opacity motion-reduce:transition-none ${
        open && isAnimating ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      role="dialog" 
      aria-modal="true"
    >
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 backdrop-blur-[8px] transition-opacity duration-200 ease-out motion-reduce:transition-none ${
          isDark ? 'bg-black/60' : 'bg-black/45'
        } ${open && isAnimating ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose} 
        aria-hidden="true" 
      />

      {/* Panel */}
      <div className={`relative w-full max-w-5xl overflow-hidden rounded-3xl border shadow-[0_30px_100px_rgba(0,0,0,0.35)] transform-gpu will-change-transform transition-[opacity,transform] motion-reduce:transition-none ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isDark 
          ? 'border-white/10 bg-[var(--bg-secondary)]' 
          : 'border-white/10 bg-white'
      } ${
        open && isAnimating 
          ? 'opacity-100 translate-y-0 duration-[260ms]' 
          : 'opacity-0 -translate-y-2 duration-200'
      }`}>
        <button
          onClick={handleClose}
          className={`absolute right-4 top-4 z-10 rounded-full border p-2 shadow-sm backdrop-blur transition-colors ${
            isDark
              ? 'border-white/10 bg-white/10 text-white/70 hover:bg-white/20'
              : 'border-black/10 bg-white/80 text-black/70 hover:bg-white'
          }`}
          aria-label="Close"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="max-h-[82vh] overflow-y-auto overflow-x-hidden">
          {/* Hero */}
          <div className={`relative border-b px-6 py-8 sm:px-8 sm:py-10 md:px-10 ${
            isDark ? 'border-white/10' : 'border-black/10'
          }`}>
            <div className="pointer-events-none absolute inset-0">
              <div className={`absolute -top-32 -right-28 h-96 w-96 rounded-full ${
                isDark ? 'bg-white/[0.02]' : 'bg-black/[0.04]'
              }`} />
              <div className={`absolute -bottom-40 -left-32 h-[28rem] w-[28rem] rounded-full ${
                isDark ? 'bg-white/[0.015]' : 'bg-black/[0.03]'
              }`} />
              <div className={`absolute inset-0 ${
                isDark 
                  ? 'bg-[radial-gradient(70%_55%_at_50%_0%,rgba(255,255,255,0.02),transparent_60%)]'
                  : 'bg-[radial-gradient(70%_55%_at_50%_0%,rgba(0,0,0,0.05),transparent_60%)]'
              }`} />
            </div>

            <div className="relative">
              <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                isDark
                  ? 'border-white/10 bg-white/5 text-white/70'
                  : 'border-black/10 bg-white text-black/70'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isDark ? 'bg-white/40' : 'bg-black/40'}`} />
                Chrome Extension
              </div>

              <h2 className={`mt-4 text-2xl font-semibold tracking-tight sm:text-3xl ${
                isDark ? 'text-white' : 'text-black'
              }`}>
                Analyze any listing. <span className={isDark ? 'text-white/55' : 'text-black/55'}>Instantly.</span>
              </h2>

              <p className={`mt-3 max-w-2xl text-sm leading-6 sm:text-[15px] ${
                isDark ? 'text-white/70' : 'text-black/70'
              }`}>
                Stop switching tabs. Our Chrome extension overlays <span className={`font-medium ${isDark ? 'text-white/80' : 'text-black/80'}`}>FMR data</span> and{' '}
                <span className={`font-medium ${isDark ? 'text-white/80' : 'text-black/80'}`}>cash flow analysis</span> directly on property listings from Zillow and Redfin. More sites coming soon.
              </p>

              <div className={`mt-7 text-xs ${isDark ? 'text-white/55' : 'text-black/55'}`}>
                Privacy-first: runs locally in your browser
              </div>
            </div>
          </div>

          {/* Sections (no "image box" containers; images ARE the cards) */}
          <Section
            title="See the signal right on the listing"
            subtitle="Every property listing gets a smart badge that shows you the numbers that matter — no research required."
            bullets={[
              'Instantly see cash flow potential or FMR data as you browse',
              'Works on list views, map views, and detail pages',
              'One click opens the full analysis without leaving the page'
            ]}
            reverse={false}
            isDark={isDark}
            media={
              <ImageCard
                src={img.badgeOnListing}
                alt="Badge shown on a listing card"
                width={912}
                height={878}
                className="max-w-full md:max-w-[375px]"
                priority
                zoom
                isDark={isDark}
              />
            }
            caption="Badge shown on a listing card"
          />

          <Section
            title="Dive deeper with one click"
            subtitle="The mini view gives you everything you need to make a quick decision — all without leaving your current page."
            bullets={[
              'Compare HUD FMR and SAFMR side-by-side',
              'See the ZIP investment score instantly',
              'Review trends and bedroom breakdowns to spot opportunities'
            ]}
            reverse
            isDark={isDark}
            media={
              <ImageCard
                src={img.miniView}
                alt="Mini view opened from the badge"
                width={2048}
                height={1394}
                className="max-w-full md:max-w-[640px]"
                isDark={isDark}
              />
            }
            caption="Mini view shown after clicking the badge"
          />

          <Section
            title="Set it once, use it everywhere"
            subtitle="Configure your investment assumptions once, and every listing automatically calculates cash flow using your criteria."
            bullets={[
              'Choose between Cash Flow mode or FMR-only display',
              'Set your standard down payment, insurance, and property management rates',
              'Toggle on or off per site, or reset anytime'
            ]}
            reverse={false}
            isDark={isDark}
            media={
              <ImageCard
                src={img.popper}
                alt="Extension popper settings"
                width={804}
                height={1198}
                className="max-w-full md:max-w-[400px]"
                isDark={isDark}
              />
            }
            caption="Extension popper settings"
          />

          <Section
            title="Account for the real costs"
            subtitle="Every property is different. Add custom monthly expenses to get cash flow estimates that match reality."
            bullets={[
              'Include utilities, maintenance reserves, or special HOA fees',
              'See how these costs impact your bottom line in real-time',
              'Build more accurate projections before you make an offer'
            ]}
            reverse
            isDark={isDark}
            media={
              <ImageCard
                src={img.customExpenses}
                alt="Custom expenses section"
                width={738}
                height={280}
                className="max-w-full md:max-w-[400px]"
                isDark={isDark}
              />
            }
            caption="Custom expenses section"
          />

          {/* Footer */}
          <div className={`border-t px-6 py-5 text-xs sm:px-8 md:px-10 ${
            isDark ? 'border-white/10 text-white/55' : 'border-black/10 text-black/55'
          }`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>All calculations run locally. No personal data or browsing activity is collected or stored.</span>
              <span>Works on list, map, and detail pages.</span>
            </div>
          </div>
        </div>

        {/* Floating action buttons - always visible */}
        <div className={`sticky bottom-0 left-0 right-0 border-t px-6 py-4 sm:px-8 md:px-10 flex flex-col gap-3 sm:flex-row sm:items-center z-30 ${
          isDark 
            ? 'border-white/10 bg-[var(--bg-secondary)] backdrop-blur-sm' 
            : 'border-black/10 bg-white/95 backdrop-blur-sm'
        }`}>
          <a
            href={chromeWebStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90 focus:outline-none focus:ring-2 ${
              isDark
                ? 'bg-[var(--accent-primary)] focus:ring-[var(--accent-primary)]/20'
                : 'bg-black focus:ring-black/20'
            }`}
          >
            Add to Chrome
          </a>
          <button
            onClick={handleNeverShow}
            className={`inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-medium shadow-sm transition focus:outline-none focus:ring-2 ${
              isDark
                ? 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10 focus:ring-white/10'
                : 'border-black/15 bg-white text-black/80 hover:bg-black/[0.02] focus:ring-black/10'
            }`}
          >
            Never show this again
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- UI building blocks ---------- */

function Section({
  title,
  subtitle,
  bullets,
  media,
  caption,
  reverse,
  isDark
}: {
  title: string;
  subtitle?: string;
  bullets: string[];
  media: React.ReactNode;
  caption?: string;
  reverse?: boolean;
  isDark: boolean;
}) {
  return (
    <div className="px-6 py-8 sm:px-8 sm:py-10 md:px-10">
      <div
        className={[
          'grid grid-cols-1 items-start gap-6 md:grid-cols-2 md:gap-10',
          reverse ? 'md:[&>div:first-child]:order-2 md:[&>div:last-child]:order-1' : ''
        ].join(' ')}
      >
        <div className="flex flex-col justify-center">
          <h3 className={`text-lg font-semibold tracking-tight sm:text-xl ${
            isDark ? 'text-white' : 'text-black'
          }`}>{title}</h3>
          {subtitle ? (
            <p className={`mt-3 text-sm leading-6 sm:text-[15px] ${
              isDark ? 'text-white/65' : 'text-black/65'
            }`}>{subtitle}</p>
          ) : null}

          <ul className={`mt-5 space-y-3 text-sm leading-6 sm:text-[15px] ${
            isDark ? 'text-white/70' : 'text-black/70'
          }`}>
            {bullets.map(b => (
              <li key={b} className="flex gap-3">
                <span className={`mt-2 h-1.5 w-1.5 flex-none rounded-full ${
                  isDark ? 'bg-white/35' : 'bg-black/35'
                }`} />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={reverse ? 'flex md:justify-start' : 'flex md:justify-end'}>{media}</div>
      </div>

      {caption ? (
        <div className={`mt-3 text-xs ${
          reverse 
            ? 'md:text-left' 
            : 'md:text-right'
        } ${
          isDark ? 'text-white/55' : 'text-black/55'
        }`}>
          {caption}
        </div>
      ) : null}
    </div>
  );
}

function ImageCard({
  src,
  alt,
  width,
  height,
  className,
  priority,
  zoom,
  isDark
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
  zoom?: boolean;
  isDark: boolean;
}) {
  return (
    <div
      className={[
        // shrink-wrap + elegant "card" treatment (no extra space around the image)
        'w-full overflow-hidden rounded-lg border shadow-[0_18px_60px_rgba(0,0,0,0.12)]',
        isDark 
          ? 'border-white/10 bg-[var(--bg-tertiary)]' 
          : 'border-black/10 bg-white',
        className ?? ''
      ].join(' ')}
    >
      <div className={zoom ? 'relative overflow-hidden' : ''}>
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          sizes="(max-width: 768px) 100vw, 1200px"
          className={[
            'block h-auto w-full max-w-full',
            zoom ? 'scale-[1] origin-center' : ''
          ].join(' ')}
        />
      </div>
    </div>
  );
}

