import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '../lib/queries';

async function debugDuplicateCounties() {
  const stateCode = process.argv[2]?.toUpperCase() || 'IL';
  const year = process.argv[3] ? parseInt(process.argv[3], 10) : await getLatestFMRYear();

  console.log(`\n=== Debugging Duplicate Counties for ${stateCode}, Year ${year} ===\n`);

  // First, let's see all the distinct combinations
  console.log('1. Checking distinct FIPS codes and their variations:\n');
  const fipsCheck = await sql.query(
    `
    SELECT 
      county_fips,
      state_code,
      COUNT(DISTINCT county_name) as name_variations,
      COUNT(DISTINCT zhvi_month) as zhvi_month_variations,
      COUNT(DISTINCT acs_vintage) as acs_vintage_variations,
      COUNT(*) as total_rows,
      COUNT(DISTINCT (zhvi_month, acs_vintage)) as version_combinations
    FROM investment_score
    WHERE state_code = $1
      AND fmr_year = $2
      AND data_sufficient = true
      AND county_fips IS NOT NULL
      AND LENGTH(TRIM(county_fips)) = 5
    GROUP BY county_fips, state_code
    HAVING COUNT(*) > 0
    ORDER BY total_rows DESC, county_fips
    `,
    [stateCode, year]
  );

  console.log('FIPS | State | Name Variations | ZHVI Months | ACS Vintages | Total Rows | Version Combos');
  console.log('-'.repeat(100));
  for (const row of fipsCheck.rows) {
    console.log(
      `${String(row.county_fips).padStart(5)} | ${row.state_code} | ${String(row.name_variations).padStart(15)} | ${String(row.zhvi_month_variations).padStart(12)} | ${String(row.acs_vintage_variations).padStart(13)} | ${String(row.total_rows).padStart(10)} | ${String(row.version_combinations).padStart(14)}`
    );
  }

  // Check for FIPS with multiple name variations
  console.log('\n\n2. FIPS codes with multiple county_name variations:\n');
  const nameVariations = await sql.query(
    `
    SELECT 
      county_fips,
      state_code,
      county_name,
      COUNT(*) as row_count,
      COUNT(DISTINCT zhvi_month) as zhvi_months,
      COUNT(DISTINCT acs_vintage) as acs_vintages
    FROM investment_score
    WHERE state_code = $1
      AND fmr_year = $2
      AND data_sufficient = true
      AND county_fips IS NOT NULL
      AND LENGTH(TRIM(county_fips)) = 5
    GROUP BY county_fips, state_code, county_name
    HAVING county_fips IN (
      SELECT county_fips
      FROM investment_score
      WHERE state_code = $1
        AND fmr_year = $2
        AND data_sufficient = true
        AND county_fips IS NOT NULL
        AND LENGTH(TRIM(county_fips)) = 5
      GROUP BY county_fips, state_code
      HAVING COUNT(DISTINCT county_name) > 1
    )
    ORDER BY county_fips, county_name
    `,
    [stateCode, year]
  );

  if (nameVariations.rows.length > 0) {
    console.log('FIPS | State | County Name | Rows | ZHVI Months | ACS Vintages');
    console.log('-'.repeat(80));
    for (const row of nameVariations.rows) {
      console.log(
        `${String(row.county_fips).padStart(5)} | ${row.state_code} | ${String(row.county_name).padEnd(30)} | ${String(row.row_count).padStart(5)} | ${String(row.zhvi_months).padStart(12)} | ${String(row.acs_vintages).padStart(13)}`
      );
    }
  } else {
    console.log('No FIPS codes with multiple county_name variations found.');
  }

  // Check for FIPS with multiple data version combinations
  console.log('\n\n3. FIPS codes with multiple (zhvi_month, acs_vintage) combinations:\n');
  const versionCombos = await sql.query(
    `
    SELECT 
      county_fips,
      state_code,
      zhvi_month,
      acs_vintage,
      COUNT(*) as row_count,
      COUNT(DISTINCT county_name) as name_count,
      AVG(score) as avg_score,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median_score
    FROM investment_score
    WHERE state_code = $1
      AND fmr_year = $2
      AND data_sufficient = true
      AND county_fips IS NOT NULL
      AND LENGTH(TRIM(county_fips)) = 5
    GROUP BY county_fips, state_code, zhvi_month, acs_vintage
    HAVING county_fips IN (
      SELECT county_fips
      FROM investment_score
      WHERE state_code = $1
        AND fmr_year = $2
        AND data_sufficient = true
        AND county_fips IS NOT NULL
        AND LENGTH(TRIM(county_fips)) = 5
      GROUP BY county_fips, state_code
      HAVING COUNT(DISTINCT (zhvi_month, acs_vintage)) > 1
    )
    ORDER BY county_fips, zhvi_month DESC NULLS LAST, acs_vintage DESC NULLS LAST
    `,
    [stateCode, year]
  );

  if (versionCombos.rows.length > 0) {
    console.log('FIPS | State | ZHVI Month | ACS Vintage | Rows | Names | Avg Score | Median Score');
    console.log('-'.repeat(100));
    for (const row of versionCombos.rows) {
      const zhviStr = row.zhvi_month ? new Date(row.zhvi_month).toISOString().slice(0, 7) : 'NULL';
      const acsStr = row.acs_vintage ? String(row.acs_vintage) : 'NULL';
      console.log(
        `${String(row.county_fips).padStart(5)} | ${row.state_code} | ${zhviStr.padEnd(11)} | ${acsStr.padStart(12)} | ${String(row.row_count).padStart(5)} | ${String(row.name_count).padStart(5)} | ${String(Number(row.avg_score).toFixed(1)).padStart(9)} | ${String(Number(row.median_score).toFixed(1)).padStart(12)}`
      );
    }
  } else {
    console.log('No FIPS codes with multiple (zhvi_month, acs_vintage) combinations found.');
  }

  // Check what the current query would return
  console.log('\n\n4. What the current API query returns (after grouping):\n');
  const currentQuery = await sql.query(
    `
    WITH latest_versions AS (
      SELECT 
        MAX(zhvi_month) as latest_zhvi_month,
        MAX(acs_vintage) as latest_acs_vintage
      FROM investment_score
      WHERE state_code = $1
        AND fmr_year = $2
        AND data_sufficient = true
        AND county_fips IS NOT NULL
        AND LENGTH(TRIM(county_fips)) = 5
    ),
    filtered_data AS (
      SELECT 
        county_fips,
        state_code,
        county_name,
        score,
        computed_at
      FROM investment_score isc
      CROSS JOIN latest_versions lv
      WHERE isc.state_code = $1
        AND isc.fmr_year = $2
        AND isc.data_sufficient = true
        AND isc.county_fips IS NOT NULL
        AND LENGTH(TRIM(isc.county_fips)) = 5
        AND (
          (lv.latest_zhvi_month IS NULL AND isc.zhvi_month IS NULL) OR
          (lv.latest_zhvi_month IS NOT NULL AND isc.zhvi_month = lv.latest_zhvi_month)
        )
        AND (
          (lv.latest_acs_vintage IS NULL AND isc.acs_vintage IS NULL) OR
          (lv.latest_acs_vintage IS NOT NULL AND isc.acs_vintage = lv.latest_acs_vintage)
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
    `,
    [stateCode, year]
  );

  console.log('FIPS | County Name | State | Median Score | Avg Score | ZIP Count');
  console.log('-'.repeat(80));
  const fipsSeen = new Set<string>();
  for (const row of currentQuery.rows) {
    const fips = String(row.county_fips).padStart(5, '0');
    if (fipsSeen.has(fips)) {
      console.log(`⚠️  DUPLICATE: ${fips} | ${row.county_name} | ${row.state_code} | ${Number(row.median_score).toFixed(1)} | ${Number(row.avg_score).toFixed(1)} | ${row.zip_count}`);
    } else {
      fipsSeen.add(fips);
      console.log(
        `${fips} | ${String(row.county_name).padEnd(30)} | ${row.state_code} | ${String(Number(row.median_score).toFixed(1)).padStart(12)} | ${String(Number(row.avg_score).toFixed(1)).padStart(9)} | ${String(row.zip_count).padStart(9)}`
      );
    }
  }

  // Check for specific problematic counties
  console.log('\n\n5. Detailed breakdown for Cass County (IL) as example:\n');
  const cassDetail = await sql.query(
    `
    SELECT 
      county_fips,
      county_name,
      state_code,
      zhvi_month,
      acs_vintage,
      COUNT(*) as zip_count,
      AVG(score) as avg_score,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median_score,
      MIN(score) as min_score,
      MAX(score) as max_score
    FROM investment_score
    WHERE state_code = $1
      AND fmr_year = $2
      AND county_fips = '17017'
      AND data_sufficient = true
    GROUP BY county_fips, county_name, state_code, zhvi_month, acs_vintage
    ORDER BY zhvi_month DESC NULLS LAST, acs_vintage DESC NULLS LAST
    `,
    [stateCode, year]
  );

  if (cassDetail.rows.length > 0) {
    console.log('FIPS | County Name | State | ZHVI Month | ACS Vintage | ZIPs | Avg | Median | Min | Max');
    console.log('-'.repeat(100));
    for (const row of cassDetail.rows) {
      const zhviStr = row.zhvi_month ? new Date(row.zhvi_month).toISOString().slice(0, 7) : 'NULL';
      const acsStr = row.acs_vintage ? String(row.acs_vintage) : 'NULL';
      console.log(
        `${row.county_fips} | ${String(row.county_name).padEnd(30)} | ${row.state_code} | ${zhviStr.padEnd(11)} | ${acsStr.padStart(12)} | ${String(row.zip_count).padStart(4)} | ${Number(row.avg_score).toFixed(1).padStart(4)} | ${Number(row.median_score).toFixed(1).padStart(6)} | ${Number(row.min_score).toFixed(1).padStart(3)} | ${Number(row.max_score).toFixed(1).padStart(3)}`
      );
    }
  }

  console.log('\n=== End of Debug Report ===\n');
  process.exit(0);
}

debugDuplicateCounties().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
