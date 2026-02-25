#!/usr/bin/env bun

/**
 * Analyze investment_score database and export ZIPs missing demand data
 * 
 * This script:
 * 1. Queries investment_score table for ZIPs
 * 2. Identifies ZIPs missing demand data (zordi_metro, demand_score, etc.)
 * 3. Enriches with context from related tables
 * 4. Exports to CSV similar to original format
 * 
 * Usage:
 *   bun scripts/export-zips-missing-demand.ts
 *   bun scripts/export-zips-missing-demand.ts --year 2026
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';
import { writeFileSync } from 'fs';

config();

interface MissingDemandRecord {
  zip_code: string;
  state_code: string;
  county_name: string;
  county_fips: string;
  has_zori_data: boolean;
  zori_metro_name: string | null;
  zordi_metro_match: boolean;
  zordi_metro_name: string | null;
  has_zordi_data: boolean;
  reason: string;
  investment_score_exists: boolean;
  bedroom_count: number | null;
  fmr_year: number | null;
}

async function exportMissingDemandZips(year?: number) {
  console.log(`\n=== Exporting ZIPs Missing Demand Data ===\n`);

  // Default to latest year if not specified
  if (!year) {
    const latestYear = await sql`
      SELECT MAX(fmr_year) as max_year FROM investment_score
    `;
    year = latestYear.rows[0]?.max_year || 2026;
  }

  console.log(`Analyzing investment scores for year: ${year}\n`);

  // Get all unique ZIPs from investment_score
  const investmentZips = await sql`
    SELECT DISTINCT 
      zip_code,
      state_code,
      county_name,
      county_fips,
      bedroom_count,
      fmr_year,
      zordi_metro,
      demand_score,
      demand_multiplier
    FROM investment_score
    WHERE geo_type = 'zip'
      AND zip_code IS NOT NULL
      AND fmr_year = ${year}
    ORDER BY zip_code, bedroom_count
  `;

  console.log(`Found ${investmentZips.rows.length} investment score records for ${investmentZips.rows.length} unique ZIPs\n`);

  // Get unique ZIPs
  const uniqueZips = new Set(investmentZips.rows.map(r => r.zip_code));
  console.log(`Unique ZIPs in investment_score: ${uniqueZips.size}\n`);

  // For each unique ZIP, check if it has demand data
  const missingRecords: MissingDemandRecord[] = [];
  const zipRecords = new Map<string, any[]>();

  // Group by ZIP
  for (const row of investmentZips.rows) {
    const zip = row.zip_code;
    if (!zipRecords.has(zip)) {
      zipRecords.set(zip, []);
    }
    zipRecords.get(zip)!.push(row);
  }

  console.log(`Analyzing demand data coverage...\n`);

  for (const [zipCode, records] of zipRecords) {
    // Check if any record for this ZIP has demand data
    const hasDemandData = records.some(r => 
      r.zordi_metro !== null || 
      r.demand_score !== null || 
      r.demand_multiplier !== null
    );

    // Get representative record (prefer one with county info)
    const repRecord = records.find(r => r.county_name) || records[0];

    // Check ZORI data
    const zoriCheck = await sql`
      SELECT metro_name
      FROM zillow_zori_zip_monthly
      WHERE zip_code = ${zipCode}
        AND metro_name IS NOT NULL
      ORDER BY month DESC
      LIMIT 1
    `;

    const hasZoriData = zoriCheck.rows.length > 0;
    const zoriMetroName = zoriCheck.rows[0]?.metro_name || null;

    // Check if ZORDI metro matches
    const zordiMetroMatch = repRecord.zordi_metro !== null;
    const zordiMetroName = repRecord.zordi_metro;

    // Determine reason
    let reason = '';
    if (!hasZoriData) {
      reason = 'No ZORI data';
    } else if (!zoriMetroName) {
      reason = 'ZORI data but no metro_name';
    } else if (!zordiMetroMatch) {
      reason = 'ZORI metro_name but no ZORDI match';
    } else {
      reason = 'Has demand data';
    }

    // Only include if missing demand data
    if (!hasDemandData) {
      missingRecords.push({
        zip_code: zipCode,
        state_code: repRecord.state_code || '',
        county_name: repRecord.county_name || '',
        county_fips: repRecord.county_fips || '',
        has_zori_data: hasZoriData,
        zori_metro_name: zoriMetroName,
        zordi_metro_match: zordiMetroMatch,
        zordi_metro_name: zordiMetroName,
        has_zordi_data: hasDemandData,
        reason: reason,
        investment_score_exists: true,
        bedroom_count: repRecord.bedroom_count,
        fmr_year: repRecord.fmr_year
      });
    }
  }

  // Also check for ZIPs that might be in other tables but not in investment_score
  // Get all ZIPs from zip_county_mapping that aren't in investment_score
  const allCountyZips = await sql`
    SELECT DISTINCT 
      zcm.zip_code,
      zcm.state_code,
      zcm.county_name,
      zcm.county_fips
    FROM zip_county_mapping zcm
    WHERE NOT EXISTS (
      SELECT 1 FROM investment_score isc
      WHERE isc.zip_code = zcm.zip_code
        AND isc.geo_type = 'zip'
        AND isc.fmr_year = ${year}
    )
    ORDER BY zcm.zip_code
    LIMIT 1000
  `;

  console.log(`Found ${allCountyZips.rows.length} ZIPs in county mapping but not in investment_score (showing first 1000)\n`);

  // Add some of these to the report
  for (const row of allCountyZips.rows.slice(0, 500)) {
    const zipCode = row.zip_code;

    // Check ZORI data
    const zoriCheck = await sql`
      SELECT metro_name
      FROM zillow_zori_zip_monthly
      WHERE zip_code = ${zipCode}
        AND metro_name IS NOT NULL
      ORDER BY month DESC
      LIMIT 1
    `;

    const hasZoriData = zoriCheck.rows.length > 0;
    const zoriMetroName = zoriCheck.rows[0]?.metro_name || null;

    let reason = '';
    if (!hasZoriData) {
      reason = 'No ZORI data';
    } else if (!zoriMetroName) {
      reason = 'ZORI data but no metro_name';
    } else {
      reason = 'Not in investment_score';
    }

    missingRecords.push({
      zip_code: zipCode,
      state_code: row.state_code || '',
      county_name: row.county_name || '',
      county_fips: row.county_fips || '',
      has_zori_data: hasZoriData,
      zori_metro_name: zoriMetroName,
      zordi_metro_match: false,
      zordi_metro_name: null,
      has_zordi_data: false,
      reason: reason,
      investment_score_exists: false,
      bedroom_count: null,
      fmr_year: null
    });
  }

  // Sort by reason, then by state, then by ZIP
  missingRecords.sort((a, b) => {
    if (a.reason !== b.reason) return a.reason.localeCompare(b.reason);
    if (a.state_code !== b.state_code) return a.state_code.localeCompare(b.state_code);
    return a.zip_code.localeCompare(b.zip_code);
  });

  // Generate CSV
  const timestamp = Date.now();
  const filename = `zips-missing-demand-${year}-${timestamp}.csv`;
  
  const csvLines = [
    'zip_code,state_code,county_name,county_fips,has_zori_data,zori_metro_name,zordi_metro_match,zordi_metro_name,has_zordi_data,reason,investment_score_exists,bedroom_count,fmr_year',
    ...missingRecords.map(r => [
      r.zip_code,
      r.state_code,
      `"${r.county_name}"`,
      r.county_fips,
      r.has_zori_data,
      r.zori_metro_name ? `"${r.zori_metro_name}"` : '',
      r.zordi_metro_match,
      r.zordi_metro_name ? `"${r.zordi_metro_name}"` : '',
      r.has_zordi_data,
      `"${r.reason}"`,
      r.investment_score_exists,
      r.bedroom_count || '',
      r.fmr_year || ''
    ].join(','))
  ];

  writeFileSync(filename, csvLines.join('\n'), 'utf-8');

  // Generate summary
  const summary = {
    total_missing: missingRecords.length,
    by_reason: {} as Record<string, number>,
    by_state: {} as Record<string, number>,
    with_investment_score: missingRecords.filter(r => r.investment_score_exists).length,
    without_investment_score: missingRecords.filter(r => !r.investment_score_exists).length,
    with_zori_no_metro: missingRecords.filter(r => r.has_zori_data && !r.zori_metro_name).length,
    no_zori_data: missingRecords.filter(r => !r.has_zori_data).length
  };

  for (const record of missingRecords) {
    summary.by_reason[record.reason] = (summary.by_reason[record.reason] || 0) + 1;
    summary.by_state[record.state_code] = (summary.by_state[record.state_code] || 0) + 1;
  }

  console.log(`\n=== Summary ===\n`);
  console.log(`Total ZIPs missing demand data: ${summary.total_missing}`);
  console.log(`  - With investment_score: ${summary.with_investment_score}`);
  console.log(`  - Without investment_score: ${summary.without_investment_score}`);
  console.log(`\nBreakdown by reason:`);
  for (const [reason, count] of Object.entries(summary.by_reason).sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${reason}: ${count}`);
  }
  console.log(`\nTop 10 states by missing ZIPs:`);
  const topStates = Object.entries(summary.by_state)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [state, count] of topStates) {
    console.log(`  - ${state}: ${count}`);
  }

  console.log(`\n✅ Export complete!`);
  console.log(`\nOutput file: ${filename}`);
  console.log(`\nTo analyze mapping opportunities:`);
  console.log(`  bun scripts/analyze-zip-demand-mapping.ts --file ${filename}\n`);
}

// CLI
const args = process.argv.slice(2);
let year: number | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--year' && args[i + 1]) {
    year = parseInt(args[i + 1], 10);
    i++;
  }
}

exportMissingDemandZips(year)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });





