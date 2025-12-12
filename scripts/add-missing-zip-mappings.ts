#!/usr/bin/env bun

/**
 * Add Missing ZIP Code County Mappings
 * 
 * Manually adds specific ZIP code to county mappings that are missing from the database.
 */

import { config } from 'dotenv';
import { configureDatabase, execute, query } from '../lib/db';
import { normalizeZipCode, normalizeStateCode } from '../lib/ingestion-utils';

config();

interface ZIPMapping {
  zipCode: string;
  countyName: string;
  stateCode: string;
  stateName: string;
  countyFips: string;
}

// Manually curated mappings for missing ZIP codes
const missingMappings: ZIPMapping[] = [
  {
    zipCode: '32072',
    countyName: 'Baker',
    stateCode: 'FL',
    stateName: 'Florida',
    countyFips: '12003'
  },
  {
    zipCode: '72017',
    countyName: 'Prairie',
    stateCode: 'AR',
    stateName: 'Arkansas',
    countyFips: '5117'
  },
  {
    zipCode: '72028',
    countyName: 'Choctaw',
    stateCode: 'AR',
    stateName: 'Arkansas',
    countyFips: '5141'
  },
  {
    zipCode: '72072',
    countyName: 'Lonoke',
    stateCode: 'AR',
    stateName: 'Arkansas',
    countyFips: '5069'
  },
  {
    zipCode: '72072',
    countyName: 'Prairie',
    stateCode: 'AR',
    stateName: 'Arkansas',
    countyFips: '5085'
  },
  {
    zipCode: '72475',
    countyName: 'Poinsett',
    stateCode: 'AR',
    stateName: 'Arkansas',
    countyFips: '5111'
  },
  {
    zipCode: '81243',
    countyName: 'Gunnison',
    stateCode: 'CO',
    stateName: 'Colorado',
    countyFips: '8051'
  }
];

async function addMissingMappings() {
  console.log('\n=== Adding Missing ZIP Code County Mappings ===\n');

  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  const results: Array<{
    zipCode: string;
    countyName: string;
    success: boolean;
    error?: string;
  }> = [];

  for (const mapping of missingMappings) {
    try {
      // Normalize values
      const zipCode = normalizeZipCode(mapping.zipCode);
      const stateCode = normalizeStateCode(mapping.stateCode);
      const countyFips = mapping.countyFips.length > 5 
        ? mapping.countyFips.substring(0, 5) 
        : mapping.countyFips;

      // Check if already exists
      const existing = await query(
        `SELECT * FROM zip_county_mapping 
         WHERE zip_code = $1 AND county_name = $2 AND state_code = $3`,
        [zipCode, mapping.countyName, stateCode]
      );

      if (existing.length > 0) {
        console.log(`  ⚠️  ${zipCode} (${mapping.countyName}, ${stateCode}): Already exists`);
        results.push({
          zipCode,
          countyName: mapping.countyName,
          success: true
        });
        continue;
      }

      // Insert the mapping
      await execute(
        `INSERT INTO zip_county_mapping (zip_code, county_name, state_code, state_name, county_fips)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (zip_code, county_name, state_code) DO UPDATE SET
           state_name = EXCLUDED.state_name,
           county_fips = EXCLUDED.county_fips`,
        [zipCode, mapping.countyName, stateCode, mapping.stateName, countyFips]
      );

      console.log(`  ✓ ${zipCode}: ${mapping.countyName} County, ${stateCode} (FIPS: ${countyFips})`);
      results.push({
        zipCode,
        countyName: mapping.countyName,
        success: true
      });
    } catch (error: any) {
      console.log(`  ✗ ${mapping.zipCode}: Error - ${error.message}`);
      results.push({
        zipCode: mapping.zipCode,
        countyName: mapping.countyName,
        success: false,
        error: error.message
      });
    }
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Total processed: ${results.length}`);
  console.log(`Successful: ${results.filter(r => r.success).length}`);
  console.log(`Failed: ${results.filter(r => !r.success).length}`);

  // Verify the ZIPs are now in the database
  console.log('\n=== Verification ===');
  const zipCodes = [...new Set(missingMappings.map(m => m.zipCode))];
  for (const zipCode of zipCodes) {
    const count = await query(
      'SELECT COUNT(*) as count FROM zip_county_mapping WHERE zip_code = $1',
      [zipCode]
    );
    console.log(`  ${zipCode}: ${count[0].count} county mapping(s)`);
  }

  console.log('\n✅ Done!\n');
}

// Run the script
addMissingMappings().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});



