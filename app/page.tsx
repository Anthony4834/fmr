import type { Metadata } from 'next';
import HomeClient from './components/HomeClient';
import { getFMRByCity, getFMRByCounty, getFMRByZip } from '@/lib/queries';
import { redirect } from 'next/navigation';
import { buildCitySlug, buildCountySlug } from '@/lib/location-slugs';

type SearchType = 'zip' | 'city' | 'county' | 'address';
type SearchParams = Record<string, string | string[] | undefined>;

function canonicalUrlFor(q: string, type: SearchType) {
  const params = new URLSearchParams();
  params.set('q', q);
  params.set('type', type);
  return `https://fmr.fyi/?${params.toString()}`;
}

function titleFor(q: string, type: SearchType) {
  const base = 'fmr.fyi';
  const year = 'FY 2026';
  if (type === 'zip') return `${q} FMR (HUD Fair Market Rent) – ${year} | ${base}`;
  if (type === 'county') return `${q} FMR (HUD Fair Market Rent) – ${year} | ${base}`;
  if (type === 'city') return `${q} FMR (HUD Fair Market Rent) – ${year} | ${base}`;
  return `Fair Market Rent Data – ${base}`;
}

function descriptionFor(q: string, type: SearchType) {
  if (type === 'zip') return `HUD Fair Market Rent (FMR/SAFMR) for ZIP ${q}. View 0–4 bedroom rent limits for FY 2026.`;
  if (type === 'city') return `HUD Fair Market Rent (FMR/SAFMR) for ${q}. View 0–4 bedroom rent limits for FY 2026.`;
  if (type === 'county') return `HUD Fair Market Rent (FMR/SAFMR) for ${q}. View 0–4 bedroom rent limits for FY 2026.`;
  return 'Search Fair Market Rent data by address, city, ZIP code, or county. Find HUD FMR and SAFMR data instantly.';
}

function normalizeType(input: unknown): SearchType | null {
  if (input === 'zip' || input === 'city' || input === 'county' || input === 'address') return input;
  return null;
}

function normalizeQuery(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const q = input.trim();
  if (!q) return null;
  return q;
}

function serializeResult<T extends Record<string, any>>(result: T): T {
  const out: any = { ...result };
  if (out.effectiveDate instanceof Date) out.effectiveDate = out.effectiveDate.toISOString();
  return out;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const q = normalizeQuery(searchParams.q);
  const type = normalizeType(searchParams.type);

  if (!q || !type) {
    return {
      title: 'fmr.fyi - Fair Market Rent Data',
      description: 'Search Fair Market Rent data by address, city, ZIP code, or county. Find HUD FMR and SAFMR data instantly.',
    };
  }

  // Clean SERP URLs: canonical location pages are slugs. Query-param pages are duplicates.
  const isAddress = type === 'address';
  const isLocation = type === 'zip' || type === 'city' || type === 'county';
  const canonical = canonicalUrlFor(q, type);

  return {
    title: titleFor(q, type),
    description: descriptionFor(q, type),
    alternates: { canonical },
    robots: isAddress ? { index: false, follow: false } : isLocation ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: titleFor(q, type),
      description: descriptionFor(q, type),
      url: canonical,
      siteName: 'fmr.fyi',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: titleFor(q, type),
      description: descriptionFor(q, type),
    },
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const q = normalizeQuery(searchParams.q);
  const type = normalizeType(searchParams.type);

  // Clean SERP URLs: redirect location query-param pages to slugs.
  if (q && type === 'zip') {
    const zip = q.trim().match(/\b(\d{5})\b/)?.[1];
    if (zip) redirect(`/zip/${zip}`);
  }
  if (q && type === 'city') {
    const [city, state] = q.split(',').map((s) => s.trim());
    if (city && state && state.length === 2) redirect(`/city/${buildCitySlug(city, state)}`);
  }
  if (q && type === 'county') {
    const [county, state] = q.split(',').map((s) => s.trim());
    if (county && state && state.length === 2) redirect(`/county/${buildCountySlug(county, state)}`);
  }

  let initialData: any | null = null;
  let initialError: string | null = null;

  try {
    if (q && type) {
      if (type === 'zip') {
        const result = await getFMRByZip(q);
        if (!result) throw new Error('No FMR data found for the given location');
        initialData = serializeResult({ ...result, queriedLocation: q, queriedType: 'zip' });
      } else if (type === 'city') {
        const [city, state] = q.split(',').map((s) => s.trim());
        if (!city || !state) throw new Error('Invalid city query');
        const result = await getFMRByCity(city, state);
        if (!result) throw new Error('No FMR data found for the given location');
        initialData = serializeResult({ ...result, queriedLocation: q, queriedType: 'city' });
      } else if (type === 'county') {
        const [county, state] = q.split(',').map((s) => s.trim());
        if (!county || !state) throw new Error('Invalid county query');
        const result = await getFMRByCounty(county, state);
        if (!result) throw new Error('No FMR data found for the given location');
        initialData = serializeResult({ ...result, queriedLocation: q, queriedType: 'county' });
      } else if (type === 'address') {
        // Keep address queries interactive-only; do not SSR fetch here.
        initialData = null;
      }
    }
  } catch (e) {
    initialError = e instanceof Error ? e.message : 'Failed to fetch FMR data';
  }

  return <HomeClient initialQuery={q} initialType={type} initialData={initialData} initialError={initialError} />;
}

