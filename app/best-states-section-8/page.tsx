import type { Metadata } from 'next';
import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '@/lib/queries';
import { STATES } from '@/lib/states';
import Link from 'next/link';

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const year = await getLatestFMRYear();
  const title = `Best States for Section 8 Investment – FY ${year} | fmr.fyi`;
  const description = `Discover the best states for Section 8 housing investment based on FMR data and investment scores. Compare states ranked by median investment score, rent-to-price ratios, and Section 8 viability for FY ${year}.`;
  const canonical = 'https://fmr.fyi/best-states-section-8';
  
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

export default async function BestStatesSection8Page() {
  const year = await getLatestFMRYear();
  
  // Get states ranked by median investment score
  const result = await sql.query(
    `
    SELECT 
      state_code,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median_score,
      AVG(score) as avg_score,
      COUNT(*) as zip_count,
      AVG(net_yield) * 100 as avg_net_yield,
      AVG(rent_to_price_ratio) * 100 as avg_rent_to_price
    FROM investment_score
    WHERE fmr_year = $1
      AND data_sufficient = true
      AND state_code IS NOT NULL
      AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
    GROUP BY state_code
    HAVING COUNT(*) > 0
    ORDER BY median_score DESC NULLS LAST
    LIMIT 50
    `,
    [year]
  );

  const states = result.rows.map((row: any) => {
    const stateInfo = STATES.find(s => s.code === row.state_code);
    return {
      stateCode: row.state_code,
      stateName: stateInfo?.name || row.state_code,
      medianScore: Number(row.median_score) || null,
      avgScore: Number(row.avg_score) || null,
      zipCount: Number(row.zip_count) || 0,
      avgNetYield: Number(row.avg_net_yield) || null,
      avgRentToPrice: Number(row.avg_rent_to_price) || null,
    };
  });

  return (
    <main className="min-h-screen bg-[#fafafa] antialiased">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16">
        <Link href="/" className="text-sm font-medium text-[#0a0a0a] hover:opacity-70">
          ← Back to search
        </Link>

        <h1 className="mt-6 text-3xl sm:text-4xl font-bold tracking-tight text-[#0a0a0a]">
          Best States for Section 8 Investment
        </h1>
        <p className="mt-3 text-base text-[#525252] max-w-3xl">
          States ranked by median investment score for Section 8 housing. Investment scores are based on 
          Fair Market Rent (FMR) data, property values, tax rates, and net yield calculations for FY {year}.
        </p>
        <p className="mt-2 text-sm text-[#737373]">
          Scores are normalized where 100 = median yield. Higher scores indicate better investment potential 
          for Section 8 properties based on rent-to-price ratios and net yields after taxes.
        </p>

        <div className="mt-8 bg-white rounded-lg border border-[#e5e5e5] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#fafafa] border-b border-[#e5e5e5]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider">
                    State
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider">
                    Median Score
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider">
                    Avg Score
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider">
                    Avg Net Yield
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider">
                    Avg Rent/Price
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider">
                    ZIP Codes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5e5e5]">
                {states.map((state, index) => (
                  <tr key={state.stateCode} className="hover:bg-[#fafafa]">
                    <td className="px-4 py-3 text-sm text-[#737373] font-medium">
                      #{index + 1}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/state/${state.stateCode}`}
                        className="text-sm font-medium text-[#0a0a0a] hover:text-[#525252] hover:underline"
                      >
                        {state.stateName}
                      </Link>
                      <div className="text-xs text-[#737373] mt-0.5">{state.stateCode}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums">
                      {state.medianScore !== null ? (
                        <span
                          className={
                            state.medianScore >= 125
                              ? 'text-green-700'
                              : state.medianScore >= 100
                              ? 'text-green-600'
                              : state.medianScore >= 75
                              ? 'text-[#0a0a0a]'
                              : 'text-[#737373]'
                          }
                        >
                          {Math.round(state.medianScore)}
                        </span>
                      ) : (
                        <span className="text-[#a3a3a3]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-[#0a0a0a]">
                      {state.avgScore !== null ? Math.round(state.avgScore) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-[#0a0a0a]">
                      {state.avgNetYield !== null ? `${state.avgNetYield.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-[#0a0a0a]">
                      {state.avgRentToPrice !== null ? `${state.avgRentToPrice.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-[#737373]">
                      {state.zipCount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h2 className="text-lg font-semibold text-[#0a0a0a] mb-2">About Section 8 Investment Scores</h2>
          <p className="text-sm text-[#525252] mb-2">
            Investment scores are calculated using Fair Market Rent (FMR) data from HUD, property values from Zillow (ZHVI), 
            and effective property tax rates from the American Community Survey (ACS). Scores are normalized where 100 represents 
            the median yield across all ZIP codes.
          </p>
          <p className="text-sm text-[#525252]">
            Higher scores indicate better investment potential for Section 8 properties, considering factors like rent-to-price ratios, 
            net yields after taxes, and market stability. States with higher median scores typically offer better cash flow potential 
            for Section 8 housing investments.
          </p>
        </div>
      </div>
    </main>
  );
}





