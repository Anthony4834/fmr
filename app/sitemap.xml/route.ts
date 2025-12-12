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

  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`);

  parts.push(`<sitemap><loc>${xmlEscape(`${base}/sitemaps/static.xml`)}</loc><lastmod>${now}</lastmod></sitemap>`);
  parts.push(`<sitemap><loc>${xmlEscape(`${base}/sitemaps/cities.xml`)}</loc><lastmod>${now}</lastmod></sitemap>`);
  parts.push(`<sitemap><loc>${xmlEscape(`${base}/sitemaps/counties.xml`)}</loc><lastmod>${now}</lastmod></sitemap>`);
  parts.push(`<sitemap><loc>${xmlEscape(`${base}/sitemaps/zips.xml`)}</loc><lastmod>${now}</lastmod></sitemap>`);

  parts.push(`</sitemapindex>`);

  return new Response(parts.join(''), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
}


