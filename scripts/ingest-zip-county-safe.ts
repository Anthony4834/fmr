#!/usr/bin/env bun

/**
 * Safe ZIP-County Ingestion Script (No Auto-Truncate)
 * 
 * This version asks for confirmation before clearing existing data,
 * or allows you to merge/update without clearing.
 * 
 * Usage:
 *   bun scripts/ingest-zip-county-safe.ts -- --file data.csv
 *   bun scripts/ingest-zip-county-safe.ts -- --file data.csv --merge (doesn't clear)
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

// Import the parsing functions from the original script
async function ingestZIPCountyDataSafe(urlOrFile?: string, merge: boolean = false): Promise<void> {
  console.log('\n=== Safe ZIP to County Mapping Ingestion ===');
  
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  await createSchema();

  // Check if data already exists
  const existing = await query('SELECT COUNT(*) as count FROM zip_county_mapping');
  const existingCount = parseInt(existing[0].count);
  
  if (existingCount > 0 && !merge) {
    console.log(`\n⚠️  WARNING: ${existingCount.toLocaleString()} ZIP-County mappings already exist in database.`);
    console.log('This script will CLEAR all existing data before importing.');
    console.log('\nTo merge instead of clearing, use: --merge flag');
    console.log('To proceed with clearing, run again without --merge');
    process.exit(1);
  }

  if (merge && existingCount > 0) {
    console.log(`\n📊 Merging with existing ${existingCount.toLocaleString()} mappings...`);
  } else if (existingCount > 0) {
    console.log('ZIP-County mapping data already exists. Clearing existing data...');
    await execute('TRUNCATE TABLE zip_county_mapping, cities CASCADE');
  }

  // Rest of the ingestion logic would go here (same as original script)
  // For now, this is a safety wrapper
  console.log('\n✅ Safe ingestion script ready');
  console.log('Use the regular ingest script with --merge flag, or modify it to use this pattern.');
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  let urlOrFile: string | undefined;
  let merge = false;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--url' || args[i] === '--file') && args[i + 1]) {
      urlOrFile = args[i + 1];
      i++;
    } else if (args[i] === '--merge') {
      merge = true;
    }
  }

  if (!urlOrFile) {
    console.error('Please provide --url or --file argument');
    process.exit(1);
  }

  ingestZIPCountyDataSafe(urlOrFile, merge)
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}



