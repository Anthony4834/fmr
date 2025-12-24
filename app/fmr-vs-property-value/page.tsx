import type { Metadata } from 'next';
import Link from 'next/link';

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const title = `FMR vs Property Value & Cost of Ownership | fmr.fyi`;
  const description = `Compare Fair Market Rent (FMR) to property values and analyze cost of ownership for Section 8 investments. View rent-to-price ratios, net yields, and investment scores across all ZIP codes.`;
  const canonical = 'https://fmr.fyi/fmr-vs-property-value';
  
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'fmr.fyi',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default function FMRVsPropertyValuePage() {
  return (
    <main className="min-h-screen bg-[#fafafa] antialiased">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16">
        <Link href="/" className="text-sm font-medium text-[#0a0a0a] hover:opacity-70">
          ← Back to search
        </Link>

        <h1 className="mt-6 text-3xl sm:text-4xl font-bold tracking-tight text-[#0a0a0a]">
          FMR vs Property Value & Cost of Ownership
        </h1>
        <p className="mt-3 text-base text-[#525252] max-w-3xl">
          Compare Fair Market Rent (FMR) to property values and analyze the true cost of ownership for 
          Section 8 housing investments. Our investment score combines FMR data, property values from 
          Zillow, and effective tax rates to help you evaluate investment opportunities.
        </p>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border border-[#e5e5e5] p-6">
            <h2 className="text-xl font-semibold text-[#0a0a0a] mb-3">
              <Link href="/zip-property-data" className="hover:text-[#525252] hover:underline">
                ZIP Code Property Data →
              </Link>
            </h2>
            <p className="text-sm text-[#525252] mb-4">
              View comprehensive property data for all ZIP codes including:
            </p>
            <ul className="list-disc list-inside text-sm text-[#525252] space-y-1">
              <li>Property values (ZHVI) for 1-4 bedroom units</li>
              <li>Effective property tax rates from ACS</li>
              <li>Investment scores and net yields</li>
              <li>Rent-to-price ratios</li>
              <li>Normalization flags (price floors, rent caps, county blending)</li>
            </ul>
            <Link
              href="/zip-property-data"
              className="mt-4 inline-block px-4 py-2 bg-[#0a0a0a] text-white rounded-md text-sm font-medium hover:bg-[#525252] transition-colors"
            >
              View All ZIP Codes
            </Link>
          </div>

          <div className="bg-white rounded-lg border border-[#e5e5e5] p-6">
            <h2 className="text-xl font-semibold text-[#0a0a0a] mb-3">
              <Link href="/best-states-section-8" className="hover:text-[#525252] hover:underline">
                Best States for Section 8 →
              </Link>
            </h2>
            <p className="text-sm text-[#525252] mb-4">
              Compare states ranked by investment potential:
            </p>
            <ul className="list-disc list-inside text-sm text-[#525252] space-y-1">
              <li>Median investment scores by state</li>
              <li>Average net yields after taxes</li>
              <li>Rent-to-price ratios</li>
              <li>ZIP code coverage</li>
            </ul>
            <Link
              href="/best-states-section-8"
              className="mt-4 inline-block px-4 py-2 bg-[#0a0a0a] text-white rounded-md text-sm font-medium hover:bg-[#525252] transition-colors"
            >
              View State Rankings
            </Link>
          </div>
        </div>

        <div className="mt-8 bg-white rounded-lg border border-[#e5e5e5] p-6">
          <h2 className="text-xl font-semibold text-[#0a0a0a] mb-4">Understanding Investment Scores</h2>
          <div className="space-y-4 text-sm text-[#525252]">
            <div>
              <h3 className="font-semibold text-[#0a0a0a] mb-2">How Investment Scores Work</h3>
              <p className="mb-2">
                Investment scores combine multiple factors to evaluate Section 8 investment potential:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li><strong>Rent:</strong> Section 8 Fair Market Rent (FMR) from HUD</li>
                <li><strong>Property Value:</strong> Zillow Home Value Index (ZHVI) for comparable units</li>
                <li><strong>Taxes:</strong> Effective property tax rates from American Community Survey (ACS)</li>
                <li><strong>Net Yield:</strong> (Annual Rent − Annual Taxes) ÷ Property Value</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-[#0a0a0a] mb-2">Score Normalization</h3>
              <p className="mb-2">
                Scores are normalized where 100 = median yield across all ZIP codes. This allows for fair 
                comparison across different markets:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li><strong>≥ 130:</strong> Excellent investment potential (top 25%)</li>
                <li><strong>100-129:</strong> Above average investment potential</li>
                <li><strong>95-99:</strong> Average investment potential</li>
                <li><strong>&lt; 95:</strong> Below average investment potential</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-[#0a0a0a] mb-2">Normalization Adjustments</h3>
              <p className="mb-2">
                To ensure fair comparisons, certain adjustments may be applied:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li><strong>Price Floor:</strong> Minimum property value of $100,000</li>
                <li><strong>Rent Cap:</strong> Maximum rent-to-price ratio of 18%</li>
                <li><strong>County Blending:</strong> 60% ZIP value + 40% county median for low-value areas</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h2 className="text-lg font-semibold text-[#0a0a0a] mb-2">Cost of Ownership Analysis</h2>
          <p className="text-sm text-[#525252] mb-2">
            When evaluating Section 8 investments, consider both the rent potential (FMR) and the total 
            cost of ownership. Our investment scores account for:
          </p>
          <ul className="list-disc list-inside text-sm text-[#525252] space-y-1 ml-4">
            <li>Property acquisition costs (estimated via ZHVI)</li>
            <li>Ongoing property tax obligations</li>
            <li>Rent-to-price ratios to assess cash flow potential</li>
            <li>Market stability and data sufficiency</li>
          </ul>
          <p className="text-sm text-[#525252] mt-2">
            <strong>Note:</strong> Investment scores are estimates based on publicly available data. Actual 
            investment returns will vary based on property condition, local market conditions, management 
            costs, and other factors not included in this analysis.
          </p>
        </div>
      </div>
    </main>
  );
}



