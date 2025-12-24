#!/usr/bin/env bun

/**
 * Index latest ZIP-level home values (Zillow ZHVI) + ZIP-level tax rates (ACS).
 *
 * This is effectively “what the cron does”, but runnable on-demand:
 * - Fetch latest month from Zillow ZHVI by bedroom count (1–5), upsert all ZIP rows
 * - Refresh zip_city_mapping and compute rollups for that latest month (city/county/state)
 * - Fetch latest available ACS 5-year vintage (or explicit) and upsert all ZCTA rows
 *
 * Usage:
 *   bun scripts/index-zip-latest.ts
 *   bun scripts/index-zip-latest.ts --bedrooms 1,2,3,4,5
 *   bun scripts/index-zip-latest.ts --zhviUrlBase https://files.zillowstatic.com/research/public_csvs/zhvi
 *   bun scripts/index-zip-latest.ts --acsVintage 2023
 *   bun scripts/index-zip-latest.ts --acsStates 06,53   # optional chunking
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';
import { parse } from 'csv-parse';
import { Readable } from 'node:stream';
import { createSchema } from '../lib/schema';
import { configureDatabase } from '../lib/db';

config();

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  let bedrooms: number[] = [1, 2, 3, 4, 5];
  let zhviUrlBase = 'https://files.zillowstatic.com/research/public_csvs/zhvi';
  let acsVintage: number | null = null;
  let acsStates: string[] | null = null; // state FIPS list

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--bedrooms' && args[i + 1]) {
      bedrooms = args[i + 1]
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
      i++;
      continue;
    }
    if (a === '--zhviUrlBase' && args[i + 1]) {
      zhviUrlBase = args[i + 1].trim().replace(/\/+$/, '');
      i++;
      continue;
    }
    if (a === '--acsVintage' && args[i + 1]) {
      const n = parseInt(args[i + 1], 10);
      if (Number.isFinite(n) && n >= 2009 && n <= 2100) acsVintage = n;
      i++;
      continue;
    }
    if (a === '--acsStates' && args[i + 1]) {
      const raw = args[i + 1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((s) => /^\d{2}$/.test(s));
      acsStates = raw.length > 0 ? raw : null;
      i++;
      continue;
    }
  }

  if (bedrooms.length === 0) bedrooms = [1, 2, 3, 4, 5];
  return { bedrooms, zhviUrlBase, acsVintage, acsStates };
}

function normalizeZip(zip: unknown): string {
  const raw = String(zip ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 5) return digits;
  if (digits.length < 5) return digits.padStart(5, '0');
  return digits.slice(0, 5);
}

function toMonthStart(yyyyMmDd: string): string {
  return `${yyyyMmDd.slice(0, 7)}-01`;
}

function pickLatestDateColumn(columns: string[]) {
  const dateCols = columns
    .filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return dateCols.length > 0 ? dateCols[dateCols.length - 1] : null;
}

function getZhviZipBedroomUrlCandidates(urlBase: string, bedroomCount: number) {
  const base = urlBase.replace(/\/+$/, '');
  return [
    `${base}/Zip_zhvi_bdrmcnt_${bedroomCount}_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv`,
    `${base}/Zip_zhvi_bdrmcnt_${bedroomCount}.csv`,
  ];
}

async function upsertZhviBatch(
  rows: Array<{
    zip_code: string;
    bedroom_count: number;
    month: string;
    zhvi: number;
    state_code: string | null;
    city_name: string | null;
    county_name: string | null;
  }>
) {
  if (rows.length === 0) return;

  const values: any[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const base = i * 7;
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}::date, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, NOW())`
    );
    values.push(r.zip_code, r.bedroom_count, r.month, r.zhvi, r.state_code, r.city_name, r.county_name);
  }

  await sql.query(
    `
    INSERT INTO zhvi_zip_bedroom_monthly
      (zip_code, bedroom_count, month, zhvi, state_code, city_name, county_name, updated_at)
    VALUES
      ${placeholders.join(',\n      ')}
    ON CONFLICT (zip_code, bedroom_count, month)
    DO UPDATE SET
      zhvi = EXCLUDED.zhvi,
      state_code = EXCLUDED.state_code,
      city_name = EXCLUDED.city_name,
      county_name = EXCLUDED.county_name,
      updated_at = NOW()
    `,
    values
  );
}

async function ingestZhviLatestForBedroom(urlBase: string, bedroomCount: number) {
  const urls = getZhviZipBedroomUrlCandidates(urlBase, bedroomCount);
  console.log(`\n=== ZHVI latest ingest: bedroom=${bedroomCount} ===`);

  let res: Response | null = null;
  let lastErr: string | null = null;
  for (const u of urls) {
    const r = await fetch(u, { headers: { Accept: 'text/csv,*/*', 'User-Agent': 'fmr-search (index-zip-latest zhvi)' } });
    if (r.ok && r.body) {
      res = r;
      break;
    }
    const body = await r.text().catch(() => '');
    lastErr = `HTTP ${r.status} ${r.statusText} (${body.slice(0, 200)})`;
  }
  if (!res || !res.body) {
    throw new Error(`Failed to fetch ZHVI CSV (bedroom=${bedroomCount}): ${lastErr || 'unknown error'}`);
  }

  const parser = parse({
    columns: true,
    relax_column_count: true,
    skip_empty_lines: true,
    bom: true,
  });
  const nodeStream = Readable.fromWeb(res.body as any);
  nodeStream.pipe(parser);

  let latestDateCol: string | null = null;
  let monthStart: string | null = null;
  let upserted = 0;
  const batch: any[] = [];

  for await (const record of parser) {
    const row = record as Record<string, string>;
    if (!latestDateCol) {
      latestDateCol = pickLatestDateColumn(Object.keys(row));
      if (!latestDateCol) throw new Error('No date columns found in ZHVI CSV.');
      monthStart = toMonthStart(latestDateCol);
      console.log(`Using month=${monthStart} (source col=${latestDateCol})`);
    }

    const zip = normalizeZip(row.RegionName);
    if (!zip) continue;

    const rawVal = row[latestDateCol];
    if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') continue;
    const zhvi = Number(String(rawVal).trim());
    if (!Number.isFinite(zhvi) || zhvi <= 0) continue;

    const stateCode = row.State ? String(row.State).trim().toUpperCase() : null;
    const cityName = row.City ? String(row.City).trim() : null;
    const countyName = row.CountyName ? String(row.CountyName).trim() : null;

    batch.push({
      zip_code: zip,
      bedroom_count: bedroomCount,
      month: monthStart!,
      zhvi,
      state_code: stateCode,
      city_name: cityName,
      county_name: countyName,
    });

    if (batch.length >= 1000) {
      const flushed = batch.splice(0, batch.length);
      await upsertZhviBatch(flushed);
      upserted += flushed.length;
    }
  }

  if (batch.length > 0) {
    await upsertZhviBatch(batch);
    upserted += batch.length;
  }

  console.log(`✅ ZHVI bedroom=${bedroomCount} upserted=${upserted}`);
  return { month: monthStart!, upserted };
}

