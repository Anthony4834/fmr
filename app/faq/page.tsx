import type { Metadata } from 'next';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'FAQ | fmr.fyi',
  description: 'Frequently asked questions about HUD FMR and SAFMR data on fmr.fyi.',
  alternates: { canonical: 'https://fmr.fyi/faq' },
};

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-[#fafafa] antialiased">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16">
        <a href="/" className="text-sm font-medium text-[#0a0a0a] hover:opacity-70">
          ← Back to search
        </a>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-[#0a0a0a]">FAQ</h1>

        <div className="mt-6 space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-[#0a0a0a]">Is this the same as my local payment standard?</h2>
            <p className="mt-2 text-base text-[#525252] leading-relaxed">
              Not always. HUD publishes FMR/SAFMR benchmarks, while local housing agencies may set payment standards that
              differ. Use these values as a starting point and confirm with your local program.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0a0a0a]">Why does my county show a ZIP range?</h2>
            <p className="mt-2 text-base text-[#525252] leading-relaxed">
              In SAFMR-designated metros, each ZIP can have its own rent values. When you search a county/city that
              includes SAFMR ZIPs, we may show a range or a list of ZIP-specific values.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0a0a0a]">Which year is shown?</h2>
            <p className="mt-2 text-base text-[#525252] leading-relaxed">
              fmr.fyi displays the current HUD fiscal year data (e.g. FY 2026). The header on each result indicates the
              fiscal year and effective date.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0a0a0a]">Where does the data come from?</h2>
            <p className="mt-2 text-base text-[#525252] leading-relaxed">
              See <a className="underline" href="/data-sources">data sources</a>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}



