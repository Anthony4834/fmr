#!/usr/bin/env bun

/**
 * Export ZIP County Mapping Issues to CSV
 * 
 * Exports detailed data about ZIP codes with mapping issues for further analysis.
 * 
 * Usage:
 *   bun scripts/export-mapping-issues.ts [--type NO_MAPPING|MULTIPLE_MAPPINGS|all] [--limit 1000]
 */

import { config } from 'dotenv';
import { writeFileSync } from 'fs';
import { configureDatabase, query } from '../lib/db';

config();

async function exportMappingIssues() {
  const args = process.argv.slice(2);
  let issueType: string | null = null;
  let limit = 10000;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' && args[i + 1]) {
      issueType = args[i + 1];
      i++;
    }
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1]);
      i++;
    }
  }

  console.log('\n=== Exporting ZIP County Mapping Issues ===\n');

  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  let whereClause = '';
  if (issueType && issueType !== 'all') {
    whereClause = `WHERE issue_type = '${issueType}'`;
  }

  console.log(`Fetching data${issueType ? ` (type: ${issueType})` : ' (all types)'}...`);
  
  const results = await query(`
    SELECT 
      zip_code,
      issue_type,
      county_count,
      counties
    FROM zip_county_mapping_issues
    ${whereClause}
    ORDER BY issue_type, zip_code
    LIMIT ${limit}
  `);

  console.log(`Found ${results.length} records`);

  // Convert to CSV
  const csvRows = [
    'zip_code,issue_type,county_count,counties'
  ];

  for (const row of results) {
    const counties = (row.counties || '').replace(/"/g, '""'); // Escape quotes
    csvRows.push(`"${row.zip_code}","${row.issue_type}",${row.county_count},"${counties}"`);
  }

  const csvContent = csvRows.join('\n');
  const filename = `zip-mapping-issues-${issueType || 'all'}-${Date.now()}.csv`;
  writeFileSync(filename, csvContent, 'utf-8');

  console.log(`\n✅ Exported ${results.length} records to: ${filename}`);
  console.log(`\nTo analyze:`);
  console.log(`  - Open in Excel/Google Sheets`);
  console.log(`  - Filter by issue_type column`);
  console.log(`  - Review counties column for MULTIPLE_MAPPINGS`);
  console.log(`\n`);
}

exportMappingIssues()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error exporting mapping issues:', error);
    process.exit(1);
  });




