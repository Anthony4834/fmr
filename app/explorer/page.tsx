import { Metadata } from 'next';
import { Suspense } from 'react';
import ExplorerClient from './ExplorerClient';
import { AppHeaderSkeleton } from '@/app/components/AppHeader';
import { STATES } from '@/lib/states';

type SearchParams = { [key: string]: string | string[] | undefined };

function getStateName(stateCode: string): string {
  return STATES.find((s) => s.code === stateCode.toUpperCase())?.name || stateCode;
}

function buildTitle(searchParams: SearchParams): string {
  const geoTab = Array.isArray(searchParams.geoTab) ? searchParams.geoTab[0] : searchParams.geoTab;
  const geoState = Array.isArray(searchParams.geoState) ? searchParams.geoState[0] : searchParams.geoState;
  const affordabilityTier = Array.isArray(searchParams.affordabilityTier) ? searchParams.affordabilityTier[0] : searchParams.affordabilityTier;
  const yieldRange = Array.isArray(searchParams.yieldRange) ? searchParams.yieldRange[0] : searchParams.yieldRange;
  const bedroom = Array.isArray(searchParams.bedroom) ? searchParams.bedroom[0] : searchParams.bedroom;
  const sort = Array.isArray(searchParams.sort) ? searchParams.sort[0] : searchParams.sort;

  const parts: string[] = [];

  // Geographic level
  if (geoTab === 'zip') {
    parts.push('ZIP Codes');
  } else if (geoTab === 'county') {
    parts.push('Counties');
  } else if (geoTab === 'city') {
    parts.push('Cities');
  } else {
    parts.push('States');
  }

  // State filter
  if (geoState && geoTab !== 'state') {
    parts.push(`in ${getStateName(geoState)}`);
  }

  // Filters
  const filterParts: string[] = [];
  if (affordabilityTier === 'affordable') {
    filterParts.push('Under $150K');
  } else if (affordabilityTier === 'midMarket') {
    filterParts.push('$150K-$350K');
  } else if (affordabilityTier === 'premium') {
    filterParts.push('Over $350K');
  }

  if (yieldRange === 'high') {
    filterParts.push('High Yield (7%+)');
  } else if (yieldRange === 'moderate') {
    filterParts.push('Moderate Yield (5-7%)');
  } else if (yieldRange === 'low') {
    filterParts.push('Low Yield (<5%)');
  }

  if (bedroom && bedroom !== 'all' && bedroom !== '3') {
    filterParts.push(`${bedroom} Bedroom`);
  }

  if (filterParts.length > 0) {
    parts.push(filterParts.join(', '));
  }

  // Sort context
  if (sort && sort !== 'score') {
    if (sort === 'yield') {
      parts.push('by Yield');
    } else if (sort === 'cashFlow') {
      parts.push('by Cash Flow');
    } else if (sort === 'affordability') {
      parts.push('by Affordability');
    } else if (sort === 'fmr') {
      parts.push('by FMR');
    }
  } else {
    parts.push('by Investment Score');
  }

  parts.push('| Section 8 Rental Markets | fmr.fyi');

  return parts.join(' ');
}

function buildDescription(searchParams: SearchParams): string {
  const geoTab = Array.isArray(searchParams.geoTab) ? searchParams.geoTab[0] : searchParams.geoTab;
  const geoState = Array.isArray(searchParams.geoState) ? searchParams.geoState[0] : searchParams.geoState;
  const affordabilityTier = Array.isArray(searchParams.affordabilityTier) ? searchParams.affordabilityTier[0] : searchParams.affordabilityTier;
  const yieldRange = Array.isArray(searchParams.yieldRange) ? searchParams.yieldRange[0] : searchParams.yieldRange;
  const bedroom = Array.isArray(searchParams.bedroom) ? searchParams.bedroom[0] : searchParams.bedroom;

  const parts: string[] = [];

  // Geographic level
  if (geoTab === 'zip') {
    parts.push('Browse ZIP codes');
  } else if (geoTab === 'county') {
    parts.push('Browse counties');
  } else if (geoTab === 'city') {
    parts.push('Browse cities');
  } else {
    parts.push('Browse states');
  }

  // State filter
  if (geoState && geoTab !== 'state') {
    parts.push(`in ${getStateName(geoState)}`);
  }

  parts.push('ranked by investment score, yield, cash flow, and affordability for Section 8 rental investing.');

  // Add filter context
  const filterParts: string[] = [];
  if (affordabilityTier === 'affordable') {
    filterParts.push('affordable properties under $150K');
  } else if (affordabilityTier === 'midMarket') {
    filterParts.push('mid-market properties $150K-$350K');
  } else if (affordabilityTier === 'premium') {
    filterParts.push('premium properties over $350K');
  }

  if (yieldRange === 'high') {
    filterParts.push('high yield markets (7%+)');
  } else if (yieldRange === 'moderate') {
    filterParts.push('moderate yield markets (5-7%)');
  } else if (yieldRange === 'low') {
    filterParts.push('low yield markets (<5%)');
  }

  if (bedroom && bedroom !== 'all' && bedroom !== '3') {
    filterParts.push(`${bedroom}-bedroom properties`);
  }

  if (filterParts.length > 0) {
    return `${parts.join(' ')} Filtered to ${filterParts.join(', ')}.`;
  }

  return parts.join(' ');
}

