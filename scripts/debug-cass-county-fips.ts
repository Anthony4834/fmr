import { sql } from '@vercel/postgres';

async function debugCassCountyFIPS() {
  console.log('\n=== Debugging Cass County FIPS Issues ===\n');

  // Check what FIPS codes are associated with "Cass County" in zip_county_mapping
  console.log('1. ZIP codes mapped to "Cass County" in zip_county_mapping:\n');
  const cassMappings = await sql.query(
    `
    SELECT 
      zip_code,
      county_name,
      county_fips,
      state_code,
      state_name
    FROM zip_county_mapping
    WHERE county_name ILIKE '%cass%'
      AND state_code = 'IL'
    ORDER BY county_fips, zip_code
    `
  );

  console.log('ZIP | County Name | FIPS | State');
  console.log('-'.repeat(60));
  for (const row of cassMappings.rows) {
    console.log(
      `${String(row.zip_code).padStart(5)} | ${String(row.county_name).padEnd(30)} | ${String(row.county_fips || 'NULL').padStart(5)} | ${row.state_code}`
    );
  }

  // Check what FIPS codes appear in investment_score for "Cass County"
  console.log('\n\n2. FIPS codes in investment_score for "Cass County" (IL):\n');
  const cassScores = await sql.query(
    `
    SELECT DISTINCT
      county_fips,
      county_name,
      state_code,
      COUNT(DISTINCT zip_code) as zip_count
    FROM investment_score
    WHERE county_name ILIKE '%cass%'
      AND state_code = 'IL'
      AND fmr_year = 2026
    GROUP BY county_fips, county_name, state_code
    ORDER BY county_fips
    `
  );

  console.log('FIPS | County Name | State | ZIP Count');
  console.log('-'.repeat(50));
  for (const row of cassScores.rows) {
    console.log(
      `${String(row.county_fips || 'NULL').padStart(5)} | ${String(row.county_name).padEnd(30)} | ${row.state_code} | ${String(row.zip_count).padStart(8)}`
    );
  }

  // Check which ZIP codes from investment_score have wrong FIPS
  console.log('\n\n3. ZIP codes in investment_score with "Cass County" but wrong FIPS (should be 17017):\n');
  const wrongFips = await sql.query(
    `
    SELECT DISTINCT
      isc.zip_code,
      isc.county_name,
      isc.county_fips,
      isc.state_code,
      zcm.county_fips as correct_fips
    FROM investment_score isc
    LEFT JOIN zip_county_mapping zcm ON 
      zcm.zip_code = isc.zip_code 
      AND zcm.county_name = isc.county_name
      AND zcm.state_code = isc.state_code
    WHERE isc.county_name ILIKE '%cass%'
      AND isc.state_code = 'IL'
      AND isc.fmr_year = 2026
      AND isc.county_fips IS NOT NULL
      AND isc.county_fips != '17017'
      AND zcm.county_fips IS NOT NULL
    ORDER BY isc.county_fips, isc.zip_code
    LIMIT 50
    `
  );

  if (wrongFips.rows.length > 0) {
    console.log('ZIP | County Name | Wrong FIPS | Correct FIPS (from zip_county_mapping)');
    console.log('-'.repeat(70));
    for (const row of wrongFips.rows) {
      console.log(
        `${String(row.zip_code).padStart(5)} | ${String(row.county_name).padEnd(30)} | ${String(row.county_fips).padStart(10)} | ${String(row.correct_fips || 'NULL').padStart(20)}`
      );
    }
  } else {
    console.log('No ZIP codes found with wrong FIPS.');
  }

  // Check what the correct FIPS should be for Cass County
  console.log('\n\n4. Checking what FIPS codes are in zip_county_mapping for Cass County ZIPs:\n');
  const fipsDistribution = await sql.query(
    `
    SELECT 
      county_fips,
      COUNT(*) as zip_count,
      COUNT(DISTINCT zip_code) as unique_zips
    FROM zip_county_mapping
    WHERE county_name ILIKE '%cass%'
      AND state_code = 'IL'
    GROUP BY county_fips
    ORDER BY zip_count DESC
    `
  );

  console.log('FIPS | ZIP Count | Unique ZIPs');
  console.log('-'.repeat(40));
  for (const row of fipsDistribution.rows) {
    console.log(
      `${String(row.county_fips || 'NULL').padStart(5)} | ${String(row.zip_count).padStart(9)} | ${String(row.unique_zips).padStart(12)}`
    );
  }

  // Check if there are ZIP codes that appear in multiple FIPS for Cass County
  console.log('\n\n5. ZIP codes that appear with multiple FIPS codes for Cass County:\n');
  const multiFips = await sql.query(
    `
    SELECT 
      zip_code,
      COUNT(DISTINCT county_fips) as fips_count,
      STRING_AGG(DISTINCT county_fips, ', ' ORDER BY county_fips) as fips_list
    FROM zip_county_mapping
    WHERE county_name ILIKE '%cass%'
      AND state_code = 'IL'
    GROUP BY zip_code
    HAVING COUNT(DISTINCT county_fips) > 1
    ORDER BY zip_code
    `
  );

  if (multiFips.rows.length > 0) {
    console.log('ZIP | FIPS Count | FIPS List');
    console.log('-'.repeat(50));
    for (const row of multiFips.rows) {
      console.log(
        `${String(row.zip_code).padStart(5)} | ${String(row.fips_count).padStart(10)} | ${row.fips_list}`
      );
    }
  } else {
    console.log('No ZIP codes found with multiple FIPS codes.');
  }

  console.log('\n=== End of Debug Report ===\n');
  process.exit(0);
}

debugCassCountyFIPS().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
