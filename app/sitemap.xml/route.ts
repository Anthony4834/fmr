import { sql } from '@vercel/postgres';

export const revalidate = 86400;

function xmlEscape(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const base = 'https://fmr.fyi';
  const now = new Date().toISOString();

  // Get all states for cities
  const cityStates = await sql`
    SELECT DISTINCT state_code
    FROM cities
    WHERE state_code != 'PR'
    ORDER BY state_code
  `;

  // Get all states for counties
  const countyStates = await sql`
    SELECT DISTINCT state_code
    FROM zip_county_mapping
    WHERE state_code != 'PR'
    ORDER BY state_code
  `;

  // Get all first digits for zips
  const zipDigits = await sql`
    SELECT DISTINCT LEFT(zip_code, 1) as first_digit
    FROM zip_county_mapping
    WHERE state_code != 'PR'
    ORDER BY first_digit
  `;

  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`);

  // Static sitemap
  parts.push(`<sitemap><loc>${xmlEscape(`${base}/sitemaps/static.xml`)}</loc><lastmod>${now}</lastmod></sitemap>`);

  // States sitemap
  parts.push(`<sitemap><loc>${xmlEscape(`${base}/sitemaps/states.xml`)}</loc><lastmod>${now}</lastmod></sitemap>`);

  // City sitemaps (direct references to actual sitemap files, not index)
  for (const r of cityStates.rows as any[]) {
    const stateCode = r.state_code.toUpperCase();
    const loc = `${base}/sitemaps/cities/${stateCode}.xml`;
    parts.push(`<sitemap><loc>${xmlEscape(loc)}</loc><lastmod>${now}</lastmod></sitemap>`);
  }

  // County sitemaps (direct references to actual sitemap files, not index)
  for (const r of countyStates.rows as any[]) {
    const stateCode = String(r.state_code || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(stateCode)) continue;
    const loc = `${base}/sitemaps/counties/${stateCode}.xml`;
    parts.push(`<sitemap><loc>${xmlEscape(loc)}</loc><lastmod>${now}</lastmod></sitemap>`);
  }

  // Zip sitemaps (direct references to actual sitemap files, not index)
  for (const r of zipDigits.rows as any[]) {
    const firstDigit = r.first_digit;
    const loc = `${base}/sitemaps/zips/${firstDigit}.xml`;
    parts.push(`<sitemap><loc>${xmlEscape(loc)}</loc><lastmod>${now}</lastmod></sitemap>`);
  }

  parts.push(`</sitemapindex>`);

  return new Response(parts.join(''), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
}




