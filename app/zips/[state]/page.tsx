import type { Metadata } from 'next';
import { sql } from '@vercel/postgres';

export const revalidate = 86400;

const PAGE_SIZE = 800;

function normalizeState(input: string): string | null {
  const s = input.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(s)) return null;
  if (s === 'PR') return null;
  return s;
}

export async function generateMetadata({ params }: { params: { state: string } }): Promise<Metadata> {
  const st = normalizeState(params.state);
  if (!st) return { title: 'ZIP codes | fmr.fyi' };
  return {
    title: `ZIP codes in ${st} | fmr.fyi`,
    description: `Browse ZIP codes in ${st} and view HUD Fair Market Rent (FMR/SAFMR) data.`,
    alternates: { canonical: `https://fmr.fyi/zips/${st.toLowerCase()}` },
  };
}

export default async function ZipsByStatePage({
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
          <a href="/zips" className="text-sm font-medium text-[#0a0a0a] hover:opacity-70">
            ← Back to states
          </a>
          <h1 className="mt-6 text-2xl font-bold text-[#0a0a0a]">State not found</h1>
        </div>
      </main>
    );
  }

  const page = Math.max(1, Number(searchParams?.page || '1') || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [stateNameRes, zipsRes, totalRes] = await Promise.all([
    sql`SELECT state_name FROM zip_county_mapping WHERE state_code = ${st} LIMIT 1`,
    sql`
      SELECT DISTINCT zip_code
      FROM zip_county_mapping
      WHERE state_code = ${st}
      ORDER BY zip_code
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `,
    sql`
      SELECT COUNT(*)::int AS c
      FROM (SELECT DISTINCT zip_code FROM zip_county_mapping WHERE state_code = ${st}) t
    `,
  ]);

  const stateName = (stateNameRes.rows[0] as any)?.state_name || st;
  const total = Number((totalRes.rows[0] as any)?.c || 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="min-h-screen bg-[#fafafa] antialiased">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16">
        <a href="/zips" className="text-sm font-medium text-[#0a0a0a] hover:opacity-70">
          ← Back to states
        </a>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-[#0a0a0a]">
          ZIP codes in {stateName} ({st})
        </h1>
        <p className="mt-3 text-base text-[#525252]">
          Showing page {page} of {totalPages} ({total.toLocaleString()} ZIP codes).
        </p>

        <div className="mt-6 grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2">
          {zipsRes.rows.map((row: any) => {
            const zip = String(row.zip_code);
            return (
              <a
                key={zip}
                href={`/zip/${zip}`}
                className="px-2.5 py-2 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#f5f5f5] text-xs font-mono text-[#0a0a0a] text-center"
              >
                {zip}
              </a>
            );
          })}
        </div>

        <div className="mt-8 flex items-center justify-between text-sm">
          <div>
            {page > 1 && (
              <a
                className="px-3 py-1.5 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#f5f5f5]"
                href={`/zips/${st.toLowerCase()}?page=${page - 1}`}
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
                href={`/zips/${st.toLowerCase()}?page=${page + 1}`}
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








