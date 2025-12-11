#!/usr/bin/env bun

/**
 * Regenerate Cities Table from CSV with City Names
 * 
 * This script regenerates the cities table from a CSV file that contains city names.
 * It does NOT modify zip_county_mapping - only updates the cities table.
 * 
 * Usage:
 *   bun run scripts/regenerate-cities.ts -- --file data/combined-zip-county.csv
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

interface CityRecord {
  cityName: string;
  stateCode: string;
  stateName: string;
  zipCodes: string[];
}

async function regenerateCities(csvFile?: string): Promise<void> {
  console.log('\n=== Regenerating Cities Table ===\n');
  
  // Get database connection
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  // Create schema (ensures tables exist)
  await createSchema();

  // Check if zip_county_mapping has data
  const zipCountyCount = await query('SELECT COUNT(*) as count FROM zip_county_mapping');
  const zipCountyCountNum = parseInt(zipCountyCount[0].count);
  
  if (zipCountyCountNum === 0) {
    console.log('❌ No ZIP-County mappings found in database.');
    console.log('Please run ingest:zip-county first to populate zip_county_mapping.');
    process.exit(1);
  }

  console.log(`Found ${zipCountyCountNum.toLocaleString()} ZIP-County mappings`);

  let citiesData: CityRecord[];

  if (csvFile) {
    console.log(`Reading city data from CSV: ${csvFile}\n`);
    const csvContent = readFileSync(csvFile, 'utf-8');
    const rawRecords = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true
    });

    // Create a map of ZIP to city name from CSV
    const zipToCity = new Map<string, string>();
    const zipToState = new Map<string, string>();
    const zipToStateName = new Map<string, string>();

    for (const csvRow of rawRecords) {
      let zip: string;
      let city: string;
      let stateCode: string;
      let stateName: string;

      // Handle both array format and object format
      if (Array.isArray(csvRow)) {
        if (csvRow.length === 5) {
          // Format 2: [ZIP, County Name, State Code, State Name, City Name]
          zip = normalizeZipCode(String(csvRow[0] || '').replace(/"/g, ''));
          city = String(csvRow[4] || '').replace(/"/g, '').trim();
          stateCode = normalizeStateCode(String(csvRow[2] || '').replace(/"/g, ''));
          stateName = String(csvRow[3] || '').replace(/"/g, '').trim();
        } else if (csvRow.length >= 9) {
          // Format 1: [ZIP, COUNTY FIPS, County Clean, USPS_ZIP_PREF_CITY, USPS_ZIP_PREF_STATE, ratios...]
          zip = normalizeZipCode(String(csvRow[0] || '').replace(/"/g, ''));
          city = String(csvRow[3] || '').replace(/"/g, '').trim(); // USPS_ZIP_PREF_CITY
          stateCode = normalizeStateCode(String(csvRow[4] || '').replace(/"/g, '')); // USPS_ZIP_PREF_STATE
          stateName = '';
        } else {
          continue;
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
        stateCode = normalizeStateCode(
          csvRow['USPS_ZIP_PREF_STATE'] || 
          csvRow['usps_zip_pref_state'] || 
          csvRow['state_code'] || 
          csvRow['STATE'] ||
          ''
        );
        stateName = (csvRow['state_name'] || csvRow['STATE_NAME'] || '').trim();
      }

      if (zip && city && stateCode) {
        // Validate: Check if city/state might be swapped
        // Common state names that might appear in city column
        const commonStateNames = ['Alaska', 'Texas', 'Louisiana', 'Kentucky', 'Alabama', 'Arkansas', 
          'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
          'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
          'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
          'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma',
          'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee',
          'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'];
        
        // Valid US state codes
        const validStateCodes = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
          'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
          'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
          'DC','PR','VI','GU','MP','AS'];
        
        // If city looks like a state name and state code is NOT a valid 2-letter code, they might be swapped
        if (commonStateNames.includes(city) && stateCode.length > 2) {
          // Likely swapped - the "state code" field contains the actual city name
          // Try to derive state code from state name
          const stateNameToCode: { [key: string]: string } = {
            'Alaska': 'AK', 'Texas': 'TX', 'Louisiana': 'LA', 'Kentucky': 'KY', 'Alabama': 'AL',
            'Arkansas': 'AR', 'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
            'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL',
            'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS', 'Maine': 'ME', 'Maryland': 'MD',
            'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
            'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH',
            'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC',
            'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA',
            'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', 'Tennessee': 'TN',
            'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
            'Wisconsin': 'WI', 'Wyoming': 'WY'
          };
          
          const correctStateCode = stateNameToCode[city];
          if (correctStateCode) {
            // Swap: use stateCode field as city name, use derived state code
            const actualCityName = stateCode;
            stateCode = correctStateCode;
            city = actualCityName;
          }
        }
        
        // Only store if state code is valid (2 uppercase letters matching valid codes)
        if (stateCode && stateCode.length === 2 && validStateCodes.includes(stateCode.toUpperCase())) {
          if (!zipToCity.has(zip)) {
            zipToCity.set(zip, city);
            zipToState.set(zip, stateCode.toUpperCase());
            if (stateName) {
              zipToStateName.set(zip, stateName);
            }
          }
        }
      }
    }

    // Get all ZIP codes from zip_county_mapping (for ZIP code list only)
    // But use CSV state codes as source of truth (they're correct)
    const zipCountyData = await query(`
      SELECT DISTINCT zip_code
      FROM zip_county_mapping
      ORDER BY zip_code
    `);

    const cityMap = new Map<string, CityRecord>();

    for (const row of zipCountyData) {
      const zipCode = row.zip_code.trim();

      // Get city name and state code from CSV (source of truth)
      const cityName = zipToCity.get(zipCode);
      const csvStateCode = zipToState.get(zipCode);
      const csvStateName = zipToStateName.get(zipCode) || csvStateCode || '';

      // Only create city entry if we have both city name and valid state code from CSV
      // State code must be exactly 2 uppercase letters
      if (cityName && csvStateCode && csvStateCode.length === 2 && csvStateCode.match(/^[A-Z]{2}$/)) {
        const key = `${cityName}-${csvStateCode}`;
        
        if (!cityMap.has(key)) {
          cityMap.set(key, {
            cityName: cityName,
            stateCode: csvStateCode,
            stateName: csvStateName,
            zipCodes: []
          });
        }

        const city = cityMap.get(key)!;
        if (!city.zipCodes.includes(zipCode)) {
          city.zipCodes.push(zipCode);
        }
      }
    }

    citiesData = Array.from(cityMap.values());
    console.log(`Generated ${citiesData.length} city records from CSV with proper city names\n`);
  } else {
    console.log('Regenerating cities table from zip_county_mapping (using county names as city names)...\n');
    
    // Get all ZIP-County mappings grouped by county name and state
    const zipCountyData = await query(`
      SELECT 
        zip_code,
        county_name,
        state_code,
        state_name
      FROM zip_county_mapping
      ORDER BY state_code, county_name, zip_code
    `);

    // Group ZIP codes by county name (which will be used as city name)
    const cityMap = new Map<string, CityRecord>();

    for (const row of zipCountyData) {
      const countyName = row.county_name.trim();
      const stateCode = row.state_code.trim();
      const stateName = row.state_name?.trim() || stateCode;
      const zipCode = row.zip_code.trim();
      
      const key = `${countyName}-${stateCode}`;
      
      if (!cityMap.has(key)) {
        cityMap.set(key, {
          cityName: countyName,
          stateCode: stateCode,
          stateName: stateName,
          zipCodes: []
        });
      }

      const city = cityMap.get(key)!;
      if (!city.zipCodes.includes(zipCode)) {
        city.zipCodes.push(zipCode);
      }
    }

    citiesData = Array.from(cityMap.values());
    console.log(`Generated ${citiesData.length} city records (grouped by county name)`);
    console.log('Note: City names are county names since no CSV file was provided.\n');
  }

  // Clear existing cities table
  console.log('Clearing existing cities table...');
  await execute('TRUNCATE TABLE cities CASCADE');
  console.log('✅ Cleared cities table\n');

  // Insert cities in batches
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
        zip_codes = EXCLUDED.zip_codes,
        state_name = EXCLUDED.state_name
    `;

    await execute(queryText, values);
    console.log(`Inserted cities ${Math.min(i + cityBatchSize, citiesData.length)}/${citiesData.length}`);
  }

  // Verify the results
  const finalCount = await query('SELECT COUNT(*) as count FROM cities');
  console.log(`\n✅ Successfully regenerated ${finalCount[0].count} city records`);
  if (!csvFile) {
    console.log('\n⚠️  Note: City names are currently county names.');
    console.log('To get proper city names, provide a CSV file with USPS_ZIP_PREF_CITY column.');
    console.log('Example: bun run regenerate:cities -- --file data/combined-zip-county.csv\n');
  } else {
    console.log('\n✅ Cities table regenerated with proper city names from CSV!\n');
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  let csvFile: string | undefined;

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      csvFile = args[i + 1];
      i++;
    }
  }

  regenerateCities(csvFile)
    .then(() => {
      console.log('Regeneration complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Regeneration failed:', error);
      process.exit(1);
    });
}

export { regenerateCities };
