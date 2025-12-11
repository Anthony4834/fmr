#!/usr/bin/env bun

/**
 * ZIP to County Mapping Ingestion Script
 * 
 * One-time import of ZIP code to county mapping data from U.S. Census Bureau.
 * This data rarely changes, so this script is typically run once during initial setup.
 * 
 * Usage:
 *   bun run ingest:zip-county -- --url <census-data-url>
 *   bun run ingest:zip-county -- --file <local-csv-file>
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

interface CityRecord {
  cityName: string;
  stateCode: string;
  stateName: string;
  zipCodes: string[];
}

/**
 * Parses ZIP-County CSV data
 * Adjust column mapping based on actual Census Bureau CSV format
 */
function parseZIPCountyCSV(csvContent: string): ZIPCountyRecord[] {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  const zipCountyRecords: ZIPCountyRecord[] = [];
  const seen = new Set<string>(); // Track unique ZIP+County combinations

  for (const row of records) {
    try {
      // Map CSV columns - adjust based on actual Census Bureau format
      // Common column names: ZIP, ZIPCODE, COUNTY, STATE, STATEFP, COUNTYFP
      const zipCode = normalizeZipCode(row['zip'] || row['zip_code'] || row['zipcode'] || row['ZIP'] || '');
      const countyName = (row['county'] || row['county_name'] || row['COUNTY'] || '').trim();
      const stateCode = normalizeStateCode(row['state'] || row['state_code'] || row['STATE'] || '');
      const stateName = (row['state_name'] || row['STATE_NAME'] || '').trim();
      const countyFips = (row['county_fips'] || row['fips'] || row['COUNTYFP'] || '').trim();

      if (!zipCode || zipCode.length !== 5 || !countyName || !stateCode || stateCode.length !== 2) {
        continue; // Skip invalid records
      }

      // Avoid duplicates
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
      console.warn(`Error parsing row:`, row, error);
    }
  }

  return zipCountyRecords;
}

/**
 * Generates cities table from ZIP-County data
 */
function generateCitiesData(zipCountyRecords: ZIPCountyRecord[]): CityRecord[] {
  const cityMap = new Map<string, CityRecord>();

  for (const record of zipCountyRecords) {
    // For now, use county name as city name (you may want to enhance this with actual city data)
    // In practice, you might want to use a separate city dataset
    const key = `${record.countyName}-${record.stateCode}`;
    
    if (!cityMap.has(key)) {
      cityMap.set(key, {
        cityName: record.countyName,
        stateCode: record.stateCode,
        stateName: record.stateName,
        zipCodes: []
      });
    }

    const city = cityMap.get(key)!;
    if (!city.zipCodes.includes(record.zipCode)) {
      city.zipCodes.push(record.zipCode);
    }
  }

  return Array.from(cityMap.values());
}

/**
 * Main ingestion function
 */
export async function ingestZIPCountyData(urlOrFile?: string): Promise<void> {
  console.log('\n=== ZIP to County Mapping Ingestion ===');
  
  // Get database connection
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  // Create schema
  await createSchema();

  // Check if data already exists
  const existing = await query('SELECT COUNT(*) as count FROM zip_county_mapping');
  if (parseInt(existing[0].count) > 0) {
    console.log('ZIP-County mapping data already exists. Clearing existing data...');
    await execute('TRUNCATE TABLE zip_county_mapping, cities CASCADE');
  }

  let csvContent: string;

  // Load CSV data
  if (urlOrFile) {
    if (urlOrFile.startsWith('http://') || urlOrFile.startsWith('https://')) {
      console.log(`Downloading ZIP-County data from: ${urlOrFile}`);
      const response = await fetch(urlOrFile);
      if (!response.ok) {
        throw new Error(`Failed to download data: ${response.status} ${response.statusText}`);
      }
      csvContent = await response.text();
    } else {
      console.log(`Reading ZIP-County data from file: ${urlOrFile}`);
      csvContent = readFileSync(urlOrFile, 'utf-8');
    }
  } else {
    throw new Error('Please provide --url or --file argument with ZIP-County data source');
  }

  try {
    // Parse CSV
    console.log('Parsing CSV data...');
    const zipCountyRecords = parseZIPCountyCSV(csvContent);
    console.log(`Parsed ${zipCountyRecords.length} ZIP-County records`);

    if (zipCountyRecords.length === 0) {
      throw new Error('No ZIP-County records found in CSV data');
    }

    // Insert ZIP-County mappings in batches
    const batchSize = 1000;
    for (let i = 0; i < zipCountyRecords.length; i += batchSize) {
      const batch = zipCountyRecords.slice(i, i + batchSize);
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
        ON CONFLICT (zip_code) DO UPDATE SET
          county_name = EXCLUDED.county_name,
          state_code = EXCLUDED.state_code,
          state_name = EXCLUDED.state_name,
          county_fips = EXCLUDED.county_fips
      `;

      await execute(queryText, values);
      console.log(`Processed ${Math.min(i + batchSize, zipCountyRecords.length)}/${zipCountyRecords.length} records`);
    }

    // Generate and insert cities data
    console.log('Generating cities data...');
    const citiesData = generateCitiesData(zipCountyRecords);
    
    for (const city of citiesData) {
      await execute(
        `INSERT INTO cities (city_name, state_code, state_name, zip_codes)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (city_name, state_code) DO UPDATE SET
           zip_codes = EXCLUDED.zip_codes`,
        [city.cityName, city.stateCode, city.stateName, city.zipCodes]
      );
    }

    console.log(`\n✅ Successfully ingested ${zipCountyRecords.length} ZIP-County mappings`);
    console.log(`✅ Generated ${citiesData.length} city records`);
  } catch (error) {
    console.error('\n❌ Error ingesting ZIP-County data:', error);
    throw error;
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  let urlOrFile: string | undefined;

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--url' || args[i] === '--file') && args[i + 1]) {
      urlOrFile = args[i + 1];
      i++;
    }
  }

  ingestZIPCountyData(urlOrFile)
    .then(() => {
      console.log('Ingestion complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Ingestion failed:', error);
      process.exit(1);
    });
}