function buildKeywords(searchParams: SearchParams): string {
  const geoTab = Array.isArray(searchParams.geoTab) ? searchParams.geoTab[0] : searchParams.geoTab;
  const geoState = Array.isArray(searchParams.geoState) ? searchParams.geoState[0] : searchParams.geoState;
  const affordabilityTier = Array.isArray(searchParams.affordabilityTier) ? searchParams.affordabilityTier[0] : searchParams.affordabilityTier;
  const yieldRange = Array.isArray(searchParams.yieldRange) ? searchParams.yieldRange[0] : searchParams.yieldRange;

  const keywords: string[] = [
    'section 8 explorer',
    'housing market search',
    'investment score rankings',
    'best section 8 markets',
    'rental investment opportunities',
  ];

  if (geoTab === 'zip') {
    keywords.push('ZIP code rankings', 'ZIP code investment scores');
  } else if (geoTab === 'county') {
    keywords.push('county rankings', 'county investment scores');
  } else if (geoTab === 'city') {
    keywords.push('city rankings', 'city investment scores');
  } else {
    keywords.push('state rankings', 'state investment scores');
  }

  if (geoState) {
    keywords.push(`${getStateName(geoState)} section 8 markets`, `${geoState} rental investing`);
  }

  if (affordabilityTier === 'affordable') {
    keywords.push('affordable section 8 properties', 'entry-level rental investing');
  } else if (affordabilityTier === 'premium') {
    keywords.push('premium section 8 properties', 'high-value rental investing');
  }

  if (yieldRange === 'high') {
    keywords.push('high yield markets', 'high return rental properties');
  }

  return keywords.join(', ');
}

function buildCanonicalUrl(searchParams: SearchParams): string {
  const params = new URLSearchParams();
  const geoTab = Array.isArray(searchParams.geoTab) ? searchParams.geoTab[0] : searchParams.geoTab;
  const geoState = Array.isArray(searchParams.geoState) ? searchParams.geoState[0] : searchParams.geoState;
  const affordabilityTier = Array.isArray(searchParams.affordabilityTier) ? searchParams.affordabilityTier[0] : searchParams.affordabilityTier;
  const yieldRange = Array.isArray(searchParams.yieldRange) ? searchParams.yieldRange[0] : searchParams.yieldRange;
  const bedroom = Array.isArray(searchParams.bedroom) ? searchParams.bedroom[0] : searchParams.bedroom;
  const sort = Array.isArray(searchParams.sort) ? searchParams.sort[0] : searchParams.sort;

  if (geoTab && geoTab !== 'state') params.set('geoTab', geoTab);
  if (geoState) params.set('geoState', geoState);
  if (affordabilityTier && affordabilityTier !== 'all') params.set('affordabilityTier', affordabilityTier);
  if (yieldRange && yieldRange !== 'all') params.set('yieldRange', yieldRange);
  if (bedroom && bedroom !== '3' && bedroom !== 'all') params.set('bedroom', bedroom);
  if (sort && sort !== 'score') params.set('sort', sort);

  const queryString = params.toString();
  return `https://fmr.fyi/explorer${queryString ? `?${queryString}` : ''}`;
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const title = buildTitle(searchParams);
  const description = buildDescription(searchParams);
  const keywords = buildKeywords(searchParams);
  const canonical = buildCanonicalUrl(searchParams);

  return {
    title,
    description,
    keywords,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'fmr.fyi',
      type: 'website',
      images: [
        {
          url: 'https://fmr.fyi/og-image.png',
          width: 1200,
          height: 630,
          alt: 'fmr.fyi - Market Explorer for Section 8 Rental Investing',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['https://fmr.fyi/og-image.png'],
    },
  };
}

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
        {/* Header Skeleton */}
        <AppHeaderSkeleton showSearch={true} showDescription={true} className="mb-4 sm:mb-6 lg:mb-4" />

        <div className="flex flex-col gap-3 sm:gap-4">

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
