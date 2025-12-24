import { Metadata } from 'next';
import { Suspense } from 'react';
import ExplorerClient from './ExplorerClient';

export const metadata: Metadata = {
  title: 'Market Explorer | Browse Section 8 Housing by Investment Score | fmr.fyi',
  description:
    'Search and filter Section 8 housing markets by Investment Score. Compare states, counties, cities, and ZIP codes to find the best rental investment opportunities.',
  keywords:
    'section 8 explorer, housing market search, investment score rankings, best section 8 markets, rental investment opportunities',
  alternates: { canonical: '/explorer' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Section 8 Market Explorer',
    description: 'Search and compare housing markets by Investment Score.',
    url: '/explorer',
    siteName: 'fmr.fyi',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Market Explorer',
    description:
      'Search and filter housing markets by Investment Score. Compare states, counties, cities, and ZIP codes to find the best rental investment opportunities.',
  },
};

function ExplorerFallback() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://fmr.fyi/' },
              { '@type': 'ListItem', position: 2, name: 'Explorer', item: 'https://fmr.fyi/explorer' },
            ],
          }),
        }}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 sm:py-8 md:py-10 lg:py-10">
        {/* Header (match app shell) */}
        <div className="mb-4 sm:mb-6 lg:mb-4">
          <div className="mb-2 sm:mb-3 lg:mb-2">
            <a href="/" className="block hover:opacity-70 transition-opacity">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[var(--text-primary)] mb-1 tracking-tight">
                fmr.fyi
              </h1>
              <p className="text-xs text-[var(--text-tertiary)] font-medium tracking-wide uppercase">Fair Market Rent Data</p>
            </a>
          </div>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-2xl">
              Search HUD Fair Market Rent data by address, city, ZIP code, county, or parish
            </p>
            <div className="h-9 w-9 rounded bg-[var(--border-color)] animate-pulse" aria-hidden="true" />
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] p-4 sm:p-6">
            <div className="h-10 sm:h-12 bg-[var(--border-color)] rounded-xl animate-pulse" aria-hidden="true" />
          </div>

          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] flex-wrap">
            <a href="/" className="hover:text-[var(--text-primary)] transition-colors">
              Home
            </a>
            <span className="text-[var(--text-muted)]">/</span>
            <span aria-current="page" className="text-[var(--text-primary)] font-medium">
              Explorer
            </span>
          </nav>

          <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] overflow-hidden">
            <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[var(--border-color)] bg-[var(--bg-tertiary)]">
              <div className="h-4 w-40 bg-[var(--border-color)] rounded animate-pulse" aria-hidden="true" />
              <div className="h-3 w-52 bg-[var(--border-color)] rounded mt-2 animate-pulse" aria-hidden="true" />
            </div>
            <div className="divide-y divide-[var(--border-color)]">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="px-3 sm:px-4 py-2 sm:py-2.5">
                  <div className="h-4 bg-[var(--border-color)] rounded animate-pulse" aria-hidden="true" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ExplorerPage() {
  return (
    <Suspense fallback={<ExplorerFallback />}>
      <ExplorerClient />
    </Suspense>
  );
}
