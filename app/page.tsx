import type { Metadata } from 'next';
import HomeClient from './components/HomeClient';
import { getFMRByCity, getFMRByCounty, getFMRByZip, getFMRHistoryByCity, getFMRHistoryByCounty, getFMRHistoryByZip } from '@/lib/queries';
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
  if (Array.isArray(out.history)) {
    out.history = out.history.map((p: any) => ({
      ...p,
      effectiveDate: p?.effectiveDate instanceof Date ? p.effectiveDate.toISOString() : p?.effectiveDate,
    }));
  }
  return out;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const q = normalizeQuery(searchParams.q);
  const type = normalizeType(searchParams.type);
  const yearParam = Array.isArray(searchParams.year) ? searchParams.year[0] : searchParams.year;
  const year = yearParam ? `FY ${yearParam}` : 'FY 2026';

  if (!q || !type) {
    return {
      title: 'fmr.fyi - Fair Market Rent Data',
      description: 'Search Fair Market Rent data by address, city, ZIP code, or county. Find HUD FMR and SAFMR data instantly.',
    };
  }

  // Clean SERP URLs: canonical location pages are slugs. Query-param pages are duplicates.
  const isAddress = type === 'address';
  const isLocation = type === 'zip' || type === 'city' || type === 'county';
  const canonical = (() => {
    if (type === 'zip') {
      const zip = q.trim().match(/\b(\d{5})\b/)?.[1];
      return zip ? `https://fmr.fyi/zip/${zip}` : canonicalUrlFor(q, type);
    }
    if (type === 'city') {
      const [city, state] = q.split(',').map((s) => s.trim());
      return city && state && state.length === 2
        ? `https://fmr.fyi/city/${buildCitySlug(city, state)}`
        : canonicalUrlFor(q, type);
    }
    if (type === 'county') {
      const [county, state] = q.split(',').map((s) => s.trim());
      return county && state && state.length === 2
        ? `https://fmr.fyi/county/${buildCountySlug(county, state)}`
        : canonicalUrlFor(q, type);
    }
    return canonicalUrlFor(q, type);
  })();

  // Update title and description to include year if provided
  const title = type === 'zip' ? `${q} FMR (HUD Fair Market Rent) – ${year} | fmr.fyi` :
                type === 'county' ? `${q} FMR (HUD Fair Market Rent) – ${year} | fmr.fyi` :
                type === 'city' ? `${q} FMR (HUD Fair Market Rent) – ${year} | fmr.fyi` :
                titleFor(q, type);
  const description = type === 'zip' ? `HUD Fair Market Rent (FMR/SAFMR) for ZIP ${q}. View 0–4 bedroom rent limits for ${year}.` :
                      type === 'city' ? `HUD Fair Market Rent (FMR/SAFMR) for ${q}. View 0–4 bedroom rent limits for ${year}.` :
                      type === 'county' ? `HUD Fair Market Rent (FMR/SAFMR) for ${q}. View 0–4 bedroom rent limits for ${year}.` :
                      descriptionFor(q, type);

  return {
    title,
    description,
    alternates: { canonical },
    robots: isAddress ? { index: false, follow: false } : isLocation ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'fmr.fyi',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
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

  const year = searchParams.year ? parseInt(Array.isArray(searchParams.year) ? searchParams.year[0] : searchParams.year, 10) : undefined;

  try {
    if (q && type) {
      if (type === 'zip') {
        const result = await getFMRByZip(q, year);
        if (!result) throw new Error('No FMR data found for the given location');
        const zip = q.trim().match(/\b(\d{5})\b/)?.[1] || q.trim();
        const history = await getFMRHistoryByZip(zip);
        initialData = serializeResult({ ...result, history, queriedLocation: q, queriedType: 'zip' });
      } else if (type === 'city') {
        const [city, state] = q.split(',').map((s) => s.trim());
        if (!city || !state) throw new Error('Invalid city query');
        const result = await getFMRByCity(city, state, year);
        if (!result) throw new Error('No FMR data found for the given location');
        const history = await getFMRHistoryByCity(city, state);
        initialData = serializeResult({ ...result, history, queriedLocation: q, queriedType: 'city' });
      } else if (type === 'county') {
        const [county, state] = q.split(',').map((s) => s.trim());
        if (!county || !state) throw new Error('Invalid county query');
        const result = await getFMRByCounty(county, state, year);
        if (!result) throw new Error('No FMR data found for the given location');
        const history = await getFMRHistoryByCounty(county, state);
        initialData = serializeResult({ ...result, history, queriedLocation: q, queriedType: 'county' });
      } else if (type === 'address') {
        // Keep address queries interactive-only; do not SSR fetch here.
        initialData = null;
      }
    }
  } catch (e) {
    initialError = e instanceof Error ? e.message : 'Failed to fetch FMR data';
  }

  return (
    <main className="min-h-screen">
      <HomeClient initialQuery={q} initialType={type} initialData={initialData} initialError={initialError} />
    </main>
  );
}

