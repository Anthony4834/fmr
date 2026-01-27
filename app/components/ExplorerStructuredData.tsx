'use client';

import { useSearchParams } from 'next/navigation';
import { STATES } from '@/lib/states';
import { buildCitySlug, buildCountySlug } from '@/lib/location-slugs';
import { formatCountyName } from '@/lib/county-utils';

interface RankingItem {
  rank: number;
  stateCode?: string;
  stateName?: string;
  countyName?: string;
  countyFips?: string;
  cityName?: string;
  zipCode?: string;
  medianScore: number | null;
  netYield?: number | null;
  medianFMR?: number | null;
  medianPropertyValue?: number | null;
  cashFlowEstimate?: number | null;
}

interface ExplorerStructuredDataProps {
  type: 'state' | 'county' | 'city' | 'zip';
  topItems?: RankingItem[];
}

export default function ExplorerStructuredData({ type, topItems = [] }: ExplorerStructuredDataProps) {
  const searchParams = useSearchParams();
  const geoTab = searchParams.get('geoTab') || 'state';
  // Use geoTab from URL params, fallback to type prop
  const effectiveType = (geoTab === 'county' || geoTab === 'city' || geoTab === 'zip' ? geoTab : 'state') as 'state' | 'county' | 'city' | 'zip';
  const geoState = searchParams.get('geoState');
  const affordabilityTier = searchParams.get('affordabilityTier');
  const yieldRange = searchParams.get('yieldRange');
  const bedroom = searchParams.get('bedroom');

  // Build breadcrumb list
  const breadcrumbItems = [
    { '@type': 'ListItem' as const, position: 1, name: 'Home', item: 'https://fmr.fyi/' },
  ];

  let explorerLabel = 'Explorer';
  const filterParts: string[] = [];

  if (geoTab && geoTab !== 'state') {
    if (geoTab === 'zip') explorerLabel = 'ZIP Code Explorer';
    else if (geoTab === 'county') explorerLabel = 'County Explorer';
    else if (geoTab === 'city') explorerLabel = 'City Explorer';
  }

  if (geoState && geoTab !== 'state') {
    const stateName = STATES.find((s) => s.code === geoState.toUpperCase())?.name || geoState;
    explorerLabel = `${stateName} ${explorerLabel}`;
    filterParts.push(`in ${stateName}`);
  }

  if (affordabilityTier && affordabilityTier !== 'all') {
    if (affordabilityTier === 'affordable') filterParts.push('Under $150K');
    else if (affordabilityTier === 'midMarket') filterParts.push('$150K-$350K');
    else if (affordabilityTier === 'premium') filterParts.push('Over $350K');
  }

  if (yieldRange && yieldRange !== 'all') {
    if (yieldRange === 'high') filterParts.push('High Yield');
    else if (yieldRange === 'moderate') filterParts.push('Moderate Yield');
    else if (yieldRange === 'low') filterParts.push('Low Yield');
  }

  const canonicalUrl = (() => {
    const params = new URLSearchParams();
    if (geoTab && geoTab !== 'state') params.set('geoTab', geoTab);
    if (geoState) params.set('geoState', geoState);
    if (affordabilityTier && affordabilityTier !== 'all') params.set('affordabilityTier', affordabilityTier);
    if (yieldRange && yieldRange !== 'all') params.set('yieldRange', yieldRange);
    if (bedroom && bedroom !== '3' && bedroom !== 'all') params.set('bedroom', bedroom);
    const queryString = params.toString();
    return `https://fmr.fyi/explorer${queryString ? `?${queryString}` : ''}`;
  })();

  breadcrumbItems.push({
    '@type': 'ListItem',
    position: 2,
    name: filterParts.length > 0 ? `${explorerLabel} (${filterParts.join(', ')})` : explorerLabel,
    item: canonicalUrl,
  });

  const breadcrumbList = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems,
  };

  // Build ItemList for top rankings (top 20)
  const itemListItems = topItems.slice(0, 20).map((item) => {
    let name = '';
    let url = '';

    if (effectiveType === 'state' && item.stateCode) {
      name = item.stateName || STATES.find((s) => s.code === item.stateCode)?.name || item.stateCode;
      url = `https://fmr.fyi/state/${item.stateCode}`;
    } else if (effectiveType === 'county' && item.countyName && item.stateCode) {
      name = formatCountyName(item.countyName, item.stateCode);
      url = `https://fmr.fyi/county/${buildCountySlug(item.countyName, item.stateCode)}`;
    } else if (effectiveType === 'city' && item.cityName && item.stateCode) {
      name = item.cityName;
      url = `https://fmr.fyi/city/${buildCitySlug(item.cityName, item.stateCode)}`;
    } else if (effectiveType === 'zip' && item.zipCode) {
      name = `ZIP ${item.zipCode}`;
      url = `https://fmr.fyi/zip/${item.zipCode}`;
    }

    const itemData: any = {
      '@type': 'ListItem',
      position: item.rank,
      name,
      item: url,
    };

    // Add additional properties for metrics
    if (item.medianScore !== null || item.netYield !== null || item.medianFMR !== null) {
      itemData.additionalProperty = [];
      if (item.medianScore !== null) {
        itemData.additionalProperty.push({
          '@type': 'PropertyValue',
          name: 'Investment Score',
          value: Math.round(item.medianScore),
        });
      }
      if (item.netYield !== null) {
        itemData.additionalProperty.push({
          '@type': 'PropertyValue',
          name: 'Net Yield',
          value: `${(item.netYield * 100).toFixed(1)}%`,
        });
      }
      if (item.medianFMR !== null) {
        itemData.additionalProperty.push({
          '@type': 'PropertyValue',
          name: 'Median FMR',
          value: `$${item.medianFMR.toLocaleString()}`,
        });
      }
      if (item.medianPropertyValue !== null) {
        itemData.additionalProperty.push({
          '@type': 'PropertyValue',
          name: 'Median Property Value',
          value: `$${item.medianPropertyValue.toLocaleString()}`,
        });
      }
      if (item.cashFlowEstimate !== null) {
        itemData.additionalProperty.push({
          '@type': 'PropertyValue',
          name: 'Estimated Cash Flow',
          value: `$${item.cashFlowEstimate.toLocaleString()}/month`,
        });
      }
    }

    return itemData;
  }).filter((item) => item.name && item.item);

  const itemList = itemListItems.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${explorerLabel} - Top ${effectiveType === 'state' ? 'States' : effectiveType === 'county' ? 'Counties' : effectiveType === 'city' ? 'Cities' : 'ZIP Codes'} by Investment Score`,
    description: `Ranked list of top ${effectiveType === 'state' ? 'states' : effectiveType === 'county' ? 'counties' : effectiveType === 'city' ? 'cities' : 'ZIP codes'} for Section 8 rental investing based on investment score, yield, and cash flow potential.${filterParts.length > 0 ? ` Filtered to: ${filterParts.join(', ')}.` : ''}`,
    numberOfItems: itemListItems.length,
    itemListElement: itemListItems,
  } : null;

  // WebPage structured data
  const webPage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: explorerLabel,
    description: `Search and filter Section 8 housing markets by Investment Score. Compare ${effectiveType === 'state' ? 'states' : effectiveType === 'county' ? 'counties' : effectiveType === 'city' ? 'cities' : 'ZIP codes'} to find the best rental investment opportunities.`,
    url: canonicalUrl,
    mainEntity: itemList ? { '@id': `${canonicalUrl}#itemlist` } : undefined,
    breadcrumb: {
      '@id': `${canonicalUrl}#breadcrumb`,
    },
  };

  // FAQ structured data
  const faqPage = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How do I use the Market Explorer?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Use the Market Explorer to browse and filter Section 8 housing markets by geographic level (states, counties, cities, or ZIP codes). You can filter by affordability tier, yield range, minimum investment score, and bedroom count. Sort by investment score, yield, cash flow, affordability, or FMR to find the best markets for your investment goals.',
        },
      },
      {
        '@type': 'Question',
        name: 'What is Investment Score?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Investment Score is a comprehensive metric that evaluates Section 8 rental markets based on net yield (annual rent minus taxes divided by property value), rental demand, and market conditions. Higher scores indicate better investment opportunities with stronger cash flow potential.',
        },
      },
      {
        '@type': 'Question',
        name: 'What filters should I use to find the best markets?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Start by selecting your target geographic level (ZIP codes offer the most granular data). Filter by affordability tier based on your budget, yield range for desired returns (7%+ for high yield), and set a minimum investment score threshold. Consider filtering by bedroom count if you have a specific property type in mind.',
        },
      },
      {
        '@type': 'Question',
        name: 'How is cash flow estimated?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Cash flow estimates are based on Fair Market Rent (FMR) data, current mortgage rates, property tax rates, and standard expense assumptions (8% vacancy/maintenance allowance, property management fees). Estimates assume a 20% down payment and 30-year fixed mortgage.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I export the explorer data?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, registered users can export explorer data to Excel. Click the export button after applying your desired filters. Export includes all visible metrics including investment scores, yields, FMR values, property values, and cash flow estimates.',
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbList) }}
      />
      {itemList && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPage) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }}
      />
    </>
  );
}
