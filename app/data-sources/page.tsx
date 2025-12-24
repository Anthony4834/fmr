import type { Metadata } from 'next';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'Data Sources | fmr.fyi',
  description:
    'Data sources and methodology for fmr.fyi, including HUD Fair Market Rent, Zillow Home Value Index, property tax rates, and mortgage rates.',
  alternates: { canonical: 'https://fmr.fyi/data-sources' },
};

const dataSources = [
  {
    name: 'HUD Fair Market Rent (FMR)',
    provider: 'U.S. Department of Housing and Urban Development',
    description:
      'Official Fair Market Rent data published annually by HUD. FMRs are gross rent estimates that include the shelter rent plus the cost of all tenant-paid utilities. Used as payment standards for the Housing Choice Voucher (Section 8) program.',
    coverage: 'All U.S. counties and metropolitan areas',
    updateFrequency: 'Annually (fiscal year)',
    url: 'https://www.huduser.gov/portal/datasets/fmr.html',
  },
  {
    name: 'Small Area FMR (SAFMR)',
    provider: 'U.S. Department of Housing and Urban Development',
    description:
      'ZIP code-level Fair Market Rents for designated metropolitan areas. SAFMRs provide more granular rent data that reflects local market variations within metro areas.',
    coverage: 'Designated metropolitan areas (ZIP code level)',
    updateFrequency: 'Annually (fiscal year)',
    url: 'https://www.huduser.gov/portal/datasets/fmr/smallarea/index.html',
  },
  {
    name: 'Zillow Home Value Index (ZHVI)',
    provider: 'Zillow Research',
    description:
      'The Zillow Home Value Index represents the typical home value for a region. ZHVI is a smoothed, seasonally adjusted measure of the typical home value across a given region and housing type, calculated using a sophisticated algorithm that considers millions of home values.',
    coverage: 'National, state, metro, county, city, and ZIP code levels',
    updateFrequency: 'Monthly',
    url: 'https://www.zillow.com/research/data/',
  },
  {
    name: 'Property Tax Rates',
    provider: 'U.S. Census Bureau (American Community Survey)',
    description:
      'Effective property tax rates calculated from ACS data on median property taxes paid and median property values. These represent the typical tax burden for homeowners in each area.',
    coverage: 'County and ZIP code levels',
    updateFrequency: 'Annually (1-year and 5-year estimates)',
    url: 'https://www.census.gov/programs-surveys/acs',
  },
  {
    name: 'Mortgage Interest Rates',
    provider: 'Freddie Mac Primary Mortgage Market Survey',
    description:
      'Weekly average mortgage rates used in cash flow calculations. Includes 30-year fixed-rate mortgage averages, which are the standard for investment property financing assumptions.',
    coverage: 'National average',
    updateFrequency: 'Weekly',
    url: 'https://www.freddiemac.com/pmms',
  },
  {
    name: 'Rental Demand Indicators',
    provider: 'Multiple sources',
    description:
      'Rental market demand metrics derived from housing occupancy rates, renter population percentages, and market vacancy data from Census surveys and other public sources.',
    coverage: 'County and metropolitan area levels',
    updateFrequency: 'Annually',
    url: null,
  },
];

export default function DataSourcesPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary)] antialiased">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16">
        <a href="/" className="text-sm font-medium text-[var(--text-primary)] hover:opacity-70">
          ← Back to search
        </a>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-[var(--text-primary)]">Data Sources</h1>
        <p className="mt-4 text-base text-[var(--text-secondary)] leading-relaxed">
          fmr.fyi aggregates data from multiple authoritative sources to provide comprehensive
          Fair Market Rent information, investment analysis, and cash flow projections.
        </p>

        <div className="mt-10 space-y-8">
          {dataSources.map((source) => (
            <div
              key={source.name}
              className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">{source.name}</h2>
                  <p className="mt-1 text-sm text-[var(--text-tertiary)]">{source.provider}</p>
                </div>
                {source.url && (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-sm px-3 py-1.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    View source →
                  </a>
                )}
              </div>
              <p className="mt-4 text-base text-[var(--text-secondary)] leading-relaxed">
                {source.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="text-[var(--text-tertiary)]">Coverage:</span>{' '}
                  <span className="text-[var(--text-primary)]">{source.coverage}</span>
                </div>
                <div>
                  <span className="text-[var(--text-tertiary)]">Updates:</span>{' '}
                  <span className="text-[var(--text-primary)]">{source.updateFrequency}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Investment Score Methodology</h2>
          <p className="mt-3 text-base text-[var(--text-secondary)] leading-relaxed">
            Our proprietary Investment Score combines the data sources above to identify markets
            with strong Section 8 investment potential. The algorithm weights:
          </p>
          <ul className="mt-4 space-y-2 text-base text-[var(--text-secondary)] leading-relaxed list-disc pl-6">
            <li>
              <span className="font-medium text-[var(--text-primary)]">Rent-to-Value Ratio:</span> FMR divided
              by median property value, measuring potential gross yield
            </li>
            <li>
              <span className="font-medium text-[var(--text-primary)]">Tax Impact:</span> Effective property
              tax rates that affect net operating income
            </li>
            <li>
              <span className="font-medium text-[var(--text-primary)]">Market Demand:</span> Rental demand
              indicators suggesting tenant availability
            </li>
            <li>
              <span className="font-medium text-[var(--text-primary)]">Price Accessibility:</span> Property
              values relative to regional and national medians
            </li>
          </ul>
        </div>

        <div className="mt-8 bg-[var(--warning-bg)] rounded-xl border border-[var(--warning-border)] p-6">
          <h2 className="text-lg font-semibold text-[var(--warning-text)]">Important Disclaimer</h2>
          <p className="mt-2 text-base text-[var(--warning-text-secondary)] leading-relaxed">
            While we strive for accuracy, all data is provided for informational purposes only.
            Local housing authorities may set different payment standards than published FMRs.
            Property values, tax rates, and other metrics are estimates and may differ from
            actual values. Always verify data with local sources and consult with professionals
            before making investment decisions.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          <a
            className="text-sm px-3 py-1.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)]"
            href="/what-is-fmr"
          >
            What is FMR?
          </a>
          <a
            className="text-sm px-3 py-1.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)]"
            href="/what-is-safmr"
          >
            What is SAFMR?
          </a>
          <a
            className="text-sm px-3 py-1.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)]"
            href="/faq"
          >
            FAQ
          </a>
        </div>
      </div>
    </main>
  );
}

