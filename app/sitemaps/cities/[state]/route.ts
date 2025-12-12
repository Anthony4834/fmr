import { sql } from '@vercel/postgres';
import { buildCitySlug } from '@/lib/location-slugs';

export const revalidate = 86400;
export const dynamic = 'force-dynamic';

function xmlEscape(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(
  request: Request,
  { params }: { params: { state: string } }
) {
  const base = 'https://fmr.fyi';
  const now = new Date().toISOString();
  const { state } = params;
  const stateCode = state.toUpperCase();

  // Validate state code is 2 uppercase letters
  if (!/^[A-Z]{2}$/.test(stateCode)) {
    return new Response('Invalid state code. Must be 2 uppercase letters.', { status: 400 });
  }

  const result = await sql`
    SELECT city_name, state_code
    FROM cities
    WHERE state_code = ${stateCode}
      AND state_code != 'PR'
    ORDER BY city_name
  `;

  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`);

  for (const r of result.rows as any[]) {
    const loc = `${base}/city/${buildCitySlug(r.city_name, r.state_code)}`;
    parts.push(`<url><loc>${xmlEscape(loc)}</loc><lastmod>${now}</lastmod></url>`);
  }

  parts.push(`</urlset>`);

  return new Response(parts.join(''), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
}


