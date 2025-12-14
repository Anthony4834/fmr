#!/usr/bin/env bun

/**
 * Recompute ZHVI rollups (city/county/state) into `zhvi_rollup_monthly`.
 *
 * Typical usage (latest month only):
 *   bun scripts/reindex-zhvi-rollups.ts
 *
 * Specific month:
 *   bun scripts/reindex-zhvi-rollups.ts --month 2025-11-01
 *
 * Specific bedrooms:
 *   bun scripts/reindex-zhvi-rollups.ts --bedrooms 2,3,4
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';

config();

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  let month: string | null = null; // YYYY-MM-01
  let bedrooms: number[] = [1, 2, 3, 4, 5];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--month' && args[i + 1]) {
      month = args[i + 1].trim();
      i++;
      continue;
    }
    if (a === '--bedrooms' && args[i + 1]) {
      bedrooms = args[i + 1]
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
      i++;
      continue;
    }
  }

  if (bedrooms.length === 0) bedrooms = [1, 2, 3, 4, 5];
  return { month, bedrooms };
}

async function ensureTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS zip_city_mapping (
      id SERIAL PRIMARY KEY,
      zip_code VARCHAR(10) NOT NULL,
      city_name TEXT NOT NULL,
      state_code VARCHAR(2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(zip_code, city_name, state_code)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS zhvi_rollup_monthly (
      id SERIAL PRIMARY KEY,
      geo_type VARCHAR(10) NOT NULL CHECK (geo_type IN ('city', 'county', 'state')),
      geo_key TEXT NOT NULL,
      state_code VARCHAR(2),
      city_name TEXT,
      county_name TEXT,
      county_fips VARCHAR(5),
      bedroom_count INTEGER NOT NULL CHECK (bedroom_count >= 1 AND bedroom_count <= 5),
      month DATE NOT NULL,
      zhvi_median NUMERIC(14, 2),
      zhvi_p25 NUMERIC(14, 2),
      zhvi_p75 NUMERIC(14, 2),
      zip_count INTEGER NOT NULL DEFAULT 0,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(geo_type, geo_key, bedroom_count, month)
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_zip_city_zip ON zip_city_mapping(zip_code);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_zip_city_city_state ON zip_city_mapping(city_name, state_code);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_zhvi_rollup_geo_month ON zhvi_rollup_monthly(geo_type, geo_key, bedroom_count, month DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_zhvi_rollup_month ON zhvi_rollup_monthly(month, geo_type);`;
}

async function refreshZipCityMapping() {
  // Rebuild mapping from authoritative `cities` table.
  // `cities` is already derived from ZIP datasets; this keeps city rollups stable.
  await sql`TRUNCATE TABLE zip_city_mapping;`;
  await sql`
    INSERT INTO zip_city_mapping (zip_code, city_name, state_code)
    SELECT DISTINCT
      unnest(c.zip_codes)::text as zip_code,
      c.city_name,
      c.state_code
    FROM cities c
    WHERE c.zip_codes IS NOT NULL
      AND array_length(c.zip_codes, 1) > 0
      AND c.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
  `;
}

async function getLatestMonth(): Promise<string> {
  const r = await sql`SELECT MAX(month) as max_month FROM zhvi_zip_bedroom_monthly`;
  const raw = r.rows?.[0]?.max_month;
  if (!raw) throw new Error('No ZHVI data found in zhvi_zip_bedroom_monthly (cannot compute rollups).');
  // `raw` might be a Date-like; stringify to YYYY-MM-DD.
  const d = new Date(raw);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function computeRollupsForMonth(month: string, bedroomCount: number) {
  console.log(`Computing rollups: month=${month} bedroom=${bedroomCount}...`);

  // Representative county mapping per ZIP (to avoid double counting in ZIP->county).
  // Prefer county_fips when available, deterministic otherwise.
  const representativeZipCountyCte = `
    SELECT DISTINCT ON (zcm.zip_code)
      zcm.zip_code,
      zcm.state_code,
      zcm.county_name,
      zcm.county_fips
    FROM zip_county_mapping zcm
    WHERE zcm.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
    ORDER BY zcm.zip_code, zcm.county_fips NULLS LAST, zcm.county_name
  `;

  // State rollups
  await sql.query(
    `
    WITH rep AS (${representativeZipCountyCte}),
    src AS (
      SELECT z.zip_code, rep.state_code, z.zhvi
      FROM zhvi_zip_bedroom_monthly z
      JOIN rep ON rep.zip_code = z.zip_code
      WHERE z.month = $1::date
        AND z.bedroom_count = $2
        AND z.zhvi IS NOT NULL
        AND z.zhvi > 0
        AND rep.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
    )
    INSERT INTO zhvi_rollup_monthly (
      geo_type, geo_key, state_code, bedroom_count, month,
      zhvi_median, zhvi_p25, zhvi_p75, zip_count, computed_at
    )
    SELECT
      'state' as geo_type,
      s.state_code as geo_key,
      s.state_code,
      $2 as bedroom_count,
      $1::date as month,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY s.zhvi) as zhvi_median,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY s.zhvi) as zhvi_p25,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY s.zhvi) as zhvi_p75,
      COUNT(DISTINCT s.zip_code) as zip_count,
      NOW() as computed_at
    FROM src s
    GROUP BY s.state_code
    ON CONFLICT (geo_type, geo_key, bedroom_count, month)
    DO UPDATE SET
      zhvi_median = EXCLUDED.zhvi_median,
      zhvi_p25 = EXCLUDED.zhvi_p25,
      zhvi_p75 = EXCLUDED.zhvi_p75,
      zip_count = EXCLUDED.zip_count,
      computed_at = NOW()
    `,
    [month, bedroomCount]
  );

  // County rollups
  await sql.query(
    `
    WITH rep AS (${representativeZipCountyCte}),
    src AS (
      SELECT z.zip_code, rep.state_code, rep.county_name, rep.county_fips, z.zhvi
      FROM zhvi_zip_bedroom_monthly z
      JOIN rep ON rep.zip_code = z.zip_code
      WHERE z.month = $1::date
        AND z.bedroom_count = $2
        AND z.zhvi IS NOT NULL
        AND z.zhvi > 0
        AND rep.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
    )
    INSERT INTO zhvi_rollup_monthly (
      geo_type, geo_key, state_code, county_name, county_fips, bedroom_count, month,
      zhvi_median, zhvi_p25, zhvi_p75, zip_count, computed_at
    )
    SELECT
      'county' as geo_type,
      (COALESCE(s.county_fips, s.county_name) || '|' || s.state_code) as geo_key,
      s.state_code,
      s.county_name,
      s.county_fips,
      $2 as bedroom_count,
      $1::date as month,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY s.zhvi) as zhvi_median,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY s.zhvi) as zhvi_p25,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY s.zhvi) as zhvi_p75,
      COUNT(DISTINCT s.zip_code) as zip_count,
      NOW() as computed_at
    FROM src s
    GROUP BY s.state_code, s.county_name, s.county_fips
    ON CONFLICT (geo_type, geo_key, bedroom_count, month)
    DO UPDATE SET
      zhvi_median = EXCLUDED.zhvi_median,
      zhvi_p25 = EXCLUDED.zhvi_p25,
      zhvi_p75 = EXCLUDED.zhvi_p75,
      zip_count = EXCLUDED.zip_count,
      computed_at = NOW()
    `,
    [month, bedroomCount]
  );

  // City rollups
  await sql.query(
    `
    WITH src AS (
      SELECT z.zip_code, z.zhvi, zcm.city_name, zcm.state_code
      FROM zhvi_zip_bedroom_monthly z
      JOIN zip_city_mapping zcm ON zcm.zip_code = z.zip_code
      WHERE z.month = $1::date
        AND z.bedroom_count = $2
        AND z.zhvi IS NOT NULL
        AND z.zhvi > 0
        AND zcm.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
    )
    INSERT INTO zhvi_rollup_monthly (
      geo_type, geo_key, state_code, city_name, bedroom_count, month,
      zhvi_median, zhvi_p25, zhvi_p75, zip_count, computed_at
    )
    SELECT
      'city' as geo_type,
      (s.city_name || '|' || s.state_code) as geo_key,
      s.state_code,
      s.city_name,
      $2 as bedroom_count,
      $1::date as month,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY s.zhvi) as zhvi_median,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY s.zhvi) as zhvi_p25,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY s.zhvi) as zhvi_p75,
      COUNT(DISTINCT s.zip_code) as zip_count,
      NOW() as computed_at
    FROM src s
    GROUP BY s.city_name, s.state_code
    ON CONFLICT (geo_type, geo_key, bedroom_count, month)
    DO UPDATE SET
      zhvi_median = EXCLUDED.zhvi_median,
      zhvi_p25 = EXCLUDED.zhvi_p25,
      zhvi_p75 = EXCLUDED.zhvi_p75,
      zip_count = EXCLUDED.zip_count,
      computed_at = NOW()
    `,
    [month, bedroomCount]
  );
}

if (import.meta.main) {
  const { month: monthArg, bedrooms } = parseArgs(process.argv);
  await ensureTables();

  console.log('Refreshing zip_city_mapping...');
  await refreshZipCityMapping();

  const month = monthArg ?? (await getLatestMonth());
  console.log(`Using month=${month}`);

  for (const b of bedrooms) {
    await computeRollupsForMonth(month, b);
  }

  console.log('✅ ZHVI rollups computed.');
}

