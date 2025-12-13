import { sql } from '@vercel/postgres';

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
  { params }: { params: { digit: string } }
) {
  const base = 'https://fmr.fyi';
  const now = new Date().toISOString();
  const { digit } = params;

  // Validate digit is 0-9
  if (!/^[0-9]$/.test(digit)) {
    return new Response('Invalid digit. Must be 0-9.', { status: 400 });
  }

  const result = await sql`
    SELECT DISTINCT zip_code
    FROM zip_county_mapping
    WHERE state_code != 'PR'
      AND LEFT(zip_code, 1) = ${digit}
    ORDER BY zip_code
  `;

  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`);

  for (const r of result.rows as any[]) {
    const loc = `${base}/zip/${r.zip_code}`;
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



