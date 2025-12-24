import { config } from 'dotenv';
import { query, configureDatabase } from '../lib/db';

config();

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is required');
}
configureDatabase({ connectionString: process.env.POSTGRES_URL });

async function debugSeattle() {
  const year = 2026;
  
  console.log('=== Debugging Seattle SAFMR Matching ===\n');
  
  // 1. Check if Seattle-Bellevue metro area exists in FMR data
  console.log('1. Checking for Seattle-Bellevue metro area in FMR data...');
  const seattleMetro = await query(`
    SELECT DISTINCT area_name, state_code, area_type
    FROM fmr_data
    WHERE year = $1
      AND area_type = 'metropolitan'
      AND (area_name ILIKE '%seattle%' OR area_name ILIKE '%bellevue%')
    ORDER BY area_name
  `, [year]);
  
  console.log(`Found ${seattleMetro.length} metro areas:`);
  seattleMetro.forEach(area => {
    console.log(`  - ${area.area_name}, ${area.state_code}`);
  });
  
  if (seattleMetro.length === 0) {
    console.log('\n⚠️  No Seattle metro area found!');
    return;
  }
  
  // 2. Check King County ZIPs
  console.log('\n2. Checking King County ZIPs...');
  const kingZips = await query(`
    SELECT COUNT(DISTINCT zip_code) as zip_count
    FROM zip_county_mapping
    WHERE state_code = 'WA'
      AND county_name ILIKE '%King%'
  `);
  
  console.log(`Found ${kingZips[0]?.zip_count || 0} ZIPs in King County`);
  
  // 3. Check which King County ZIPs have SAFMR data
  console.log('\n3. Checking King County ZIPs with SAFMR data...');
  const kingSafmrZips = await query(`
    SELECT COUNT(DISTINCT zcm.zip_code) as zip_count
    FROM zip_county_mapping zcm
    INNER JOIN safmr_data sd ON sd.zip_code = zcm.zip_code AND sd.year = $1
    WHERE zcm.state_code = 'WA'
      AND zcm.county_name ILIKE '%King%'
  `, [year]);
  
  console.log(`Found ${kingSafmrZips[0]?.zip_count || 0} King County ZIPs with SAFMR data`);
  
  // 4. Check if King County ZIPs are in required_safmr_zips
  console.log('\n4. Checking if King County ZIPs are in required_safmr_zips...');
  const kingRequiredZips = await query(`
    SELECT COUNT(DISTINCT zcm.zip_code) as zip_count
    FROM zip_county_mapping zcm
    INNER JOIN required_safmr_zips rsz ON rsz.zip_code = zcm.zip_code AND rsz.year = $1
    WHERE zcm.state_code = 'WA'
      AND zcm.county_name ILIKE '%King%'
  `, [year]);
  
  console.log(`Found ${kingRequiredZips[0]?.zip_count || 0} King County ZIPs in required_safmr_zips`);
  
  // 5. Test the matching logic
  console.log('\n5. Testing matching logic...');
  const metroArea = seattleMetro[0];
  console.log(`Testing match: "${metroArea.area_name}" with "King County"`);
  
  const testMatch = await query(`
    SELECT COUNT(DISTINCT zcm.zip_code) as zip_count
    FROM zip_county_mapping zcm
    WHERE zcm.state_code = $1
      AND zcm.county_name ILIKE '%King%'
      AND EXISTS (
        SELECT 1
        FROM fmr_data fd
        WHERE fd.area_name = $2
          AND fd.state_code = $1
          AND fd.year = $3
          AND (
            normalize_accents(fd.area_name) ILIKE '%' || normalize_accents(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(zcm.county_name, ' County', ''), ' Municipio', ''), ' Municipality', ''), ' Island', ''), ' ', '')) || '%'
            OR normalize_accents(fd.area_name) ILIKE '%' || normalize_accents(REPLACE(REPLACE(REPLACE(REPLACE(zcm.county_name, ' County', ''), ' Municipio', ''), ' Municipality', ''), ' Island', '')) || '%'
          )
      )
  `, [metroArea.state_code, metroArea.area_name, year]);
  
  console.log(`Current matching logic finds: ${testMatch[0]?.zip_count || 0} ZIPs`);
  
  // 6. Check what counties are actually in the Seattle metro area FMR data
  console.log('\n6. Checking what counties are associated with Seattle metro area in FMR data...');
  const metroCounties = await query(`
    SELECT DISTINCT area_name, state_code
    FROM fmr_data
    WHERE year = $1
      AND area_type = 'county'
      AND state_code = 'WA'
      AND EXISTS (
        SELECT 1
        FROM fmr_data fd2
        WHERE fd2.year = $1
          AND fd2.area_type = 'metropolitan'
          AND fd2.area_name = $2
          AND fd2.state_code = 'WA'
          AND (
            normalize_accents(fd2.area_name) ILIKE '%' || normalize_accents(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(fmr_data.area_name, ' County', ''), ' Municipio', ''), ' Municipality', ''), ' Island', ''), ' ', '')) || '%'
            OR normalize_accents(fd2.area_name) ILIKE '%' || normalize_accents(REPLACE(REPLACE(REPLACE(REPLACE(fmr_data.area_name, ' County', ''), ' Municipio', ''), ' Municipality', ''), ' Island', '')) || '%'
          )
      )
    ORDER BY area_name
  `, [year, metroArea.area_name]);
  
  console.log(`Found ${metroCounties.length} counties that match Seattle metro area:`);
  metroCounties.forEach(county => {
    console.log(`  - ${county.area_name}`);
  });
  
  // 7. Sample some King County ZIPs with SAFMR data
  console.log('\n7. Sample King County ZIPs with SAFMR data:');
  const sampleZips = await query(`
    SELECT DISTINCT zcm.zip_code, zcm.county_name
    FROM zip_county_mapping zcm
    INNER JOIN safmr_data sd ON sd.zip_code = zcm.zip_code AND sd.year = $1
    WHERE zcm.state_code = 'WA'
      AND zcm.county_name ILIKE '%King%'
    LIMIT 10
  `, [year]);
  
  sampleZips.forEach(row => {
    console.log(`  - ${row.zip_code} (${row.county_name})`);
  });
}

if (import.meta.main) {
  debugSeattle()
    .then(() => {
      console.log('\nDone!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}





