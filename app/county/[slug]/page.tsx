import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveCountySlugToQuery } from '@/lib/seo-slugs';
import { getFMRByCounty } from '@/lib/queries';
import HomeClient from '@/app/components/HomeClient';

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
  return out;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const q = await resolveCountySlugToQuery(params.slug);
  if (!q) return { title: 'County FMR | fmr.fyi' };
  const canonical = `https://fmr.fyi/county/${params.slug}`;
  return {
    title: titleFor(q),
    description: descriptionFor(q),
    alternates: { canonical },
    openGraph: { title: titleFor(q), description: descriptionFor(q), url: canonical, siteName: 'fmr.fyi', type: 'website' },
    twitter: { card: 'summary', title: titleFor(q), description: descriptionFor(q) },
  };
}

export default async function CountySlugPage({ params }: { params: { slug: string } }) {
  const q = await resolveCountySlugToQuery(params.slug);
  if (!q) notFound();
  const [county, state] = q.split(',').map((s) => s.trim());
  if (!county || !state) notFound();

  const result = await getFMRByCounty(county, state);
  if (!result) notFound();
  const initialData = serializeResult({ ...result, queriedLocation: q, queriedType: 'county' as const });
  return <HomeClient initialQuery={q} initialType="county" initialData={initialData} initialError={null} />;
}

