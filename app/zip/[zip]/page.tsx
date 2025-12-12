import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFMRByZip } from '@/lib/queries';
import HomeClient from '@/app/components/HomeClient';

export const revalidate = 86400;

function normalizeZip(input: string): string | null {
  const z = input.trim();
  if (!/^\d{5}$/.test(z)) return null;
  return z;
}

function titleFor(zip: string) {
  return `${zip} FMR (HUD Fair Market Rent) – FY 2026 | fmr.fyi`;
}

function descriptionFor(zip: string) {
  return `HUD Fair Market Rent (FMR/SAFMR) for ZIP ${zip}. View 0–4 bedroom rent limits for FY 2026.`;
}

function serializeResult<T extends Record<string, any>>(result: T): T {
  const out: any = { ...result };
  if (out.effectiveDate instanceof Date) out.effectiveDate = out.effectiveDate.toISOString();
  return out;
}

export async function generateMetadata({ params }: { params: { zip: string } }): Promise<Metadata> {
  const z = normalizeZip(params.zip);
  if (!z) return { title: 'ZIP FMR | fmr.fyi' };
  const canonical = `https://fmr.fyi/zip/${z}`;
  return {
    title: titleFor(z),
    description: descriptionFor(z),
    alternates: { canonical },
    openGraph: { title: titleFor(z), description: descriptionFor(z), url: canonical, siteName: 'fmr.fyi', type: 'website' },
    twitter: { card: 'summary', title: titleFor(z), description: descriptionFor(z) },
  };
}

export default async function ZipSlugPage({ params }: { params: { zip: string } }) {
  const z = normalizeZip(params.zip);
  if (!z) notFound();

  const result = await getFMRByZip(z);
  if (!result) notFound();
  const initialData = serializeResult({ ...result, queriedLocation: z, queriedType: 'zip' });
  return <HomeClient initialQuery={z} initialType="zip" initialData={initialData} initialError={null} />;
}

