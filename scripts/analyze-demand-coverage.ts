#!/usr/bin/env bun

/**
 * Analyze demand data coverage - compare old vs new dump
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

config();

async function analyzeCoverage() {
  console.log(`\n=== Analyzing Demand Data Coverage ===\n`);

  // Read the new dump
  const newDump = readFileSync('zips-missing-demand-2026-1765859207715.csv', 'utf-8');
  const newRecords = parse(newDump, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  console.log(`New dump: ${newRecords.length} ZIPs missing demand data\n`);

  // Analyze new dump
  const byReason: Record<string, number> = {};
  const byState: Record<string, number> = {};
  const withInvestmentScore = newRecords.filter((r: any) => r.investment_score_exists === 'true').length;
  const withoutInvestmentScore = newRecords.filter((r: any) => r.investment_score_exists === 'false').length;

  for (const record of newRecords) {
    byReason[record.reason] = (byReason[record.reason] || 0) + 1;
    byState[record.state_code] = (byState[record.state_code] || 0) + 1;
  }

  console.log(`Breakdown:`);
  console.log(`  - With investment_score: ${withInvestmentScore}`);
  console.log(`  - Without investment_score: ${withoutInvestmentScore}`);
  console.log(`\nBy reason:`);
  for (const [reason, count] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${reason}: ${count}`);
  }
  console.log(`\nTop states:`);
  for (const [state, count] of Object.entries(byState).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  - ${state}: ${count}`);
  }

  // Check investment_score table directly
  console.log(`\n=== Checking investment_score table ===\n`);
  
  const investmentScores = await sql`
    SELECT 
      COUNT(*) as total_zips,
      COUNT(DISTINCT zip_code) as unique_zips,
      COUNT(*) FILTER (WHERE zordi_metro IS NOT NULL) as with_zordi_metro,
      COUNT(*) FILTER (WHERE demand_score IS NOT NULL) as with_demand_score,
      COUNT(*) FILTER (WHERE zordi_metro IS NULL AND demand_score IS NULL) as missing_demand,
      COUNT(*) FILTER (WHERE zordi_metro IS NOT NULL OR demand_score IS NOT NULL) as has_demand
    FROM investment_score
    WHERE geo_type = 'zip'
      AND zip_code IS NOT NULL
      AND fmr_year = 2026
  `;

  const stats = investmentScores.rows[0];
  console.log(`Investment Score Statistics (2026):`);
  console.log(`  - Total records: ${stats.total_zips}`);
  console.log(`  - Unique ZIPs: ${stats.unique_zips}`);
  console.log(`  - With ZORDI metro: ${stats.with_zordi_metro}`);
  console.log(`  - With demand score: ${stats.with_demand_score}`);
  console.log(`  - Has demand data: ${stats.has_demand}`);
  console.log(`  - Missing demand data: ${stats.missing_demand}`);
  
  if (stats.total_zips > 0) {
    const coverage = ((stats.has_demand / stats.total_zips) * 100).toFixed(1);
    console.log(`  - Coverage: ${coverage}%`);
  }

  // Get ZIPs in investment_score that are missing demand
  const missingInInvestmentScore = await sql`
    SELECT DISTINCT
      isc.zip_code,
      isc.state_code,
      isc.county_name,
      isc.county_fips,
      COUNT(*) as record_count
    FROM investment_score isc
    WHERE isc.geo_type = 'zip'
      AND isc.zip_code IS NOT NULL
      AND isc.fmr_year = 2026
      AND (isc.zordi_metro IS NULL AND isc.demand_score IS NULL)
    GROUP BY isc.zip_code, isc.state_code, isc.county_name, isc.county_fips
    ORDER BY record_count DESC, isc.zip_code
    LIMIT 50
  `;

  if (missingInInvestmentScore.rows.length > 0) {
    console.log(`\n=== Sample ZIPs in investment_score missing demand ===\n`);
    console.log(`Showing first 20:`);
    for (const row of missingInInvestmentScore.rows.slice(0, 20)) {
      console.log(`  ${row.zip_code} (${row.county_name}, ${row.state_code}) - ${row.record_count} records`);
    }
  }

  // Compare with old dump if it exists
  try {
    const oldDump = readFileSync('zips-without-demand-2026-1765851975147.csv', 'utf-8');
    const oldRecords = parse(oldDump, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    console.log(`\n=== Comparison with Original Dump ===\n`);
    console.log(`Original dump: ${oldRecords.length} ZIPs`);
    console.log(`New dump: ${newRecords.length} ZIPs`);
    console.log(`Improvement: ${oldRecords.length - newRecords.length} fewer ZIPs missing demand`);
    console.log(`Reduction: ${(((oldRecords.length - newRecords.length) / oldRecords.length) * 100).toFixed(1)}%`);
  } catch (e) {
    console.log(`\n(Original dump not found for comparison)\n`);
  }

  console.log(`\n✅ Analysis complete!\n`);
}

analyzeCoverage()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });





