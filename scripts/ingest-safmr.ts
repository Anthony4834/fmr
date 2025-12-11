#!/usr/bin/env bun

/**
 * SAFMR Data Ingestion Script
 * 
 * Downloads and indexes HUD Small Area Fair Market Rent data for a specified year.
 * This script is reusable and configurable for different years.
 * 
 * Usage:
 *   bun run ingest:safmr -- --year 2024
 *   bun run ingest:safmr -- --year 2024 --url <custom-url>
 *   bun run ingest:safmr -- --year 2024 --replace
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
  SAFMRRecord,
  clearSAFMRDataForYear,
  insertSAFMRRecords,
  getCurrentFMRYear,
  normalizeZipCode
} from '../lib/ingestion-utils';

config();

interface ScriptOptions {
  year?: number;
  url?: string;
  replace?: boolean;
  skipSchema?: boolean;
}

/**
 * Default HUD SAFMR data URL pattern
 * Note: You'll need to update this with the actual HUD URL structure
 */
function getDefaultSAFMRUrl(year: number): string {
  // HUD typically publishes SAFMR data at:
  // https://www.huduser.gov/portal/datasets/fmr/smallarea/safmr_YYYY.csv
  // Or similar pattern - adjust based on actual HUD URL structure
  return `https://www.huduser.gov/portal/datasets/fmr/smallarea/safmr_${year}.csv`;
}

/**
 * Parses SAFMR CSV data into structured records
 * Adjust column mapping based on actual HUD CSV structure
 */
function parseSAFMRCSV(csvContent: string, year: number, effectiveDate?: Date): SAFMRRecord[] {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  const safmrRecords: SAFMRRecord[] = [];
  const seen = new Set<string>(); // Track unique records

  for (const row of records) {
    try {
      // Map CSV columns to SAFMRRecord structure
      // HUD FY 2026 format: ZIP Code, SAFMR 0BR-4BR (headers may have newlines)
      const zipCode = normalizeZipCode(
        row['ZIP\nCode'] || row['ZIP Code'] || row['zip_code'] || row['zip'] || row['zipcode'] || ''
      );

      if (!zipCode || zipCode.length !== 5) {
        continue; // Skip invalid ZIP codes
      }

      // Check for duplicates using unique constraint key
      const key = `${year}-${zipCode}`;
      if (seen.has(key)) {
        continue; // Skip duplicate
      }
      seen.add(key);

      const record: SAFMRRecord = {
        year,
        zipCode,
        bedroom0: parseFloat(row['SAFMR\n0BR'] || row['SAFMR 0BR'] || row['bedroom_0'] || row['efficiency'] || row['0br'] || '0') || undefined,
        bedroom1: parseFloat(row['SAFMR\n1BR'] || row['SAFMR 1BR'] || row['bedroom_1'] || row['1br'] || '0') || undefined,
        bedroom2: parseFloat(row['SAFMR\n2BR'] || row['SAFMR 2BR'] || row['bedroom_2'] || row['2br'] || '0') || undefined,
        bedroom3: parseFloat(row['SAFMR\n3BR'] || row['SAFMR 3BR'] || row['bedroom_3'] || row['3br'] || '0') || undefined,
        bedroom4: parseFloat(row['SAFMR\n4BR'] || row['SAFMR 4BR'] || row['bedroom_4'] || row['4br'] || '0') || undefined,
        effectiveDate: effectiveDate || undefined
      };

      safmrRecords.push(record);
    } catch (error) {
      console.warn(`Error parsing row:`, row, error);
    }
  }

  return safmrRecords;
}

/**
 * Main ingestion function - reusable and configurable
 */
export async function ingestSAFMRData(config: IngestionConfig & { url?: string }): Promise<void> {
  const { year, effectiveDate, replaceExisting, url } = config;
  
  console.log(`\n=== SAFMR Data Ingestion for Year ${year} ===`);
  
  // Get database connection
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  // Create schema if needed
  await createSchema();

  // Clear existing data if replacing
  if (replaceExisting) {
    await clearSAFMRDataForYear(year);
  } else {
    // Check if data already exists
    const existing = await query('SELECT COUNT(*) as count FROM safmr_data WHERE year = $1', [year]);
    if (parseInt(existing[0].count) > 0) {
      console.log(`SAFMR data for year ${year} already exists. Use --replace to overwrite.`);
      return;
    }
  }

  // Determine data source (URL or file)
  let csvContent: string;
  
  if (url) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      console.log(`Downloading SAFMR data from: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download SAFMR data: ${response.status} ${response.statusText}`);
      }
      csvContent = await response.text();
    } else {
      // Treat as file path
      console.log(`Reading SAFMR data from file: ${url}`);
      const { readFileSync } = await import('fs');
      csvContent = readFileSync(url, 'utf-8');
    }
  } else {
    throw new Error('Please provide --url or --file argument with SAFMR data source');
  }

  try {

    // Parse CSV
    console.log('Parsing CSV data...');
    const safmrRecords = parseSAFMRCSV(csvContent, year, effectiveDate);
    console.log(`Parsed ${safmrRecords.length} SAFMR records`);

    if (safmrRecords.length === 0) {
      throw new Error('No SAFMR records found in CSV data');
    }

    // Insert records in batches
    const batchSize = 1000;
    for (let i = 0; i < safmrRecords.length; i += batchSize) {
      const batch = safmrRecords.slice(i, i + batchSize);
      await insertSAFMRRecords(batch);
      console.log(`Processed ${Math.min(i + batchSize, safmrRecords.length)}/${safmrRecords.length} records`);
    }

    console.log(`\n✅ Successfully ingested ${safmrRecords.length} SAFMR records for year ${year}`);
  } catch (error) {
    console.error(`\n❌ Error ingesting SAFMR data:`, error);
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
    } else if ((args[i] === '--url' || args[i] === '--file') && args[i + 1]) {
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

  ingestSAFMRData({
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

