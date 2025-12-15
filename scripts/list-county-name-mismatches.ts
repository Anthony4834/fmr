#!/usr/bin/env bun

/**
 * List all counties where ZHVI county_name doesn't match zip_county_mapping county_name
 * This helps identify normalization issues
 */

import { config } from 'dotenv';
import { configureDatabase, query } from '../lib/db';

config();

async function listMismatches() {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  console.log('\n=== County Name Mismatches (ZHVI vs zip_county_mapping) ===\n');

  // Get the latest ZHVI month
  const latestMonthRes = await query(
    `SELECT MAX(month) as latest_month FROM zhvi_zip_bedroom_monthly LIMIT 1`
  );
  const latestMonth = latestMonthRes[0]?.latest_month;

  if (!latestMonth) {
    console.log('❌ No ZHVI data found');
    return;
  }

  console.log(`Using ZHVI month: ${latestMonth}\n`);

  // Find mismatches
  const mismatches = await query(`
    WITH zhvi_counties AS (
      SELECT DISTINCT
        z.zip_code,
        z.county_name as zhvi_county,
        z.state_code
      FROM zhvi_zip_bedroom_monthly z
      WHERE z.month = $1::date
        AND z.bedroom_count = 3
        AND z.county_name IS NOT NULL
    ),
    mapping_counties AS (
      SELECT DISTINCT
        zcm.zip_code,
        zcm.county_name as mapping_county,
        zcm.county_fips,
        zcm.state_code
      FROM zip_county_mapping zcm
    ),
    joined AS (
      SELECT 
        zc.zip_code,
        zc.zhvi_county,
        mc.mapping_county,
        mc.county_fips,
        zc.state_code,
        CASE 
          WHEN mc.mapping_county IS NULL THEN 'MISSING_IN_MAPPING'
          WHEN zc.zhvi_county != mc.mapping_county THEN 'NAME_MISMATCH'
          ELSE 'MATCH'
        END as match_status
      FROM zhvi_counties zc
      LEFT JOIN mapping_counties mc ON 
        mc.zip_code = zc.zip_code 
        AND mc.state_code = zc.state_code
    )
    SELECT 
      state_code,
      zhvi_county,
      mapping_county,
      county_fips,
      COUNT(DISTINCT zip_code) as zip_count,
      match_status
    FROM joined
    WHERE match_status != 'MATCH'
    GROUP BY state_code, zhvi_county, mapping_county, county_fips, match_status
    ORDER BY zip_count DESC, state_code, zhvi_county
  `, [latestMonth]);

  console.log(`Found ${mismatches.length} county name mismatches\n`);

  // Group by type
  const missing = mismatches.filter((m: any) => m.match_status === 'MISSING_IN_MAPPING');
  const nameMismatch = mismatches.filter((m: any) => m.match_status === 'NAME_MISMATCH');

  console.log(`Missing in mapping: ${missing.length}`);
  console.log(`Name mismatches: ${nameMismatch.length}\n`);

  if (nameMismatch.length > 0) {
    console.log('=== Name Mismatches (ZHVI has "County" suffix, mapping doesn\'t) ===\n');
    nameMismatch.slice(0, 50).forEach((m: any) => {
      const zhvi = String(m.zhvi_county || '').trim();
      const mapping = String(m.mapping_county || 'NULL').trim();
      const fips = m.county_fips ? String(m.county_fips).trim() : 'NULL';
      console.log(`${m.state_code.padEnd(3)} | ${zhvi.padEnd(35)} | ${mapping.padEnd(35)} | FIPS: ${fips.padEnd(5)} | ZIPs: ${String(m.zip_count).padStart(5)}`);
    });
    if (nameMismatch.length > 50) {
      console.log(`\n... and ${nameMismatch.length - 50} more`);
    }
  }

  if (missing.length > 0) {
    console.log('\n=== Missing in zip_county_mapping ===\n');
    missing.slice(0, 30).forEach((m: any) => {
      const zhvi = String(m.zhvi_county || '').trim();
      console.log(`${m.state_code.padEnd(3)} | ${zhvi.padEnd(40)} | ZIPs: ${String(m.zip_count).padStart(5)}`);
    });
    if (missing.length > 30) {
      console.log(`\n... and ${missing.length - 30} more`);
    }
  }

  // Summary by state
  console.log('\n=== Summary by State ===\n');
  const byState = await query(`
    WITH zhvi_counties AS (
      SELECT DISTINCT
        z.zip_code,
        z.county_name as zhvi_county,
        z.state_code
      FROM zhvi_zip_bedroom_monthly z
      WHERE z.month = $1::date
        AND z.bedroom_count = 3
        AND z.county_name IS NOT NULL
    ),
    mapping_counties AS (
      SELECT DISTINCT
        zcm.zip_code,
        zcm.county_name as mapping_county,
        zcm.state_code
      FROM zip_county_mapping zcm
    ),
    joined AS (
      SELECT 
        zc.state_code,
        zc.zhvi_county,
        mc.mapping_county,
        CASE 
          WHEN mc.mapping_county IS NULL THEN 'MISSING'
          WHEN zc.zhvi_county != mc.mapping_county THEN 'MISMATCH'
          ELSE 'MATCH'
        END as match_status
      FROM zhvi_counties zc
      LEFT JOIN mapping_counties mc ON 
        mc.zip_code = zc.zip_code 
        AND mc.state_code = zc.state_code
    )
    SELECT 
      state_code,
      COUNT(DISTINCT CASE WHEN match_status = 'MATCH' THEN zhvi_county END) as matched,
      COUNT(DISTINCT CASE WHEN match_status = 'MISMATCH' THEN zhvi_county END) as mismatched,
      COUNT(DISTINCT CASE WHEN match_status = 'MISSING' THEN zhvi_county END) as missing
    FROM joined
    GROUP BY state_code
    HAVING COUNT(DISTINCT CASE WHEN match_status != 'MATCH' THEN zhvi_county END) > 0
    ORDER BY mismatched DESC, missing DESC, state_code
  `, [latestMonth]);

  byState.forEach((s: any) => {
    console.log(`${s.state_code.padEnd(3)} | Matched: ${String(s.matched || 0).padStart(3)} | Mismatched: ${String(s.mismatched || 0).padStart(3)} | Missing: ${String(s.missing || 0).padStart(3)}`);
  });
}

listMismatches().catch(console.error);
