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

  // Get count of zips per first digit to ensure we have data
  const result = await sql`
    SELECT 
      LEFT(zip_code, 1) as first_digit,
      COUNT(*) as zip_count
    FROM zip_county_mapping
    WHERE state_code != 'PR'
    GROUP BY LEFT(zip_code, 1)
    ORDER BY first_digit
  `;

  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`);

  for (const r of result.rows as any[]) {
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

