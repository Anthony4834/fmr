#!/usr/bin/env bun

/**
 * Export ZIPs without demand data to CSV for analysis.
 * 
 * This script identifies ZIPs in investment_score that don't have demand_score
 * and exports detailed information about why they might be missing demand data.
 * 
 * Usage:
 *   bun scripts/export-zips-without-demand-data.ts [--year 2026] [--output zips-without-demand.csv]
 */

import { config } from 'dotenv';
import { configureDatabase, query } from '../lib/db';
import { getLatestFMRYear } from '../lib/queries';
import { writeFileSync } from 'fs';
import { join } from 'path';

config();

interface ZipAnalysis {
  zipCode: string;
  stateCode: string;
  countyName: string;
  countyFips: string | null;
  hasZoriData: boolean;
  zoriMetroName: string | null;
  zordiMetroMatch: boolean;
  zordiMetroName: string | null;
  hasZordiData: boolean;
  reason: string;
}

function getReason(zip: ZipAnalysis): string {
  if (!zip.hasZoriData) {
    return 'No ZORI data';
  }
  if (!zip.zoriMetroName) {
    return 'ZORI data but no metro_name';
  }
  if (!zip.zordiMetroMatch) {
    return `ZORI metro "${zip.zoriMetroName}" not found in ZORDI`;
  }
  if (!zip.hasZordiData) {
    return 'Metro matched but no ZORDI data';
  }
  return 'Unknown';
}

