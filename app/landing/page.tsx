import { Metadata } from 'next';
import { sql } from '@vercel/postgres';
import { computeCashFlow } from '@/lib/investment';
import LandingClient from './LandingClient';
import type { LandingCalculatorExample } from '@/app/components/landing/CalculatorShowcaseV2';

export const revalidate = 3600; // Revalidate every hour

const title = 'fmr.fyi - Fair Market Rent Data & Section 8 Investment Tools';
const description = 'Access FY 2026 HUD Fair Market Rent (FMR) and Small Area FMR (SAFMR) data for 41,000+ ZIP codes. Calculate cash flow, analyze investment scores, and discover the best markets for Section 8 rental investing.';
const canonical = 'https://fmr.fyi/landing';

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    'fair market rent',
    'FMR',
    'SAFMR',
    'small area fair market rent',
    'HUD rent data',
    'Section 8 investing',
    'Section 8 housing',
    'rental property investment',
    'cash flow calculator',
    'investment score',
    'rent to price ratio',
    'real estate investing',
    'HUD voucher',
    'housing choice voucher',
    'Section 8 rental properties',
    'best Section 8 markets',
    'Section 8 investment analysis',
    'rental yield calculator',
    'property investment tools',
    'affordable housing investment',
    'Section 8 cash flow',
    'rental property ROI',
    'HUD Fair Market Rent lookup',
    'Section 8 market research',
    'rental property finder',
  ],
  alternates: {
    canonical,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    title,
    description,
    type: 'website',
    url: canonical,
    siteName: 'fmr.fyi',
    locale: 'en_US',
    images: [
      {
        url: 'https://fmr.fyi/og-image.png',
        width: 1200,
        height: 630,
        alt: 'fmr.fyi - Fair Market Rent Data for Real Estate Investors',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['https://fmr.fyi/og-image.png'],
  },
  applicationName: 'fmr.fyi',
  appleWebApp: {
    title: 'fmr.fyi',
    capable: true,
  },
};

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function roundToNearest(n: number, step: number): number {
  return Math.round(n / step) * step;
}

// Fallback example - will be populated with real data if needed
async function getFallbackExample(mortgageRateAnnualPct: number): Promise<LandingCalculatorExample> {
  const fallbackZip = '43952';
  
  // Fetch real tax rate for fallback ZIP
  const taxResult = await sql`
    SELECT effective_tax_rate
    FROM acs_tax_zcta_latest
    WHERE zcta = ${fallbackZip}
    ORDER BY acs_vintage DESC
    LIMIT 1
  `;
  
  const taxRateDecimal = taxResult.rows[0]?.effective_tax_rate;
  const taxRateAnnualPct = taxRateDecimal !== null && taxRateDecimal !== undefined
    ? Number(taxRateDecimal) * 100
    : 1.2;
  
  // Recalculate with correct rates
  const rentNum = 1285;
  const purchasePrice = 95000;
  const maintenanceMonthly = Math.round(rentNum * 0.05);
  const propertyManagementMonthly = Math.round(rentNum * 0.10);
  
  const cash = computeCashFlow({
    purchasePrice,
    rentMonthly: rentNum,
    bedrooms: 3,
    interestRateAnnualPct: mortgageRateAnnualPct,
    propertyTaxRateAnnualPct: taxRateAnnualPct,
    insuranceMonthly: 150,
    hoaMonthly: 0,
    propertyManagementMonthly,
    downPayment: { mode: 'percent', percent: 20 },
    termMonths: 360,
  });
  
  const mortgageMonthly = cash ? Math.round(cash.monthlyMortgagePayment) : 480;
  const taxesMonthly = cash ? Math.round(cash.monthlyTaxes) : 78;
  const cashFlowMonthly = cash ? Math.round(cash.monthlyCashFlow - maintenanceMonthly) : 367;
  const estimatedMonthlyExpenses = Math.round(
    taxesMonthly + 150 + maintenanceMonthly + propertyManagementMonthly
  );
  
  return {
    marketZip: fallbackZip,
    marketCity: 'Steubenville',
    marketState: 'OH',
    marketRank: 1,
    fmr3Br: rentNum,
    fmrYear: 2026,
    taxRateAnnualPct,
    downPaymentPercent: 20,
    mortgageRateAnnualPct: mortgageRateAnnualPct,
    insuranceMonthly: 150,
    maintenancePercentOfRent: 5,
    propertyManagementPercentOfRent: 10,
    purchasePrice,
    mortgageMonthly,
    taxesMonthly,
    maintenanceMonthly,
    propertyManagementMonthly,
    cashFlowMonthly,
    targetCashFlowMonthly: cashFlowMonthly,
    estimatedMonthlyExpenses,
    maxPurchasePrice: purchasePrice,
  };
}

async function getCalculatorExample(): Promise<LandingCalculatorExample> {
  // Fetch current mortgage rate from database (same as market-params API) - fetch once at start
  let mortgageRateAnnualPct = 6.5;
  try {
    const mortgageRateResult = await sql`
      SELECT rate_annual_pct
      FROM mortgage_rates
      WHERE rate_type = '30_year_fixed'
      ORDER BY fetched_at DESC
      LIMIT 1
    `;
    mortgageRateAnnualPct = mortgageRateResult.rows[0]?.rate_annual_pct || 6.5;
  } catch {
    // Use default if fetch fails
  }
  
  try {
    // Get top 100 ZIPs by investment score
    const rankingsResult = await sql`
      SELECT 
        z.zip_code,
        z.city_name,
        z.state_code,
        s.median_score,
        ROW_NUMBER() OVER (ORDER BY s.median_score DESC) as rank
      FROM investment_scores_zcta s
      JOIN zip_county_mapping z ON s.zcta = z.zip_code
      WHERE s.median_score IS NOT NULL
      ORDER BY s.median_score DESC
      LIMIT 100
    `;

    const candidates = rankingsResult.rows.filter(
      (r) => r.zip_code && /^\d{5}$/.test(r.zip_code)
    );

    if (candidates.length === 0) return getFallbackExample(mortgageRateAnnualPct);

    // Shuffle and try to find a good example
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);

    const DEFAULTS = {
      downPaymentPercent: 20,
      insuranceMonthly: 150,
      maintenancePercentOfRent: 5,
      propertyManagementPercentOfRent: 10,
      bedrooms: 3,
      hoaMonthly: 0,
    };

    for (const pick of shuffled.slice(0, 20)) {
      const zip = pick.zip_code;

      // Fetch 3BR FMR
      const fmrResult = await sql`
        SELECT bedroom3, year, city_name, state_code
        FROM fmr_safmr_fy26_latest
        WHERE zip_code = ${zip}
        LIMIT 1
      `;

      if (fmrResult.rows.length === 0) continue;
      const fmrRow = fmrResult.rows[0];
      const rent = fmrRow.bedroom3;
      if (!rent || rent < 800) continue;

      // Fetch tax rate from database (same as market-params API)
      const taxResult = await sql`
        SELECT effective_tax_rate
        FROM acs_tax_zcta_latest
        WHERE zcta = ${zip}
        ORDER BY acs_vintage DESC
        LIMIT 1
      `;

      // effective_tax_rate is stored as decimal (e.g., 0.012), convert to percent
      const taxRateDecimal = taxResult.rows[0]?.effective_tax_rate;
      const taxRateAnnualPct = taxRateDecimal !== null && taxRateDecimal !== undefined
        ? Number(taxRateDecimal) * 100
        : 1.2;

      const rentNum = Number(rent);
      const maintenanceMonthly = Math.round(rentNum * (DEFAULTS.maintenancePercentOfRent / 100));
      const propertyManagementMonthly = Math.round(rentNum * (DEFAULTS.propertyManagementPercentOfRent / 100));

      // Pick a realistic purchase price
      const basePriceFromRent = rentNum * 100;
      const minPrice = Math.max(60000, basePriceFromRent * 0.6);
      const maxPrice = Math.min(200000, basePriceFromRent * 1.2);
      const purchasePrice = roundToNearest(randomInt(Math.round(minPrice), Math.round(maxPrice)), 5000);

      const cash = computeCashFlow({
        purchasePrice,
        rentMonthly: rentNum,
        bedrooms: DEFAULTS.bedrooms,
        interestRateAnnualPct: mortgageRateAnnualPct,
        propertyTaxRateAnnualPct: taxRateAnnualPct,
        insuranceMonthly: DEFAULTS.insuranceMonthly,
        hoaMonthly: DEFAULTS.hoaMonthly,
        propertyManagementMonthly,
        downPayment: { mode: 'percent', percent: DEFAULTS.downPaymentPercent },
        termMonths: 360,
      });

      if (!cash) continue;

      const cashFlowMonthly = Math.round(cash.monthlyCashFlow - maintenanceMonthly);
      if (cashFlowMonthly < 100 || cashFlowMonthly > 900) continue;

      const mortgageMonthly = Math.round(cash.monthlyMortgagePayment);
      const taxesMonthly = Math.round(cash.monthlyTaxes);
      const estimatedMonthlyExpenses = Math.round(
        taxesMonthly + DEFAULTS.insuranceMonthly + maintenanceMonthly + propertyManagementMonthly
      );

      return {
        marketZip: zip,
        marketCity: fmrRow.city_name || pick.city_name || null,
        marketState: fmrRow.state_code || pick.state_code || null,
        marketRank: Number(pick.rank) || null,
        fmr3Br: Math.round(rentNum),
        fmrYear: fmrRow.year || null,
        taxRateAnnualPct,
        downPaymentPercent: DEFAULTS.downPaymentPercent,
        mortgageRateAnnualPct: mortgageRateAnnualPct,
        insuranceMonthly: DEFAULTS.insuranceMonthly,
        maintenancePercentOfRent: DEFAULTS.maintenancePercentOfRent,
        propertyManagementPercentOfRent: DEFAULTS.propertyManagementPercentOfRent,
        purchasePrice: Math.round(purchasePrice),
        mortgageMonthly,
        taxesMonthly,
        maintenanceMonthly,
        propertyManagementMonthly,
        cashFlowMonthly,
        targetCashFlowMonthly: cashFlowMonthly,
        estimatedMonthlyExpenses,
        maxPurchasePrice: Math.round(purchasePrice),
      };
    }

    return getFallbackExample(mortgageRateAnnualPct);
  } catch (error) {
    console.error('Calculator example error:', error);
    return getFallbackExample(mortgageRateAnnualPct);
  }
}

