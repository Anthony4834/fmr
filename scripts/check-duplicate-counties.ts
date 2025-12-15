#!/usr/bin/env bun

/**
 * Check for duplicate counties in investment_score table
 * This helps identify if the county name normalization fix resolved the issue
 */

import { config } from 'dotenv';
import { configureDatabase, query } from '../lib/db';

config();

async function checkDuplicates() {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  console.log('\n=== Checking for Duplicate Counties ===\n');

  // Get latest FMR year
  const yearRes = await query(
    `SELECT MAX(fmr_year) as latest_year FROM investment_score LIMIT 1`
  );
  const year = yearRes[0]?.latest_year;

  if (!year) {
    console.log('❌ No investment_score data found');
    return;
  }

  console.log(`Checking for year: ${year}\n`);

  // Check for duplicates by FIPS
  const duplicatesByFips = await query(`
    WITH county_data AS (
      SELECT 
        county_fips,
        state_code,
        county_name,
        COUNT(DISTINCT zip_code) as zip_count,
        COUNT(*) as total_records
      FROM investment_score
      WHERE fmr_year = $1
        AND data_sufficient = true
        AND county_fips IS NOT NULL
        AND LENGTH(TRIM(county_fips)) = 5
      GROUP BY county_fips, state_code, county_name
    ),
    fips_groups AS (
      SELECT 
        county_fips,
        state_code,
        COUNT(DISTINCT county_name) as name_count,
        STRING_AGG(DISTINCT county_name, ', ' ORDER BY county_name) as county_names,
        SUM(zip_count) as total_zips
      FROM county_data
      GROUP BY county_fips, state_code
      HAVING COUNT(DISTINCT county_name) > 1
    )
    SELECT 
      county_fips,
      state_code,
      name_count,
      county_names,
      total_zips
    FROM fips_groups
    ORDER BY name_count DESC, total_zips DESC
  `, [year]);

  console.log(`=== Duplicates by FIPS (same FIPS, different county names) ===\n`);
  if (duplicatesByFips.length === 0) {
    console.log('✅ No duplicates found by FIPS\n');
  } else {
    console.log(`Found ${duplicatesByFips.length} FIPS codes with multiple county names:\n`);
    duplicatesByFips.forEach((d: any) => {
      console.log(`FIPS: ${d.county_fips} | State: ${d.state_code} | Names (${d.name_count}): ${d.county_names} | ZIPs: ${d.total_zips}`);
    });
  }

  // Check for duplicates by county name (normalized)
  const duplicatesByName = await query(`
    WITH county_data AS (
      SELECT 
        county_fips,
        state_code,
        county_name,
        REGEXP_REPLACE(county_name, '\\s+(County|Parish|Borough|Municipality|Census Area|City and Borough)\\s*$', '', 'i') as normalized_name,
        COUNT(DISTINCT zip_code) as zip_count
      FROM investment_score
      WHERE fmr_year = $1
        AND data_sufficient = true
        AND county_fips IS NOT NULL
        AND LENGTH(TRIM(county_fips)) = 5
      GROUP BY county_fips, state_code, county_name, normalized_name
    ),
    name_groups AS (
      SELECT 
        normalized_name,
        state_code,
        COUNT(DISTINCT county_fips) as fips_count,
        STRING_AGG(DISTINCT county_fips, ', ' ORDER BY county_fips) as fips_codes,
        STRING_AGG(DISTINCT county_name, ', ' ORDER BY county_name) as county_names,
        SUM(zip_count) as total_zips
      FROM county_data
      GROUP BY normalized_name, state_code
      HAVING COUNT(DISTINCT county_fips) > 1
    )
    SELECT 
      normalized_name,
      state_code,
      fips_count,
      fips_codes,
      county_names,
      total_zips
    FROM name_groups
    ORDER BY fips_count DESC, total_zips DESC
  `, [year]);

  console.log(`\n=== Duplicates by Name (same normalized name, different FIPS) ===\n`);
  if (duplicatesByName.length === 0) {
    console.log('✅ No duplicates found by normalized name\n');
  } else {
    console.log(`Found ${duplicatesByName.length} normalized county names with multiple FIPS:\n`);
    duplicatesByName.forEach((d: any) => {
      console.log(`Name: ${d.normalized_name} | State: ${d.state_code} | FIPS (${d.fips_count}): ${d.fips_codes} | Names: ${d.county_names} | ZIPs: ${d.total_zips}`);
    });
  }

  // Check what the API would return (simulating the state-counties query)
  console.log(`\n=== Simulating State-Counties API Query (IL as example) ===\n`);
  const apiResult = await query(`
    WITH all_county_data AS (
      SELECT 
        county_fips,
        state_code,
        county_name,
        score,
        zhvi_month,
        acs_vintage,
        computed_at
      FROM investment_score
      WHERE state_code = 'IL'
        AND fmr_year = $1
        AND data_sufficient = true
        AND county_fips IS NOT NULL
        AND LENGTH(TRIM(county_fips)) = 5
    ),
    latest_versions AS (
      SELECT 
        COALESCE(MAX(zhvi_month), NULL) as latest_zhvi_month,
        COALESCE(MAX(acs_vintage), NULL) as latest_acs_vintage
      FROM all_county_data
    ),
    filtered_data AS (
      SELECT 
        county_fips,
        state_code,
        county_name,
        score,
        computed_at
      FROM all_county_data acd
      CROSS JOIN latest_versions lv
      WHERE (
        (lv.latest_zhvi_month IS NULL AND acd.zhvi_month IS NULL) OR
        (lv.latest_zhvi_month IS NOT NULL AND acd.zhvi_month = lv.latest_zhvi_month)
      )
      AND (
        (lv.latest_acs_vintage IS NULL AND acd.acs_vintage IS NULL) OR
        (lv.latest_acs_vintage IS NOT NULL AND acd.acs_vintage = lv.latest_acs_vintage)
      )
    ),
    county_names AS (
      SELECT DISTINCT ON (county_fips, state_code)
        county_fips,
        state_code,
        county_name,
        COUNT(*) as name_count
      FROM filtered_data
      GROUP BY county_fips, state_code, county_name
      ORDER BY county_fips, state_code, name_count DESC, county_name
    ),
    county_aggregates AS (
      SELECT 
        fd.county_fips,
        fd.state_code,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fd.score) as median_score,
        AVG(fd.score) as avg_score,
        COUNT(*) as zip_count
      FROM filtered_data fd
      GROUP BY fd.county_fips, fd.state_code
      HAVING COUNT(*) > 0
    )
    SELECT 
      ca.county_fips,
      COALESCE(cn.county_name, 'Unknown County') as county_name,
      ca.state_code,
      ca.median_score,
      ca.avg_score,
      ca.zip_count
    FROM county_aggregates ca
    LEFT JOIN county_names cn ON ca.county_fips = cn.county_fips AND ca.state_code = cn.state_code
    ORDER BY ca.median_score DESC NULLS LAST
  `, [year]);

  // Check for duplicates in the API result
  const apiDuplicates = new Map<string, number>();
  apiResult.forEach((r: any) => {
    const key = `${r.county_fips}-${r.state_code}`;
    apiDuplicates.set(key, (apiDuplicates.get(key) || 0) + 1);
  });

  const duplicateKeys = Array.from(apiDuplicates.entries()).filter(([_, count]) => count > 1);
  
  if (duplicateKeys.length === 0) {
    console.log(`✅ No duplicates in API result for IL (${apiResult.length} counties)\n`);
  } else {
    console.log(`⚠️  Found ${duplicateKeys.length} duplicate FIPS in API result:\n`);
    duplicateKeys.forEach(([key, count]) => {
      const [fips, state] = key.split('-');
      const matches = apiResult.filter((r: any) => r.county_fips === fips && r.state_code === state);
      console.log(`FIPS: ${fips} | State: ${state} | Count: ${count}`);
      matches.forEach((m: any) => {
        console.log(`  - ${m.county_name} | Score: ${m.median_score?.toFixed(2)} | ZIPs: ${m.zip_count}`);
      });
    });
  }

  // Show first 20 counties from API result
  console.log(`\n=== First 20 Counties from API Result (IL) ===\n`);
  apiResult.slice(0, 20).forEach((r: any) => {
    console.log(`${r.county_fips} | ${r.county_name.padEnd(30)} | Score: ${r.median_score?.toFixed(2) || 'NULL'} | ZIPs: ${r.zip_count}`);
  });
}

checkDuplicates().catch(console.error);
