#!/usr/bin/env bun

/**
 * Ingest Zillow Observed Renter Demand Index (ZORDI) data
 *
 * ZORDI is a demand proxy based on engagement on Zillow rental listings.
 * Available at national + MSA (metro) levels only.
 * Data source: https://www.zillow.com/research/data/ (Rentals section)
 *
 * Usage:
 *   bun scripts/ingest-zordi.ts
 *   bun scripts/ingest-zordi.ts --historyMonths 12
 *   bun scripts/ingest-zordi.ts --historyMonths all
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';
import { parse } from 'csv-parse';
import { Readable } from 'stream';

config();

type HistoryMonths = number | 'all';

function parseArgs(argv: string[]) {
  const args = argv.slice(2);

  let historyMonths: HistoryMonths = 0;
  let onlyLatest = true;
  let urlBase = 'https://files.zillowstatic.com/research/public_csvs/zordi';

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

  if (historyMonths === 'all' || (typeof historyMonths === 'number' && historyMonths > 0)) {
    onlyLatest = false;
  }

  return { historyMonths, onlyLatest, urlBase };
}

function getZordiUrlCandidates(urlBase: string) {
  const base = urlBase.replace(/\/+$/, '');
  return [
    // MSA level - most granular available for ZORDI
    `${base}/Metro_zordi_uc_sfrcondomfr_month.csv`,
    `${base}/Metro_ZORDI_AllHomesPlusMultifamily.csv`,
    `${base}/Msa_zordi_month.csv`,
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

async function ensureZordiTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS zillow_zordi_metro_monthly (
      id SERIAL PRIMARY KEY,
      region_name TEXT NOT NULL,
      region_type VARCHAR(20) NOT NULL,
      cbsa_code VARCHAR(10),
      month DATE NOT NULL,
      zordi NUMERIC(10, 4),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(region_name, region_type, month)
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_zordi_region_month ON zillow_zordi_metro_monthly(region_name, month DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_zordi_cbsa_month ON zillow_zordi_metro_monthly(cbsa_code, month DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_zordi_month ON zillow_zordi_metro_monthly(month DESC);`;
}

async function upsertBatch(
  rows: Array<{
    region_name: string;
    region_type: string;
    cbsa_code: string | null;
    month: string;
    zordi: number;
  }>
) {
  if (rows.length === 0) return;

  const values: any[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const base = i * 5;
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::date, $${base + 5}, NOW())`
    );
    values.push(
      r.region_name,
      r.region_type,
      r.cbsa_code,
      r.month,
      r.zordi
    );
  }

  await sql.query(
    `
    INSERT INTO zillow_zordi_metro_monthly
      (region_name, region_type, cbsa_code, month, zordi, updated_at)
    VALUES
      ${placeholders.join(',\n      ')}
    ON CONFLICT (region_name, region_type, month)
    DO UPDATE SET
      zordi = EXCLUDED.zordi,
      cbsa_code = COALESCE(EXCLUDED.cbsa_code, zillow_zordi_metro_monthly.cbsa_code),
      updated_at = NOW()
    `,
    values
  );
}

async function ingestZordi(opts: { url: string; historyMonths: HistoryMonths; onlyLatest: boolean }) {
  const { url, historyMonths, onlyLatest } = opts;
  console.log(`\n=== ZORDI ingest: url=${url} ===`);

  const headers = {
    Accept: 'text/csv,*/*',
    'User-Agent': 'fmr-search (ingest-zordi)',
  };

  const candidates = getZordiUrlCandidates(url.replace(/\/[^/]*$/, ''));
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
    throw new Error(`Failed to fetch ZORDI CSV: ${lastErr?.message || 'unknown error'}`);
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
    region_name: string;
    region_type: string;
    cbsa_code: string | null;
    month: string;
    zordi: number;
  }> = [];

  for await (const record of parser) {
    const row = record as Record<string, string>;

    if (!selectedDateCols) {
      selectedDateCols = pickDateColumns(Object.keys(row), historyMonths, onlyLatest);
      if (selectedDateCols.length === 0) {
        throw new Error('No date columns found in Zillow ZORDI CSV header.');
      }
      console.log(`Selected ${selectedDateCols.length} month column(s). Latest=${selectedDateCols[selectedDateCols.length - 1]}`);
      console.log(`Columns available: ${Object.keys(row).slice(0, 10).join(', ')}...`);
    }

    // ZORDI uses RegionName for metro area name
    const regionName = row.RegionName ? String(row.RegionName).trim() : null;
    if (!regionName) continue;

    // Get region type (msa, national, etc.)
    const regionType = row.RegionType ? String(row.RegionType).trim().toLowerCase() : 'msa';

    // Extract CBSA code if available (StateName field might have CBSA or separate column)
    // Zillow sometimes uses RegionID for CBSA code
    let cbsaCode: string | null = null;
    if (row.RegionID) {
      const id = String(row.RegionID).trim();
      // CBSA codes are typically 5 digits
      if (/^\d{5}$/.test(id)) {
        cbsaCode = id;
      }
    }

    for (const dateCol of selectedDateCols) {
      const rawVal = row[dateCol];
      if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') continue;
      const num = Number(String(rawVal).trim());
      if (!Number.isFinite(num)) continue;

      batch.push({
        region_name: regionName,
        region_type: regionType,
        cbsa_code: cbsaCode,
        month: toMonthStart(dateCol),
        zordi: num,
      });

      if (batch.length >= 1000) {
        const flushed = batch.splice(0, batch.length);
        await upsertBatch(flushed);
        totalInserted += flushed.length;
        if (totalInserted % 5000 === 0) {
          console.log(`... upserted ~${totalInserted} rows so far`);
        }
      }
    }
  }

  if (batch.length > 0) {
    await upsertBatch(batch);
    totalInserted += batch.length;
  }

  console.log(`ZORDI ingest complete. Upserted ~${totalInserted} rows.`);
  return totalInserted;
}

// Export for use in cron API
export { ingestZordi, ensureZordiTables };

if (import.meta.main) {
  const { historyMonths, onlyLatest, urlBase } = parseArgs(process.argv);

  await ensureZordiTables();

  const url = `${urlBase}/Metro_zordi_uc_sfrcondomfr_month.csv`;
  await ingestZordi({ url, historyMonths, onlyLatest });

  console.log('\nZORDI ingestion complete.');
}
