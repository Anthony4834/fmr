import type { Metadata } from 'next';
import { sql } from '@vercel/postgres';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'Browse ZIP codes | fmr.fyi',
  description: 'Browse ZIP codes by state to view HUD Fair Market Rent (FMR/SAFMR) data.',
  alternates: { canonical: 'https://fmr.fyi/zips' },
};

export default async function ZipsIndexPage() {
  const states = await sql`
    SELECT DISTINCT state_code, state_name
    FROM zip_county_mapping
    WHERE state_code != 'PR'
    ORDER BY state_name
  `;

  return (
    <main className="min-h-screen bg-[#fafafa] antialiased">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16">
        <a href="/" className="text-sm font-medium text-[#0a0a0a] hover:opacity-70">
          ← Back to search
        </a>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-[#0a0a0a]">Browse ZIP codes</h1>
        <p className="mt-3 text-base text-[#525252]">
          Pick a state to browse ZIP codes. Each ZIP page redirects to the main FMR view.
        </p>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {states.rows.map((row: any) => (
            <a
              key={row.state_code}
              href={`/zips/${String(row.state_code).toLowerCase()}`}
              className="px-3 py-2 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#f5f5f5] text-sm text-[#0a0a0a]"
            >
              <span className="font-semibold">{row.state_code}</span>
              <span className="text-[#737373]"> — {row.state_name}</span>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}



