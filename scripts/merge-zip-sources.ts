#!/usr/bin/env bun

/**
 * Merge ZIP-County mappings from multiple sources
 * 
 * Combines data from:
 * 1. Bulk CSV files (Row Zero, Gigasheet, etc.)
 * 2. API lookups (Census, SmartyStreets, etc.)
 * 3. Existing database mappings
 * 
 * Usage:
 *   bun scripts/merge-zip-sources.ts \
 *     --missing-file app/zips-missing-counties.txt \
 *     --bulk-csv data/rowzero-zip-county.csv \
 *     --output data/merged-zip-county.csv
 */

import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { configureDatabase, query } from '../lib/db';

config();

interface ZipMapping {
  zipCode: string;
  countyName?: string;
  stateCode?: string;
  stateName?: string;
  source: string;
}

/**
 * Parse ZIP codes from missing counties file
 */
function parseMissingZips(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').slice(1); // Skip header
  const zipCodes: string[] = [];
  
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const zipCode = parts[0]?.trim();
    if (zipCode && /^\d{5}$/.test(zipCode)) {
      zipCodes.push(zipCode);
    }
  }
  
  return [...new Set(zipCodes)];
}

/**
 * Parse bulk CSV file (Row Zero, Gigasheet, etc.)
 */
function parseBulkCSV(filePath: string): Map<string, ZipMapping> {
  const content = readFileSync(filePath, 'utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  const mappings = new Map<string, ZipMapping>();

  for (const row of records) {
    // Try various column name formats
    const zipCode = (
      row['zip'] || row['zip_code'] || row['zipcode'] || 
      row['ZIP'] || row['Zip'] || row['postal_code'] || ''
    ).trim();
    
    const countyName = (
      row['county'] || row['county_name'] || row['COUNTY'] || 
      row['County'] || row['county_clean'] || ''
    ).trim();
    
    const stateCode = (
      row['state'] || row['state_code'] || row['STATE'] || 
      row['State'] || row['usps_zip_pref_state'] || ''
    ).trim().toUpperCase();
    
    const stateName = (
      row['state_name'] || row['STATE_NAME'] || row['State Name'] || ''
    ).trim();

    if (zipCode && /^\d{5}$/.test(zipCode) && countyName && stateCode && stateCode.length === 2) {
      // Handle ZIPs that span multiple counties
      const key = `${zipCode}-${countyName}-${stateCode}`;
      if (!mappings.has(key)) {
        mappings.set(key, {
          zipCode,
          countyName,
          stateCode,
          stateName: stateName || stateCode,
          source: 'bulk-csv'
        });
      }
    }
  }

  return mappings;
}

/**
 * Get existing mappings from database
 */
async function getDatabaseMappings(zipCodes: string[]): Promise<Map<string, ZipMapping[]>> {
  if (!process.env.POSTGRES_URL) {
    return new Map();
  }

  try {
    configureDatabase({ connectionString: process.env.POSTGRES_URL });
    const results = await query(`
      SELECT zip_code, county_name, state_code, state_name
      FROM zip_county_mapping
      WHERE zip_code = ANY($1::text[])
    `, [zipCodes]);

    const mappings = new Map<string, ZipMapping[]>();
    for (const row of results) {
      const zip = row.zip_code;
      if (!mappings.has(zip)) {
        mappings.set(zip, []);
      }
      mappings.get(zip)!.push({
        zipCode: zip,
        countyName: row.county_name,
        stateCode: row.state_code,
        stateName: row.state_name,
        source: 'database'
      });
    }

    return mappings;
  } catch (error) {
    console.warn('Could not query database:', error);
    return new Map();
  }
}

async function mergeSources() {
  const args = process.argv.slice(2);
  let missingFile: string | null = null;
  let bulkCsv: string | null = null;
  let outputFile = 'merged-zip-county.csv';
  let apiLookup = false;
  let apiType = 'census';

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--missing-file' && args[i + 1]) {
      missingFile = args[i + 1];
      i++;
    } else if (args[i] === '--bulk-csv' && args[i + 1]) {
      bulkCsv = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      outputFile = args[i + 1];
      i++;
    } else if (args[i] === '--api-lookup') {
      apiLookup = true;
    } else if (args[i] === '--api' && args[i + 1]) {
      apiType = args[i + 1];
      i++;
    }
  }

  if (!missingFile) {
    console.error('Error: --missing-file required');
    console.log('\nUsage:');
    console.log('  bun scripts/merge-zip-sources.ts \\');
    console.log('    --missing-file app/zips-missing-counties.txt \\');
    console.log('    --bulk-csv data/rowzero-zip-county.csv \\');
    console.log('    --output data/merged-zip-county.csv');
    console.log('\nOptional:');
    console.log('  --api-lookup    Also lookup remaining ZIPs via API');
    console.log('  --api census    API to use (census, smartystreets, zipcodeapi)');
    process.exit(1);
  }

  console.log('\n=== Merging ZIP-County Sources ===\n');

  // Step 1: Get list of missing ZIPs
  const missingZips = parseMissingZips(missingFile);
  console.log(`Found ${missingZips.length} missing ZIP codes\n`);

  // Step 2: Check database for existing mappings
  console.log('Checking database for existing mappings...');
  const dbMappings = await getDatabaseMappings(missingZips);
  const foundInDb = new Set(dbMappings.keys());
  console.log(`Found ${foundInDb.size} ZIPs already in database\n`);

  // Step 3: Parse bulk CSV if provided
  const bulkMappings = new Map<string, ZipMapping>();
  if (bulkCsv) {
    console.log(`Parsing bulk CSV: ${bulkCsv}...`);
    try {
      const parsed = parseBulkCSV(bulkCsv);
      for (const [key, mapping] of parsed) {
        const zip = mapping.zipCode;
        if (!bulkMappings.has(zip)) {
          bulkMappings.set(zip, mapping);
        }
      }
      console.log(`Found ${bulkMappings.size} ZIP mappings in bulk CSV\n`);
    } catch (error) {
      console.warn(`Warning: Could not parse bulk CSV: ${error}`);
    }
  }

  // Step 4: Determine which ZIPs still need lookup
  const stillMissing = missingZips.filter(zip => 
    !foundInDb.has(zip) && !bulkMappings.has(zip)
  );
  
  console.log('=== Summary ===');
  console.log(`Total missing ZIPs: ${missingZips.length}`);
  console.log(`Found in database: ${foundInDb.size}`);
  console.log(`Found in bulk CSV: ${bulkMappings.size}`);
  console.log(`Still need lookup: ${stillMissing.length}\n`);

  // Step 5: Combine all found mappings
  const allMappings: ZipMapping[] = [];

  // Add database mappings
  for (const [zip, mappings] of dbMappings) {
    allMappings.push(...mappings);
  }

  // Add bulk CSV mappings (only for missing ZIPs)
  for (const zip of missingZips) {
    if (bulkMappings.has(zip) && !foundInDb.has(zip)) {
      allMappings.push(bulkMappings.get(zip)!);
    }
  }

  // Step 6: API lookup for remaining ZIPs (if requested)
  if (apiLookup && stillMissing.length > 0) {
    console.log(`Looking up ${stillMissing.length} ZIPs via ${apiType} API...`);
    console.log('(This may take a while. Consider running lookup-zip-counties.ts separately)\n');
    
    // Note: This is a simplified version - full API lookup should use lookup-zip-counties.ts
    console.log('For API lookups, run:');
    console.log(`  bun scripts/lookup-zip-counties.ts --file app/zips-missing-counties.txt --api ${apiType}\n`);
  }

  // Step 7: Write merged CSV
  const csvLines = [
    'zip_code,county_name,state_code,state_name,source',
    ...allMappings.map(m => 
      `"${m.zipCode}","${m.countyName || ''}","${m.stateCode || ''}","${m.stateName || ''}","${m.source}"`
    )
  ];

  writeFileSync(outputFile, csvLines.join('\n'), 'utf-8');

  // Step 8: Create report
  const reportFile = outputFile.replace('.csv', '-report.txt');
  const reportLines = [
    'ZIP-County Mapping Merge Report',
    `Generated: ${new Date().toISOString()}`,
    '',
    'Summary:',
    `  Total missing ZIPs: ${missingZips.length}`,
    `  Found in database: ${foundInDb.size}`,
    `  Found in bulk CSV: ${bulkMappings.size}`,
    `  Still need lookup: ${stillMissing.length}`,
    '',
    'Still Missing ZIPs:',
    ...stillMissing.slice(0, 100).map(zip => `  ${zip}`),
    stillMissing.length > 100 ? `  ... and ${stillMissing.length - 100} more` : '',
    '',
    'Next Steps:',
    `1. Review merged CSV: ${outputFile}`,
    `2. For remaining ${stillMissing.length} ZIPs, run:`,
    `   bun scripts/lookup-zip-counties.ts --file app/zips-missing-counties.txt --api census`,
    `3. Import merged results:`,
    `   bun run ingest:zip-county -- --file ${outputFile}`
  ];

  writeFileSync(reportFile, reportLines.join('\n'), 'utf-8');

  console.log('✅ Merge complete!');
  console.log(`\nOutput files:`);
  console.log(`  - ${outputFile} (merged CSV)`);
  console.log(`  - ${reportFile} (report)`);
  console.log(`\nTo import:`);
  console.log(`  bun run ingest:zip-county -- --file ${outputFile}\n`);
}

mergeSources()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });




