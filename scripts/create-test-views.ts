import { config } from 'dotenv';
import { execute, query, configureDatabase } from '../lib/db';

config();

// Configure database connection
if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is required');
}
configureDatabase({ connectionString: process.env.POSTGRES_URL });

async function createTestViews() {
  console.log('Creating test views for data coverage...\n');

  // Create a function to normalize accents (if it doesn't exist)
  await execute(`
    CREATE OR REPLACE FUNCTION normalize_accents(text)
    RETURNS text AS $$
    BEGIN
      RETURN translate(
        translate(
          translate(
            translate(
              translate($1, 'áéíóúñÁÉÍÓÚÑ', 'aeiounAEIOUN'),
              'àèìòùÀÈÌÒÙ', 'aeiouAEIOU'
            ),
            'âêîôûÂÊÎÔÛ', 'aeiouAEIOU'
          ),
          'äëïöüÄËÏÖÜ', 'aeiouAEIOU'
        ),
        'ãõÃÕ', 'aoAO'
      );
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);
  console.log('✅ Created normalize_accents function');

  // View: Cities without FMR data
  await execute(`
    CREATE OR REPLACE VIEW cities_without_fmr AS
    SELECT 
      c.city_name,
      c.state_code,
      c.state_name,
      c.zip_codes,
      CASE 
        WHEN EXISTS (
          SELECT 1 
          FROM safmr_data sd 
          WHERE sd.zip_code = ANY(c.zip_codes) 
          AND sd.year = 2026
        ) THEN true
        WHEN EXISTS (
          SELECT 1 
          FROM zip_county_mapping zcm
          JOIN fmr_data fd ON (
            (
              -- Normalize both sides and match (handles accents and spacing)
              -- Try with spaces removed (for LaSalle -> La Salle)
              normalize_accents(REPLACE(fd.area_name, ' ', '')) ILIKE '%' || normalize_accents(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(zcm.county_name, ' County', ''), ' Municipio', ''), ' Municipality', ''), ' Island', ''), ' ', '')) || '%'
              -- Try with spaces preserved
              OR normalize_accents(fd.area_name) ILIKE '%' || normalize_accents(REPLACE(REPLACE(REPLACE(REPLACE(zcm.county_name, ' County', ''), ' Municipio', ''), ' Municipality', ''), ' Island', '')) || '%'
              -- Special case for MP: match any MP ZIP to "Northern Mariana Islands"
              OR (zcm.state_code = 'MP' AND fd.area_name ILIKE '%Northern Mariana Islands%')
              -- Special case for DC: ZIPs mapped to DC but counties are in MD/VA
              OR (zcm.state_code = 'DC' AND (
                (zcm.county_name ILIKE '%Montgomery%' AND fd.state_code = 'MD' AND normalize_accents(fd.area_name) ILIKE '%montgomery%')
                OR (zcm.county_name ILIKE '%Fairfax%' AND fd.state_code = 'VA' AND normalize_accents(fd.area_name) ILIKE '%fairfax%')
                OR (zcm.county_name ILIKE '%Arlington%' AND fd.state_code = 'VA' AND normalize_accents(fd.area_name) ILIKE '%arlington%')
                OR (zcm.county_name ILIKE '%Prince George%' AND fd.state_code = 'MD' AND normalize_accents(fd.area_name) ILIKE '%prince george%')
              ))
            )
            AND (fd.state_code = zcm.state_code OR (zcm.state_code = 'DC' AND fd.state_code IN ('MD', 'VA')))
            AND fd.year = 2026
          )
          WHERE zcm.zip_code = ANY(c.zip_codes)
        ) THEN true
        ELSE false
      END as has_fmr_data
    FROM cities c
    ORDER BY has_fmr_data ASC, c.state_code, c.city_name;
  `);
  console.log('✅ Created view: cities_without_fmr');

  // View: ZIP codes without FMR data
  await execute(`
    CREATE OR REPLACE VIEW zips_without_fmr AS
    SELECT 
      zcm.zip_code,
      zcm.county_name,
      zcm.state_code,
      zcm.state_name,
      CASE 
        WHEN EXISTS (
          SELECT 1 
          FROM safmr_data sd 
          WHERE sd.zip_code = zcm.zip_code 
          AND sd.year = 2026
        ) THEN 'SAFMR'
        WHEN EXISTS (
          SELECT 1 
          FROM fmr_data fd 
          WHERE (
            -- Normalize both sides and match (handles accents and spacing)
            normalize_accents(fd.area_name) ILIKE '%' || normalize_accents(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(zcm.county_name, ' County', ''), ' Municipio', ''), ' Municipality', ''), ' Island', ''), ' ', '')) || '%'
            OR normalize_accents(fd.area_name) ILIKE '%' || normalize_accents(REPLACE(REPLACE(REPLACE(REPLACE(zcm.county_name, ' County', ''), ' Municipio', ''), ' Municipality', ''), ' Island', '')) || '%'
            -- Special case for MP: match any MP ZIP to "Northern Mariana Islands"
            OR (zcm.state_code = 'MP' AND fd.area_name ILIKE '%Northern Mariana Islands%')
            -- Special case for DC: ZIPs mapped to DC but counties are in MD/VA
            OR (zcm.state_code = 'DC' AND (
              (zcm.county_name ILIKE '%Montgomery%' AND fd.state_code = 'MD' AND normalize_accents(fd.area_name) ILIKE '%montgomery%')
              OR (zcm.county_name ILIKE '%Fairfax%' AND fd.state_code = 'VA' AND normalize_accents(fd.area_name) ILIKE '%fairfax%')
              OR (zcm.county_name ILIKE '%Arlington%' AND fd.state_code = 'VA' AND normalize_accents(fd.area_name) ILIKE '%arlington%')
              OR (zcm.county_name ILIKE '%Prince George%' AND fd.state_code = 'MD' AND normalize_accents(fd.area_name) ILIKE '%prince george%')
            ))
          )
          AND (fd.state_code = zcm.state_code OR (zcm.state_code = 'DC' AND fd.state_code IN ('MD', 'VA')))
          AND fd.year = 2026
        ) THEN 'FMR'
        ELSE 'NONE'
      END as fmr_source
    FROM zip_county_mapping zcm
    ORDER BY fmr_source ASC, zcm.state_code, zcm.zip_code;
  `);
  console.log('✅ Created view: zips_without_fmr');

  // View: Counties without FMR data
  await execute(`
    CREATE OR REPLACE VIEW counties_without_fmr AS
    SELECT DISTINCT
      zcm.county_name,
      zcm.state_code,
      zcm.state_name,
      COUNT(DISTINCT zcm.zip_code) as zip_count,
      CASE 
        WHEN EXISTS (
          SELECT 1 
          FROM fmr_data fd 
          WHERE (
            -- Normalize both sides and match (handles accents and spacing)
            -- Try with spaces removed from BOTH sides (for LaSalle -> La Salle)
            normalize_accents(REPLACE(fd.area_name, ' ', '')) ILIKE '%' || normalize_accents(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(zcm.county_name, ' County', ''), ' Municipio', ''), ' Municipality', ''), ' Island', ''), ' ', '')) || '%'
            -- Try with spaces preserved
            OR normalize_accents(fd.area_name) ILIKE '%' || normalize_accents(REPLACE(REPLACE(REPLACE(REPLACE(zcm.county_name, ' County', ''), ' Municipio', ''), ' Municipality', ''), ' Island', '')) || '%'
            -- Special case for MP: match any MP county to "Northern Mariana Islands"
            OR (zcm.state_code = 'MP' AND fd.area_name ILIKE '%Northern Mariana Islands%')
            -- Special case for DC: counties mapped to DC but exist in MD/VA
            OR (zcm.state_code = 'DC' AND (
              (zcm.county_name ILIKE '%Montgomery%' AND fd.state_code = 'MD' AND normalize_accents(fd.area_name) ILIKE '%montgomery%')
              OR (zcm.county_name ILIKE '%Fairfax%' AND fd.state_code = 'VA' AND normalize_accents(fd.area_name) ILIKE '%fairfax%')
              OR (zcm.county_name ILIKE '%Arlington%' AND fd.state_code = 'VA' AND normalize_accents(fd.area_name) ILIKE '%arlington%')
              OR (zcm.county_name ILIKE '%Prince George%' AND fd.state_code = 'MD' AND normalize_accents(fd.area_name) ILIKE '%prince george%')
            ))
          )
          AND (fd.state_code = zcm.state_code OR (zcm.state_code = 'DC' AND fd.state_code IN ('MD', 'VA')))
          AND fd.year = 2026
        ) THEN true
        ELSE false
      END as has_fmr_data
    FROM zip_county_mapping zcm
    GROUP BY zcm.county_name, zcm.state_code, zcm.state_name
    ORDER BY has_fmr_data ASC, zcm.state_code, zcm.county_name;
  `);
  console.log('✅ Created view: counties_without_fmr');

  // View: ZIP codes with problematic county mappings
  await execute(`
    CREATE OR REPLACE VIEW zip_county_mapping_issues AS
    WITH zip_mapping_counts AS (
      SELECT 
        zip_code,
        COUNT(*) as county_count,
        STRING_AGG(DISTINCT county_name || ', ' || state_code, '; ' ORDER BY county_name || ', ' || state_code) as counties
      FROM zip_county_mapping
      GROUP BY zip_code
    ),
    zips_without_mapping AS (
      SELECT DISTINCT
        sd.zip_code,
        0 as county_count,
        NULL::text as counties,
        'NO_MAPPING' as issue_type
      FROM safmr_data sd
      WHERE sd.year = 2026
        AND NOT EXISTS (
          SELECT 1 
          FROM zip_county_mapping zcm 
          WHERE zcm.zip_code = sd.zip_code
        )
    ),
    zips_with_multiple_mappings AS (
      SELECT 
        zip_code,
        county_count,
        counties,
        'MULTIPLE_MAPPINGS' as issue_type
      FROM zip_mapping_counts
      WHERE county_count > 1
    )
    SELECT zip_code, county_count, counties, issue_type
    FROM zips_without_mapping
    UNION ALL
    SELECT zip_code, county_count, counties, issue_type
    FROM zips_with_multiple_mappings
    ORDER BY issue_type, zip_code;
  `);
  console.log('✅ Created view: zip_county_mapping_issues');

  console.log('\n📊 View Statistics:');
  
  // Get counts
  const cityStats = await query(`
    SELECT 
      COUNT(*) as total_cities,
      COUNT(*) FILTER (WHERE has_fmr_data = false) as cities_without_fmr,
      COUNT(*) FILTER (WHERE has_fmr_data = true) as cities_with_fmr
    FROM cities_without_fmr
  `);
  
  const zipStats = await query(`
    SELECT 
      COUNT(*) as total_zips,
      COUNT(*) FILTER (WHERE fmr_source = 'NONE') as zips_without_fmr,
      COUNT(*) FILTER (WHERE fmr_source = 'SAFMR') as zips_with_safmr,
      COUNT(*) FILTER (WHERE fmr_source = 'FMR') as zips_with_fmr_only
    FROM zips_without_fmr
  `);
  
  const countyStats = await query(`
    SELECT 
      COUNT(*) as total_counties,
      COUNT(*) FILTER (WHERE has_fmr_data = false) as counties_without_fmr,
      COUNT(*) FILTER (WHERE has_fmr_data = true) as counties_with_fmr
    FROM counties_without_fmr
  `);
  
  const zipMappingStats = await query(`
    SELECT 
      COUNT(*) as total_issues,
      COUNT(*) FILTER (WHERE issue_type = 'NO_MAPPING') as zips_without_mapping,
      COUNT(*) FILTER (WHERE issue_type = 'MULTIPLE_MAPPINGS') as zips_with_multiple_mappings
    FROM zip_county_mapping_issues
  `);

  console.log('\nCities:');
  console.log(`  Total: ${cityStats[0]?.total_cities || 0}`);
  console.log(`  With FMR: ${cityStats[0]?.cities_with_fmr || 0}`);
  console.log(`  Without FMR: ${cityStats[0]?.cities_without_fmr || 0}`);
  
  console.log('\nZIP Codes:');
  console.log(`  Total: ${zipStats[0]?.total_zips || 0}`);
  console.log(`  With SAFMR: ${zipStats[0]?.zips_with_safmr || 0}`);
  console.log(`  With FMR only: ${zipStats[0]?.zips_with_fmr_only || 0}`);
  console.log(`  Without FMR: ${zipStats[0]?.zips_without_fmr || 0}`);
  
  console.log('\nCounties:');
  console.log(`  Total: ${countyStats[0]?.total_counties || 0}`);
  console.log(`  With FMR: ${countyStats[0]?.counties_with_fmr || 0}`);
  console.log(`  Without FMR: ${countyStats[0]?.counties_without_fmr || 0}`);
  
  console.log('\nZIP County Mapping Issues:');
  console.log(`  Total Issues: ${zipMappingStats[0]?.total_issues || 0}`);
  console.log(`  ZIPs Without Mapping: ${zipMappingStats[0]?.zips_without_mapping || 0}`);
  console.log(`  ZIPs With Multiple Mappings: ${zipMappingStats[0]?.zips_with_multiple_mappings || 0}`);
  
  console.log('\n✅ Test views created successfully!');
  console.log('\nTo query missing data:');
  console.log('  SELECT * FROM cities_without_fmr WHERE has_fmr_data = false LIMIT 10;');
  console.log('  SELECT * FROM zips_without_fmr WHERE fmr_source = \'NONE\' LIMIT 10;');
  console.log('  SELECT * FROM counties_without_fmr WHERE has_fmr_data = false LIMIT 10;');
  console.log('  SELECT * FROM zip_county_mapping_issues LIMIT 10;');
}

createTestViews()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error creating views:', error);
    process.exit(1);
  });

