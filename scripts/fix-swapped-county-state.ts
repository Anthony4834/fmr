#!/usr/bin/env bun

/**
 * Fix Swapped County/State Entries
 * 
 * Finds and deletes entries where county_name is a 2-letter state code
 * and state_code is something else (indicating swapped data).
 */

import { config } from 'dotenv';
import { configureDatabase, query, execute } from '../lib/db';

config();

// Valid US state codes
const validUSStates = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
  'PR', 'VI', 'GU', 'MP', 'AS'
];

async function fixSwappedEntries() {
  console.log('\n=== Finding Swapped County/State Entries ===\n');

  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  // Find entries where county_name is a valid state code (2 letters)
  // and state_code is different (indicating swapped data)
  const swappedEntries = await query(`
    SELECT zip_code, county_name, state_code, state_name
    FROM zip_county_mapping
    WHERE LENGTH(county_name) = 2
      AND county_name = UPPER(county_name)
      AND county_name IN (${validUSStates.map((_, i) => `$${i + 1}`).join(', ')})
      AND state_code != county_name
    ORDER BY zip_code, county_name
  `, validUSStates);

  console.log(`Found ${swappedEntries.length} potentially swapped entries:\n`);

  if (swappedEntries.length === 0) {
    console.log('✅ No swapped entries found!\n');
    return;
  }

  // Show first 20 examples
  console.log('Examples:');
  swappedEntries.slice(0, 20).forEach((entry, i) => {
    console.log(`  ${i + 1}. ZIP ${entry.zip_code}: county="${entry.county_name}", state="${entry.state_code}"`);
  });
  if (swappedEntries.length > 20) {
    console.log(`  ... and ${swappedEntries.length - 20} more`);
  }

  // Check if there are correct entries for these ZIPs
  console.log('\n=== Checking for Correct Entries ===\n');
  
  const zipCodes = [...new Set(swappedEntries.map(e => e.zip_code))];
  let deletedCount = 0;
  let keptCount = 0;

  for (const zipCode of zipCodes) {
    const swapped = swappedEntries.filter(e => e.zip_code === zipCode);
    const correct = await query(
      `SELECT zip_code, county_name, state_code, state_name
       FROM zip_county_mapping
       WHERE zip_code = $1
         AND (LENGTH(county_name) > 2 OR county_name NOT IN (${validUSStates.map((_, i) => `$${i + 2}`).join(', ')}))
         AND state_code IN (${validUSStates.map((_, i) => `$${i + 2}`).join(', ')})
       ORDER BY county_name`,
      [zipCode, ...validUSStates]
    );

    if (correct.length > 0) {
      // We have correct entries, delete the swapped ones
      for (const entry of swapped) {
        await execute(
          `DELETE FROM zip_county_mapping 
           WHERE zip_code = $1 AND county_name = $2 AND state_code = $3`,
          [entry.zip_code, entry.county_name, entry.state_code]
        );
        deletedCount++;
        console.log(`  ✓ Deleted: ZIP ${entry.zip_code} (county="${entry.county_name}", state="${entry.state_code}")`);
      }
    } else {
      // No correct entries found - might need manual review
      keptCount += swapped.length;
      console.log(`  ⚠️  Kept (no correct entry found): ZIP ${zipCode} - ${swapped.length} swapped entry(ies)`);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total swapped entries found: ${swappedEntries.length}`);
  console.log(`Deleted: ${deletedCount}`);
  console.log(`Kept (needs review): ${keptCount}`);
  console.log('\n✅ Done!\n');
}

// Run the script
fixSwappedEntries().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});









