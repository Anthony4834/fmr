import { Metadata } from 'next';
import { Suspense } from 'react';
import InsightsClient from './InsightsClient';
import { AppHeaderSkeleton } from '@/app/components/AppHeader';

export const metadata: Metadata = {
  title: 'Market Intelligence | Section 8 Trends, Prices & Opportunities | fmr.fyi',
  description:
    'Analyze Section 8 rental market trends, discover the most expensive and affordable markets, and track rising and falling investment opportunities across ZIP codes, cities, and counties.',
  keywords:
    'section 8 trends, rental market analysis, housing price trends, investment movers, section 8 opportunities, fair market rent trends',
  alternates: { canonical: '/insights' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Section 8 Market Intelligence',
    description:
      'Analyze Section 8 rental market trends, discover the most expensive and affordable markets, and track rising and falling investment opportunities across ZIP codes, cities, and counties.',
    url: '/insights',
    siteName: 'fmr.fyi',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Market Intelligence',
    description:
      'Analyze rental market trends, discover the most expensive and affordable markets, and track rising and falling investment opportunities across ZIP codes, cities, and counties.',
  },
};

function InsightsFallback() {
  return (
    <main className="noise min-h-screen bg-[var(--bg-primary)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://fmr.fyi/' },
              { '@type': 'ListItem', position: 2, name: 'Market explorer', item: 'https://fmr.fyi/insights' },
            ],
          }),
        }}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-5 py-6 sm:py-8">
        <AppHeaderSkeleton showSearch showDescription={true} className="mb-4 sm:mb-6" />
        <div className="flex flex-col gap-5">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <span className="h-4 w-24 bg-[var(--border-color)] rounded animate-pulse" aria-hidden />
          </nav>
          <div className="h-24 bg-[var(--border-color)] rounded animate-pulse" aria-hidden />
          <div className="h-10 w-full max-w-[420px] bg-[var(--border-color)] rounded-md animate-pulse" aria-hidden />
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] overflow-hidden">
            <div className="p-4 sm:p-5 space-y-3">
              <div className="h-10 bg-[var(--border-color)] rounded animate-pulse w-full" aria-hidden />
              <div className="h-px bg-[var(--border-color)]" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-[var(--border-color)] rounded animate-pulse" aria-hidden />
                ))}
              </div>
            </div>
          </div>
          <div className="mt-6 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-color)] grid grid-cols-[1.5fr_1fr_1fr_1fr_0.8fr] gap-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-4 bg-[var(--border-color)] rounded animate-pulse" aria-hidden />
              ))}
            </div>
            <div className="divide-y divide-[var(--border-color)]">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="px-4 py-4 grid grid-cols-[1.5fr_1fr_1fr_1fr_0.8fr] gap-3 items-center">
                  <div className="h-4 bg-[var(--border-color)] rounded animate-pulse w-3/4" aria-hidden />
                  <div className="h-4 bg-[var(--border-color)] rounded animate-pulse" aria-hidden />
                  <div className="h-4 bg-[var(--border-color)] rounded animate-pulse" aria-hidden />
                  <div className="h-4 bg-[var(--border-color)] rounded animate-pulse" aria-hidden />
                  <div className="h-4 bg-[var(--border-color)] rounded animate-pulse w-12" aria-hidden />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function InsightsPage() {
  return (
    <Suspense fallback={<InsightsFallback />}>
      <InsightsClient />
    </Suspense>
  );
}
