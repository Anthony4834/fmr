import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveCountySlugToQuery } from '@/lib/seo-slugs';
import { getFMRByCounty, getFMRHistoryByCounty, getCountyInvestmentScore, getLatestFMRYear } from '@/lib/queries';
import HomeClient from '@/app/components/HomeClient';
import IncompleteGeoView from '@/app/components/IncompleteGeoView';

export const revalidate = 86400;

function titleFor(q: string) {
  return `${q} FMR (HUD Fair Market Rent) – FY 2026 | fmr.fyi`;
}

function descriptionFor(q: string) {
  return `HUD Fair Market Rent (FMR/SAFMR) for ${q}. View 0–4 bedroom rent limits for FY 2026.`;
}

function serializeResult<T extends Record<string, any>>(result: T): T {
  const out: any = { ...result };
  if (out.effectiveDate instanceof Date) out.effectiveDate = out.effectiveDate.toISOString();
  if (Array.isArray(out.history)) {
    out.history = out.history.map((p: any) => ({
      ...p,
      effectiveDate: p?.effectiveDate instanceof Date ? p.effectiveDate.toISOString() : p?.effectiveDate,
    }));
  }
  return out;
}

export async function generateMetadata({ params, searchParams }: { params: { slug: string }; searchParams: { year?: string } }): Promise<Metadata> {
  const q = await resolveCountySlugToQuery(params.slug);
  if (!q) return { title: 'County FMR | fmr.fyi' };
  const year = searchParams.year ? `FY ${searchParams.year}` : 'FY 2026';
  const canonical = `https://fmr.fyi/county/${params.slug}`;
  return {
    title: `${q} FMR (HUD Fair Market Rent) – ${year} | fmr.fyi`,
    description: `HUD Fair Market Rent (FMR/SAFMR) for ${q}. View 0–4 bedroom rent limits for ${year}.`,
    alternates: { canonical },
    openGraph: { title: `${q} FMR (HUD Fair Market Rent) – ${year} | fmr.fyi`, description: `HUD Fair Market Rent (FMR/SAFMR) for ${q}. View 0–4 bedroom rent limits for ${year}.`, url: canonical, siteName: 'fmr.fyi', type: 'website' },
    twitter: { card: 'summary', title: `${q} FMR (HUD Fair Market Rent) – ${year} | fmr.fyi`, description: `HUD Fair Market Rent (FMR/SAFMR) for ${q}. View 0–4 bedroom rent limits for ${year}.` },
  };
}

export default async function CountySlugPage({ params, searchParams }: { params: { slug: string }; searchParams: { year?: string } }) {
  const q = await resolveCountySlugToQuery(params.slug);
  if (!q) notFound();
  const [county, state] = q.split(',').map((s) => s.trim());
  if (!county || !state) notFound();

  const year = searchParams.year ? parseInt(searchParams.year, 10) : undefined;
  const result = await getFMRByCounty(county, state, year);

  // If FMR data exists, show the full view
  if (result) {
    const history = await getFMRHistoryByCounty(county, state);
    const initialData = serializeResult({ ...result, history, queriedLocation: q, queriedType: 'county' as const });
    return <HomeClient initialQuery={q} initialType="county" initialData={initialData} initialError={null} />;
  }

  // Try to get investment score data as fallback
  const investmentScore = await getCountyInvestmentScore(county, state, year);

  // If we have investment score data, show the incomplete/degraded view
  if (investmentScore) {
    const latestYear = year ?? await getLatestFMRYear();
    return (
      <IncompleteGeoView
        geoType="county"
        name={county}
        stateCode={state}
        year={latestYear}
        zipCount={investmentScore.zipCount}
        medianScore={investmentScore.medianScore}
        avgYield={investmentScore.avgYield}
        avgPropertyValue={investmentScore.avgPropertyValue}
        avgAnnualRent={investmentScore.avgAnnualRent}
      />
    );
  }

  // No data at all - show 404
  notFound();
}




