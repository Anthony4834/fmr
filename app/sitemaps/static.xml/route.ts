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

  const urls = [
    `${base}/`,
    `${base}/landing`,
    `${base}/explorer`,
    `${base}/cities`,
    `${base}/counties`,
    `${base}/zips`,
    `${base}/what-is-fmr`,
    `${base}/data-sources`,
    `${base}/faq`,
    `${base}/best-states-section-8`,
    `${base}/highest-fmr-states`,
    `${base}/fmr-vs-property-value`,
    `${base}/zip-property-data`,
    // Key explorer filter combinations
    `${base}/explorer?geoTab=state`,
    `${base}/explorer?geoTab=county`,
    `${base}/explorer?geoTab=city`,
    `${base}/explorer?geoTab=zip`,
    `${base}/explorer?geoTab=zip&affordabilityTier=affordable`,
    `${base}/explorer?geoTab=zip&yieldRange=high`,
    `${base}/explorer?geoTab=zip&affordabilityTier=affordable&yieldRange=high`,
    `${base}/explorer?geoTab=zip&bedroom=2`,
    `${base}/explorer?geoTab=zip&bedroom=3`,
    `${base}/explorer?geoTab=zip&bedroom=4`,
  ];

  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`);
  for (const u of urls) {
    parts.push(`<url><loc>${xmlEscape(u)}</loc><lastmod>${now}</lastmod></url>`);
  }
  parts.push(`</urlset>`);

  return new Response(parts.join(''), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
}








