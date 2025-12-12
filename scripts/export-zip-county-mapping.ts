#!/usr/bin/env bun

/**
 * Export ZIP-County Mapping Data
 * 
 * Exports the entire zip_county_mapping table to a text file for backup/restore purposes.
 * 
 * Usage:
 *   bun run scripts/export-zip-county-mapping.ts [--output filename.txt]
 */

import { config } from 'dotenv';
import { writeFileSync } from 'fs';
import { sql } from '@vercel/postgres';

config();

async function exportZipCountyMapping(outputFile: string = 'zip-county-mapping-backup.txt'): Promise<void> {
  console.log('\n=== Exporting ZIP-County Mapping Data ===\n');
  
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }

  // Get all ZIP-County mappings
  console.log('Fetching all ZIP-County mappings...');
  const result = await sql`
    SELECT 
      zip_code,
      county_name,
      state_code,
      state_name,
      county_fips,
      created_at
    FROM zip_county_mapping
    ORDER BY state_code, county_name, zip_code
  `;

  const results = result.rows;
  console.log(`Found ${results.length} ZIP-County mapping records`);

  // Format as tab-separated values for easy import
  const lines = [
    'ZIP Code\tCounty Name\tState Code\tState Name\tCounty FIPS\tCreated At',
    ...results.map(row => {
      return [
        String(row.zip_code || ''),
        String(row.county_name || ''),
        String(row.state_code || ''),
        String(row.state_name || ''),
        String(row.county_fips || ''),
        row.created_at ? new Date(row.created_at).toISOString() : ''
      ].join('\t');
    })
  ];

  // Write to file
  const content = lines.join('\n');
  writeFileSync(outputFile, content, 'utf-8');

  console.log(`\n✅ Successfully exported ${results.length} records to: ${outputFile}`);
  console.log(`File size: ${(content.length / 1024).toFixed(2)} KB\n`);
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  let outputFile = 'zip-county-mapping-backup.txt';

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--output' || args[i] === '-o') && args[i + 1]) {
      outputFile = args[i + 1];
      i++;
    }
  }

  exportZipCountyMapping(outputFile)
    .then(() => {
      console.log('Export complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Export failed:', error);
      process.exit(1);
    });
}

export { exportZipCountyMapping };



