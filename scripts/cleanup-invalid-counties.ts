#!/usr/bin/env bun

/**
 * Cleanup Invalid County Entries in zip_county_mapping
 * 
 * Removes entries from zip_county_mapping that have invalid state codes.
 * This will clean up entries created by the earlier parsing bug.
 * 
 * Usage:
 *   bun run scripts/cleanup-invalid-counties.ts [--dry-run]
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';

config();

async function cleanupInvalidCounties(dryRun: boolean = false): Promise<void> {
  console.log('\n=== Cleaning Up Invalid County Entries ===\n');
  
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }

  // Valid US state codes (50 states + DC + US territories)
  const validUSStates = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
    'PR', 'VI', 'GU', 'MP', 'AS' // US territories
  ];

  // Get count of invalid entries
  const countResult = await sql.query(
    `SELECT COUNT(*) as count
     FROM zip_county_mapping
     WHERE state_code NOT IN (${validUSStates.map((_, i) => `$${i + 1}`).join(', ')})`,
    validUSStates
  );
  
  const invalidCount = parseInt(countResult.rows[0].count);
  console.log(`Found ${invalidCount.toLocaleString()} entries with invalid state codes`);

  if (invalidCount === 0) {
    console.log('✅ No invalid entries found. Database is clean!\n');
    return;
  }

  // Get sample of invalid entries to show
  const sampleResult = await sql.query(
    `SELECT zip_code, county_name, state_code, state_name
     FROM zip_county_mapping
     WHERE state_code NOT IN (${validUSStates.map((_, i) => `$${i + 1}`).join(', ')})
     ORDER BY state_code, county_name
     LIMIT 10`,
    validUSStates
  );
  
  console.log('\nSample of invalid entries:');
  sampleResult.rows.forEach(row => {
    console.log(`  ZIP: ${row.zip_code}, County: ${row.county_name}, State: ${row.state_code}`);
  });

  if (dryRun) {
    console.log(`\n⚠️  DRY RUN: Would delete ${invalidCount.toLocaleString()} invalid entries`);
    console.log('Run without --dry-run to actually delete them.\n');
    return;
  }

  // Delete invalid entries
  console.log(`\n⚠️  Deleting ${invalidCount.toLocaleString()} invalid entries...`);
  
  const deleteResult = await sql.query(
    `DELETE FROM zip_county_mapping
     WHERE state_code NOT IN (${validUSStates.map((_, i) => `$${i + 1}`).join(', ')})`,
    validUSStates
  );
  
  console.log(`✅ Deleted ${invalidCount.toLocaleString()} invalid entries`);

  // Verify cleanup
  const verifyResult = await sql.query(
    `SELECT COUNT(*) as count
     FROM zip_county_mapping
     WHERE state_code NOT IN (${validUSStates.map((_, i) => `$${i + 1}`).join(', ')})`,
    validUSStates
  );
  
  const remainingInvalid = parseInt(verifyResult.rows[0].count);
  
  if (remainingInvalid === 0) {
    console.log('✅ All invalid entries cleaned up!\n');
  } else {
    console.log(`⚠️  Warning: ${remainingInvalid} invalid entries still remain\n`);
  }

  // Show final count
  const finalCount = await sql.query(`SELECT COUNT(*) as count FROM zip_county_mapping`);
  console.log(`Total ZIP-County mappings remaining: ${parseInt(finalCount.rows[0].count).toLocaleString()}\n`);
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-d');

  cleanupInvalidCounties(dryRun)
    .then(() => {
      console.log('Cleanup complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Cleanup failed:', error);
      process.exit(1);
    });
}

export { cleanupInvalidCounties };
