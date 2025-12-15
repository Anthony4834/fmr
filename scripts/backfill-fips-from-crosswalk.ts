#!/usr/bin/env bun

/**
 * Backfill missing county_fips in zip_county_mapping using the county-name-fips-crosswalk.csv file.
 * 
 * This is more comprehensive than backfill-county-fips.ts because it uses a complete
 * crosswalk file rather than matching to fmr_county_metro.
 */

import { config } from 'dotenv';
import { configureDatabase, query, execute } from '../lib/db';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

config();

interface CrosswalkRecord {
  fips: string;
  name: string;
  state: string;
}

function parseCrosswalk(filePath: string): CrosswalkRecord[] {
  const content = readFileSync(filePath, 'utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  return records
    .filter((r: any) => {
      // Filter out state-level entries (fips like "0", "1000", etc. that aren't 5 digits)
      const fips = String(r.fips || '').trim();
      return fips.length === 5 && /^\d{5}$/.test(fips) && r.state && r.state !== 'NA';
    })
    .map((r: any) => ({
      fips: String(r.fips).trim().padStart(5, '0'),
      name: String(r.name || '').trim(),
      state: String(r.state || '').trim().toUpperCase()
    }));
}

async function backfillFromCrosswalk(crosswalkPath: string, dryRun: boolean = false, fixMismatches: boolean = false) {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  console.log('\n=== Backfilling FIPS from Crosswalk ===\n');
  console.log(`Reading crosswalk from: ${crosswalkPath}`);

  const crosswalk = parseCrosswalk(crosswalkPath);
  console.log(`Loaded ${crosswalk.length} county FIPS entries from crosswalk\n`);

  // Check current state
  const before = await query(
    `SELECT COUNT(*)::int AS count
     FROM zip_county_mapping
     WHERE county_fips IS NULL OR county_fips !~ '^\\d{5}$'`
  );
  console.log(`Rows with NULL/invalid county_fips (before): ${before[0]?.count ?? 0}`);

  // Create a map for quick lookup: state + normalized county name -> FIPS
  const crosswalkMap = new Map<string, string>();
  for (const record of crosswalk) {
    // Normalize county name (remove "County", "Parish", etc.)
    const normalized = record.name
      .replace(/\s+(County|Parish|Borough|Municipality|Census Area|City and Borough)\s*$/i, '')
      .trim()
      .toLowerCase();
    const key = `${record.state}|${normalized}`;
    
    // If there are duplicates, prefer the one that already exists
    if (!crosswalkMap.has(key)) {
      crosswalkMap.set(key, record.fips);
    }
  }

  console.log(`Created lookup map with ${crosswalkMap.size} entries\n`);

  // Get all zip_county_mapping rows (including those with FIPS for validation)
  const allMappings = await query(
    `SELECT DISTINCT
       zip_code,
       county_name,
       state_code,
       county_fips
     FROM zip_county_mapping
     ORDER BY state_code, county_name`
  );

  const missingFips = allMappings.filter((r: any) => 
    !r.county_fips || !/^\d{5}$/.test(String(r.county_fips).trim())
  );

  console.log(`Found ${allMappings.length} total ZIP-county mappings`);
  console.log(`Found ${missingFips.length} ZIP-county mappings needing FIPS\n`);

  let matched = 0;
  let mismatched = 0;
  let updated = 0;
  const updates: Array<{ zip: string; county: string; state: string; fips: string; existing?: string }> = [];
  const mismatches: Array<{ zip: string; county: string; state: string; existing: string; correct: string }> = [];

  for (const row of allMappings) {
    const countyName = String(row.county_name || '').trim();
    const stateCode = String(row.state_code || '').trim().toUpperCase();
    const existingFips = row.county_fips ? String(row.county_fips).trim() : null;
    
    // Try exact match first
    const normalized = countyName
      .replace(/\s+(County|Parish|Borough|Municipality|Census Area|City and Borough)\s*$/i, '')
      .trim()
      .toLowerCase();
    const key = `${stateCode}|${normalized}`;
    
    const correctFips = crosswalkMap.get(key);
    if (correctFips) {
      if (!existingFips || !/^\d{5}$/.test(existingFips)) {
        // Missing FIPS - add to updates
        matched++;
        updates.push({
          zip: String(row.zip_code),
          county: countyName,
          state: stateCode,
          fips: correctFips
        });
      } else if (existingFips !== correctFips) {
        // Mismatched FIPS - log for review
        mismatched++;
        mismatches.push({
          zip: String(row.zip_code),
          county: countyName,
          state: stateCode,
          existing: existingFips,
          correct: correctFips
        });
      }
    }
  }

  console.log(`Matched ${matched} county names needing FIPS codes`);
  if (mismatched > 0) {
    console.log(`Found ${mismatched} county names with mismatched FIPS codes\n`);
  } else {
    console.log();
  }

  if (dryRun) {
    if (updates.length > 0) {
      console.log('⚠️  DRY RUN: Would add FIPS codes to the following:');
      updates.slice(0, 20).forEach(u => {
        console.log(`  ${u.zip}: ${u.county}, ${u.state} -> ${u.fips}`);
      });
      if (updates.length > 20) {
        console.log(`  ... and ${updates.length - 20} more`);
      }
      console.log();
    }
    
    if (mismatches.length > 0) {
      console.log('⚠️  DRY RUN: Found FIPS mismatches (would need --fix-mismatches to update):');
      mismatches.slice(0, 20).forEach(m => {
        console.log(`  ${m.zip}: ${m.county}, ${m.state} -> existing: ${m.existing}, correct: ${m.correct}`);
      });
      if (mismatches.length > 20) {
        console.log(`  ... and ${mismatches.length - 20} more`);
      }
      console.log();
    }
    
    console.log('⚠️  DRY RUN: No updates applied');
    console.log('   Use without --dry-run to apply updates');
    if (mismatches.length > 0) {
      console.log('   Use --fix-mismatches to also fix mismatched FIPS codes');
    }
    return;
  }

  // Add mismatches to updates if fixMismatches is enabled
  if (fixMismatches && mismatches.length > 0) {
    console.log(`\nIncluding ${mismatches.length} mismatched FIPS in updates...`);
    for (const m of mismatches) {
      updates.push({
        zip: m.zip,
        county: m.county,
        state: m.state,
        fips: m.correct,
        existing: m.existing
      });
    }
  }

  // Batch update
  if (updates.length > 0) {
    const batchSize = 1000;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      for (const update of batch) {
        placeholders.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
        values.push(update.zip, update.county, update.state, update.fips);
      }

      const queryText = `
        UPDATE zip_county_mapping z
        SET county_fips = v.fips::varchar(5)
        FROM (VALUES ${placeholders.join(', ')}) AS v(zip_code, county_name, state_code, fips)
        WHERE z.zip_code = v.zip_code
          AND z.county_name = v.county_name
          AND z.state_code = v.state_code
          AND (z.county_fips IS NULL OR z.county_fips !~ '^\\d{5}$')
      `;

      await execute(queryText, values);
      updated += batch.length;
      console.log(`Updated ${updated}/${updates.length} mappings...`);
    }
  }

  const after = await query(
    `SELECT COUNT(*)::int AS count
     FROM zip_county_mapping
     WHERE county_fips IS NULL OR county_fips !~ '^\\d{5}$'`
  );
  console.log(`\nRows with NULL/invalid county_fips (after): ${after[0]?.count ?? 0}`);
  console.log(`\n✅ Backfilled ${updated} FIPS codes from crosswalk`);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('-d');
const fixMismatches = args.includes('--fix-mismatches');
const crosswalkPath = args.find(arg => !arg.startsWith('--')) || 'data/county-name-fips-crosswalk.csv';

backfillFromCrosswalk(crosswalkPath, dryRun, fixMismatches).catch(console.error);
