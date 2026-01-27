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

  // Get all states (excluding territories)
  const statesResult = await sql`
    SELECT DISTINCT state_code
    FROM zip_county_mapping
    WHERE state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
    ORDER BY state_code
  `;

  const states = statesResult.rows.map((r: any) => r.state_code.toUpperCase());

  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`);

  // Base explorer URLs for each geographic level
  const baseUrls = [
    `${base}/explorer?geoTab=state`,
    `${base}/explorer?geoTab=county`,
    `${base}/explorer?geoTab=city`,
    `${base}/explorer?geoTab=zip`,
  ];

  for (const url of baseUrls) {
    parts.push(`<url><loc>${xmlEscape(url)}</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`);
  }

  // State-specific explorer views for counties, cities, and ZIPs
  for (const stateCode of states) {
    // County explorer for this state
    parts.push(`<url><loc>${xmlEscape(`${base}/explorer?geoTab=county&geoState=${stateCode}`)}</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`);
    
    // City explorer for this state
    parts.push(`<url><loc>${xmlEscape(`${base}/explorer?geoTab=city&geoState=${stateCode}`)}</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`);
    
    // ZIP explorer for this state
    parts.push(`<url><loc>${xmlEscape(`${base}/explorer?geoTab=zip&geoState=${stateCode}`)}</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`);
  }

  // Key filter combinations (high-value SEO targets)
  const filterCombinations = [
    // Affordability filters
    { geoTab: 'zip', affordabilityTier: 'affordable' },
    { geoTab: 'zip', affordabilityTier: 'midMarket' },
    { geoTab: 'zip', affordabilityTier: 'premium' },
    // Yield filters
    { geoTab: 'zip', yieldRange: 'high' },
    { geoTab: 'zip', yieldRange: 'moderate' },
    { geoTab: 'zip', yieldRange: 'low' },
    // Combined filters
    { geoTab: 'zip', affordabilityTier: 'affordable', yieldRange: 'high' },
    { geoTab: 'zip', affordabilityTier: 'affordable', yieldRange: 'moderate' },
    { geoTab: 'zip', affordabilityTier: 'midMarket', yieldRange: 'high' },
    // Bedroom filters
    { geoTab: 'zip', bedroom: '2' },
    { geoTab: 'zip', bedroom: '3' },
    { geoTab: 'zip', bedroom: '4' },
    // Combined with bedrooms
    { geoTab: 'zip', affordabilityTier: 'affordable', bedroom: '2' },
    { geoTab: 'zip', affordabilityTier: 'affordable', bedroom: '3' },
    { geoTab: 'zip', yieldRange: 'high', bedroom: '3' },
  ];

  for (const combo of filterCombinations) {
    const params = new URLSearchParams();
    params.set('geoTab', combo.geoTab);
    if (combo.affordabilityTier) params.set('affordabilityTier', combo.affordabilityTier);
    if (combo.yieldRange) params.set('yieldRange', combo.yieldRange);
    if (combo.bedroom) params.set('bedroom', combo.bedroom);
    
    const url = `${base}/explorer?${params.toString()}`;
    parts.push(`<url><loc>${xmlEscape(url)}</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>0.6</priority></url>`);
  }

  // State-specific filter combinations (top states only for performance)
  const topStates = ['CA', 'TX', 'FL', 'NY', 'PA', 'IL', 'OH', 'GA', 'NC', 'MI', 'NJ', 'VA', 'WA', 'AZ', 'MA', 'TN', 'IN', 'MO', 'MD', 'WI'];
  
  for (const stateCode of topStates) {
    const stateFilterCombos = [
      { geoTab: 'zip', geoState: stateCode, affordabilityTier: 'affordable' },
      { geoTab: 'zip', geoState: stateCode, yieldRange: 'high' },
      { geoTab: 'zip', geoState: stateCode, affordabilityTier: 'affordable', yieldRange: 'high' },
      { geoTab: 'county', geoState: stateCode },
      { geoTab: 'city', geoState: stateCode },
    ];

    for (const combo of stateFilterCombos) {
      const params = new URLSearchParams();
      params.set('geoTab', combo.geoTab);
      params.set('geoState', combo.geoState);
      if (combo.affordabilityTier) params.set('affordabilityTier', combo.affordabilityTier);
      if (combo.yieldRange) params.set('yieldRange', combo.yieldRange);
      
      const url = `${base}/explorer?${params.toString()}`;
      parts.push(`<url><loc>${xmlEscape(url)}</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>0.6</priority></url>`);
    }
  }

  parts.push(`</urlset>`);

  return new Response(parts.join(''), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
}
