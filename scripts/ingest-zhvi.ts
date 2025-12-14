#!/usr/bin/env bun

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';
import { parse } from 'csv-parse';
import { Readable } from 'stream';

config();

type HistoryMonths = number | 'all';

function parseBool(v: string | undefined, defaultValue: boolean) {
  if (v === undefined) return defaultValue;
  const s = v.trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'y') return true;
  if (s === '0' || s === 'false' || s === 'no' || s === 'n') return false;
  return defaultValue;
}

function normalizeZip(zip: unknown): string {
  const raw = String(zip ?? '').trim();
  // Zillow RegionName is usually already a zero-padded ZIP; keep digits only.
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 5) return digits;
  if (digits.length < 5) return digits.padStart(5, '0');
  return digits.slice(0, 5);
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);

  let bedrooms: number[] = [1, 2, 3, 4, 5];
  let historyMonths: HistoryMonths = 0;
  let onlyLatest = true;
  let urlBase = 'https://files.zillowstatic.com/research/public_csvs/zhvi';

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

    if (a === '--historyMonths' && args[i + 1]) {
      const raw = args[i + 1].trim().toLowerCase();
      if (raw === 'all') {
        historyMonths = 'all';
      } else {
        const n = parseInt(raw, 10);
        historyMonths = Number.isFinite(n) && n >= 0 ? n : 0;
      }
      i++;
      continue;
    }

    if (a === '--onlyLatest' && args[i + 1]) {
      onlyLatest = parseBool(args[i + 1], true);
      i++;
      continue;
    }

    if (a === '--urlBase' && args[i + 1]) {
      urlBase = args[i + 1].trim().replace(/\/+$/, '');
      i++;
      continue;
    }
  }

  // If historyMonths is explicitly requested, onlyLatest defaults to false.
  if (historyMonths === 'all' || (typeof historyMonths === 'number' && historyMonths > 0)) {
    onlyLatest = false;
  }

  if (bedrooms.length === 0) bedrooms = [1, 2, 3, 4, 5];

  return { bedrooms, historyMonths, onlyLatest, urlBase };
}

function getZhviZipBedroomUrl(urlBase: string, bedroomCount: number) {
  // Zillow Research public CSV naming can vary by “flavor” (property type, tiers, smoothing, SA).
  // We default to a commonly-published “middle tier, SFR/Condo, smoothed, seasonally adjusted” series,
  // but also keep a short fallback name.
  //
  // If Zillow changes naming again, pass an explicit `--urlBase` pointing at a mirror, or update here.
  const candidates = [
    // Common current naming from Zillow Research downloads:
    `Zip_zhvi_bdrmcnt_${bedroomCount}_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv`,
    // Fallback (historical/simplified naming):
    `Zip_zhvi_bdrmcnt_${bedroomCount}.csv`,
  ];
  return `${urlBase}/${candidates[0]}`;
}

function getZhviZipBedroomUrlCandidates(urlBase: string, bedroomCount: number) {
  const base = urlBase.replace(/\/+$/, '');
  return [
    `${base}/Zip_zhvi_bdrmcnt_${bedroomCount}_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv`,
    `${base}/Zip_zhvi_bdrmcnt_${bedroomCount}.csv`,
  ];
}

function toMonthStart(yyyyMmDd: string): string {
  // Zillow columns are end-of-month dates. Normalize to first-of-month for storage consistency.
  // Input: YYYY-MM-DD -> YYYY-MM-01
  return `${yyyyMmDd.slice(0, 7)}-01`;
}

function pickDateColumns(allColumns: string[], historyMonths: HistoryMonths, onlyLatest: boolean) {
  const dateCols = allColumns
    .filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  if (dateCols.length === 0) return [];

  if (onlyLatest) return [dateCols[dateCols.length - 1]];

  if (historyMonths === 'all') return dateCols;

  if (typeof historyMonths === 'number' && historyMonths > 0) {
    return dateCols.slice(Math.max(0, dateCols.length - historyMonths));
  }

  // default: behave like onlyLatest
  return [dateCols[dateCols.length - 1]];
}

async function ensureZhviTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS zhvi_zip_bedroom_monthly (
      id SERIAL PRIMARY KEY,
      zip_code VARCHAR(10) NOT NULL,
      bedroom_count INTEGER NOT NULL CHECK (bedroom_count >= 1 AND bedroom_count <= 5),
      month DATE NOT NULL,
      zhvi NUMERIC(14, 2),
      state_code VARCHAR(2),
      city_name TEXT,
      county_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(zip_code, bedroom_count, month)
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_zhvi_zip_bedroom_month ON zhvi_zip_bedroom_monthly(zip_code, bedroom_count, month DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_zhvi_month_bedroom ON zhvi_zip_bedroom_monthly(month, bedroom_count);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_zhvi_state_month ON zhvi_zip_bedroom_monthly(state_code, month DESC);`;
}

async function upsertBatch(
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
    values.push(
      r.zip_code,
      r.bedroom_count,
      r.month,
      r.zhvi,
      r.state_code,
      r.city_name,
      r.county_name
    );
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

async function ingestBedroom(opts: { bedroomCount: number; url: string; historyMonths: HistoryMonths; onlyLatest: boolean }) {
  const { bedroomCount, url, historyMonths, onlyLatest } = opts;
  console.log(`\n=== ZHVI ingest: bedroom=${bedroomCount} url=${url} ===`);

  const headers = {
    // Helps some CDNs return the raw file without HTML.
    Accept: 'text/csv,*/*',
    'User-Agent': 'fmr-search (ingest-zhvi)',
  };

  // If the caller passed a specific URL, try it first.
  // If it fails, try our known filename candidates (helps when Zillow changes naming).
  const candidates = [url, ...getZhviZipBedroomUrlCandidates(url.replace(/\/[^/]*$/, ''), bedroomCount)];
  let res: Response | null = null;
  let lastErr: Error | null = null;
  for (const u of candidates) {
    try {
      const r = await fetch(u, { headers });
      if (r.ok) {
        res = r;
        if (u !== url) console.log(`Fetched via fallback URL: ${u}`);
        break;
      }
      const body = await r.text().catch(() => '');
      lastErr = new Error(`HTTP ${r.status} ${r.statusText} (${body.slice(0, 200)})`);
    } catch (e: any) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }

  if (!res) {
    throw new Error(`Failed to fetch ZHVI CSV for bedroom=${bedroomCount}: ${lastErr?.message || 'unknown error'}`);
  }
  if (!res.body) {
    throw new Error('Fetch response has no body (cannot stream CSV).');
  }

  const parser = parse({
    columns: true,
    relax_column_count: true,
    skip_empty_lines: true,
    bom: true,
  });

  const nodeStream = Readable.fromWeb(res.body as any);
  nodeStream.pipe(parser);

  let selectedDateCols: string[] | null = null;
  let totalInserted = 0;
  const batch: Array<{
    zip_code: string;
    bedroom_count: number;
    month: string;
    zhvi: number;
    state_code: string | null;
    city_name: string | null;
    county_name: string | null;
  }> = [];

  for await (const record of parser) {
    const row = record as Record<string, string>;

    if (!selectedDateCols) {
      selectedDateCols = pickDateColumns(Object.keys(row), historyMonths, onlyLatest);
      if (selectedDateCols.length === 0) {
        throw new Error('No date columns found in Zillow ZHVI CSV header.');
      }
      console.log(`Selected ${selectedDateCols.length} month column(s). Latest=${selectedDateCols[selectedDateCols.length - 1]}`);
    }

    const zip = normalizeZip(row.RegionName);
    if (!zip) continue;

    const stateCode = row.State ? String(row.State).trim().toUpperCase() : null;
    const cityName = row.City ? String(row.City).trim() : null;
    const countyName = row.CountyName ? String(row.CountyName).trim() : null;

    for (const dateCol of selectedDateCols) {
      const rawVal = row[dateCol];
      if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') continue;
      const num = Number(String(rawVal).trim());
      if (!Number.isFinite(num) || num <= 0) continue;

      batch.push({
        zip_code: zip,
        bedroom_count: bedroomCount,
        month: toMonthStart(dateCol),
        zhvi: num,
        state_code: stateCode,
        city_name: cityName,
        county_name: countyName,
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
  }

  if (batch.length > 0) {
    await upsertBatch(batch);
    totalInserted += batch.length;
  }

  console.log(`✅ ZHVI ingest complete for bedroom=${bedroomCount}. Upserted ~${totalInserted} rows.`);
}

if (import.meta.main) {
  const { bedrooms, historyMonths, onlyLatest, urlBase } = parseArgs(process.argv);

  await ensureZhviTables();

  for (const b of bedrooms) {
    const url = getZhviZipBedroomUrl(urlBase, b);
    await ingestBedroom({ bedroomCount: b, url, historyMonths, onlyLatest });
  }

  console.log('\n✅ All requested bedrooms ingested.');
}

