import type { Metadata } from 'next';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'FAQ | fmr.fyi',
  description: 'Frequently asked questions about HUD FMR and SAFMR data, investment scores, cash flow calculations, and more on fmr.fyi.',
  alternates: { canonical: 'https://fmr.fyi/faq' },
};

const faqs = [
  {
    category: 'Fair Market Rent (FMR)',
    questions: [
      {
        q: 'What is Fair Market Rent (FMR)?',
        a: 'Fair Market Rent (FMR) is the amount of money HUD determines is needed to rent a moderately-priced dwelling unit in a specific area. FMRs are used to determine payment standards for the Housing Choice Voucher (Section 8) program, initial renewal rents for some expiring project-based Section 8 contracts, and rent ceilings for other HUD programs.',
      },
      {
        q: 'How is FMR determined by HUD?',
        a: 'HUD calculates FMRs using American Community Survey (ACS) data, which provides estimates of rents paid by recent movers. The FMR is set at the 40th percentile of gross rents for standard quality rental units in a metropolitan area or county. This means 40% of the rental units in the area rent at or below the FMR amount.',
      },
      {
        q: 'What is Small Area FMR (SAFMR)?',
        a: 'Small Area FMRs are Fair Market Rents calculated at the ZIP code level rather than the metropolitan area level. SAFMRs provide more localized rent standards, reflecting the actual rent variations within a metro area. HUD requires SAFMRs in certain metropolitan areas and allows other areas to opt in.',
      },
      {
        q: 'Is this the same as my local payment standard?',
        a: 'Not always. HUD publishes FMR/SAFMR benchmarks, while local Public Housing Authorities (PHAs) may set their own payment standards between 90% and 110% of FMR (or higher with HUD approval). Use these values as a starting point and confirm with your local housing authority.',
      },
      {
        q: 'When does FMR data update?',
        a: 'HUD publishes new FMR data annually, typically in the fall for the upcoming fiscal year (which runs October to September). For example, FY 2026 data becomes effective October 1, 2025. fmr.fyi updates with new data as soon as HUD releases it.',
      },
      {
        q: 'Why does my county show a ZIP range?',
        a: 'In SAFMR-designated metros, each ZIP code can have its own rent values based on local market conditions. When you search a county or city that includes SAFMR ZIPs, we show the range of values across those ZIPs to give you a complete picture.',
      },
    ],
  },
  {
    category: 'Investment Scores',
    questions: [
      {
        q: 'What is the Investment Score?',
        a: 'The Investment Score is a proprietary metric that helps identify markets with strong potential for Section 8 rental investing. It combines multiple data points to give you a quick assessment of a market\'s investment potential, with higher scores indicating better opportunities.',
      },
      {
        q: 'How is the Investment Score calculated?',
        a: 'The Investment Score factors in four key components: (1) Fair Market Rent relative to property values, measuring potential rental yield; (2) Zillow Home Value Index (ZHVI) data to understand property costs; (3) Local property tax rates that affect operating expenses; and (4) Rental demand indicators showing tenant availability. These factors are weighted and normalized to produce a score typically ranging from 50 to 150+.',
      },
      {
        q: 'What do the score ranges mean?',
        a: 'Scores of 130+ indicate excellent investment potential with strong rent-to-value ratios. Scores between 100-129 represent good markets with solid fundamentals. Scores below 95 suggest below-average returns, often due to high property values relative to achievable rents.',
      },
      {
        q: 'Should I base my investment decisions solely on the score?',
        a: 'No. The Investment Score is a starting point for market research, not a complete investment analysis. Always conduct thorough due diligence including property inspection, local market research, neighborhood analysis, and consultation with local real estate professionals.',
      },
    ],
  },
  {
    category: 'Cash Flow Calculator',
    questions: [
      {
        q: 'How does the cash flow calculator work?',
        a: 'The cash flow calculator estimates monthly cash flow by subtracting estimated expenses from potential rental income (FMR). You input a property price, and it calculates mortgage payment (based on current rates), property taxes (using local tax rates), insurance estimates, and a vacancy/maintenance reserve.',
      },
      {
        q: 'What assumptions does the calculator use?',
        a: 'The calculator uses current average mortgage rates (updated regularly), local property tax rates from Census ACS data, estimated insurance costs based on property value, a default 25% down payment (adjustable), and standard expense ratios for vacancy and maintenance reserves.',
      },
      {
        q: 'Why might actual cash flow differ from the estimate?',
        a: 'Several factors can affect actual cash flow: actual rent achieved may differ from FMR, property tax rates may vary by specific location, insurance costs depend on coverage and carrier, maintenance costs vary by property age and condition, and vacancy rates depend on local market conditions.',
      },
    ],
  },
  {
    category: 'Data & Coverage',
    questions: [
      {
        q: 'How many locations does fmr.fyi cover?',
        a: 'fmr.fyi covers over 41,000 ZIP codes across all 50 states, plus every county and metropolitan area in the United States. This includes both standard FMR areas and SAFMR-designated metropolitan areas.',
      },
      {
        q: 'Where does the property value data come from?',
        a: 'Property values are sourced from Zillow\'s Home Value Index (ZHVI), which represents the typical home value in an area. ZHVI is calculated using a sophisticated algorithm that considers millions of home values and sale prices.',
      },
      {
        q: 'How accurate are the tax rate estimates?',
        a: 'Property tax rates are derived from U.S. Census American Community Survey (ACS) data, calculating effective tax rates from median property taxes and property values. Actual tax rates can vary by specific property, exemptions, and local assessment practices.',
      },
      {
        q: 'How often is the data updated?',
        a: 'FMR data updates annually with HUD releases. Property values (ZHVI) update monthly. Tax rates update annually with new ACS releases. We maintain historical data going back several years to show trends.',
      },
    ],
  },
  {
    category: 'Chrome Extension',
    questions: [
      {
        q: 'What does the Chrome extension do?',
        a: 'The fmr.fyi Chrome extension overlays FMR data and cash flow analysis directly on property listings from Zillow and Redfin. This lets you instantly see Section 8 potential without leaving the listing page. More sites coming soon.',
      },
      {
        q: 'Which websites does the extension support?',
        a: 'The extension currently supports Zillow and Redfin. We\'re actively working on adding support for additional platforms — more sites coming soon.',
      },
      {
        q: 'Is the extension free?',
        a: 'Yes, the fmr.fyi Chrome extension is completely free to use. Install it from the Chrome Web Store to get started.',
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary)] antialiased">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16">
        <a href="/" className="text-sm font-medium text-[var(--text-primary)] hover:opacity-70">
          ← Back to search
        </a>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-[var(--text-primary)]">Frequently Asked Questions</h1>
        <p className="mt-3 text-base text-[var(--text-secondary)]">
          Everything you need to know about FMR data, investment scores, and using fmr.fyi.
        </p>

        <div className="mt-10 space-y-12">
          {faqs.map((section) => (
            <div key={section.category}>
              <h2 className="text-xl font-bold text-[var(--text-primary)] pb-3 border-b border-[var(--border-color)]">
                {section.category}
              </h2>
              <div className="mt-6 space-y-8">
                {section.questions.map((faq, index) => (
                  <div key={index}>
                    <h3 className="text-base font-semibold text-[var(--text-primary)]">{faq.q}</h3>
                    <p className="mt-2 text-base text-[var(--text-secondary)] leading-relaxed">{faq.a}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-[var(--border-color)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Still have questions?</h2>
          <p className="mt-2 text-base text-[var(--text-secondary)]">
            Check out our{' '}
            <a href="/data-sources" className="text-[var(--text-primary)] underline hover:opacity-70">
              data sources
            </a>{' '}
            page for more technical details, or explore our guides on{' '}
            <a href="/what-is-fmr" className="text-[var(--text-primary)] underline hover:opacity-70">
              What is FMR?
            </a>{' '}
            and{' '}
            <a href="/what-is-safmr" className="text-[var(--text-primary)] underline hover:opacity-70">
              What is SAFMR?
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}


