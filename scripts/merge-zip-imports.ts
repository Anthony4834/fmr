#!/usr/bin/env bun

/**
 * Merge ZIP-County imports without clearing existing data
 * 
 * Imports multiple CSV files, merging them together.
 * Uses ON CONFLICT DO UPDATE to handle duplicates.
 */

import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { createSchema } from '../lib/schema';
import { 
  configureDatabase, 
  execute,
  query 
} from '../lib/db';
import { normalizeZipCode, normalizeStateCode } from '../lib/ingestion-utils';

config();

interface ZIPCountyRecord {
  zipCode: string;
  countyName: string;
  stateCode: string;
  stateName: string;
  countyFips?: string;
}

function parseZIPCountyCSV(csvContent: string): ZIPCountyRecord[] {
  const rawRecords = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true // Allow inconsistent column counts
  });

  const zipCountyRecords: ZIPCountyRecord[] = [];
  const seen = new Set<string>();

  for (const row of rawRecords) {
    try {
      const zipCode = normalizeZipCode(
        row['zip'] || row['zip_code'] || row['zipcode'] || 
        row['ZIP'] || row['Zip'] || ''
      );
      const countyName = (
        row['county'] || row['county_name'] || row['COUNTY'] || 
        row['County Clean'] || row['county_clean'] || row['COUNTY CLEAN'] || ''
      ).trim();
      const stateCode = normalizeStateCode(
        row['state'] || row['state_code'] || row['STATE'] || 
        row['USPS_ZIP_PREF_STATE'] || row['usps_zip_pref_state'] || ''
      );
      const stateName = (row['state_name'] || row['STATE_NAME'] || row['State'] || '').trim();
      const countyFips = (
        row['county_fips'] || row['fips'] || row['COUNTYFP'] || 
        row['COUNTY FIPS'] || row['county_fips'] || ''
      ).trim();

      if (!zipCode || zipCode.length !== 5 || !countyName || !stateCode || stateCode.length !== 2) {
        continue;
      }

      const key = `${zipCode}-${countyName}-${stateCode}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      zipCountyRecords.push({
        zipCode,
        countyName,
        stateCode,
        stateName: stateName || stateCode,
        countyFips: countyFips || undefined
      });
    } catch (error) {
      // Skip invalid rows
    }
  }

  return zipCountyRecords;
}

async function mergeImports(filePaths: string[]) {
  console.log('\n=== Merging ZIP-County Imports ===\n');

  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  await createSchema();

  let allRecords: ZIPCountyRecord[] = [];

  // Parse all files
  for (const filePath of filePaths) {
    console.log(`Parsing ${filePath}...`);
    const content = readFileSync(filePath, 'utf-8');
    const records = parseZIPCountyCSV(content);
    console.log(`  Found ${records.length} records`);
    allRecords.push(...records);
  }

  // Deduplicate
  const uniqueRecords = new Map<string, ZIPCountyRecord>();
  for (const record of allRecords) {
    const key = `${record.zipCode}-${record.countyName}-${record.stateCode}`;
    if (!uniqueRecords.has(key)) {
      uniqueRecords.set(key, record);
    }
  }

  console.log(`\nTotal unique records: ${uniqueRecords.size}`);

  // Insert in batches
  const batchSize = 1000;
  const recordsArray = Array.from(uniqueRecords.values());
  
  for (let i = 0; i < recordsArray.length; i += batchSize) {
    const batch = recordsArray.slice(i, i + batchSize);
    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const record of batch) {
      placeholders.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
      values.push(
        record.zipCode,
        record.countyName,
        record.stateCode,
        record.stateName,
        record.countyFips || null
      );
    }

    const queryText = `
      INSERT INTO zip_county_mapping (zip_code, county_name, state_code, state_name, county_fips)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (zip_code, county_name, state_code) DO UPDATE SET
        state_name = EXCLUDED.state_name,
        county_fips = EXCLUDED.county_fips
    `;

    await execute(queryText, values);
    console.log(`Processed ${Math.min(i + batchSize, recordsArray.length)}/${recordsArray.length} records`);
  }

  // Get final count
  const final = await query('SELECT COUNT(*) as count FROM zip_county_mapping');
  console.log(`\n✅ Successfully merged imports!`);
  console.log(`Total ZIP-County mappings in database: ${final[0].count}\n`);
}

// CLI
const args = process.argv.slice(2);
const files = args.filter(arg => !arg.startsWith('--'));

if (files.length === 0) {
  console.error('Error: Please provide CSV file paths');
  console.log('\nUsage:');
  console.log('  bun scripts/merge-zip-imports.ts data/file1.csv data/file2.csv');
  process.exit(1);
}

mergeImports(files)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });



