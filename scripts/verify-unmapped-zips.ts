#!/usr/bin/env bun

/**
 * Verify Unmapped ZIP Codes
 * 
 * Checks if unmapped ZIP codes are valid by:
 * - Checking if they exist in SAFMR data
 * - Verifying ZIP code format
 * - Checking for patterns that might indicate data issues
 * 
 * Usage:
 *   bun scripts/verify-unmapped-zips.ts [--limit 100]
 */

import { config } from 'dotenv';
import { configureDatabase, query } from '../lib/db';

config();

async function verifyUnmappedZips() {
  const args = process.argv.slice(2);
  let limit = 100;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1]);
      i++;
    }
  }

  console.log('\n=== Verifying Unmapped ZIP Codes ===\n');

  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  // Get sample of unmapped ZIPs with their SAFMR data
  console.log(`Fetching ${limit} unmapped ZIPs with SAFMR data...\n`);
  
  const unmappedZips = await query(`
    SELECT 
      sd.zip_code,
      sd.bedroom_0,
      sd.bedroom_1,
      sd.bedroom_2,
      sd.bedroom_3,
      sd.bedroom_4,
      CASE 
        WHEN sd.zip_code LIKE '0%' THEN 'MA, RI, NH, ME, VT, CT'
        WHEN sd.zip_code LIKE '1%' THEN 'NY, PA'
        WHEN sd.zip_code LIKE '2%' THEN 'VA, WV, KY, MD, NC, SC, TN, DE'
        WHEN sd.zip_code LIKE '3%' THEN 'FL, GA, AL, MS, LA, AR, TN'
        WHEN sd.zip_code LIKE '4%' THEN 'IN, KY, MI, OH'
        WHEN sd.zip_code LIKE '5%' THEN 'MN, IA, MO, ND, SD, WI, MT'
        WHEN sd.zip_code LIKE '6%' THEN 'IL, KS, MO, NE'
        WHEN sd.zip_code LIKE '7%' THEN 'TX, AR, LA, OK'
        WHEN sd.zip_code LIKE '8%' THEN 'CO, ID, UT, AZ, NM, NV, WY'
        WHEN sd.zip_code LIKE '9%' THEN 'CA, OR, WA, AK, HI'
        ELSE 'Unknown'
      END as likely_region
    FROM safmr_data sd
    WHERE sd.year = 2026
      AND NOT EXISTS (
        SELECT 1 FROM zip_county_mapping zcm WHERE zcm.zip_code = sd.zip_code
      )
    ORDER BY sd.zip_code
    LIMIT ${limit}
  `);

  console.log(`Found ${unmappedZips.length} unmapped ZIPs\n`);

  // Analyze patterns
  const regions = new Map<string, number>();
  const hasData = { withData: 0, withoutData: 0 };
  
  for (const zip of unmappedZips) {
    const region = zip.likely_region;
    regions.set(region, (regions.get(region) || 0) + 1);
    
    // Check if ZIP has FMR data
    const hasFmrData = zip.bedroom_0 || zip.bedroom_1 || zip.bedroom_2 || 
                       zip.bedroom_3 || zip.bedroom_4;
    if (hasFmrData) {
      hasData.withData++;
    } else {
      hasData.withoutData++;
    }
  }

  console.log('📊 Analysis:\n');
  console.log(`  ZIPs with FMR data: ${hasData.withData}`);
  console.log(`  ZIPs without FMR data: ${hasData.withoutData}`);
  
  console.log('\n🗺️  Regional Distribution (sample):');
  const sortedRegions = Array.from(regions.entries())
    .sort((a, b) => b[1] - a[1]);
  for (const [region, count] of sortedRegions) {
    console.log(`    ${region}: ${count} ZIPs`);
  }

  // Show sample ZIPs
  console.log('\n📋 Sample Unmapped ZIPs:');
  console.log('  ZIP Code | Region | Has FMR Data');
  console.log('  ---------|--------|--------------');
  for (let i = 0; i < Math.min(20, unmappedZips.length); i++) {
    const zip = unmappedZips[i];
    const hasFmrData = zip.bedroom_0 || zip.bedroom_1 || zip.bedroom_2 || 
                       zip.bedroom_3 || zip.bedroom_4;
    const region = zip.likely_region.split(',')[0]; // Just show first state
    console.log(`  ${zip.zip_code} | ${region.padEnd(6)} | ${hasFmrData ? 'Yes' : 'No'}`);
  }

  // Check for invalid ZIP formats
  console.log('\n🔍 ZIP Code Format Validation:');
  const invalidFormat = unmappedZips.filter(z => 
    !/^\d{5}$/.test(z.zip_code)
  );
  if (invalidFormat.length > 0) {
    console.log(`  ⚠️  Found ${invalidFormat.length} ZIPs with invalid format:`);
    invalidFormat.slice(0, 10).forEach(z => {
      console.log(`    ${z.zip_code}`);
    });
  } else {
    console.log('  ✅ All ZIP codes have valid format (5 digits)');
  }

  // Recommendations
  console.log('\n💡 Recommendations:');
  if (hasData.withData > hasData.withoutData) {
    console.log('  ✅ Most unmapped ZIPs have FMR data - they are likely valid');
    console.log('  → Action: Update ZIP-county mapping data source');
  } else {
    console.log('  ⚠️  Many unmapped ZIPs lack FMR data - verify they are active ZIPs');
  }
  
  if (sortedRegions[0] && sortedRegions[0][1] > unmappedZips.length * 0.3) {
    console.log(`  → Focus on ${sortedRegions[0][0]} region (${sortedRegions[0][1]} ZIPs)`);
  }

  console.log('\n✅ Verification complete!\n');
}

verifyUnmappedZips()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error verifying unmapped ZIPs:', error);
    process.exit(1);
  });