async function refreshZipCityMapping() {
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

async function computeZhviRollupsForMonth(month: string, bedroomCount: number) {
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

  // state
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

  // county
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

  // city
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

async function censusDatasetExists(vintage: number): Promise<boolean> {
  const url = `https://api.census.gov/data/${vintage}/acs/acs5?get=NAME&for=zip%20code%20tabulation%20area:90210`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  return res.ok;
}

async function pickLatestAcsVintage(explicit: number | null) {
  if (explicit && Number.isFinite(explicit)) return explicit;
  const now = new Date();
  const candidates = [now.getUTCFullYear() - 1, now.getUTCFullYear() - 2, now.getUTCFullYear() - 3, 2023, 2022];
  for (const y of candidates) {
    try {
      if (await censusDatasetExists(y)) return y;
    } catch {
      // ignore
    }
  }
  return 2023;
}

async function upsertAcsTaxBatch(
  vintage: number,
  rows: Array<{
    zcta: string;
    median_home_value: number | null;
    median_real_estate_taxes_paid: number | null;
    effective_tax_rate: number | null;
  }>
) {
  if (rows.length === 0) return;
  const values: any[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const base = i * 5;
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, NOW())`);
    values.push(vintage, r.zcta, r.median_home_value, r.median_real_estate_taxes_paid, r.effective_tax_rate);
  }

  await sql.query(
    `
    INSERT INTO acs_tax_zcta_latest
      (acs_vintage, zcta, median_home_value, median_real_estate_taxes_paid, effective_tax_rate, computed_at)
    VALUES
      ${placeholders.join(',\n      ')}
    ON CONFLICT (acs_vintage, zcta)
    DO UPDATE SET
      median_home_value = EXCLUDED.median_home_value,
      median_real_estate_taxes_paid = EXCLUDED.median_real_estate_taxes_paid,
      effective_tax_rate = EXCLUDED.effective_tax_rate,
      computed_at = NOW()
    `,
    values
  );
}

async function fetchAcsRows(vintage: number, stateFips?: string) {
  const base = `https://api.census.gov/data/${vintage}/acs/acs5`;
  const vars = ['NAME', 'B25077_001E', 'B25103_001E'];
  const params = new URLSearchParams();
  params.set('get', vars.join(','));
  params.set('for', 'zip code tabulation area:*');
  if (stateFips) params.set('in', `state:${stateFips}`);
  const url = `${base}?${params.toString()}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ACS API failed: HTTP ${res.status} ${res.statusText} (${body.slice(0, 200)})`);
  }
  return (await res.json()) as string[][];
}

