import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFMRByZip, getFMRHistoryByZip } from '@/lib/queries';
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
  if (Array.isArray(out.history)) {
    out.history = out.history.map((p: any) => ({
      ...p,
      effectiveDate: p?.effectiveDate instanceof Date ? p.effectiveDate.toISOString() : p?.effectiveDate,
    }));
  }
  return out;
}

export async function generateMetadata({ params, searchParams }: { params: { zip: string }; searchParams: { year?: string } }): Promise<Metadata> {
  const z = normalizeZip(params.zip);
  if (!z) return { title: 'ZIP FMR | fmr.fyi' };
  const year = searchParams.year ? `FY ${searchParams.year}` : 'FY 2026';
  const canonical = `https://fmr.fyi/zip/${z}`;
  return {
    title: `${z} FMR (HUD Fair Market Rent) – ${year} | fmr.fyi`,
    description: `HUD Fair Market Rent (FMR/SAFMR) for ZIP ${z}. View 0–4 bedroom rent limits for ${year}.`,
    alternates: { canonical },
    openGraph: { title: `${z} FMR (HUD Fair Market Rent) – ${year} | fmr.fyi`, description: `HUD Fair Market Rent (FMR/SAFMR) for ZIP ${z}. View 0–4 bedroom rent limits for ${year}.`, url: canonical, siteName: 'fmr.fyi', type: 'website' },
    twitter: { card: 'summary', title: `${z} FMR (HUD Fair Market Rent) – ${year} | fmr.fyi`, description: `HUD Fair Market Rent (FMR/SAFMR) for ZIP ${z}. View 0–4 bedroom rent limits for ${year}.` },
  };
}

export default async function ZipSlugPage({ params, searchParams }: { params: { zip: string }; searchParams: { year?: string; state?: string; config?: string } }) {
  const z = normalizeZip(params.zip);
  if (!z) notFound();

  const year = searchParams.year ? parseInt(searchParams.year, 10) : undefined;
  const result = await getFMRByZip(z, year);
  if (!result) notFound();
  const history = await getFMRHistoryByZip(z);
  const initialData = serializeResult({ ...result, history, queriedLocation: z, queriedType: 'zip' as const });

  // Pass config from extension if provided
  const extensionConfig = searchParams.config || undefined;

  return <HomeClient initialQuery={z} initialType="zip" initialData={initialData} initialError={null} initialState={searchParams.state || undefined} extensionConfig={extensionConfig} />;
}




