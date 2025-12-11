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
 * Returns both parsed records and raw CSV records for city extraction
 */
function parseZIPCountyCSV(csvContent: string): { records: ZIPCountyRecord[], rawRecords: any[] } {
  const rawRecords = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true // Allow inconsistent column counts
  });

  const zipCountyRecords: ZIPCountyRecord[] = [];
  const seen = new Set<string>(); // Track unique ZIP+County combinations

  for (const row of rawRecords) {
    try {
      // Handle two different CSV formats:
      // Format 1 (9 columns with headers): ZIP, COUNTY FIPS, County Clean, USPS_ZIP_PREF_CITY, USPS_ZIP_PREF_STATE, ratios...
      // Format 2 (5 columns, no headers): ZIP, County Name, State Code, State Name, City Name
      
      let zipCode: string;
      let countyName: string;
      let stateCode: string;
      let stateName: string;
      let countyFips: string = '';
      
      // Check if row is an array (happens when column count doesn't match headers)
      // Format 2 (5 columns): [ZIP, County Name, State Code, State Name, City Name]
      // Format 1 (9 columns): [ZIP, COUNTY FIPS, County Clean, USPS_ZIP_PREF_CITY, USPS_ZIP_PREF_STATE, ratios...]
      if (Array.isArray(row)) {
        if (row.length === 5) {
          // Format 2: [ZIP, County Name, State Code, State Name, City Name]
          zipCode = normalizeZipCode(String(row[0] || '').replace(/"/g, ''));
          countyName = String(row[1] || '').replace(/"/g, '').trim();
          stateCode = normalizeStateCode(String(row[2] || '').replace(/"/g, ''));
          stateName = String(row[3] || '').replace(/"/g, '').trim();
        } else if (row.length >= 9) {
          // Format 1: [ZIP, COUNTY FIPS, County Clean, USPS_ZIP_PREF_CITY, USPS_ZIP_PREF_STATE, ratios...]
          zipCode = normalizeZipCode(String(row[0] || '').replace(/"/g, ''));
          countyFips = String(row[1] || '').replace(/"/g, '').trim();
          countyName = String(row[2] || '').replace(/"/g, '').trim();
          // row[3] is city name (USPS_ZIP_PREF_CITY)
          stateCode = normalizeStateCode(String(row[4] || '').replace(/"/g, '')); // USPS_ZIP_PREF_STATE
          stateName = ''; // Not in Format 1
        } else {
          // Skip rows that don't match either format
          continue;
        }
      } else {
        // Format 1: Object with column names
        zipCode = normalizeZipCode(
          row['zip'] || row['zip_code'] || row['zipcode'] || 
          row['ZIP'] || row['Zip'] || ''
        );
        countyName = (
          row['county'] || row['county_name'] || row['COUNTY'] || 
          row['County Clean'] || row['county_clean'] || row['COUNTY CLEAN'] || ''
        ).trim();
        stateCode = normalizeStateCode(
          row['state'] || row['state_code'] || row['STATE'] || 
          row['USPS_ZIP_PREF_STATE'] || row['usps_zip_pref_state'] || ''
        );
        stateName = (row['state_name'] || row['STATE_NAME'] || '').trim();
        countyFips = (
          row['county_fips'] || row['fips'] || row['COUNTYFP'] || 
          row['COUNTY FIPS'] || row['county_fips'] || ''
        ).trim();
      }

      if (!zipCode || zipCode.length !== 5 || !countyName || !stateCode || stateCode.length !== 2) {
        continue; // Skip invalid records
      }

      // Avoid duplicates
      const key = `${zipCode}-${countyName}-${stateCode}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      // Validate and truncate fields to fit database constraints
      // zip_code: VARCHAR(10), state_code: VARCHAR(2), county_fips: VARCHAR(5)
      const validatedZipCode = zipCode.length > 10 ? zipCode.substring(0, 10) : zipCode;
      const validatedStateCode = stateCode.length > 2 ? stateCode.substring(0, 2) : stateCode;
      const validatedCountyFips = countyFips && countyFips.length > 5 
        ? countyFips.substring(0, 5) 
        : (countyFips || undefined);
      
      zipCountyRecords.push({
        zipCode: validatedZipCode,
        countyName,
        stateCode: validatedStateCode,
        stateName: stateName || validatedStateCode,
        countyFips: validatedCountyFips
      });
    } catch (error) {
      console.warn(`Error parsing row:`, row, error);
    }
  }

  return { records: zipCountyRecords, rawRecords };
}

/**
 * Generates cities table from ZIP-County data
 * Uses actual city names from USPS_ZIP_PREF_CITY when available
 */
function generateCitiesData(zipCountyRecords: ZIPCountyRecord[], csvRecords: any[]): CityRecord[] {
  const cityMap = new Map<string, CityRecord>();
  
  // Create a map of ZIP to city name from CSV
  const zipToCity = new Map<string, string>();
  for (const csvRow of csvRecords) {
    let zip: string;
    let city: string;
    
    // Handle both array format and object format
    if (Array.isArray(csvRow)) {
      if (csvRow.length === 5) {
        // Format 2: [ZIP, County Name, State Code, State Name, City Name]
        zip = normalizeZipCode(String(csvRow[0] || '').replace(/"/g, ''));
        city = String(csvRow[4] || '').replace(/"/g, '').trim();
      } else if (csvRow.length >= 9) {
        // Format 1: [ZIP, COUNTY FIPS, County Clean, USPS_ZIP_PREF_CITY, USPS_ZIP_PREF_STATE, ratios...]
        zip = normalizeZipCode(String(csvRow[0] || '').replace(/"/g, ''));
        city = String(csvRow[3] || '').replace(/"/g, '').trim(); // USPS_ZIP_PREF_CITY is at index 3
      } else {
        continue; // Skip rows that don't match either format
      }
    } else {
      // Format 1: Object with column names
      zip = normalizeZipCode(csvRow['ZIP'] || csvRow['zip'] || csvRow['zip_code'] || '');
      city = (
        csvRow['USPS_ZIP_PREF_CITY'] || 
        csvRow['usps_zip_pref_city'] || 
        csvRow['city_name'] || 
        csvRow['CITY_NAME'] ||
        ''
      ).trim();
    }
    
    if (zip && city && !zipToCity.has(zip)) {
      zipToCity.set(zip, city);
    }
  }

  for (const record of zipCountyRecords) {
    // Use actual city name from CSV if available, otherwise fall back to county
    const cityName = zipToCity.get(record.zipCode) || record.countyName;
    const key = `${cityName}-${record.stateCode}`;
    
    if (!cityMap.has(key)) {
      cityMap.set(key, {
        cityName: cityName,
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
  const existingCount = parseInt(existing[0].count);
  
  // Check for --merge flag (import without clearing)
  const mergeFlag = process.argv.includes('--merge') || process.argv.includes('-m');
  
  if (existingCount > 0 && !mergeFlag) {
    // Check for --force flag to allow clearing
    const forceFlag = process.argv.includes('--force') || process.argv.includes('-f');
    
    if (!forceFlag) {
      console.log(`\n⚠️  WARNING: ${existingCount.toLocaleString()} ZIP-County mappings already exist in database.`);
      console.log('This script will CLEAR all existing data before importing.');
      console.log('\nOptions:');
      console.log('  --merge    Import/update without clearing (recommended for adding new data)');
      console.log('  --force    Clear existing data and re-import everything');
      console.log('\nExample:');
      console.log('  bun run ingest:zip-county -- --file data.csv --merge');
      console.log('  bun run ingest:zip-county -- --file data.csv --force');
      console.log('\nAborting to prevent data loss.');
      process.exit(1);
    }
    
    console.log(`⚠️  Clearing ${existingCount.toLocaleString()} existing ZIP-County mappings...`);
    await execute('TRUNCATE TABLE zip_county_mapping, cities CASCADE');
  } else if (existingCount > 0 && mergeFlag) {
    console.log(`\n📊 Merging with existing ${existingCount.toLocaleString()} ZIP-County mappings...`);
    console.log('New records will be added, existing ones will be updated.\n');
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
    const { records: zipCountyRecords, rawRecords } = parseZIPCountyCSV(csvContent);
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
        ON CONFLICT (zip_code, county_name, state_code) DO UPDATE SET
          state_name = EXCLUDED.state_name,
          county_fips = EXCLUDED.county_fips
      `;

      await execute(queryText, values);
      console.log(`Processed ${Math.min(i + batchSize, zipCountyRecords.length)}/${zipCountyRecords.length} records`);
    }

    // Generate and insert cities data
    console.log('Generating cities data...');
    const citiesData = generateCitiesData(zipCountyRecords, rawRecords);
    console.log(`Generated ${citiesData.length} city records`);
    
    // Batch insert cities for better performance
    const cityBatchSize = 100;
    for (let i = 0; i < citiesData.length; i += cityBatchSize) {
      const batch = citiesData.slice(i, i + cityBatchSize);
      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      for (const city of batch) {
        placeholders.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
        values.push(
          city.cityName,
          city.stateCode,
          city.stateName,
          city.zipCodes
        );
      }

      const queryText = `
        INSERT INTO cities (city_name, state_code, state_name, zip_codes)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (city_name, state_code) DO UPDATE SET
          zip_codes = EXCLUDED.zip_codes
      `;

      await execute(queryText, values);
      console.log(`Inserted cities ${Math.min(i + cityBatchSize, citiesData.length)}/${citiesData.length}`);
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

