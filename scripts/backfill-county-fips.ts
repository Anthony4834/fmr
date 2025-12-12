#!/usr/bin/env bun

/**
 * Backfill missing county_fips in zip_county_mapping from fmr_county_metro.
 *
 * Why:
 * - Many zip_county_mapping rows have county_fips NULL.
 * - That makes FIPS-join based coverage and lookups unreliable.
 * - We already ingest authoritative county FIPS into fmr_county_metro from HUD FMR CSV.
 *
 * What it does:
 * - For a target year (default 2026), fill zip_county_mapping.county_fips where NULL
 *   by joining on (state_code, county_name) to fmr_county_metro(year, state_code, county_name).
 * - A second pass tries a suffix-normalized county name match (still requires 1 unique FIPS).
 *
 * Usage:
 *   bun scripts/backfill-county-fips.ts [--year 2026] [--dry-run]
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

  console.log(`\n=== Backfilling county_fips from fmr_county_metro (year=${year}) ===\n`);

  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  const before = await query(
    `SELECT COUNT(*)::int AS count
     FROM zip_county_mapping
     WHERE county_fips IS NULL`
  );
  console.log(`Rows with NULL county_fips (before): ${before[0]?.count ?? 0}`);

  // PASS 1: exact match on county_name + state_code
  const pass1Preview = await query(
    `
    WITH matches AS (
      SELECT
        zcm.zip_code,
        zcm.county_name,
        zcm.state_code,
        MIN(fcm.county_fips) AS county_fips,
        COUNT(DISTINCT fcm.county_fips) AS fips_count
      FROM zip_county_mapping zcm
      JOIN fmr_county_metro fcm
        ON fcm.year = $1
       AND fcm.state_code = zcm.state_code
       AND fcm.county_name = zcm.county_name
      WHERE zcm.county_fips IS NULL
        AND zcm.state_code != 'PR'
        AND fcm.county_fips IS NOT NULL
      GROUP BY zcm.zip_code, zcm.county_name, zcm.state_code
      HAVING COUNT(DISTINCT fcm.county_fips) = 1
    )
    SELECT COUNT(*)::int AS count
    FROM matches
    `,
    [year]
  );
  console.log(`Pass 1 candidates (exact county/state match): ${pass1Preview[0]?.count ?? 0}`);

  if (!dryRun) {
    await execute(
      `
      WITH matches AS (
        SELECT
          zcm.zip_code,
          zcm.county_name,
          zcm.state_code,
          MIN(fcm.county_fips) AS county_fips,
          COUNT(DISTINCT fcm.county_fips) AS fips_count
        FROM zip_county_mapping zcm
        JOIN fmr_county_metro fcm
          ON fcm.year = $1
         AND fcm.state_code = zcm.state_code
         AND fcm.county_name = zcm.county_name
        WHERE zcm.county_fips IS NULL
          AND zcm.state_code != 'PR'
          AND fcm.county_fips IS NOT NULL
        GROUP BY zcm.zip_code, zcm.county_name, zcm.state_code
        HAVING COUNT(DISTINCT fcm.county_fips) = 1
      )
      UPDATE zip_county_mapping z
      SET county_fips = m.county_fips
      FROM matches m
      WHERE z.zip_code = m.zip_code
        AND z.county_name = m.county_name
        AND z.state_code = m.state_code
        AND z.county_fips IS NULL
      `,
      [year]
    );
    console.log('✅ Pass 1 applied');
  } else {
    console.log('⚠️  DRY RUN: Pass 1 not applied');
  }

  // PASS 2: suffix-normalized match (still requires a unique FIPS per normalized name+state)
  // We only apply where county_fips is still NULL after pass 1.
  const pass2Preview = await query(
    `
    WITH norm AS (
      SELECT
        zcm.zip_code,
        zcm.county_name,
        zcm.state_code,
        LOWER(TRIM(REGEXP_REPLACE(
          zcm.county_name,
          '\\s+(County|Parish|Borough|Municipality|Census Area|City and Borough)\\s*$',
          '',
          'i'
        ))) AS norm_name
      FROM zip_county_mapping zcm
      WHERE zcm.county_fips IS NULL
        AND zcm.state_code != 'PR'
    ),
    fcm_norm AS (
      SELECT
        fcm.state_code,
        LOWER(TRIM(REGEXP_REPLACE(
          fcm.county_name,
          '\\s+(County|Parish|Borough|Municipality|Census Area|City and Borough)\\s*$',
          '',
          'i'
        ))) AS norm_name,
        fcm.county_fips
      FROM fmr_county_metro fcm
      WHERE fcm.year = $1
        AND fcm.county_fips IS NOT NULL
    ),
    matches AS (
      SELECT
        n.zip_code,
        n.county_name,
        n.state_code,
        MIN(fn.county_fips) AS county_fips,
        COUNT(DISTINCT fn.county_fips) AS fips_count
      FROM norm n
      JOIN fcm_norm fn
        ON fn.state_code = n.state_code
       AND fn.norm_name = n.norm_name
      GROUP BY n.zip_code, n.county_name, n.state_code
      HAVING COUNT(DISTINCT fn.county_fips) = 1
    )
    SELECT COUNT(*)::int AS count
    FROM matches
    `,
    [year]
  );
  console.log(`Pass 2 candidates (normalized suffix match): ${pass2Preview[0]?.count ?? 0}`);

  if (!dryRun) {
    await execute(
      `
      WITH norm AS (
        SELECT
          zcm.zip_code,
          zcm.county_name,
          zcm.state_code,
          LOWER(TRIM(REGEXP_REPLACE(
            zcm.county_name,
            '\\s+(County|Parish|Borough|Municipality|Census Area|City and Borough)\\s*$',
            '',
            'i'
          ))) AS norm_name
        FROM zip_county_mapping zcm
        WHERE zcm.county_fips IS NULL
          AND zcm.state_code != 'PR'
      ),
      fcm_norm AS (
        SELECT
          fcm.state_code,
          LOWER(TRIM(REGEXP_REPLACE(
            fcm.county_name,
            '\\s+(County|Parish|Borough|Municipality|Census Area|City and Borough)\\s*$',
            '',
            'i'
          ))) AS norm_name,
          fcm.county_fips
        FROM fmr_county_metro fcm
        WHERE fcm.year = $1
          AND fcm.county_fips IS NOT NULL
      ),
      matches AS (
        SELECT
          n.zip_code,
          n.county_name,
          n.state_code,
          MIN(fn.county_fips) AS county_fips,
          COUNT(DISTINCT fn.county_fips) AS fips_count
        FROM norm n
        JOIN fcm_norm fn
          ON fn.state_code = n.state_code
         AND fn.norm_name = n.norm_name
        GROUP BY n.zip_code, n.county_name, n.state_code
        HAVING COUNT(DISTINCT fn.county_fips) = 1
      )
      UPDATE zip_county_mapping z
      SET county_fips = m.county_fips
      FROM matches m
      WHERE z.zip_code = m.zip_code
        AND z.county_name = m.county_name
        AND z.state_code = m.state_code
        AND z.county_fips IS NULL
      `,
      [year]
    );
    console.log('✅ Pass 2 applied');
  } else {
    console.log('⚠️  DRY RUN: Pass 2 not applied');
  }

  const after = await query(
    `SELECT COUNT(*)::int AS count
     FROM zip_county_mapping
     WHERE county_fips IS NULL`
  );
  console.log(`\nRows with NULL county_fips (after): ${after[0]?.count ?? 0}`);

  console.log('\nNext: run `bun run create-test-views` and re-check ZIP Codes missing list.\n');
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});

