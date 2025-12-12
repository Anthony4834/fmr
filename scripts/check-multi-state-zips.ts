#!/usr/bin/env bun

/**
 * Check for ZIP Codes with Multiple Counties in Different States
 * 
 * Finds ZIP codes that have multiple county mappings where the counties
 * are in different states. This is usually a data quality issue.
 */

import { config } from 'dotenv';
import { configureDatabase, query } from '../lib/db';
import { writeFileSync } from 'fs';

config();

async function checkMultiStateZips() {
  console.log('\n=== Checking ZIP Codes with Multiple Counties in Different States ===\n');

  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  // Find ZIP codes with multiple counties in different states
  const multiStateZips = await query(`
    SELECT 
      zcm1.zip_code,
      COUNT(DISTINCT zcm1.state_code) as state_count,
      STRING_AGG(DISTINCT zcm1.state_code, ', ' ORDER BY zcm1.state_code) as states,
      COUNT(DISTINCT zcm1.county_name || ', ' || zcm1.state_code) as county_count,
      STRING_AGG(
        DISTINCT zcm1.county_name || ', ' || zcm1.state_code, 
        ' | ' 
        ORDER BY zcm1.county_name || ', ' || zcm1.state_code
      ) as counties
    FROM zip_county_mapping zcm1
    WHERE zcm1.state_code != 'PR'
    GROUP BY zcm1.zip_code
    HAVING COUNT(DISTINCT zcm1.state_code) > 1
    ORDER BY state_count DESC, zcm1.zip_code
  `);

  console.log(`Found ${multiStateZips.length} ZIP codes with counties in multiple states:\n`);

  if (multiStateZips.length === 0) {
    console.log('✅ No ZIP codes found with counties in multiple states!\n');
    return;
  }

  // Show first 30 examples
  console.log('Examples (first 30):');
  console.log('─'.repeat(100));
  multiStateZips.slice(0, 30).forEach((entry, i) => {
    console.log(`\n${i + 1}. ZIP ${entry.zip_code}:`);
    console.log(`   States: ${entry.states} (${entry.state_count} states)`);
    console.log(`   Counties: ${entry.counties}`);
  });
  if (multiStateZips.length > 30) {
    console.log(`\n... and ${multiStateZips.length - 30} more`);
  }

  // Also get all ZIP codes with multiple counties (for comparison)
  const allMultiCountyZips = await query(`
    SELECT 
      zip_code,
      COUNT(DISTINCT county_name || ', ' || state_code) as county_count,
      COUNT(DISTINCT state_code) as state_count,
      STRING_AGG(
        DISTINCT county_name || ', ' || state_code, 
        ' | ' 
        ORDER BY county_name || ', ' || state_code
      ) as counties
    FROM zip_county_mapping
    WHERE state_code != 'PR'
    GROUP BY zip_code
    HAVING COUNT(DISTINCT county_name || ', ' || state_code) > 1
    ORDER BY county_count DESC, zip_code
    LIMIT 100
  `);

  console.log('\n\n=== Statistics ===');
  console.log(`Total ZIP codes with multiple counties: ${allMultiCountyZips.length}+`);
  console.log(`ZIP codes with counties in multiple states: ${multiStateZips.length}`);
  console.log(`Percentage with multi-state issue: ${((multiStateZips.length / Math.min(allMultiCountyZips.length, 100)) * 100).toFixed(2)}%`);

  // Export to file
  const timestamp = Date.now();
  const filename = `zips-multi-state-${timestamp}.txt`;
  const lines = [
    'ZIP Code\tState Count\tStates\tCounty Count\tCounties',
    ...multiStateZips.map(entry => 
      `${entry.zip_code}\t${entry.state_count}\t${entry.states}\t${entry.county_count}\t${entry.counties.replace(/\t/g, ' ')}`
    )
  ];
  
  writeFileSync(filename, lines.join('\n'));
  console.log(`\n✅ Exported results to: ${filename}`);

  // Get detailed breakdown by state pairs
  console.log('\n=== Top State Pair Combinations ===');
  const statePairs = await query(`
    SELECT 
      LEAST(zcm1.state_code, zcm2.state_code) as state1,
      GREATEST(zcm1.state_code, zcm2.state_code) as state2,
      COUNT(DISTINCT zcm1.zip_code) as zip_count
    FROM zip_county_mapping zcm1
    INNER JOIN zip_county_mapping zcm2 
      ON zcm1.zip_code = zcm2.zip_code 
      AND zcm1.state_code < zcm2.state_code
    WHERE zcm1.state_code != 'PR' AND zcm2.state_code != 'PR'
    GROUP BY LEAST(zcm1.state_code, zcm2.state_code), GREATEST(zcm1.state_code, zcm2.state_code)
    ORDER BY zip_count DESC
    LIMIT 20
  `);

  statePairs.forEach((pair, i) => {
    console.log(`${i + 1}. ${pair.state1} ↔ ${pair.state2}: ${pair.zip_count} ZIP code(s)`);
  });

  console.log('\n✅ Done!\n');
}

// Run the script
checkMultiStateZips().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});



