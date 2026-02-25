import type { Metadata } from 'next';
import ZipPropertyDataClient from './client';

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const title = `ZIP Code Property Data: FMR vs Property Values | fmr.fyi`;
  const description = `View property values (ZHVI), tax rates, effective rent, confidence score, and Investment Scores for all ZIP codes. Compare FMR to property values, analyze rent-to-price ratios, and evaluate Section 8 investment potential.`;
  const canonical = 'https://fmr.fyi/zip-property-data';
  
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

export default function ZipPropertyDataPage() {
  return <ZipPropertyDataClient />;
}
