/**
 * Investigate duplicate counties in investment_score table
 * 
 * Run with: bun scripts/investigate-county-duplicates.ts
 */

import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '../lib/queries';

async function investigateDuplicates() {
  const year = await getLatestFMRYear();
  console.log(`\n=== Investigating County Duplicates (Year: ${year}) ===\n`);

  // Check 1: Are there multiple county_name values for the same FIPS+state?
  console.log('1. Checking for multiple county_name values per FIPS+state:');
  const nameVariations = await sql.query(
    `
    SELECT 
      county_fips,
      state_code,
      COUNT(DISTINCT county_name) as name_count,
      STRING_AGG(DISTINCT county_name, ', ' ORDER BY county_name) as county_names
    FROM investment_score
    WHERE fmr_year = $1
      AND county_fips IS NOT NULL
      AND LENGTH(TRIM(county_fips)) = 5
      AND state_code IS NOT NULL
      AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
    GROUP BY county_fips, state_code
    HAVING COUNT(DISTINCT county_name) > 1
    ORDER BY name_count DESC, state_code, county_fips
    LIMIT 20
    `,
    [year]
  );

  if (nameVariations.rows.length > 0) {
    console.log(`Found ${nameVariations.rows.length} FIPS+state combinations with multiple county_name values:\n`);
    nameVariations.rows.forEach((row: any) => {
      console.log(`  FIPS: ${row.county_fips}, State: ${row.state_code}`);
      console.log(`    Names (${row.name_count}): ${row.county_names}`);
    });
  } else {
    console.log('  ✓ No multiple county_name values found for same FIPS+state\n');
  }

  // Check 2: Are there duplicate FIPS codes across different states? (shouldn't happen)
  console.log('\n2. Checking for duplicate FIPS codes across states:');
  const duplicateFips = await sql.query(
    `
    SELECT 
      county_fips,
      COUNT(DISTINCT state_code) as state_count,
      STRING_AGG(DISTINCT state_code, ', ' ORDER BY state_code) as states
    FROM investment_score
    WHERE fmr_year = $1
      AND county_fips IS NOT NULL
      AND LENGTH(TRIM(county_fips)) = 5
      AND state_code IS NOT NULL
      AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
    GROUP BY county_fips
    HAVING COUNT(DISTINCT state_code) > 1
    ORDER BY state_count DESC, county_fips
    LIMIT 20
    `,
    [year]
  );

  if (duplicateFips.rows.length > 0) {
    console.log(`Found ${duplicateFips.rows.length} FIPS codes appearing in multiple states:\n`);
    duplicateFips.rows.forEach((row: any) => {
      console.log(`  FIPS: ${row.county_fips} appears in ${row.state_count} states: ${row.states}`);
    });
  } else {
    console.log('  ✓ No duplicate FIPS codes across states\n');
  }

  // Check 3: Sample data for a specific state to see what's happening
  console.log('\n3. Sample data for states with potential issues:');
  const sampleStates = await sql.query(
    `
    SELECT DISTINCT state_code
    FROM investment_score
    WHERE fmr_year = $1
      AND county_fips IS NOT NULL
      AND LENGTH(TRIM(county_fips)) = 5
      AND state_code IS NOT NULL
      AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
    ORDER BY state_code
    LIMIT 5
    `,
    [year]
  );

  for (const stateRow of sampleStates.rows.slice(0, 3)) {
    const stateCode = stateRow.state_code;
    console.log(`\n  State: ${stateCode}`);
    
    const stateData = await sql.query(
      `
      SELECT 
        county_fips,
        county_name,
        COUNT(*) as zip_count,
        COUNT(DISTINCT county_name) as name_variations
      FROM investment_score
      WHERE fmr_year = $1
        AND state_code = $2
        AND county_fips IS NOT NULL
        AND LENGTH(TRIM(county_fips)) = 5
        AND data_sufficient = true
      GROUP BY county_fips, county_name
      ORDER BY county_fips, zip_count DESC
      LIMIT 10
      `,
      [year, stateCode]
    );

    console.log(`    Found ${stateData.rows.length} county entries:`);
    stateData.rows.forEach((row: any) => {
      console.log(`      FIPS: ${String(row.county_fips).padStart(5, '0')}, Name: "${row.county_name}", ZIPs: ${row.zip_count}`);
    });
  }

  // Check 4: What does the current query return?
  console.log('\n\n4. Testing current query result:');
  const currentQuery = await sql.query(
    `
    WITH county_scores AS (
      SELECT 
        county_fips,
        state_code,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median_score,
        AVG(score) as avg_score,
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
    SELECT 
      cs.county_fips,
      COALESCE(cn.county_name, 'Unknown County') as county_name,
      cs.state_code,
      cs.median_score,
      cs.zip_count
    FROM county_scores cs
    LEFT JOIN county_names cn ON cs.county_fips = cn.county_fips AND cs.state_code = cn.state_code
    ORDER BY cs.state_code, cn.county_name
    LIMIT 50
    `,
    [year]
  );

  // Check for duplicates in the result
  const fipsCount = new Map<string, number>();
  currentQuery.rows.forEach((row: any) => {
    const fips = String(row.county_fips).padStart(5, '0');
    fipsCount.set(fips, (fipsCount.get(fips) || 0) + 1);
  });

  const duplicates = Array.from(fipsCount.entries()).filter(([_, count]) => count > 1);
  if (duplicates.length > 0) {
    console.log(`\n  ⚠️ Found ${duplicates.length} FIPS codes appearing multiple times in query result:`);
    duplicates.forEach(([fips, count]) => {
      const rows = currentQuery.rows.filter((r: any) => String(r.county_fips).padStart(5, '0') === fips);
      console.log(`\n    FIPS ${fips} appears ${count} times:`);
      rows.forEach((r: any) => {
        console.log(`      - ${r.county_name}, ${r.state_code}, ZIPs: ${r.zip_count}`);
      });
    });
  } else {
    console.log('  ✓ No duplicates found in query result (first 50 rows)');
  }

  console.log('\n=== Investigation Complete ===\n');
  process.exit(0);
}

investigateDuplicates().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});





