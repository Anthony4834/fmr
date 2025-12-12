#!/usr/bin/env bun

/**
 * FMR Data Ingestion Script
 * 
 * Downloads and indexes HUD Fair Market Rent data for a specified year.
 * This script is reusable and configurable for different years.
 * 
 * Usage:
 *   bun run ingest:fmr -- --year 2024
 *   bun run ingest:fmr -- --year 2024 --url <custom-url>
 *   bun run ingest:fmr -- --year 2024 --replace
 */

import { config } from 'dotenv';
import { parse } from 'csv-parse/sync';
import { createSchema } from '../lib/schema';
import { 
  configureDatabase, 
  query 
} from '../lib/db';
import {
  IngestionConfig,
  FMRRecord,
  clearFMRDataForYear,
  insertFMRRecords,
  getCurrentFMRYear,
  normalizeCountyFips,
  normalizeStateCode
} from '../lib/ingestion-utils';

config();

interface ScriptOptions {
  year?: number;
  url?: string;
  replace?: boolean;
  skipSchema?: boolean;
}

/**
 * Default HUD FMR data URL pattern
 * Note: You'll need to update this with the actual HUD URL structure
 */
function getDefaultFMRUrl(year: number): string {
  // HUD typically publishes FMR data at:
  // https://www.huduser.gov/portal/datasets/fmr/fmr_csvs/fmr_YYYY.csv
  // Or similar pattern - adjust based on actual HUD URL structure
  return `https://www.huduser.gov/portal/datasets/fmr/fmr_csvs/fmr_${year}.csv`;
}

/**
 * Parses FMR CSV data into structured records
 * Adjust column mapping based on actual HUD CSV structure
 */
function parseFMRCSV(csvContent: string, year: number, effectiveDate?: Date): FMRRecord[] {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  const fmrRecords: FMRRecord[] = [];
  const seen = new Set<string>(); // Track unique records

  for (const row of records) {
    try {
      // Map CSV columns to FMRRecord structure
      // HUD FY 2026 format: stusps, state, hud_area_code, countyname, metro, hud_area_name, fips, fmr_0-4
      const metro = parseInt(row['metro'] || '0');
      const areaType = metro === 1 ? 'metropolitan' : 'nonmetropolitan';

      // Use countyname as primary identifier to avoid deduplication issues
      // Multiple counties can share the same hud_area_name (metro area)
      const countyName = row['countyname'] || row['county_town_name'] || '';
      const hudAreaName = row['hud_area_name'] || '';
      const hudAreaCode = row['hud_area_code'] || row['hudareacode'] || row['area_code'] || '';
      
      // Use county name if available, otherwise fall back to hud_area_name
      const areaName = countyName || hudAreaName || row['area_name'] || row['county_name'] || '';

      const record: FMRRecord = {
        year,
        areaType,
        areaName: areaName,
        stateCode: normalizeStateCode(row['stusps'] || row['state_code'] || row['state'] || ''),
        countyCode: normalizeCountyFips(row['fips'] || row['county_code'] || row['fips_code'] || ''),
        hudAreaCode: hudAreaCode || undefined,
        hudAreaName: hudAreaName || undefined,
        bedroom0: parseFloat(row['fmr_0'] || row['bedroom_0'] || row['efficiency'] || row['0br'] || '0') || undefined,
        bedroom1: parseFloat(row['fmr_1'] || row['bedroom_1'] || row['1br'] || '0') || undefined,
        bedroom2: parseFloat(row['fmr_2'] || row['bedroom_2'] || row['2br'] || '0') || undefined,
        bedroom3: parseFloat(row['fmr_3'] || row['bedroom_3'] || row['3br'] || '0') || undefined,
        bedroom4: parseFloat(row['fmr_4'] || row['bedroom_4'] || row['4br'] || '0') || undefined,
        effectiveDate: effectiveDate || undefined
      };

      // Validate required fields
      if (record.areaName && record.stateCode && record.stateCode.length === 2) {
        // Check for duplicates using unique constraint key (now based on county name, not metro area)
        const key = `${year}-${record.areaName}-${record.stateCode}-${record.areaType}`;
        if (!seen.has(key)) {
          seen.add(key);
          fmrRecords.push(record);
        }
      }
    } catch (error) {
      console.warn(`Error parsing row:`, row, error);
    }
  }

  return fmrRecords;
}

/**
 * Main ingestion function - reusable and configurable
 */
export async function ingestFMRData(config: IngestionConfig & { url?: string }): Promise<void> {
  const { year, effectiveDate, replaceExisting, url } = config;
  
  console.log(`\n=== FMR Data Ingestion for Year ${year} ===`);
  
  // Get database connection
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  // Create schema if needed
  await createSchema();

  // Clear existing data if replacing
  if (replaceExisting) {
    await clearFMRDataForYear(year);
  } else {
    // Check if data already exists
    const existing = await query('SELECT COUNT(*) as count FROM fmr_data WHERE year = $1', [year]);
    if (parseInt(existing[0].count) > 0) {
      console.log(`FMR data for year ${year} already exists. Use --replace to overwrite.`);
      return;
    }
  }

  // Determine data source (URL or file)
  let csvContent: string;
  
  if (url) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      console.log(`Downloading FMR data from: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download FMR data: ${response.status} ${response.statusText}`);
      }
      csvContent = await response.text();
    } else {
      // Treat as file path
      console.log(`Reading FMR data from file: ${url}`);
      const { readFileSync } = await import('fs');
      csvContent = readFileSync(url, 'utf-8');
    }
  } else {
    throw new Error('Please provide --url or --file argument with FMR data source');
  }

  try {

    // Parse CSV
    console.log('Parsing CSV data...');
    const fmrRecords = parseFMRCSV(csvContent, year, effectiveDate);
    console.log(`Parsed ${fmrRecords.length} FMR records`);

    if (fmrRecords.length === 0) {
      throw new Error('No FMR records found in CSV data');
    }

    // Insert records in batches
    const batchSize = 1000;
    for (let i = 0; i < fmrRecords.length; i += batchSize) {
      const batch = fmrRecords.slice(i, i + batchSize);
      await insertFMRRecords(batch);
      console.log(`Processed ${Math.min(i + batchSize, fmrRecords.length)}/${fmrRecords.length} records`);
    }

    console.log(`\n✅ Successfully ingested ${fmrRecords.length} FMR records for year ${year}`);
  } catch (error) {
    console.error(`\n❌ Error ingesting FMR data:`, error);
    throw error;
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: ScriptOptions = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--year' && args[i + 1]) {
      options.year = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--url' && args[i + 1]) {
      options.url = args[i + 1];
      i++;
    } else if (args[i] === '--replace') {
      options.replace = true;
    } else if (args[i] === '--skip-schema') {
      options.skipSchema = true;
    }
  }

  const year = options.year || getCurrentFMRYear();
  const effectiveDate = new Date(year, 9, 1); // October 1st

  ingestFMRData({
    year,
    effectiveDate,
    replaceExisting: options.replace || false,
    url: options.url
  })
    .then(() => {
      console.log('Ingestion complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Ingestion failed:', error);
      process.exit(1);
    });
}

