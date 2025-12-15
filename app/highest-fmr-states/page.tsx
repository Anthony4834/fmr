import type { Metadata } from 'next';
import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '@/lib/queries';
import { STATES } from '@/lib/states';
import Link from 'next/link';

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const year = await getLatestFMRYear();
  const title = `Highest FMR States – FY ${year} | fmr.fyi`;
  const description = `Ranking of all 50 states by highest Fair Market Rent (FMR) for FY ${year}. Compare average FMR across states for 0-4 bedroom units. Find states with the highest Section 8 rent limits.`;
  const canonical = 'https://fmr.fyi/highest-fmr-states';
  
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

export default async function HighestFMRStatesPage() {
  const year = await getLatestFMRYear();
  
  // Get states ranked by average FMR (using 2BR as primary metric)
  const result = await sql.query(
    `
    SELECT 
      fd.state_code,
      AVG(fd.bedroom_0) as avg_0br,
      AVG(fd.bedroom_1) as avg_1br,
      AVG(fd.bedroom_2) as avg_2br,
      AVG(fd.bedroom_3) as avg_3br,
      AVG(fd.bedroom_4) as avg_4br,
      COUNT(DISTINCT fd.area_name) as area_count
    FROM fmr_data fd
    WHERE fd.year = $1
      AND fd.state_code IS NOT NULL
      AND fd.state_code != 'PR'
      AND fd.bedroom_2 IS NOT NULL
    GROUP BY fd.state_code
    HAVING COUNT(DISTINCT fd.area_name) > 0
    ORDER BY AVG(fd.bedroom_2) DESC NULLS LAST
    `,
    [year]
  );

  const states = result.rows.map((row: any) => {
    const stateInfo = STATES.find(s => s.code === row.state_code);
    return {
      stateCode: row.state_code,
      stateName: stateInfo?.name || row.state_code,
      avg0BR: Number(row.avg_0br) || null,
      avg1BR: Number(row.avg_1br) || null,
      avg2BR: Number(row.avg_2br) || null,
      avg3BR: Number(row.avg_3br) || null,
      avg4BR: Number(row.avg_4br) || null,
      areaCount: Number(row.area_count) || 0,
    };
  });

  const formatCurrency = (value: number | null) => {
    if (value === null) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <main className="min-h-screen bg-[#fafafa] antialiased">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16">
        <Link href="/" className="text-sm font-medium text-[#0a0a0a] hover:opacity-70">
          ← Back to search
        </Link>

        <h1 className="mt-6 text-3xl sm:text-4xl font-bold tracking-tight text-[#0a0a0a]">
          Highest FMR States
        </h1>
        <p className="mt-3 text-base text-[#525252] max-w-3xl">
          All 50 states ranked by average Fair Market Rent (FMR) for FY {year}. States are ranked by 
          average 2-bedroom FMR, with complete data for all bedroom sizes (0-4 BR).
        </p>
        <p className="mt-2 text-sm text-[#737373]">
          FMR data is from the U.S. Department of Housing and Urban Development (HUD) and represents 
          the maximum rent that can be paid for Section 8 housing vouchers in each area.
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
                    0 BR
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider">
                    1 BR
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider">
                    2 BR
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider">
                    3 BR
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider">
                    4 BR
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider">
                    Areas
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
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-[#0a0a0a]">
                      {formatCurrency(state.avg0BR)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-[#0a0a0a]">
                      {formatCurrency(state.avg1BR)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-[#0a0a0a]">
                      {formatCurrency(state.avg2BR)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-[#0a0a0a]">
                      {formatCurrency(state.avg3BR)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-[#0a0a0a]">
                      {formatCurrency(state.avg4BR)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-[#737373]">
                      {state.areaCount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h2 className="text-lg font-semibold text-[#0a0a0a] mb-2">About Fair Market Rent (FMR)</h2>
          <p className="text-sm text-[#525252] mb-2">
            Fair Market Rent (FMR) is the maximum amount that can be paid for rental assistance under the 
            Housing Choice Voucher Program (Section 8). FMRs are set annually by HUD and vary by geographic 
            area and bedroom size.
          </p>
          <p className="text-sm text-[#525252]">
            States with higher average FMRs typically have higher housing costs and may offer better rental 
            income potential for property investors participating in Section 8 programs. However, property 
            values and operating costs should also be considered when evaluating investment opportunities.
          </p>
        </div>
      </div>
    </main>
  );
}
