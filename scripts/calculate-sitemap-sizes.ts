#!/usr/bin/env bun

/**
 * Calculate maximum sitemap sizes after modularization
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';

config();

async function calculateSitemapSizes() {
  console.log('\n=== Calculating Sitemap Sizes ===\n');

  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }

  // Calculate ZIP code distribution by first digit
  console.log('📊 ZIP Code Distribution by First Digit:');
  const zipDistribution = await sql`
    SELECT 
      LEFT(zip_code, 1) as first_digit,
      COUNT(DISTINCT zip_code) as zip_count
    FROM zip_county_mapping
    WHERE state_code != 'PR'
    GROUP BY LEFT(zip_code, 1)
    ORDER BY zip_count DESC
  `;

  let maxZipCount = 0;
  let maxZipDigit = '';
  for (const row of zipDistribution.rows as any[]) {
    const count = parseInt(row.zip_count);
    console.log(`  ${row.first_digit}xxxx: ${count.toLocaleString()} ZIP codes`);
    if (count > maxZipCount) {
      maxZipCount = count;
      maxZipDigit = row.first_digit;
    }
  }

  console.log(`\n  Max ZIP sitemap: ${maxZipDigit}xxxx with ${maxZipCount.toLocaleString()} ZIP codes`);

  // Calculate city distribution by state
  console.log('\n📊 City Distribution by State:');
  const cityDistribution = await sql`
    SELECT 
      state_code,
      COUNT(*) as city_count
    FROM cities
    WHERE state_code != 'PR'
    GROUP BY state_code
    ORDER BY city_count DESC
    LIMIT 10
  `;

  let maxCityCount = 0;
  let maxCityState = '';
  for (const row of cityDistribution.rows as any[]) {
    const count = parseInt(row.city_count);
    console.log(`  ${row.state_code}: ${count.toLocaleString()} cities`);
    if (count > maxCityCount) {
      maxCityCount = count;
      maxCityState = row.state_code;
    }
  }

  // Get total counts
  const [totalZips, totalCities] = await Promise.all([
    sql`SELECT COUNT(DISTINCT zip_code) as count FROM zip_county_mapping WHERE state_code != 'PR'`,
    sql`SELECT COUNT(*) as count FROM cities WHERE state_code != 'PR'`
  ]);

  const totalZipCount = parseInt(totalZips.rows[0].count);
  const totalCityCount = parseInt(totalCities.rows[0].count);

  console.log(`\n  Max city sitemap: ${maxCityState} with ${maxCityCount.toLocaleString()} cities`);

  // Calculate estimated XML sizes
  // Each URL entry is approximately: <url><loc>https://fmr.fyi/zip/12345</loc><lastmod>2024-01-01T00:00:00.000Z</lastmod></url>
  // That's roughly 100-120 bytes per ZIP entry
  // For cities: <url><loc>https://fmr.fyi/city/city-name-state</loc><lastmod>...</lastmod></url>
  // That's roughly 120-150 bytes per city entry (longer URLs)
  
  const zipEntrySize = 110; // bytes per ZIP entry
  const cityEntrySize = 140; // bytes per city entry
  const xmlHeader = 200; // XML header + urlset opening/closing tags
  const xmlFooter = 20; // urlset closing tag

  const maxZipSitemapSize = xmlHeader + (maxZipCount * zipEntrySize) + xmlFooter;
  const maxCitySitemapSize = xmlHeader + (maxCityCount * cityEntrySize) + xmlFooter;

  console.log('\n📏 Estimated Sitemap Sizes:');
  console.log(`\n  ZIP Codes:`);
  console.log(`    Total ZIPs: ${totalZipCount.toLocaleString()}`);
  console.log(`    Sitemaps: 10 (one per digit 0-9)`);
  console.log(`    Largest sitemap: ${maxZipDigit}xxxx`);
  console.log(`    URLs in largest: ${maxZipCount.toLocaleString()}`);
  console.log(`    Estimated size: ${(maxZipSitemapSize / 1024).toFixed(2)} KB (${(maxZipSitemapSize / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`    Average per sitemap: ${((totalZipCount / 10) * zipEntrySize / 1024).toFixed(2)} KB`);

  console.log(`\n  Cities:`);
  console.log(`    Total cities: ${totalCityCount.toLocaleString()}`);
  const stateCount = await sql`SELECT COUNT(DISTINCT state_code) as count FROM cities WHERE state_code != 'PR'`;
  const numStates = parseInt(stateCount.rows[0].count);
  console.log(`    Sitemaps: ${numStates} (one per state)`);
  console.log(`    Largest sitemap: ${maxCityState}`);
  console.log(`    URLs in largest: ${maxCityCount.toLocaleString()}`);
  console.log(`    Estimated size: ${(maxCitySitemapSize / 1024).toFixed(2)} KB (${(maxCitySitemapSize / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`    Average per sitemap: ${((totalCityCount / numStates) * cityEntrySize / 1024).toFixed(2)} KB`);

  console.log('\n✅ Google Search Console Limits:');
  console.log('  Max URLs per sitemap: 50,000');
  console.log('  Max file size: 50 MB (uncompressed)');
  console.log(`\n  ZIP sitemaps: ${maxZipCount < 50000 ? '✅' : '❌'} Under limit (${maxZipCount.toLocaleString()} < 50,000)`);
  console.log(`  City sitemaps: ${maxCityCount < 50000 ? '✅' : '❌'} Under limit (${maxCityCount.toLocaleString()} < 50,000)`);
  console.log(`  ZIP file size: ${maxZipSitemapSize < 50 * 1024 * 1024 ? '✅' : '❌'} Under limit (${(maxZipSitemapSize / 1024 / 1024).toFixed(2)} MB < 50 MB)`);
  console.log(`  City file size: ${maxCitySitemapSize < 50 * 1024 * 1024 ? '✅' : '❌'} Under limit (${(maxCitySitemapSize / 1024 / 1024).toFixed(2)} MB < 50 MB)`);

  console.log('\n');
}

calculateSitemapSizes().catch(console.error);





