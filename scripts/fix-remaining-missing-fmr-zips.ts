#!/usr/bin/env bun

/**
 * Fix the remaining "missing FMR" ZIPs by correcting known bad/legacy ZIP→county FIPS mappings.
 *
 * This is intentionally small + targeted (based on the current residual list).
 *
 * What it does:
 * - Pads numeric `county_fips` to 5 digits (e.g. "8051" -> "08051")
 * - Fixes 03804 (Rockingham, NH) county_fips to 33015
 * - Fixes legacy "Valdez-Cordova" AK ZIPs to current census areas:
 *   - 99588 -> Copper River Census Area (02066)
 *   - 99686, 99693 -> Chugach Census Area (02063)
 * - Fixes MP ZIPs to use the territory-wide FMR county_code used by HUD (69999)
 *
 * Usage:
 *   bun scripts/fix-remaining-missing-fmr-zips.ts [--dry-run]
 */

import { config } from 'dotenv';
import { configureDatabase, execute, query } from '../lib/db';

config();

async function main() {
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');

  console.log('\n=== Fix remaining missing-FMR ZIP mappings ===\n');

  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  const before = await query(
    `SELECT COUNT(*)::int AS count
     FROM zip_county_mapping
     WHERE county_fips IS NULL OR county_fips !~ '^\\d{5}$'`
  );
  console.log(`Rows with NULL/non-5-digit county_fips (before): ${before[0]?.count ?? 0}`);

  // 1) Pad numeric FIPS codes that are 1-4 digits (common bug from earlier scripts)
  const padPreview = await query(
    `SELECT COUNT(*)::int AS count
     FROM zip_county_mapping
     WHERE county_fips ~ '^\\d{1,4}$'`
  );
  console.log(`Pad candidates (1-4 digit county_fips): ${padPreview[0]?.count ?? 0}`);
  if (!dryRun) {
    await execute(
      `UPDATE zip_county_mapping
       SET county_fips = LPAD(county_fips, 5, '0')
       WHERE county_fips ~ '^\\d{1,4}$'`
    );
    console.log('✅ Padded short numeric county_fips values');
  } else {
    console.log('⚠️  DRY RUN: Padding not applied');
  }

  // 2) Fix 03804 to Rockingham County, NH (county_code 33015)
  // (it was previously carrying York County, ME FIPS 23031)
  const rockingham = await query(
    `SELECT county_code
     FROM fmr_data
     WHERE year = 2026 AND state_code = 'NH' AND area_name ILIKE '%Rockingham%'
     LIMIT 1`
  );
  const rockinghamFips = rockingham[0]?.county_code || '33015';
  console.log(`Rockingham NH county_code from fmr_data: ${rockinghamFips}`);
  if (!dryRun) {
    await execute(
      `UPDATE zip_county_mapping
       SET county_fips = $1,
           county_name = 'Rockingham',
           state_name = 'New Hampshire'
       WHERE zip_code = '03804'
         AND state_code = 'NH'`,
      [rockinghamFips]
    );
    console.log('✅ Fixed ZIP 03804 county_fips to Rockingham NH');
  } else {
    console.log('⚠️  DRY RUN: 03804 fix not applied');
  }

  // 3) Fix Alaska legacy "Valdez-Cordova" mappings.
  // HUD FMR data uses the post-split census areas for 2026 (02063 / 02066).
  if (!dryRun) {
    await execute(
      `UPDATE zip_county_mapping
       SET county_name = 'Copper River Census Area',
           county_fips = '02066',
           state_name = 'Alaska'
       WHERE zip_code = '99588' AND state_code = 'AK'`
    );
    await execute(
      `UPDATE zip_county_mapping
       SET county_name = 'Chugach Census Area',
           county_fips = '02063',
           state_name = 'Alaska'
       WHERE zip_code IN ('99686','99693') AND state_code = 'AK'`
    );
    console.log('✅ Fixed AK Valdez-Cordova legacy ZIPs to Copper River / Chugach census areas');
  } else {
    console.log('⚠️  DRY RUN: AK Valdez-Cordova fixes not applied');
  }

  // 4) MP: HUD FMR uses a territory-wide county_code (69999) for Northern Mariana Islands in our ingestion.
  // Update municipality rows to use that code so the FIPS join works.
  if (!dryRun) {
    await execute(
      `UPDATE zip_county_mapping
       SET county_fips = '69999',
           state_name = 'Northern Mariana Islands'
       WHERE zip_code IN ('96950','96951','96952') AND state_code = 'MP'`
    );
    console.log('✅ Fixed MP ZIPs to county_fips=69999 (territory-wide FMR row)');
  } else {
    console.log('⚠️  DRY RUN: MP fixes not applied');
  }

  const after = await query(
    `SELECT COUNT(*)::int AS count
     FROM zip_county_mapping
     WHERE county_fips IS NULL OR county_fips !~ '^\\d{5}$'`
  );
  console.log(`\nRows with NULL/non-5-digit county_fips (after): ${after[0]?.count ?? 0}`);

  console.log('\nNext: re-run `bun run create-test-views` and refresh /test-coverage.\n');
}

main().catch((err) => {
  console.error('Fix script failed:', err);
  process.exit(1);
});


