#!/usr/bin/env bun

/**
 * Ingest CBSA (Core Based Statistical Area) to ZIP code mapping
 *
 * This maps ZIP codes to their corresponding metro areas (CBSAs) so we can
 * join metro-level ZORDI data to ZIP-level data.
 *
 * Data source: HUD USPS ZIP Code Crosswalk Files
 * https://www.huduser.gov/portal/datasets/usps_crosswalk.html
 *
 * Usage:
 *   bun scripts/ingest-cbsa-mapping.ts
 *   bun scripts/ingest-cbsa-mapping.ts --year 2024
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';
import { execute, query } from '../lib/db';
import { parse } from 'csv-parse';
import { Readable } from 'stream';

config();

function normalizeZip(zip: unknown): string {
  const raw = String(zip ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 5) return digits;
  if (digits.length < 5) return digits.padStart(5, '0');
  return digits.slice(0, 5);
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);

  let year = new Date().getFullYear();
  let quarter = Math.ceil((new Date().getMonth() + 1) / 3);

  for (let i = 0; i < args.length; i++) {
    const a = args[i];

    if (a === '--year' && args[i + 1]) {
      const n = parseInt(args[i + 1], 10);
      if (Number.isFinite(n) && n >= 2010 && n <= 2030) {
        year = n;
      }
      i++;
      continue;
    }

    if (a === '--quarter' && args[i + 1]) {
      const n = parseInt(args[i + 1], 10);
      if (Number.isFinite(n) && n >= 1 && n <= 4) {
        quarter = n;
      }
      i++;
      continue;
    }
  }

  return { year, quarter };
}

function getHudCrossWalkUrl(year: number, quarter: number) {
  // HUD provides quarterly ZIP-CBSA crosswalk files
  // Format: ZIP_CBSA_YYYY_QQ.xlsx (but also available as CSV through their API)
  // We'll use the USPS ZIP to CBSA crosswalk
  return `https://www.huduser.gov/hudapi/public/usps?type=5&query=${year}${quarter.toString().padStart(2, '0')}`;
}

async function ensureCbsaTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS cbsa_zip_mapping (
      id SERIAL PRIMARY KEY,
      zip_code VARCHAR(10) NOT NULL,
      cbsa_code VARCHAR(10) NOT NULL,
      cbsa_name TEXT NOT NULL,
      state_code VARCHAR(2),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(zip_code, cbsa_code)
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_cbsa_zip ON cbsa_zip_mapping(zip_code);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cbsa_code ON cbsa_zip_mapping(cbsa_code);`;
}

async function upsertBatch(
  rows: Array<{
    zip_code: string;
    cbsa_code: string;
    cbsa_name: string;
    state_code: string | null;
  }>
) {
  if (rows.length === 0) return;

  const values: any[] = [];
  const placeholders: string[] = [];
  let paramIndex = 1;

  for (const r of rows) {
    placeholders.push(
      `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, NOW())`
    );
    values.push(r.zip_code, r.cbsa_code, r.cbsa_name, r.state_code);
  }

  const queryText = `
    INSERT INTO cbsa_zip_mapping (zip_code, cbsa_code, cbsa_name, state_code, created_at)
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (zip_code, cbsa_code)
    DO UPDATE SET
      cbsa_name = EXCLUDED.cbsa_name,
      state_code = EXCLUDED.state_code
  `;

  await execute(queryText, values);
}

// Alternative: Build CBSA mapping from existing fmr_county_metro data
// This uses HUD's FMR area codes which map to CBSAs
async function buildCbsaMappingFromFmrData() {
  console.log('\n=== Building CBSA mapping from existing FMR county-metro data ===');

  // Get latest year of FMR county-metro data
  const yearResult = await query('SELECT MAX(year) as latest_year FROM fmr_county_metro');
  const year = yearResult[0]?.latest_year || new Date().getFullYear();

  console.log(`Using FMR county-metro data from year: ${year}`);

  // Build mapping: ZIP -> County -> Metro (CBSA equivalent)
  // HUD area codes like "METRO33860M33860" contain the CBSA code (33860)
  const result = await query(`
    WITH metro_counties AS (
      SELECT DISTINCT
        fcm.county_fips,
        fcm.state_code,
        fcm.hud_area_code,
        fcm.hud_area_name,
        -- Extract CBSA code from HUD area code (e.g., METRO33860M33860 -> 33860)
        CASE
          WHEN fcm.hud_area_code LIKE 'METRO%' THEN
            REGEXP_REPLACE(fcm.hud_area_code, '^METRO(\\d+).*', '\\1')
          ELSE NULL
        END as cbsa_code
      FROM fmr_county_metro fcm
      WHERE fcm.year = $1
        AND fcm.is_metro = true
        AND fcm.hud_area_code IS NOT NULL
    )
    SELECT DISTINCT
      zcm.zip_code,
      mc.cbsa_code,
      mc.hud_area_name as cbsa_name,
      zcm.state_code
    FROM zip_county_mapping zcm
    JOIN metro_counties mc ON
      mc.county_fips = zcm.county_fips
      AND mc.state_code = zcm.state_code
    WHERE mc.cbsa_code IS NOT NULL
      AND LENGTH(mc.cbsa_code) >= 4
  `, [year]);

  console.log(`Found ${result.length} ZIP-to-CBSA mappings`);

  if (result.length === 0) {
    console.log('No mappings found. Check if fmr_county_metro and zip_county_mapping have data.');
    return 0;
  }

  // Insert in batches (deduplicate by zip_code + cbsa_code first)
  const seen = new Set<string>();
  const batch: Array<{
    zip_code: string;
    cbsa_code: string;
    cbsa_name: string;
    state_code: string | null;
  }> = [];

  let totalInserted = 0;

  for (const row of result) {
    const zip = normalizeZip(row.zip_code);
    const cbsa = String(row.cbsa_code).trim();
    const key = `${zip}-${cbsa}`;
    
    // Skip duplicates
    if (seen.has(key)) continue;
    seen.add(key);

    batch.push({
      zip_code: zip,
      cbsa_code: cbsa,
      cbsa_name: String(row.cbsa_name).trim(),
      state_code: row.state_code || null,
    });

    if (batch.length >= 1000) {
      const flushed = batch.splice(0, batch.length);
      await upsertBatch(flushed);
      totalInserted += flushed.length;
      if (totalInserted % 10000 === 0) {
        console.log(`... upserted ~${totalInserted} rows so far`);
      }
    }
  }

  if (batch.length > 0) {
    await upsertBatch(batch);
    totalInserted += batch.length;
  }

  console.log(`CBSA mapping complete. Upserted ~${totalInserted} rows.`);
  return totalInserted;
}

// Alternative: Try to match ZORDI metro names to ZIPs via existing data
async function buildCbsaMappingFromZordi() {
  console.log('\n=== Building CBSA mapping from ZORDI metro names ===');

  // Match ZORDI region names to FMR HUD area names
  // This is fuzzy matching since naming conventions differ
  const result = await query(`
    WITH zordi_metros AS (
      SELECT DISTINCT region_name, cbsa_code
      FROM zillow_zordi_metro_monthly
      WHERE region_type IN ('msa', 'metro')
    ),
    metro_counties AS (
      SELECT DISTINCT
        fcm.county_fips,
        fcm.state_code,
        fcm.hud_area_name,
        -- Normalize metro name for matching (remove "HUD Metro FMR Area" suffix, etc.)
        REGEXP_REPLACE(
          REGEXP_REPLACE(fcm.hud_area_name, '\\s+HUD.*$', '', 'i'),
          ',\\s*[A-Z]{2}(-[A-Z]{2})*$', ''
        ) as normalized_name
      FROM fmr_county_metro fcm
      WHERE fcm.is_metro = true
        AND fcm.year = (SELECT MAX(year) FROM fmr_county_metro)
    )
    SELECT DISTINCT
      zcm.zip_code,
      zm.cbsa_code,
      zm.region_name as cbsa_name,
      zcm.state_code
    FROM zordi_metros zm
    JOIN metro_counties mc ON
      -- Fuzzy match: ZORDI "Atlanta-Sandy Springs-Roswell" matches FMR "Atlanta-Sandy Springs-Roswell, GA"
      zm.region_name ILIKE mc.normalized_name || '%'
      OR mc.normalized_name ILIKE zm.region_name || '%'
    JOIN zip_county_mapping zcm ON
      zcm.county_fips = mc.county_fips
      AND zcm.state_code = mc.state_code
    WHERE zm.cbsa_code IS NOT NULL OR zm.region_name IS NOT NULL
  `);

  console.log(`Found ${result.length} ZIP-to-ZORDI-metro mappings via name matching`);

  if (result.length === 0) {
    return 0;
  }

  // Insert in batches (deduplicate by zip_code + cbsa_code first)
  const seen = new Set<string>();
  const batch: Array<{
    zip_code: string;
    cbsa_code: string;
    cbsa_name: string;
    state_code: string | null;
  }> = [];

  let totalInserted = 0;

  for (const row of result) {
    const zip = normalizeZip(row.zip_code);
    
    // Generate CBSA code if missing, but ensure it fits in VARCHAR(10)
    let cbsaCode = row.cbsa_code;
    if (!cbsaCode || cbsaCode.length === 0) {
      // Create a short identifier from the metro name (max 10 chars)
      const namePart = row.cbsa_name.slice(0, 8).replace(/\W+/g, '').toUpperCase();
      cbsaCode = namePart.length > 0 ? `Z${namePart}` : 'ZORDI';
    }
    // Ensure it's not longer than 10 characters
    cbsaCode = String(cbsaCode).trim().slice(0, 10);
    
    const key = `${zip}-${cbsaCode}`;
    
    // Skip duplicates
    if (seen.has(key)) continue;
    seen.add(key);

    batch.push({
      zip_code: zip,
      cbsa_code: cbsaCode,
      cbsa_name: String(row.cbsa_name).trim(),
      state_code: row.state_code || null,
    });

    if (batch.length >= 1000) {
      const flushed = batch.splice(0, batch.length);
      await upsertBatch(flushed);
      totalInserted += flushed.length;
    }
  }

  if (batch.length > 0) {
    await upsertBatch(batch);
    totalInserted += batch.length;
  }

  console.log(`CBSA mapping from ZORDI complete. Upserted ~${totalInserted} rows.`);
  return totalInserted;
}

// Export for use in cron API
export { ensureCbsaTables, buildCbsaMappingFromFmrData, buildCbsaMappingFromZordi };

if (import.meta.main) {
  await ensureCbsaTables();

  // Primary method: build from existing FMR county-metro data
  const fromFmr = await buildCbsaMappingFromFmrData();

  // If ZORDI data exists, also try to match metro names
  const zordiCount = await query('SELECT COUNT(*) as cnt FROM zillow_zordi_metro_monthly');
  if (zordiCount[0]?.cnt > 0) {
    await buildCbsaMappingFromZordi();
  }

  console.log('\nCBSA mapping ingestion complete.');
}
