import type { Metadata } from 'next';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'Data sources | fmr.fyi',
  description:
    'Data sources and methodology for fmr.fyi, including HUD Fair Market Rent (FMR) and Small Area Fair Market Rent (SAFMR).',
  alternates: { canonical: 'https://fmr.fyi/data-sources' },
};

export default function DataSourcesPage() {
  return (
    <main className="min-h-screen bg-[#fafafa] antialiased">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16">
        <a href="/" className="text-sm font-medium text-[#0a0a0a] hover:opacity-70">
          ← Back to search
        </a>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-[#0a0a0a]">Data sources</h1>
        <p className="mt-4 text-base text-[#525252] leading-relaxed">
          fmr.fyi is built around publicly available data from the{' '}
          <span className="font-semibold text-[#0a0a0a]">U.S. Department of Housing and Urban Development (HUD)</span>.
          We ingest HUD Fair Market Rent (FMR) and, where applicable, Small Area Fair Market Rent (SAFMR).
        </p>

        <h2 className="mt-8 text-xl font-semibold text-[#0a0a0a]">What we show</h2>
        <ul className="mt-3 space-y-2 text-base text-[#525252] leading-relaxed list-disc pl-6">
          <li>
            <span className="font-semibold text-[#0a0a0a]">FMR</span> values (typically county/metropolitan-area level)
            for 0–4 bedroom units.
          </li>
          <li>
            <span className="font-semibold text-[#0a0a0a]">SAFMR</span> values (ZIP-level) for designated metropolitan
            areas.
          </li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold text-[#0a0a0a]">Notes</h2>
        <p className="mt-3 text-base text-[#525252] leading-relaxed">
          HUD updates these datasets on an annual cadence (fiscal year). Local housing agencies may apply their own
          payment standards and program rules, so treat these values as a benchmark and verify locally when needed.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <a className="text-sm px-3 py-1.5 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#f5f5f5]" href="/what-is-fmr">
            What is FMR?
          </a>
          <a className="text-sm px-3 py-1.5 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#f5f5f5]" href="/what-is-fmr#safmr">
            What is SAFMR?
          </a>
        </div>
      </div>
    </main>
  );
}



