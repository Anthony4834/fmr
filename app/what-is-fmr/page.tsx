import type { Metadata } from 'next';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'What are FMR and SAFMR? (HUD Fair Market Rent) | fmr.fyi',
  description:
    'Learn what HUD Fair Market Rent (FMR) and Small Area Fair Market Rent (SAFMR) mean, how they are used, and how to interpret 0–4 bedroom rent values.',
  alternates: { canonical: 'https://fmr.fyi/what-is-fmr' },
};

export default function WhatIsFmrPage() {
  return (
    <main className="min-h-screen bg-[#fafafa] antialiased">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16">
        <a href="/" className="text-sm font-medium text-[#0a0a0a] hover:opacity-70">
          ← Back to search
        </a>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-[#0a0a0a]">What are HUD FMR and SAFMR?</h1>
        <p className="mt-4 text-base text-[#525252] leading-relaxed">
          <span className="font-semibold text-[#0a0a0a]">Fair Market Rent (FMR)</span> is a set of rent estimates
          published by the U.S. Department of Housing and Urban Development (HUD). FMRs are commonly used as a benchmark
          for rental assistance programs, including the Housing Choice Voucher (Section 8) program.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-[#0a0a0a]">How to read the numbers</h2>
        <p className="mt-3 text-base text-[#525252] leading-relaxed">
          HUD publishes FMR values by bedroom size (typically 0–4 bedrooms). These figures represent an estimate of what
          it costs to rent a modest unit in a given area. Different programs may apply local rules and may use payment
          standards that are above or below the published HUD FMR.
        </p>

        <h2 id="safmr" className="mt-8 text-xl font-semibold text-[#0a0a0a]">
          What is SAFMR?
        </h2>
        <p className="mt-3 text-base text-[#525252] leading-relaxed">
          <span className="font-semibold text-[#0a0a0a]">Small Area Fair Market Rent (SAFMR)</span> is HUD’s ZIP-code
          level version of Fair Market Rent for certain metropolitan areas. The goal is to reflect meaningful rent
          differences within a metro region, where neighborhoods can vary widely.
        </p>
        <p className="mt-3 text-base text-[#525252] leading-relaxed">
          Standard FMR is often published at a county or metro-area level. SAFMR can help identify which ZIP codes are
          relatively more expensive or more affordable compared to the county median.
        </p>
        <p className="mt-3 text-base text-[#525252] leading-relaxed">
          On fmr.fyi, when a ZIP or area is designated for SAFMR, we label the result as{' '}
          <span className="font-semibold text-[#0a0a0a]">SAFMR</span>. If SAFMR isn’t applicable, we fall back to the
          county/metropolitan <span className="font-semibold text-[#0a0a0a]">FMR</span>.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-[#0a0a0a]">Try it</h2>
        <p className="mt-3 text-base text-[#525252] leading-relaxed">
          Search by <span className="font-medium text-[#0a0a0a]">city</span>, <span className="font-medium text-[#0a0a0a]">county</span>, or{' '}
          <span className="font-medium text-[#0a0a0a]">ZIP</span> to see the latest HUD values.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <a className="text-sm px-3 py-1.5 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#f5f5f5]" href="/cities">
            Browse cities
          </a>
          <a className="text-sm px-3 py-1.5 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#f5f5f5]" href="/counties">
            Browse counties
          </a>
          <a className="text-sm px-3 py-1.5 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#f5f5f5]" href="/zips">
            Browse ZIPs
          </a>
        </div>
      </div>
    </main>
  );
}

