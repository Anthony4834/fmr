'use client';

import Link from 'next/link';
import { useIntersectionObserver } from '@/app/hooks/useIntersectionObserver';
import SearchInput from '@/app/components/SearchInput';

export default function FinalCTA() {
  const { ref, hasBeenInView } = useIntersectionObserver<HTMLElement>({ threshold: 0.35, mobileThreshold: 0.45 });

  return (
    <section
      ref={ref}
      className="py-16 sm:py-24 md:py-32"
      style={{
        background: 'linear-gradient(180deg, #0a0a0a 0%, #141414 100%)',
      }}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-left">
        {/* Header */}
        <div className={`mb-8 sm:mb-10 md:mb-14 transition-all duration-700 ${hasBeenInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-medium text-white mb-4 sm:mb-5 tracking-tight">
            Ready to Find Your
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#16a34a] to-[#44e37e]">
              Next Investment?
            </span>
          </h2>
          <p className="text-base sm:text-lg text-white/50 font-light">
            Search any location and see FMR data instantly
          </p>
        </div>

        {/* Full-featured search input */}
        <div
          className={`mb-8 sm:mb-10 md:mb-14 max-w-xl transition-all duration-700 delay-200 ${hasBeenInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          <div className="bg-white rounded-2xl p-1.5">
            <SearchInput />
          </div>
        </div>

        {/* Alternative CTAs */}
        <div className={`flex flex-wrap items-center gap-3 transition-all duration-700 delay-400 ${hasBeenInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <span className="text-white/30 text-sm font-light">or explore:</span>
          <Link
            href="/explorer"
            className="px-4 py-2 bg-white/[0.04] text-white/70 font-normal rounded-lg border border-white/[0.06] hover:bg-white/[0.08] hover:text-white transition-colors text-sm"
          >
            Market Rankings
          </Link>
          <Link
            href="/map"
            className="px-4 py-2 bg-white/[0.04] text-white/70 font-normal rounded-lg border border-white/[0.06] hover:bg-white/[0.08] hover:text-white transition-colors text-sm"
          >
            Interactive Map
          </Link>
          <Link
            href="/insights"
            className="px-4 py-2 bg-white/[0.04] text-white/70 font-normal rounded-lg border border-white/[0.06] hover:bg-white/[0.08] hover:text-white transition-colors text-sm"
          >
            Market Insights
          </Link>
        </div>

        {/* Footer */}
        <div className={`mt-16 sm:mt-20 md:mt-28 pt-8 sm:pt-10 border-t border-white/[0.06] transition-all duration-700 delay-500 ${hasBeenInView ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-lg font-medium text-white/90">
                fmr.fyi
              </Link>
              <span className="text-white/30 text-sm font-light">
                Fair Market Rent Data
              </span>
            </div>
            <div className="flex items-center gap-5">
              <Link href="/what-is-fmr" className="text-sm text-white/40 hover:text-white/70 transition-colors font-light">
                What is FMR?
              </Link>
              <Link href="/faq" className="text-sm text-white/40 hover:text-white/70 transition-colors font-light">
                FAQ
              </Link>
              <a
                href="https://chromewebstore.google.com/detail/fmrfyi-%E2%80%93-fair-market-rent/gkemjakehildeolcagbibhmbcddkkflb"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-white/40 hover:text-white/70 transition-colors font-light"
              >
                Chrome Extension
              </a>
            </div>
          </div>
          <div className="mt-6 text-sm text-white/25 font-light">
            Data sourced from HUD. FY 2026 data available.
          </div>
        </div>
      </div>
    </section>
  );
}
