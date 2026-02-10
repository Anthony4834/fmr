/**
 * Insights index: precomputed yield-movers data for zip/city/county.
 * Used by cron (day 19) and by scripts/index-insights.ts for local indexing.
 */

import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '@/lib/queries';
import {
  computeYieldMoversBaseData,
  type YieldMoversGeoType,
  type YieldMoverBaseRow,
} from '@/lib/yield-movers';

const INSIGHTS_INDEX_BATCH_SIZE = 500;

export async function ensureInsightsIndexTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS insights_index (
      geo_type VARCHAR(10) NOT NULL CHECK (geo_type IN ('zip', 'city', 'county')),
      geo_key VARCHAR(255) NOT NULL,
      state_code VARCHAR(2) NOT NULL,
      zip_code VARCHAR(10),
      city_name TEXT,
      area_name TEXT,
      county_name TEXT,
      fmr_curr NUMERIC(14, 2) NOT NULL,
      fmr_yoy NUMERIC(10, 4) NOT NULL,
      zhvi_curr NUMERIC(14, 2) NOT NULL,
      zhvi_yoy NUMERIC(10, 4) NOT NULL,
      yield_curr NUMERIC(10, 6) NOT NULL,
      yield_delta_pp NUMERIC(10, 4) NOT NULL,
      divergence_pp NUMERIC(10, 4) NOT NULL,
      zip_count INTEGER,
      zhvi_as_of_month VARCHAR(10) NOT NULL,
      fmr_year INTEGER NOT NULL,
      indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (geo_type, geo_key)
    );
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_insights_index_geo_state ON insights_index(geo_type, state_code);
  `;
}

const INSIGHTS_INDEX_COLUMNS = [
  'geo_type', 'geo_key', 'state_code', 'zip_code', 'city_name', 'area_name', 'county_name',
  'fmr_curr', 'fmr_yoy', 'zhvi_curr', 'zhvi_yoy', 'yield_curr', 'yield_delta_pp', 'divergence_pp',
  'zip_count', 'zhvi_as_of_month', 'fmr_year', 'indexed_at',
] as const;

type InsightsIndexRow = {
  geo_type: string;
  geo_key: string;
  state_code: string;
  zip_code: string | null;
  city_name: string | null;
  area_name: string | null;
  county_name: string | null;
  fmr_curr: number;
  fmr_yoy: number;
  zhvi_curr: number;
  zhvi_yoy: number;
  yield_curr: number;
  yield_delta_pp: number;
  divergence_pp: number;
  zip_count: number | null;
  zhvi_as_of_month: string;
  fmr_year: number;
  indexed_at: string;
};

function rowToInsightsIndexRow(
  geoType: YieldMoversGeoType,
  row: YieldMoverBaseRow,
  zhviAsOfMonth: string,
  fmrYear: number,
  indexedAt: string
): InsightsIndexRow {
  return {
    geo_type: geoType,
    geo_key: row.geoKey,
    state_code: row.stateCode,
    zip_code: row.zipCode ?? null,
    city_name: row.cityName ?? null,
    area_name: row.areaName ?? null,
    county_name: row.countyName ?? null,
    fmr_curr: row.fmrCurr,
    fmr_yoy: row.fmrYoy,
    zhvi_curr: row.zhviCurr,
    zhvi_yoy: row.zhviYoy,
    yield_curr: row.yieldCurr,
    yield_delta_pp: row.yieldDeltaPp,
    divergence_pp: row.divergencePp,
    zip_count: row.zipCount ?? null,
    zhvi_as_of_month: zhviAsOfMonth,
    fmr_year: fmrYear,
    indexed_at: indexedAt,
  };
}

/** Escape string for PostgreSQL literal: double single quotes. */
function escapeLiteral(s: string | null): string {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}
function numLiteral(n: number | null): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'NULL';
  return String(n);
}

/**
 * Bulk insert using literal VALUES (no params) to avoid Neon 42P18 param type inference.
 * One INSERT per batch; values are safely escaped. Batch size kept modest for query length.
 */
async function bulkInsertInsightsIndex(batch: InsightsIndexRow[]): Promise<void> {
  if (batch.length === 0) return;
  const rows = batch.map(
    (r) =>
      `(${[
        escapeLiteral(r.geo_type),
        escapeLiteral(r.geo_key),
        escapeLiteral(r.state_code),
        escapeLiteral(r.zip_code),
        escapeLiteral(r.city_name),
        escapeLiteral(r.area_name),
        escapeLiteral(r.county_name),
        numLiteral(r.fmr_curr),
        numLiteral(r.fmr_yoy),
        numLiteral(r.zhvi_curr),
        numLiteral(r.zhvi_yoy),
        numLiteral(r.yield_curr),
        numLiteral(r.yield_delta_pp),
        numLiteral(r.divergence_pp),
        r.zip_count === null || r.zip_count === undefined ? 'NULL' : String(r.zip_count),
        escapeLiteral(r.zhvi_as_of_month),
        String(r.fmr_year),
        escapeLiteral(r.indexed_at),
      ].join(',')})`
  );
  const insertSql = `INSERT INTO insights_index (
    geo_type, geo_key, state_code, zip_code, city_name, area_name, county_name,
    fmr_curr, fmr_yoy, zhvi_curr, zhvi_yoy, yield_curr, yield_delta_pp, divergence_pp,
    zip_count, zhvi_as_of_month, fmr_year, indexed_at
  ) VALUES ${rows.join(', ')}
  ON CONFLICT (geo_type, geo_key) DO UPDATE SET
    state_code = EXCLUDED.state_code,
    zip_code = EXCLUDED.zip_code,
    city_name = EXCLUDED.city_name,
    area_name = EXCLUDED.area_name,
    county_name = EXCLUDED.county_name,
    fmr_curr = EXCLUDED.fmr_curr,
    fmr_yoy = EXCLUDED.fmr_yoy,
    zhvi_curr = EXCLUDED.zhvi_curr,
    zhvi_yoy = EXCLUDED.zhvi_yoy,
    yield_curr = EXCLUDED.yield_curr,
    yield_delta_pp = EXCLUDED.yield_delta_pp,
    divergence_pp = EXCLUDED.divergence_pp,
    zip_count = EXCLUDED.zip_count,
    zhvi_as_of_month = EXCLUDED.zhvi_as_of_month,
    fmr_year = EXCLUDED.fmr_year,
    indexed_at = EXCLUDED.indexed_at`;
  await sql.query(insertSql, []);
}

export async function indexInsights(): Promise<{
  success: boolean;
  error?: string;
  counts?: { zip: number; city: number; county: number };
}> {
  try {
    console.log('[insights-index] Ensuring table exists...');
    await ensureInsightsIndexTable();
    console.log('[insights-index] Fetching FMR year...');
    const year = await getLatestFMRYear();
    const indexedAt = new Date().toISOString();
    const counts: { zip: number; city: number; county: number } = { zip: 0, city: 0, county: 0 };

    for (const geoType of ['zip', 'city', 'county'] as YieldMoversGeoType[]) {
      console.log(`[insights-index] Computing ${geoType} data (this may take a few minutes)...`);
      const { rows, zhviAsOfMonth } = await computeYieldMoversBaseData({
        year,
        type: geoType,
        filters: { stateCode: null, bedroomSize: 3 },
      });

      await sql`DELETE FROM insights_index WHERE geo_type = ${geoType}`;

      for (let i = 0; i < rows.length; i += INSIGHTS_INDEX_BATCH_SIZE) {
        const batchRows = rows.slice(i, i + INSIGHTS_INDEX_BATCH_SIZE);
        const batch = batchRows.map((r) =>
          rowToInsightsIndexRow(geoType, r, zhviAsOfMonth, year, indexedAt)
        );
        await bulkInsertInsightsIndex(batch);
      }

      counts[geoType] = rows.length;
      console.log(`[insights-index] ${geoType}: ${rows.length} rows`);
    }

    return { success: true, counts };
  } catch (e: any) {
    console.error('[insights-index] Error:', e);
    return { success: false, error: e?.message ?? 'Unknown error' };
  }
}
