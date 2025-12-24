#!/usr/bin/env bun

/**
 * Test the actual API response to verify it returns score_with_demand values
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '../lib/queries';

config();

async function testAPIResponse() {
  console.log(`\n=== Testing API Response Format ===\n`);

  const year = await getLatestFMRYear();
  console.log(`Year: ${year}\n`);

  // Simulate the exact API query
  const result = await sql.query(
    `
    WITH county_scores AS (
      SELECT 
        county_fips,
        state_code,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(score_with_demand, score)) as median_score,
        AVG(COALESCE(score_with_demand, score)) as avg_score,
        COUNT(*) as zip_count,
        AVG(net_yield) as avg_yield
      FROM investment_score
      WHERE fmr_year = $1
        AND data_sufficient = true
        AND county_fips IS NOT NULL
        AND LENGTH(TRIM(county_fips)) = 5
        AND state_code IS NOT NULL
        AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
      GROUP BY county_fips, state_code
      HAVING COUNT(*) > 0
    ),
    county_names AS (
      SELECT DISTINCT ON (county_fips, state_code)
        county_fips,
        state_code,
        county_name
      FROM investment_score
      WHERE fmr_year = $1
        AND county_fips IS NOT NULL
        AND LENGTH(TRIM(county_fips)) = 5
        AND state_code IS NOT NULL
        AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
      ORDER BY county_fips, state_code, county_name
    )
    SELECT DISTINCT ON (cs.county_fips, cs.state_code)
      cs.county_fips,
      COALESCE(cn.county_name, 'Unknown County') as county_name,
      cs.state_code,
      cs.median_score,
      cs.avg_score,
      cs.zip_count,
      cs.avg_yield
    FROM county_scores cs
    LEFT JOIN county_names cn ON cs.county_fips = cn.county_fips AND cs.state_code = cn.state_code
    WHERE cs.county_fips IN ('01017', '06001', '06003', '06007', '06009')
    ORDER BY cs.county_fips, cs.state_code, cs.zip_count DESC
    `,
    [year]
  );

  console.log(`Sample API Response (counties that should show color changes):\n`);
  
  for (const row of result.rows) {
    const fips = String(row.county_fips).padStart(5, '0');
    const median = row.median_score ? Number(row.median_score) : null;
    const color = median === null ? 'Gray' : 
                  median < 95 ? 'Red' : 
                  median < 130 ? 'Light Green' : 
                  'Dark Green';
    
    console.log(`  ${row.county_name}, ${row.state_code} (FIPS: ${fips}):`);
    console.log(`    medianScore: ${median?.toFixed(1) ?? 'null'}`);
    console.log(`    Color: ${color}`);
    console.log('');
  }

  // Also check what the old query would return
  console.log(`\nComparing with OLD query (using just 'score'):\n`);
  
  const oldResult = await sql.query(
    `
    WITH county_scores AS (
      SELECT 
        county_fips,
        state_code,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median_score,
        COUNT(*) as zip_count
      FROM investment_score
      WHERE fmr_year = $1
        AND data_sufficient = true
        AND county_fips IS NOT NULL
        AND LENGTH(TRIM(county_fips)) = 5
        AND state_code IS NOT NULL
        AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
      GROUP BY county_fips, state_code
      HAVING COUNT(*) > 0
    )
    SELECT 
      county_fips,
      state_code,
      median_score
    FROM county_scores
    WHERE county_fips IN ('01017', '06001', '06003', '06007', '06009')
    ORDER BY county_fips, state_code
    `,
    [year]
  );

  for (const row of oldResult.rows) {
    const fips = String(row.county_fips).padStart(5, '0');
    const median = row.median_score ? Number(row.median_score) : null;
    const color = median === null ? 'Gray' : 
                  median < 95 ? 'Red' : 
                  median < 130 ? 'Light Green' : 
                  'Dark Green';
    
    console.log(`  FIPS ${fips}:`);
    console.log(`    medianScore (OLD): ${median?.toFixed(1) ?? 'null'}`);
    console.log(`    Color (OLD): ${color}`);
    console.log('');
  }

  console.log(`✅ API test complete!\n`);
}

testAPIResponse()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });



