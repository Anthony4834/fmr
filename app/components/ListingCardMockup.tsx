'use client';

import { motion } from 'framer-motion';
import { Heart, MoreHorizontal, MapPin, Bed, Bath, Square } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

// Mockup of the fmr.fyi badge - matches actual extension badge styles
function ExtensionBadgeMockup({ mode }: { mode: 'cashflow' | 'fmr' }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkTheme = () => {
      if (typeof window !== 'undefined') {
        setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
      }
    };
    
    checkTheme();
    
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    
    return () => observer.disconnect();
  }, []);
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      key={mode} // Re-animate on mode change
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium select-none cursor-pointer transition-all',
        isDark
          ? 'bg-gradient-to-br from-[#0a0a0a] to-[#1a1a1a] border border-[#3a3a3a] rounded-md shadow-[0_2px_8px_rgba(0,0,0,0.15)]'
          : 'bg-white border border-[#e5e5e5] rounded-[10px] shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
      )}
    >
      {/* Brand label - matches actual badge */}
      <span
        className={cn(
          'text-[10px] font-semibold uppercase tracking-[0.5px] mr-0.5',
          isDark ? 'text-white/70' : 'text-[var(--text-tertiary)]'
        )}
      >
        FMR.fyi
      </span>

      {/* Separator */}
      <span
        className={cn('w-px h-3', isDark ? 'bg-white/15' : 'bg-[var(--border-color)]')}
      />

      {/* Cash Flow / FMR Value */}
      {mode === 'cashflow' ? (
        <>
          <span className={cn('text-xs mr-1', isDark ? 'text-white/70' : 'text-[var(--text-secondary)]')}>
            Cash Flow:
          </span>
          <span className={cn('font-bold text-[13px]', isDark ? 'text-[var(--accent-success)]' : 'text-[var(--accent-success-dark)]')}>
            +$593
          </span>
          <span className={cn('text-[11px] ml-0.5', isDark ? 'text-white/50' : 'text-[var(--text-muted)]')}>
            /mo
          </span>
        </>
      ) : (
        <>
          <span className={cn('text-xs mr-1', isDark ? 'text-white/70' : 'text-[var(--text-secondary)]')}>
            FMR:
          </span>
          <span className={cn('font-bold text-[13px]', isDark ? 'text-[var(--primary-blue)]' : 'text-[var(--primary-blue)]')}>
            $1,300
          </span>
          <span className={cn('text-[11px] ml-0.5', isDark ? 'text-white/50' : 'text-[var(--text-muted)]')}>
            /mo
          </span>
        </>
      )}
    </motion.div>
  );
}

// Mockup of a real estate listing card
export function ListingCardMockup({ mode }: { mode: 'cashflow' | 'fmr' }) {
  return (
    <div className="bg-[var(--bg-secondary)] dark:bg-[var(--bg-tertiary)] rounded-lg overflow-hidden shadow-lg border border-[var(--border-color)] max-w-sm mx-auto select-none transform transition-all duration-500">
      {/* Image Area */}
      <div className="relative h-48 bg-[var(--bg-tertiary)] overflow-hidden group flex items-center justify-center">
        {/* Placeholder House Image - using a gradient/pattern to look like a loaded image */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
          <div className="absolute inset-0 opacity-20 dark:opacity-10 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:16px_16px]" />
        </div>

        {/* SVG House Illustration - keep orange */}
        <div className="relative z-10 w-32 h-32 opacity-80 text-[#f59e0b]/40">
          <svg
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full drop-shadow-sm"
          >
            <path
              d="M100 20L20 90H40V180H80V130H120V180H160V90H180L100 20Z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <rect x="85" y="50" width="30" height="30" rx="4" fill="white" fillOpacity="0.6" />
            <path d="M90 65H110" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M100 55V75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />

            {/* Windows */}
            <rect
              x="45"
              y="100"
              width="25"
              height="30"
              rx="2"
              fill="white"
              fillOpacity="0.6"
              stroke="currentColor"
              strokeWidth="2"
            />
            <rect
              x="130"
              y="100"
              width="25"
              height="30"
              rx="2"
              fill="white"
              fillOpacity="0.6"
              stroke="currentColor"
              strokeWidth="2"
            />

            {/* Tree */}
            <path d="M170 180V140" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            <circle
              cx="170"
              cy="130"
              r="20"
              fill="#22c55e"
              fillOpacity="0.2"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        </div>

        <div className="absolute top-2 right-2 text-[var(--bg-secondary)]">
          <Heart className="w-5 h-5 drop-shadow-md" />
        </div>

        {/* Carousel Dots */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--bg-secondary)] shadow-sm" />
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--bg-secondary)]/50 shadow-sm" />
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--bg-secondary)]/50 shadow-sm" />
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 space-y-3 relative">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-2xl font-bold text-[var(--text-primary)]">$425,000</div>
            <div className="flex items-center gap-3 text-[var(--text-secondary)] text-sm mt-1">
              <span className="flex items-center gap-1">
                <Bed className="w-3 h-3" /> 3 bds
              </span>
              <span className="bg-[var(--border-color)] w-px h-3" />
              <span className="flex items-center gap-1">
                <Bath className="w-3 h-3" /> 2 ba
              </span>
              <span className="bg-[var(--border-color)] w-px h-3" />
              <span className="flex items-center gap-1">
                <Square className="w-3 h-3" /> 1,850 sqft
              </span>
            </div>
          </div>
          <MoreHorizontal className="w-5 h-5 text-[var(--text-tertiary)]" />
        </div>

        <div className="text-sm text-[var(--text-tertiary)] flex items-center gap-1 truncate">
          <MapPin className="w-3 h-3 flex-shrink-0" />
          123 Investment Lane, Austin, TX 78701
        </div>

        {/* The Extension Injection Point */}
        <div className="pt-2 border-t border-[var(--border-color)] flex items-center justify-between">
          <div className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider">
            Realty Corp
          </div>

          {/* This is where our badge lives in the "DOM" */}
          <div className="relative z-10 scale-110 origin-right shadow-sm rounded-lg">
            <ExtensionBadgeMockup mode={mode} />
          </div>
        </div>
      </div>
    </div>
  );
}
