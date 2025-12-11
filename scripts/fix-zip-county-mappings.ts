import { config } from 'dotenv';
import { execute, query, configureDatabase } from '../lib/db';

config();

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is required');
}
configureDatabase({ connectionString: process.env.POSTGRES_URL });

async function fixZipCountyMappings() {
  console.log('Fixing incorrect ZIP-county mappings...\n');

  // Fix 03804: York, NH -> Rockingham, NH
  await execute(`
    UPDATE zip_county_mapping
    SET county_name = 'Rockingham',
        state_name = 'New Hampshire'
    WHERE zip_code = '03804' 
      AND county_name = 'York' 
      AND state_code = 'NH'
  `);
  console.log('✅ Fixed ZIP 03804: York, NH -> Rockingham, NH');

  // Fix 45275: Boone, OH -> Hamilton, OH
  await execute(`
    UPDATE zip_county_mapping
    SET county_name = 'Hamilton',
        state_name = 'Ohio'
    WHERE zip_code = '45275' 
      AND county_name = 'Boone' 
      AND state_code = 'OH'
  `);
  console.log('✅ Fixed ZIP 45275: Boone, OH -> Hamilton, OH');

  // Fix Kenton, OH -> Kenton, KY (Kenton County is in KY, not OH)
  await execute(`
    UPDATE zip_county_mapping
    SET county_name = 'Kenton',
        state_code = 'KY',
        state_name = 'Kentucky'
    WHERE county_name = 'Kenton' 
      AND state_code = 'OH'
  `);
  const kentonUpdated = await query(`
    SELECT COUNT(*) as count 
    FROM zip_county_mapping 
    WHERE county_name = 'Kenton' AND state_code = 'OH'
  `);
  if (parseInt(kentonUpdated[0].count) === 0) {
    console.log('✅ Fixed Kenton, OH -> Kenton, KY');
  }

  // Remove Adams, SD mappings (Adams County doesn't exist in SD)
  // ZIP 57638 has multiple mappings including Corson and Perkins, so we'll remove just the Adams one
  await execute(`
    DELETE FROM zip_county_mapping
    WHERE county_name = 'Adams' 
      AND state_code = 'SD'
  `);
  const adamsRemoved = await query(`
    SELECT COUNT(*) as count 
    FROM zip_county_mapping 
    WHERE county_name = 'Adams' AND state_code = 'SD'
  `);
  if (parseInt(adamsRemoved[0].count) === 0) {
    console.log('✅ Removed incorrect Adams, SD mappings');
  }

  console.log('\n✅ ZIP-county mapping fixes applied!');
  console.log('\nNext steps:');
  console.log('  1. Re-run: bun run create-test-views');
  console.log('  2. Check the test-coverage page to verify fixes');
}

fixZipCountyMappings()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error fixing mappings:', error);
    process.exit(1);
  });