async function ingestAcsTaxLatest(explicitVintage: number | null, states: string[] | null) {
  const vintage = await pickLatestAcsVintage(explicitVintage);
  console.log(`\n=== ACS tax ingest: vintage=${vintage} ===`);

  const ingestOne = async (stateFips?: string) => {
    const json = await fetchAcsRows(vintage, stateFips);
    if (!Array.isArray(json) || json.length < 2) return 0;

    const header = json[0]!;
    const idxZcta = header.indexOf('zip code tabulation area');
    const idxHome = header.indexOf('B25077_001E');
    const idxTax = header.indexOf('B25103_001E');
    if (idxZcta === -1 || idxHome === -1 || idxTax === -1) {
      throw new Error(`Unexpected ACS header; missing required columns. header=${JSON.stringify(header)}`);
    }

    let written = 0;
    const batch: any[] = [];

    for (let i = 1; i < json.length; i++) {
      const row = json[i]!;
      const zcta = String(row[idxZcta] || '').trim();
      if (!/^\d{5}$/.test(zcta)) continue;

      const homeVal = row[idxHome] ? Number(row[idxHome]) : NaN;
      const taxVal = row[idxTax] ? Number(row[idxTax]) : NaN;
      const median_home_value = Number.isFinite(homeVal) && homeVal > 0 ? homeVal : null;
      const median_real_estate_taxes_paid = Number.isFinite(taxVal) && taxVal > 0 ? taxVal : null;
      const effective_tax_rate =
        median_home_value !== null && median_real_estate_taxes_paid !== null
          ? median_real_estate_taxes_paid / median_home_value
          : null;

      batch.push({ zcta, median_home_value, median_real_estate_taxes_paid, effective_tax_rate });
      if (batch.length >= 1000) {
        const flushed = batch.splice(0, batch.length);
        await upsertAcsTaxBatch(vintage, flushed);
        written += flushed.length;
      }
    }

    if (batch.length > 0) {
      await upsertAcsTaxBatch(vintage, batch);
      written += batch.length;
    }
    return written;
  };

  let total = 0;
  if (!states || states.length === 0) {
    total = await ingestOne();
  } else {
    for (const st of states) total += await ingestOne(st);
  }

  console.log(`✅ ACS tax upserted=${total} (vintage=${vintage})`);
  return { vintage, upserted: total };
}

async function main() {
  // Ensure database schema exists
  if (process.env.POSTGRES_URL) {
    configureDatabase({ connectionString: process.env.POSTGRES_URL });
  }
  await createSchema();

  const { bedrooms, zhviUrlBase, acsVintage, acsStates } = parseArgs(process.argv);

  // ZHVI (latest month, all ZIPs, by bedroom)
  const months: string[] = [];
  for (const b of bedrooms) {
    const r = await ingestZhviLatestForBedroom(zhviUrlBase, b);
    months.push(r.month);
  }

  // Use the maximum month across the ingests (if Zillow files differ).
  const month = months.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))[months.length - 1]!;
  console.log(`\nRefreshing zip_city_mapping + rollups for month=${month}...`);
  await refreshZipCityMapping();
  for (const b of bedrooms) {
    await computeZhviRollupsForMonth(month, b);
  }
  console.log('✅ ZHVI rollups updated.');

  // ACS tax rates (latest available vintage)
  await ingestAcsTaxLatest(acsVintage, acsStates);

  console.log('\n✅ ZIP latest indexing complete (ZHVI + tax rates).');
}

if (import.meta.main) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('❌ index-zip-latest failed:', e);
      process.exit(1);
    });
}




