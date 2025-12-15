#!/usr/bin/env bun

import { config } from 'dotenv';
import { configureDatabase, query } from '../lib/db';

config();

async function countFIPS() {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  console.log('\n=== Unique FIPS Code Counts ===\n');

  const results = await Promise.all([
    query('SELECT COUNT(DISTINCT county_code) as count FROM fmr_data WHERE county_code IS NOT NULL AND LENGTH(TRIM(county_code)) = 5'),
    query('SELECT COUNT(DISTINCT county_fips) as count FROM fmr_county_metro WHERE county_fips IS NOT NULL AND LENGTH(TRIM(county_fips)) = 5'),
    query('SELECT COUNT(DISTINCT county_fips) as count FROM zip_county_mapping WHERE county_fips IS NOT NULL AND LENGTH(TRIM(county_fips)) = 5'),
    query('SELECT COUNT(DISTINCT county_fips) as count FROM investment_score WHERE county_fips IS NOT NULL AND LENGTH(TRIM(county_fips)) = 5'),
    query('SELECT COUNT(DISTINCT county_fips) as count FROM zhvi_rollup_monthly WHERE county_fips IS NOT NULL AND LENGTH(TRIM(county_fips)) = 5'),
    query(`
      SELECT COUNT(DISTINCT fips) as count FROM (
        SELECT county_fips as fips FROM fmr_county_metro WHERE county_fips IS NOT NULL AND LENGTH(TRIM(county_fips)) = 5
        UNION
        SELECT county_code::text as fips FROM fmr_data WHERE county_code IS NOT NULL AND LENGTH(TRIM(county_code)) = 5
        UNION
        SELECT county_fips as fips FROM zip_county_mapping WHERE county_fips IS NOT NULL AND LENGTH(TRIM(county_fips)) = 5
        UNION
        SELECT county_fips as fips FROM investment_score WHERE county_fips IS NOT NULL AND LENGTH(TRIM(county_fips)) = 5
        UNION
        SELECT county_fips as fips FROM zhvi_rollup_monthly WHERE county_fips IS NOT NULL AND LENGTH(TRIM(county_fips)) = 5
      ) as all_fips
    `)
  ]);

  console.log('fmr_data.county_code:', results[0][0]?.count || 0);
  console.log('fmr_county_metro.county_fips:', results[1][0]?.count || 0);
  console.log('zip_county_mapping.county_fips:', results[2][0]?.count || 0);
  console.log('investment_score.county_fips:', results[3][0]?.count || 0);
  console.log('zhvi_rollup_monthly.county_fips:', results[4][0]?.count || 0);
  console.log('\nTOTAL UNIQUE FIPS (across all tables):', results[5][0]?.count || 0);
  console.log('\nNote: There are ~3,143 counties in the US\n');
}

countFIPS().catch(console.error);
