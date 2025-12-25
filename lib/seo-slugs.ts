import { sql } from '@vercel/postgres';
import { slugify } from '@/lib/location-slugs';
import { formatCountyName } from '@/lib/county-utils';

export type LocationType = 'zip' | 'city' | 'county';

export function parseStateFromSlugTail(slug: string): { base: string; stateCode: string } | null {
  const m = slug.trim().toLowerCase().match(/^(.*)-([a-z]{2})$/);
  if (!m) return null;
  return { base: m[1], stateCode: m[2].toUpperCase() };
}

export function buildZipSlug(zip: string): string {
  return zip;
}

export async function resolveCitySlugToQuery(slug: string): Promise<string | null> {
  const parsed = parseStateFromSlugTail(slug);
  if (!parsed) return null;
  const { base, stateCode } = parsed;

  // Prefer an exact slugified match in the DB for correctness (punctuation like "St. Louis").
  // If DB is unavailable (local dev), fall back to best-effort decoding.
  try {
    const result = await sql`
      SELECT city_name, state_code
      FROM cities
      WHERE state_code = ${stateCode}
        AND regexp_replace(lower(city_name), '[^a-z0-9]+', '-', 'g') = ${base}
      LIMIT 1
    `;

    if (result.rows.length > 0) {
      const row = result.rows[0] as { city_name: string; state_code: string };
      return `${row.city_name}, ${row.state_code}`;
    }
  } catch {
    // ignore and fallback below
  }

  // Fallback: best-effort decode.
  const cityGuess = base.replace(/-/g, ' ').trim();
  if (!cityGuess) return null;
  return `${cityGuess}, ${stateCode}`;
}

export async function resolveCountySlugToQuery(slug: string): Promise<string | null> {
  const parsed = parseStateFromSlugTail(slug);
  if (!parsed) return null;
  const { base, stateCode } = parsed;

  // Accept both "...-county-XX" and "...-XX"
  const baseNoCounty = base.replace(/-county$/i, '');

  try {
    const result = await sql`
      SELECT DISTINCT county_name, state_code
      FROM zip_county_mapping
      WHERE state_code = ${stateCode}
        AND regexp_replace(regexp_replace(lower(county_name), '\\s+county\\s*$', '', 'gi'), '[^a-z0-9]+', '-', 'g') = ${baseNoCounty}
      LIMIT 1
    `;

    if (result.rows.length > 0) {
      const row = result.rows[0] as { county_name: string; state_code: string };
      const countyDisplay = formatCountyName(row.county_name, row.state_code);
      return `${countyDisplay}, ${row.state_code}`;
    }
  } catch {
    // ignore and fallback below
  }

  // Fallback: best-effort decode.
  const countyGuess = baseNoCounty.replace(/-/g, ' ').trim();
  if (!countyGuess) return null;
  return `${formatCountyName(countyGuess, stateCode)}, ${stateCode}`;
}








