import type { Metadata } from 'next';
import { sql } from '@vercel/postgres';
import { buildCountySlug } from '@/lib/location-slugs';
import { formatCountyName, getCountySuffix } from '@/lib/county-utils';

export const revalidate = 86400;

const PAGE_SIZE = 500;

function normalizeState(input: string): string | null {
  const s = input.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(s)) return null;
  if (s === 'PR') return null;
  return s;
}

export async function generateMetadata({ params }: { params: { state: string } }): Promise<Metadata> {
  const st = normalizeState(params.state);
  if (!st) return { title: 'Counties | fmr.fyi' };
  const regionalUnitPlural = st === 'LA' ? 'Parishes' : 'Counties';
  const regionalUnitPluralLower = regionalUnitPlural.toLowerCase();
  return {
    title: `${regionalUnitPlural} in ${st} | fmr.fyi`,
    description: `Browse ${regionalUnitPluralLower} in ${st} and view HUD Fair Market Rent (FMR/SAFMR) data.`,
    alternates: { canonical: `https://fmr.fyi/counties/${st.toLowerCase()}` },
  };
}

export default async function CountiesByStatePage({
  params,
  searchParams,
}: {
  params: { state: string };
  searchParams?: { page?: string };
}) {
  const st = normalizeState(params.state);
  if (!st) {
    return (
      <main className="min-h-screen bg-[#fafafa] antialiased">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16">
          <a href="/counties" className="text-sm font-medium text-[#0a0a0a] hover:opacity-70">
            ← Back to states
          </a>
          <h1 className="mt-6 text-2xl font-bold text-[#0a0a0a]">State not found</h1>
        </div>
      </main>
    );
  }

  const page = Math.max(1, Number(searchParams?.page || '1') || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [stateNameRes, countiesRes, totalRes] = await Promise.all([
    sql`SELECT state_name FROM zip_county_mapping WHERE state_code = ${st} LIMIT 1`,
    sql`
      SELECT DISTINCT county_name
      FROM zip_county_mapping
      WHERE state_code = ${st}
      ORDER BY county_name
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `,
    sql`
      SELECT COUNT(*)::int AS c
      FROM (SELECT DISTINCT county_name FROM zip_county_mapping WHERE state_code = ${st}) t
    `,
  ]);

  const stateName = (stateNameRes.rows[0] as any)?.state_name || st;
  const total = Number((totalRes.rows[0] as any)?.c || 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const regionalUnit = getCountySuffix(st);
  const regionalUnitPlural = regionalUnit === 'Parish' ? 'Parishes' : 'Counties';

  return (
    <main className="min-h-screen bg-[#fafafa] antialiased">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16">
        <a href="/counties" className="text-sm font-medium text-[#0a0a0a] hover:opacity-70">
          ← Back to states
        </a>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-[#0a0a0a]">
          {regionalUnitPlural} in {stateName} ({st})
        </h1>
        <p className="mt-3 text-base text-[#525252]">
          Showing page {page} of {totalPages} ({total.toLocaleString()} {regionalUnitPlural.toLowerCase()}).
        </p>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {countiesRes.rows.map((row: any) => {
            const county = String(row.county_name);
            const slug = buildCountySlug(county, st);
            const displayName = formatCountyName(county, st);
            return (
              <a
                key={slug}
                href={`/county/${slug}`}
                className="px-3 py-2 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#f5f5f5] text-sm text-[#0a0a0a]"
              >
                {displayName}
              </a>
            );
          })}
        </div>

        <div className="mt-8 flex items-center justify-between text-sm">
          <div>
            {page > 1 && (
              <a
                className="px-3 py-1.5 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#f5f5f5]"
                href={`/counties/${st.toLowerCase()}?page=${page - 1}`}
              >
                ← Prev
              </a>
            )}
          </div>
          <div className="text-[#737373]">Page {page}</div>
          <div>
            {page < totalPages && (
              <a
                className="px-3 py-1.5 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#f5f5f5]"
                href={`/counties/${st.toLowerCase()}?page=${page + 1}`}
              >
                Next →
              </a>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}






