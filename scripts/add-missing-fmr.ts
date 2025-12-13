#!/usr/bin/env bun

/**
 * Add Missing FMR Data for ZIP Codes
 * 
 * For ZIPs that have county mappings but no FMR data, this script:
 * 1. Checks if county has FMR data (use that)
 * 2. Checks if nearby ZIPs in same county have SAFMR (use average)
 * 3. Checks if metro area covers the county (use metro FMR)
 * 
 * Usage:
 *   bun scripts/add-missing-fmr.ts --zips 03804,45275
 *   bun scripts/add-missing-fmr.ts --file app/zips-missing-counties.txt
 */

import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { configureDatabase, execute, query } from '../lib/db';

config();

async function addMissingFMR(zipCodes: string[]) {
  console.log('\n=== Adding Missing FMR Data ===\n');

  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  const results: Array<{
    zipCode: string;
    strategy: string;
    fmrData: any;
    success: boolean;
    error?: string;
  }> = [];

  for (const zipCode of zipCodes) {
    console.log(`\nProcessing ZIP ${zipCode}...`);

    // Check if already has SAFMR
    const existingSAFMR = await query(`
      SELECT * FROM safmr_data 
      WHERE zip_code = $1 AND year = 2026
    `, [zipCode]);

    if (existingSAFMR.length > 0) {
      console.log(`  ✓ Already has SAFMR data`);
      results.push({
        zipCode,
        strategy: 'existing',
        fmrData: existingSAFMR[0],
        success: true
      });
      continue;
    }

    // Get county info
    const countyInfo = await query(`
      SELECT county_name, state_code, state_name
      FROM zip_county_mapping
      WHERE zip_code = $1
      LIMIT 1
    `, [zipCode]);

    if (countyInfo.length === 0) {
      console.log(`  ✗ No county mapping found`);
      results.push({
        zipCode,
        strategy: 'none',
        fmrData: null,
        success: false,
        error: 'No county mapping'
      });
      continue;
    }

    const county = countyInfo[0];
    console.log(`  County: ${county.county_name}, ${county.state_code}`);

    // Strategy 1: Check if county has FMR data
    const normalizedCounty = county.county_name.replace(/\s+County\s*$/i, '').trim();
    const countyFMR = await query(`
      SELECT * FROM fmr_data
      WHERE state_code = $1
        AND year = 2026
        AND (
          area_name ILIKE $2
          OR area_name ILIKE $3
        )
      LIMIT 1
    `, [
      county.state_code,
      `%${normalizedCounty}%`,
      `${normalizedCounty} County%`
    ]);

    if (countyFMR.length > 0) {
      console.log(`  ✓ Found county FMR data`);
      const fmr = countyFMR[0];
      
      // Insert as SAFMR for this ZIP
      await execute(`
        INSERT INTO safmr_data (
          year, zip_code, bedroom_0, bedroom_1, bedroom_2, 
          bedroom_3, bedroom_4, effective_date
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (year, zip_code) DO UPDATE SET
          bedroom_0 = EXCLUDED.bedroom_0,
          bedroom_1 = EXCLUDED.bedroom_1,
          bedroom_2 = EXCLUDED.bedroom_2,
          bedroom_3 = EXCLUDED.bedroom_3,
          bedroom_4 = EXCLUDED.bedroom_4,
          effective_date = EXCLUDED.effective_date
      `, [
        2026,
        zipCode,
        fmr.bedroom_0,
        fmr.bedroom_1,
        fmr.bedroom_2,
        fmr.bedroom_3,
        fmr.bedroom_4,
        fmr.effective_date
      ]);

      results.push({
        zipCode,
        strategy: 'county-fmr',
        fmrData: fmr,
        success: true
      });
      continue;
    }

    // Strategy 2: Check if other ZIPs in same county have SAFMR (use average)
    const countyZips = await query(`
      SELECT zip_code FROM zip_county_mapping
      WHERE county_name = $1 AND state_code = $2 AND zip_code != $3
    `, [county.county_name, county.state_code, zipCode]);

    if (countyZips.length > 0) {
      const zipList = countyZips.map((z: any) => z.zip_code);
      const safmrInCounty = await query(`
        SELECT 
          AVG(bedroom_0) as avg_0,
          AVG(bedroom_1) as avg_1,
          AVG(bedroom_2) as avg_2,
          AVG(bedroom_3) as avg_3,
          AVG(bedroom_4) as avg_4
        FROM safmr_data
        WHERE zip_code = ANY($1::text[])
          AND year = 2026
      `, [zipList]);

      if (safmrInCounty.length > 0 && safmrInCounty[0].avg_2) {
        console.log(`  ✓ Found SAFMR data from ${zipList.length} other ZIPs in county (using average)`);
        const avg = safmrInCounty[0];
        
        await execute(`
          INSERT INTO safmr_data (
            year, zip_code, bedroom_0, bedroom_1, bedroom_2, 
            bedroom_3, bedroom_4
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (year, zip_code) DO UPDATE SET
            bedroom_0 = EXCLUDED.bedroom_0,
            bedroom_1 = EXCLUDED.bedroom_1,
            bedroom_2 = EXCLUDED.bedroom_2,
            bedroom_3 = EXCLUDED.bedroom_3,
            bedroom_4 = EXCLUDED.bedroom_4
        `, [
          2026,
          zipCode,
          avg.avg_0 ? Math.round(parseFloat(avg.avg_0)) : null,
          avg.avg_1 ? Math.round(parseFloat(avg.avg_1)) : null,
          avg.avg_2 ? Math.round(parseFloat(avg.avg_2)) : null,
          avg.avg_3 ? Math.round(parseFloat(avg.avg_3)) : null,
          avg.avg_4 ? Math.round(parseFloat(avg.avg_4)) : null
        ]);

        results.push({
          zipCode,
          strategy: 'county-average',
          fmrData: avg,
          success: true
        });
        continue;
      }
    }

    // Strategy 3: Check if county is part of a metro area
    // Check FMR data for metro areas that might include this county
    const metroFMR = await query(`
      SELECT * FROM fmr_data
      WHERE state_code = $1
        AND year = 2026
        AND area_type = 'metropolitan'
        AND (
          area_name ILIKE $2
          OR area_name ILIKE '%metro%'
        )
      ORDER BY 
        CASE WHEN area_name ILIKE $2 THEN 1 ELSE 2 END
      LIMIT 1
    `, [
      county.state_code,
      `%${county.county_name}%`
    ]);

    if (metroFMR.length > 0) {
      console.log(`  ✓ Found metro area FMR data: ${metroFMR[0].area_name}`);
      const fmr = metroFMR[0];
      
      await execute(`
        INSERT INTO safmr_data (
          year, zip_code, bedroom_0, bedroom_1, bedroom_2, 
          bedroom_3, bedroom_4, effective_date
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (year, zip_code) DO UPDATE SET
          bedroom_0 = EXCLUDED.bedroom_0,
          bedroom_1 = EXCLUDED.bedroom_1,
          bedroom_2 = EXCLUDED.bedroom_2,
          bedroom_3 = EXCLUDED.bedroom_3,
          bedroom_4 = EXCLUDED.bedroom_4,
          effective_date = EXCLUDED.effective_date
      `, [
        2026,
        zipCode,
        fmr.bedroom_0,
        fmr.bedroom_1,
        fmr.bedroom_2,
        fmr.bedroom_3,
        fmr.bedroom_4,
        fmr.effective_date
      ]);

      results.push({
        zipCode,
        strategy: 'metro-fmr',
        fmrData: fmr,
        success: true
      });
      continue;
    }

    // Strategy 4: Use state average as last resort
    const stateAvg = await query(`
      SELECT 
        AVG(bedroom_0) as avg_0,
        AVG(bedroom_1) as avg_1,
        AVG(bedroom_2) as avg_2,
        AVG(bedroom_3) as avg_3,
        AVG(bedroom_4) as avg_4
      FROM fmr_data
      WHERE state_code = $1 AND year = 2026
    `, [county.state_code]);

    if (stateAvg.length > 0 && stateAvg[0].avg_2) {
      console.log(`  ⚠️  Using state average FMR (county not in database)`);
      const avg = stateAvg[0];
      
      await execute(`
        INSERT INTO safmr_data (
          year, zip_code, bedroom_0, bedroom_1, bedroom_2, 
          bedroom_3, bedroom_4
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (year, zip_code) DO UPDATE SET
          bedroom_0 = EXCLUDED.bedroom_0,
          bedroom_1 = EXCLUDED.bedroom_1,
          bedroom_2 = EXCLUDED.bedroom_2,
          bedroom_3 = EXCLUDED.bedroom_3,
          bedroom_4 = EXCLUDED.bedroom_4
      `, [
        2026,
        zipCode,
        avg.avg_0 ? Math.round(parseFloat(avg.avg_0)) : null,
        avg.avg_1 ? Math.round(parseFloat(avg.avg_1)) : null,
        avg.avg_2 ? Math.round(parseFloat(avg.avg_2)) : null,
        avg.avg_3 ? Math.round(parseFloat(avg.avg_3)) : null,
        avg.avg_4 ? Math.round(parseFloat(avg.avg_4)) : null
      ]);

      results.push({
        zipCode,
        strategy: 'state-average',
        fmrData: avg,
        success: true
      });
      continue;
    }

    console.log(`  ✗ No FMR data found (county not in FMR database, no metro area, no state average)`);
    results.push({
      zipCode,
      strategy: 'none',
      fmrData: null,
      success: false,
      error: 'No FMR data available'
    });
  }

  // Summary
  console.log('\n=== Summary ===');
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`\nTotal: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);
  
  if (successful.length > 0) {
    console.log('\n✅ Successfully added FMR data:');
    successful.forEach(r => {
      console.log(`  ${r.zipCode}: ${r.strategy}`);
    });
  }
  
  if (failed.length > 0) {
    console.log('\n❌ Failed to add FMR data:');
    failed.forEach(r => {
      console.log(`  ${r.zipCode}: ${r.error || 'Unknown error'}`);
    });
  }
  
  console.log('\n');
}

// CLI
const args = process.argv.slice(2);
let zipCodes: string[] = [];
let filePath: string | null = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--zips' && args[i + 1]) {
    zipCodes = args[i + 1].split(',').map(z => z.trim());
    i++;
  } else if (args[i] === '--file' && args[i + 1]) {
    filePath = args[i + 1];
    i++;
  }
}

if (filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').slice(1); // Skip header
  zipCodes = lines
    .map(line => line.split('\t')[0]?.trim())
    .filter(zip => zip && /^\d{5}$/.test(zip));
}

if (zipCodes.length === 0) {
  console.error('Error: Please provide --zips or --file');
  console.log('\nUsage:');
  console.log('  bun scripts/add-missing-fmr.ts --zips 03804,45275');
  console.log('  bun scripts/add-missing-fmr.ts --file app/zips-missing-counties.txt');
  process.exit(1);
}

addMissingFMR(zipCodes)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });




