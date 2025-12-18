import Link from 'next/link';
import SearchInput from '@/app/components/SearchInput';
import InvestorScoreInfoButton from '@/app/components/InvestorScoreInfoButton';
import NewBadge from '@/app/components/NewBadge';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#fafafa] antialiased">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-10 sm:py-10">
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <div className="mb-2 sm:mb-3 flex items-start justify-between gap-3 flex-wrap">
            <Link href="/" className="hover:opacity-70 transition-opacity">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-[#0a0a0a] tracking-tight">
                fmr.fyi
              </h1>
              <p className="text-xs text-[#737373] font-medium tracking-wide uppercase">
                Fair Market Rent Data
              </p>
            </Link>

            <a
              href="https://chromewebstore.google.com/detail/fmrfyi-%E2%80%93-fair-market-rent/gkemjakehildeolcagbibhmbcddkkflb"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 px-3 py-2 bg-[#0a0a0a] text-white text-xs sm:text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              <span className="flex items-center gap-1.5">
                <span className="hidden sm:inline">Get Chrome Extension</span>
                <span className="sm:hidden">Extension</span>
                <NewBadge />
              </span>
            </a>
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm sm:text-base text-[#525252] max-w-2xl">
              Search HUD Fair Market Rent data by address, city, ZIP code, county, or parish
            </p>
            <InvestorScoreInfoButton />
          </div>
        </div>

        {/* Search */}
        <div className="mb-10">
          <div className="bg-white border border-[#e5e5e5] rounded-lg p-4 sm:p-6">
            <SearchInput />
          </div>
        </div>

        {/* 404 */}
        <section className="max-w-xl mx-auto text-center">
          <p className="text-xs uppercase tracking-widest text-[#a3a3a3] mb-3">
            Not found
          </p>

          <h2 className="text-lg font-normal text-[#0a0a0a] mb-2">
            This page doesn’t exist
          </h2>

          <p className="text-sm text-[#737373] leading-relaxed mb-6">
            The link may be outdated, or the page may have moved.
            You can search above or return to a known location.
          </p>

          <div className="flex items-center justify-center gap-4 text-sm">
            <Link
              href="/"
              className="text-[#525252] hover:text-[#0a0a0a] transition-colors"
            >
              Home
            </Link>
            <span className="text-[#d4d4d4]">•</span>
            <Link
              href="/explorer"
              className="text-[#525252] hover:text-[#0a0a0a] transition-colors"
            >
              Explorer
            </Link>
          </div>

          <div className="mt-8 text-xs text-[#a3a3a3]">
            Common entry points:
            <div className="mt-2 flex justify-center gap-3">
              <Link href="/state/CA" className="hover:underline underline-offset-2">
                CA
              </Link>
              <Link href="/state/NY" className="hover:underline underline-offset-2">
                NY
              </Link>
              <Link href="/state/TX" className="hover:underline underline-offset-2">
                TX
              </Link>
              <Link href="/state/FL" className="hover:underline underline-offset-2">
                FL
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
