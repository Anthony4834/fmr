#!/usr/bin/env bun

/**
 * Ingest Zillow Observed Rent Index (ZORI) data
 *
 * ZORI measures changes in asking rents over time. Available at ZIP, city, county, metro levels.
 * Data source: https://www.zillow.com/research/data/ (Rentals section)
 *
 * Usage:
 *   bun scripts/ingest-zori.ts
 *   bun scripts/ingest-zori.ts --historyMonths 12
 *   bun scripts/ingest-zori.ts --historyMonths all
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';
import { parse } from 'csv-parse';
import { Readable } from 'stream';

config();

type HistoryMonths = number | 'all';

function normalizeZip(zip: unknown): string {
  const raw = String(zip ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 5) return digits;
  if (digits.length < 5) return digits.padStart(5, '0');
  return digits.slice(0, 5);
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);

  let historyMonths: HistoryMonths = 0;
  let onlyLatest = true;
  let urlBase = 'https://files.zillowstatic.com/research/public_csvs/zori';

  for (let i = 0; i < args.length; i++) {
    const a = args[i];

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
      const s = args[i + 1].trim().toLowerCase();
      onlyLatest = s === '1' || s === 'true' || s === 'yes' || s === 'y';
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

  return { historyMonths, onlyLatest, urlBase };
}

function getZoriZipUrlCandidates(urlBase: string) {
  const base = urlBase.replace(/\/+$/, '');
  return [
    // Current naming - All Homes, Smoothed, Seasonally Adjusted
    `${base}/Zip_zori_uc_sfrcondomfr_sm_sa_month.csv`,
    // Alternative naming patterns Zillow has used
    `${base}/Zip_ZORI_AllHomesPlusMultifamily_Smoothed.csv`,
    `${base}/Zip_zori_sm_month.csv`,
  ];
}

function toMonthStart(yyyyMmDd: string): string {
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

  return [dateCols[dateCols.length - 1]];
}

async function ensureZoriTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS zillow_zori_zip_monthly (
      id SERIAL PRIMARY KEY,
      zip_code VARCHAR(10) NOT NULL,
      month DATE NOT NULL,
      zori NUMERIC(10, 2),
      state_code VARCHAR(2),
      city_name TEXT,
      county_name TEXT,
      metro_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(zip_code, month)
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_zori_zip_month ON zillow_zori_zip_monthly(zip_code, month DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_zori_month ON zillow_zori_zip_monthly(month DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_zori_state ON zillow_zori_zip_monthly(state_code, month DESC);`;
}

async function upsertBatch(
  rows: Array<{
    zip_code: string;
    month: string;
    zori: number;
    state_code: string | null;
    city_name: string | null;
    county_name: string | null;
    metro_name: string | null;
  }>
) {
  if (rows.length === 0) return;

  const values: any[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const base = i * 7;
    placeholders.push(
      `($${base + 1}, $${base + 2}::date, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, NOW())`
    );
    values.push(
      r.zip_code,
      r.month,
      r.zori,
      r.state_code,
      r.city_name,
      r.county_name,
      r.metro_name
    );
  }

  await sql.query(
    `
    INSERT INTO zillow_zori_zip_monthly
      (zip_code, month, zori, state_code, city_name, county_name, metro_name, updated_at)
    VALUES
      ${placeholders.join(',\n      ')}
    ON CONFLICT (zip_code, month)
    DO UPDATE SET
      zori = EXCLUDED.zori,
      state_code = EXCLUDED.state_code,
      city_name = EXCLUDED.city_name,
      county_name = EXCLUDED.county_name,
      metro_name = EXCLUDED.metro_name,
      updated_at = NOW()
    `,
    values
  );
}

async function ingestZori(opts: { url: string; historyMonths: HistoryMonths; onlyLatest: boolean }) {
  const { url, historyMonths, onlyLatest } = opts;
  console.log(`\n=== ZORI ingest: url=${url} ===`);

  const headers = {
    Accept: 'text/csv,*/*',
    'User-Agent': 'fmr-search (ingest-zori)',
  };

  const candidates = getZoriZipUrlCandidates(url.replace(/\/[^/]*$/, ''));
  let res: Response | null = null;
  let lastErr: Error | null = null;

  for (const u of candidates) {
    try {
      console.log(`Trying: ${u}`);
      const r = await fetch(u, { headers });
      if (r.ok) {
        res = r;
        console.log(`Success: ${u}`);
        break;
      }
      const body = await r.text().catch(() => '');
      lastErr = new Error(`HTTP ${r.status} ${r.statusText} (${body.slice(0, 200)})`);
    } catch (e: any) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }

  if (!res) {
    throw new Error(`Failed to fetch ZORI CSV: ${lastErr?.message || 'unknown error'}`);
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
    month: string;
    zori: number;
    state_code: string | null;
    city_name: string | null;
    county_name: string | null;
    metro_name: string | null;
  }> = [];

  for await (const record of parser) {
    const row = record as Record<string, string>;

    if (!selectedDateCols) {
      selectedDateCols = pickDateColumns(Object.keys(row), historyMonths, onlyLatest);
      if (selectedDateCols.length === 0) {
        throw new Error('No date columns found in Zillow ZORI CSV header.');
      }
      console.log(`Selected ${selectedDateCols.length} month column(s). Latest=${selectedDateCols[selectedDateCols.length - 1]}`);
    }

    // ZORI uses RegionName for ZIP code at ZIP level
    const zip = normalizeZip(row.RegionName);
    if (!zip || zip.length !== 5) continue;

    // Skip non-ZIP region types if present
    const regionType = row.RegionType?.toLowerCase();
    if (regionType && regionType !== 'zip') continue;

    const stateCode = row.State ? String(row.State).trim().toUpperCase() : null;
    const cityName = row.City ? String(row.City).trim() : null;
    const countyName = row.CountyName ? String(row.CountyName).trim() : null;
    const metroName = row.Metro ? String(row.Metro).trim() : null;

    for (const dateCol of selectedDateCols) {
      const rawVal = row[dateCol];
      if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') continue;
      const num = Number(String(rawVal).trim());
      if (!Number.isFinite(num) || num <= 0) continue;

      batch.push({
        zip_code: zip,
        month: toMonthStart(dateCol),
        zori: num,
        state_code: stateCode,
        city_name: cityName,
        county_name: countyName,
        metro_name: metroName,
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

  console.log(`ZORI ingest complete. Upserted ~${totalInserted} rows.`);
  return totalInserted;
}

// Export for use in cron API
export { ingestZori, ensureZoriTables };

if (import.meta.main) {
  const { historyMonths, onlyLatest, urlBase } = parseArgs(process.argv);

  await ensureZoriTables();

  const url = `${urlBase}/Zip_zori_uc_sfrcondomfr_sm_sa_month.csv`;
  await ingestZori({ url, historyMonths, onlyLatest });

  console.log('\nZORI ingestion complete.');
}