// Structured data for SEO
function LandingStructuredData() {
  const webApplication = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'fmr.fyi',
    description: 'Fair Market Rent lookup tool with investment analysis for Section 8 rental properties',
    url: 'https://fmr.fyi',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Any',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: [
      'FY 2026 HUD Fair Market Rent data',
      'Small Area FMR (SAFMR) data',
      'Cash flow calculator',
      'Investment score analysis',
      'Property tax rate data',
      'Historical FMR trends',
      '41,000+ ZIP codes covered',
    ],
  };

  const chromeExtension = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'fmr.fyi Chrome Extension',
    description: 'Browser extension to view Fair Market Rent data while browsing real estate listings',
    url: 'https://chromewebstore.google.com/detail/fmrfyi-%E2%80%93-fair-market-rent/gkemjakehildeolcagbibhmbcddkkflb',
    applicationCategory: 'BrowserApplication',
    operatingSystem: 'Chrome',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'fmr.fyi',
    url: 'https://fmr.fyi',
    logo: 'https://fmr.fyi/icon.png',
    sameAs: [
      'https://chromewebstore.google.com/detail/fmrfyi-%E2%80%93-fair-market-rent/gkemjakehildeolcagbibhmbcddkkflb',
    ],
  };

  const faqPage = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is Fair Market Rent (FMR)?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Fair Market Rent (FMR) is the maximum rent that HUD allows for units participating in the Housing Choice Voucher (Section 8) program. FMRs are set annually by HUD for each metropolitan area and county.',
        },
      },
      {
        '@type': 'Question',
        name: 'What is Small Area FMR (SAFMR)?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Small Area Fair Market Rents (SAFMRs) are FMRs calculated at the ZIP code level instead of the metro area level, providing more precise rent limits that reflect local market conditions.',
        },
      },
      {
        '@type': 'Question',
        name: 'How can I use FMR data for real estate investing?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'FMR data helps investors identify markets where Section 8 rents can cover mortgage payments and expenses, generating positive cash flow. Our investment score tool analyzes FMR relative to property prices, tax rates, and rental demand.',
        },
      },
      {
        '@type': 'Question',
        name: 'How does the investment score work?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Investment score evaluates markets based on net yield (annual rent minus taxes divided by property value), rental demand indicators, and market conditions. Higher scores indicate better cash flow potential and investment opportunities.',
        },
      },
      {
        '@type': 'Question',
        name: 'What data sources does fmr.fyi use?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'We use official HUD FMR and SAFMR data, Zillow Home Value Index (ZHVI) for property values, U.S. Census Bureau ACS data for property tax rates, and Zillow rental demand metrics. All data is updated regularly to ensure accuracy.',
        },
      },
      {
        '@type': 'Question',
        name: 'How accurate is the cash flow calculator?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Our cash flow calculator uses real-time mortgage rates, actual property tax rates from Census data, and FMR rent data. Estimates include standard assumptions for vacancy (8%), maintenance, and property management. Actual results may vary based on specific property conditions and local factors.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I export data for analysis?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, registered users can export explorer data to Excel format, including investment scores, yields, FMR values, property values, and cash flow estimates for further analysis.',
        },
      },
    ],
  };

  const howTo = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'How to Use FMR Data for Real Estate Investing',
    description: 'Step-by-step guide to using Fair Market Rent data to find profitable Section 8 rental investment opportunities.',
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: 'Search for a Location',
        text: 'Enter an address, city, ZIP code, or county to view Fair Market Rent data for that area. You can see FMR values for 0-4 bedroom units.',
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: 'Review Investment Metrics',
        text: 'Check the investment score, which combines net yield, rental demand, and market conditions. Higher scores indicate better cash flow potential.',
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: 'Use the Cash Flow Calculator',
        text: 'Enter property details (purchase price, down payment, mortgage rate) to calculate estimated monthly cash flow based on FMR rent data.',
      },
      {
        '@type': 'HowToStep',
        position: 4,
        name: 'Explore Markets',
        text: 'Use the Market Explorer to browse and filter markets by investment score, yield, affordability, and other metrics to find the best opportunities.',
      },
      {
        '@type': 'HowToStep',
        position: 5,
        name: 'Analyze Historical Trends',
        text: 'Review historical FMR data to understand rent trends and market stability over time.',
      },
      {
        '@type': 'HowToStep',
        position: 6,
        name: 'Export and Compare',
        text: 'Export data for multiple markets to compare investment opportunities and make informed decisions.',
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webApplication) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(chromeExtension) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howTo) }}
      />
    </>
  );
}

export default async function LandingPage() {
  const calculatorExample = await getCalculatorExample();
  return (
    <>
      <LandingStructuredData />
      <LandingClient calculatorExample={calculatorExample} />
    </>
  );
}
