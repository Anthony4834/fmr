#!/usr/bin/env bun

/**
 * Index ZIP/ZCTA-level effective property tax rates from ACS 5-year data.
 *
 * We approximate an effective property tax rate as:
 *   effective_tax_rate = median_real_estate_taxes_paid / median_home_value
 *
 * Data source: US Census ACS 5-year via API
 * - Median home value: B25077_001E
 * - Median real estate taxes paid: B25103_001E
 *
 * Usage:
 *   bun scripts/ingest-acs-tax.ts --vintage 2023
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';

config();

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  let vintage = 2023;
  let states: string[] | null = null; // state FIPS codes (e.g. 06,53)

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--vintage' && args[i + 1]) {
      const n = parseInt(args[i + 1], 10);
      if (Number.isFinite(n) && n >= 2009 && n <= 2100) vintage = n;
      i++;
      continue;
    }
    if (a === '--states' && args[i + 1]) {
      const raw = args[i + 1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      states = raw.length > 0 ? raw : null;
      i++;
      continue;
    }
  }
  return { vintage, states };
}

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS acs_tax_zcta_latest (
      id SERIAL PRIMARY KEY,
      acs_vintage INTEGER NOT NULL,
      zcta VARCHAR(5) NOT NULL,
      median_home_value NUMERIC(14, 2),
      median_real_estate_taxes_paid NUMERIC(14, 2),
      effective_tax_rate NUMERIC(10, 6),
      computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(acs_vintage, zcta)
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_acs_tax_zcta ON acs_tax_zcta_latest(zcta);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_acs_tax_vintage ON acs_tax_zcta_latest(acs_vintage);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_acs_tax_rate ON acs_tax_zcta_latest(effective_tax_rate);`;
}

async function upsertBatch(
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
    values.push(
      vintage,
      r.zcta,
      r.median_home_value,
      r.median_real_estate_taxes_paid,
      r.effective_tax_rate
    );
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
  const json = (await res.json()) as string[][];
  return json;
}

async function ingest(vintage: number, states: string[] | null) {
  await ensureTable();

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
    const batch: Array<{
      zcta: string;
      median_home_value: number | null;
      median_real_estate_taxes_paid: number | null;
      effective_tax_rate: number | null;
    }> = [];

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

      batch.push({
        zcta,
        median_home_value,
        median_real_estate_taxes_paid,
        effective_tax_rate,
      });

      if (batch.length >= 1000) {
        const flushed = batch.splice(0, batch.length);
        await upsertBatch(vintage, flushed);
        written += flushed.length;
      }
    }

    if (batch.length > 0) {
      await upsertBatch(vintage, batch);
      written += batch.length;
    }

    return written;
  };

  if (!states || states.length === 0) {
    console.log(`Fetching ACS5 ZCTA data for all ZCTAs (vintage=${vintage})...`);
    const count = await ingestOne();
    console.log(`✅ Upserted ${count} ZCTA rows (vintage=${vintage}).`);
    return;
  }

  let total = 0;
  for (const st of states) {
    const stateFips = st.trim();
    if (!/^\d{2}$/.test(stateFips)) continue;
    console.log(`Fetching ACS5 ZCTA data (vintage=${vintage}) for state=${stateFips}...`);
    const count = await ingestOne(stateFips);
    total += count;
    console.log(`... upserted ${count} rows for state=${stateFips}`);
  }
  console.log(`✅ Upserted ${total} ZCTA rows total (vintage=${vintage}).`);
}

if (import.meta.main) {
  const { vintage, states } = parseArgs(process.argv);
  ingest(vintage, states)
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('❌ ACS tax-rate ingestion failed:', e);
      process.exit(1);
    });
}




