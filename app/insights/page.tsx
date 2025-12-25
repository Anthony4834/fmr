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
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://fmr.fyi/' },
              { '@type': 'ListItem', position: 2, name: 'Insights', item: 'https://fmr.fyi/insights' },
            ],
          }),
        }}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 sm:py-8 md:py-10 lg:py-10">
        {/* Header Skeleton */}
        <AppHeaderSkeleton showSearch={true} showDescription={true} className="mb-4 sm:mb-6 lg:mb-4" />

        <div className="flex flex-col gap-2 sm:gap-3">

          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] flex-wrap">
            <a href="/" className="hover:text-[var(--text-primary)] transition-colors">
              Home
            </a>
            <span className="text-[var(--text-muted)]">/</span>
            <span aria-current="page" className="text-[var(--text-primary)] font-medium">
              Insights
            </span>
          </nav>

          <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] overflow-hidden">
            <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[var(--border-color)] bg-[var(--bg-tertiary)]">
              <div className="h-4 w-44 bg-[var(--border-color)] rounded animate-pulse" aria-hidden="true" />
              <div className="h-3 w-56 bg-[var(--border-color)] rounded mt-2 animate-pulse" aria-hidden="true" />
            </div>
            <div className="divide-y divide-[var(--border-color)]">
              {[...Array(12)].map((_, i) => (
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

export default function InsightsPage() {
  return (
    <Suspense fallback={<InsightsFallback />}>
      <InsightsClient />
    </Suspense>
  );
}
