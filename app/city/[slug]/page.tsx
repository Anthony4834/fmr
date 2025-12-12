import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveCitySlugToQuery } from '@/lib/seo-slugs';
import { getFMRByCity } from '@/lib/queries';
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
  const q = await resolveCitySlugToQuery(params.slug);
  if (!q) return { title: 'City FMR | fmr.fyi' };
  const canonical = `https://fmr.fyi/city/${params.slug}`;
  return {
    title: titleFor(q),
    description: descriptionFor(q),
    alternates: { canonical },
    openGraph: { title: titleFor(q), description: descriptionFor(q), url: canonical, siteName: 'fmr.fyi', type: 'website' },
    twitter: { card: 'summary', title: titleFor(q), description: descriptionFor(q) },
  };
}

export default async function CitySlugPage({ params }: { params: { slug: string } }) {
  const q = await resolveCitySlugToQuery(params.slug);
  if (!q) notFound();
  const [city, state] = q.split(',').map((s) => s.trim());
  if (!city || !state) notFound();

  const result = await getFMRByCity(city, state);
  if (!result) notFound();
  const initialData = serializeResult({ ...result, queriedLocation: q, queriedType: 'city' });
  return <HomeClient initialQuery={q} initialType="city" initialData={initialData} initialError={null} />;
}

