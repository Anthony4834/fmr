#!/usr/bin/env bun

/**
 * Convert Excel files to CSV
 * Requires: bunx xlsx-cli or manual conversion
 * 
 * Usage:
 *   bun scripts/convert-excel-to-csv.ts <excel-file> <output-csv>
 */

import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: bun scripts/convert-excel-to-csv.ts <excel-file> <output-csv>');
  console.error('');
  console.error('Note: This script requires Excel files to be manually converted to CSV.');
  console.error('You can:');
  console.error('  1. Open in Excel/LibreOffice and Save As CSV');
  console.error('  2. Use online converter');
  console.error('  3. Install xlsx-cli: bunx xlsx-cli <file.xlsx>');
  process.exit(1);
}

console.log('Excel to CSV conversion helper');
console.log('Input:', args[0]);
console.log('Output:', args[1]);
console.log('');
console.log('Please convert the Excel file manually or use:');
console.log(`  bunx xlsx-cli ${args[0]} > ${args[1]}`);