async function exportZipsWithoutDemand(year?: number, outputPath?: string) {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  const fmrYear = year || await getLatestFMRYear();
  const outputFile = outputPath || join(process.cwd(), `zips-without-demand-${fmrYear}-${Date.now()}.csv`);

  console.log('\n' + '='.repeat(80));
  console.log('Exporting ZIPs Without Demand Data');
  console.log('='.repeat(80));
  console.log(`FMR Year: ${fmrYear}`);
  console.log(`Output: ${outputFile}\n`);

  const queryText = `
    WITH investment_zips AS (
      SELECT DISTINCT
        isc.zip_code,
        isc.state_code,
        isc.county_name,
        isc.county_fips
      FROM investment_score isc
      WHERE isc.fmr_year = $1
        AND isc.demand_score IS NULL
    ),
    latest_zori_month AS (
      SELECT MAX(month) as month FROM zillow_zori_zip_monthly
    ),
    latest_zordi_month AS (
      SELECT MAX(month) as month FROM zillow_zordi_metro_monthly
    ),
    zori_data AS (
      SELECT DISTINCT
        z.zip_code,
        z.metro_name,
        LOWER(
          REGEXP_REPLACE(
            SPLIT_PART(COALESCE(z.metro_name, ''), '-', 1),
            ',\\s*[A-Z]{2}(-[A-Z]{2})*',
            '',
            'g'
          )
        ) as metro_name_normalized
      FROM zillow_zori_zip_monthly z
      CROSS JOIN latest_zori_month lzm
      WHERE z.month = lzm.month
    ),
    zordi_metros AS (
      SELECT DISTINCT
        z.region_name,
        LOWER(
          REGEXP_REPLACE(
            SPLIT_PART(z.region_name, '-', 1),
            ',\\s*[A-Z]{2}(-[A-Z]{2})*',
            '',
            'g'
          )
        ) as region_name_normalized
      FROM zillow_zordi_metro_monthly z
      CROSS JOIN latest_zordi_month lzm
      WHERE z.month = lzm.month
        AND z.region_type IN ('msa', 'metro')
    )
    SELECT 
      iz.zip_code,
      iz.state_code,
      iz.county_name,
      iz.county_fips,
      CASE WHEN zori.zip_code IS NOT NULL THEN true ELSE false END as has_zori_data,
      zori.metro_name as zori_metro_name,
      CASE WHEN zordi.region_name IS NOT NULL THEN true ELSE false END as zordi_metro_match,
      zordi.region_name as zordi_metro_name,
      CASE WHEN zordi.region_name IS NOT NULL THEN true ELSE false END as has_zordi_data
    FROM investment_zips iz
    LEFT JOIN zori_data zori ON zori.zip_code = iz.zip_code
    LEFT JOIN zordi_metros zordi ON zordi.region_name_normalized = zori.metro_name_normalized
    ORDER BY iz.state_code, iz.county_name, iz.zip_code
  `;

  const results = await query(queryText, [fmrYear]);

  console.log(`Found ${results.length} ZIPs without demand data\n`);

  // Convert to analysis format
  const analysis: ZipAnalysis[] = results.map((row: any) => ({
    zipCode: String(row.zip_code),
    stateCode: String(row.state_code || ''),
    countyName: String(row.county_name || ''),
    countyFips: row.county_fips ? String(row.county_fips) : null,
    hasZoriData: Boolean(row.has_zori_data),
    zoriMetroName: row.zori_metro_name ? String(row.zori_metro_name) : null,
    zordiMetroMatch: Boolean(row.zordi_metro_match),
    zordiMetroName: row.zordi_metro_name ? String(row.zordi_metro_name) : null,
    hasZordiData: Boolean(row.has_zordi_data),
    reason: '' // Will be set below
  }));

  // Add reasons
  analysis.forEach(zip => {
    zip.reason = getReason(zip);
  });

  // Generate CSV
  const headers = [
    'zip_code',
    'state_code',
    'county_name',
    'county_fips',
    'has_zori_data',
    'zori_metro_name',
    'zordi_metro_match',
    'zordi_metro_name',
    'has_zordi_data',
    'reason'
  ];

  const csvRows = [
    headers.join(','),
    ...analysis.map(zip => [
      zip.zipCode,
      zip.stateCode,
      `"${zip.countyName.replace(/"/g, '""')}"`,
      zip.countyFips || '',
      zip.hasZoriData ? 'true' : 'false',
      zip.zoriMetroName ? `"${zip.zoriMetroName.replace(/"/g, '""')}"` : '',
      zip.zordiMetroMatch ? 'true' : 'false',
      zip.zordiMetroName ? `"${zip.zordiMetroName.replace(/"/g, '""')}"` : '',
      zip.hasZordiData ? 'true' : 'false',
      `"${zip.reason.replace(/"/g, '""')}"`
    ].join(','))
  ];

  writeFileSync(outputFile, csvRows.join('\n'), 'utf-8');

  // Summary statistics
  const stats = {
    total: analysis.length,
    noZoriData: analysis.filter(z => !z.hasZoriData).length,
    zoriButNoMetro: analysis.filter(z => z.hasZoriData && !z.zoriMetroName).length,
    metroNoMatch: analysis.filter(z => z.zoriMetroName && !z.zordiMetroMatch).length,
    metroMatchButNoData: analysis.filter(z => z.zordiMetroMatch && !z.hasZordiData).length
  };

  console.log('=== Summary Statistics ===\n');
  console.log(`Total ZIPs without demand data: ${stats.total}`);
  console.log(`  - No ZORI data: ${stats.noZoriData} (${(stats.noZoriData / stats.total * 100).toFixed(1)}%)`);
  console.log(`  - ZORI data but no metro_name: ${stats.zoriButNoMetro} (${(stats.zoriButNoMetro / stats.total * 100).toFixed(1)}%)`);
  console.log(`  - Metro name doesn't match ZORDI: ${stats.metroNoMatch} (${(stats.metroNoMatch / stats.total * 100).toFixed(1)}%)`);
  console.log(`  - Metro matches but no ZORDI data: ${stats.metroMatchButNoData} (${(stats.metroMatchButNoData / stats.total * 100).toFixed(1)}%)\n`);

  // Top reasons
  const reasonCounts = new Map<string, number>();
  analysis.forEach(zip => {
    reasonCounts.set(zip.reason, (reasonCounts.get(zip.reason) || 0) + 1);
  });

  const sortedReasons = Array.from(reasonCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  console.log('=== Top 10 Reasons ===\n');
  sortedReasons.forEach(([reason, count]) => {
    console.log(`  ${reason}: ${count} ZIPs (${(count / stats.total * 100).toFixed(1)}%)`);
  });

  console.log(`\n✅ Exported ${analysis.length} ZIPs to ${outputFile}`);
  console.log('='.repeat(80));
}

const args = process.argv.slice(2);
let year: number | undefined;
let output: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--year' && args[i + 1]) {
    year = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--output' && args[i + 1]) {
    output = args[i + 1];
    i++;
  }
}

exportZipsWithoutDemand(year, output).catch(console.error);
