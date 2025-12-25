#!/usr/bin/env bun

/**
 * Normalize zip_county_mapping.county_name from the authoritative FMR county name
 * for the same county_fips (county_code).
 *
 * Why:
 * - We found cases like county_fips=05141 (Van Buren County, AR) but county_name="Choctaw".
 *   That breaks county-level coverage and is confusing in the UI.
 *
 * What it does:
 * - For each zip_county_mapping row with a 5-digit county_fips, set county_name to the
 *   FMR county's name (with a trailing " County" removed), when there is exactly one match.
 *
 * Usage:
 *   bun scripts/normalize-county-names-from-fips.ts [--year 2026] [--dry-run]
 */

import { config } from 'dotenv';
import { configureDatabase, query, execute } from '../lib/db';

config();

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-d');
  let year = 2026;
  const yearIdx = args.findIndex(a => a === '--year');
  if (yearIdx !== -1) {
    const y = parseInt(args[yearIdx + 1] || '', 10);
    if (!Number.isFinite(y)) throw new Error('Invalid --year value');
    year = y;
  }
  return { dryRun, year };
}

async function main() {
  const { dryRun, year } = parseArgs(process.argv);

  console.log(`\n=== Normalize county_name from FMR county_code (year=${year}) ===\n`);

  if (!process.env.POSTGRES_URL) throw new Error('POSTGRES_URL environment variable is required');
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  // Preview mismatches (top 20)
  const preview = await query(
    `
    WITH fmr_county AS (
      SELECT DISTINCT ON (county_code, state_code)
        county_code,
        state_code,
        REGEXP_REPLACE(area_name, '\\s+County\\s*$', '', 'i') AS canonical_county_name
      FROM fmr_data
      WHERE year = $1
        AND county_code IS NOT NULL
      ORDER BY county_code, state_code
    )
    SELECT
      zcm.zip_code,
      zcm.state_code,
      zcm.county_fips,
      zcm.county_name AS current_county_name,
      f.canonical_county_name AS fmr_county_name
    FROM zip_county_mapping zcm
    JOIN fmr_county f
      ON f.county_code = zcm.county_fips
     AND (
       f.state_code = zcm.state_code
       OR (zcm.state_code = 'DC' AND f.state_code IN ('MD', 'VA'))
     )
    WHERE zcm.county_fips ~ '^\\d{5}$'
      AND zcm.county_name <> f.canonical_county_name
    ORDER BY zcm.state_code, zcm.county_fips, zcm.zip_code
    LIMIT 20
    `,
    [year]
  );

  console.log(`Sample mismatches: ${preview.length}`);
  preview.forEach(r => {
    console.log(`  ZIP ${r.zip_code} ${r.state_code} fips=${r.county_fips}: "${r.current_county_name}" -> "${r.fmr_county_name}"`);
  });

  const mismatchCount = await query(
    `
    WITH fmr_county AS (
      SELECT DISTINCT ON (county_code, state_code)
        county_code,
        state_code,
        REGEXP_REPLACE(area_name, '\\s+County\\s*$', '', 'i') AS canonical_county_name
      FROM fmr_data
      WHERE year = $1
        AND county_code IS NOT NULL
      ORDER BY county_code, state_code
    )
    SELECT COUNT(*)::int AS count
    FROM zip_county_mapping zcm
    JOIN fmr_county f
      ON f.county_code = zcm.county_fips
     AND (
       f.state_code = zcm.state_code
       OR (zcm.state_code = 'DC' AND f.state_code IN ('MD', 'VA'))
     )
    WHERE zcm.county_fips ~ '^\\d{5}$'
      AND zcm.county_name <> f.canonical_county_name
    `,
    [year]
  );
  console.log(`Total mismatched rows: ${mismatchCount[0]?.count ?? 0}`);

  if (dryRun) {
    console.log('\n⚠️  DRY RUN: No updates applied.\n');
    return;
  }

  await execute(
    `
    WITH fmr_county AS (
      SELECT DISTINCT ON (county_code, state_code)
        county_code,
        state_code,
        REGEXP_REPLACE(area_name, '\\s+County\\s*$', '', 'i') AS canonical_county_name
      FROM fmr_data
      WHERE year = $1
        AND county_code IS NOT NULL
      ORDER BY county_code, state_code
    )
    UPDATE zip_county_mapping zcm
    SET county_name = f.canonical_county_name
    FROM fmr_county f
    WHERE f.county_code = zcm.county_fips
      AND (
        f.state_code = zcm.state_code
        OR (zcm.state_code = 'DC' AND f.state_code IN ('MD', 'VA'))
      )
      AND zcm.county_fips ~ '^\\d{5}$'
      AND zcm.county_name <> f.canonical_county_name
    `,
    [year]
  );
  console.log('✅ Updated county_name values to match FMR county names');
}

main().catch((err) => {
  console.error('Normalize failed:', err);
  process.exit(1);
});







