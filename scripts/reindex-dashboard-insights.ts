#!/usr/bin/env bun

/**
 * Re-index dashboard insights for all (type × state × bedroom) combinations.
 *
 * This precomputes the payloads that `/api/stats/insights` serves and stores them in
 * `dashboard_insights_cache_v2` (same table/key format used by the API route).
 *
 * Usage:
 *   bun scripts/reindex-dashboard-insights.ts
 *   bun scripts/reindex-dashboard-insights.ts --year 2026
 *   bun scripts/reindex-dashboard-insights.ts --types zip,city,county
 *   bun scripts/reindex-dashboard-insights.ts --states WA,OR
 *   bun scripts/reindex-dashboard-insights.ts --bedrooms 0,1,2
 *   bun scripts/reindex-dashboard-insights.ts --no-nationwide
 *
 * Notes:
 * - This is DB-only work (no external APIs).
 * - It can take a while: city/county aggregates are the heaviest.
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';
import {
  computeDashboardInsights,
  type DashboardInsightsType,
  type DashboardInsightsFilters,
} from '../lib/dashboard-insights';
import { getLatestFMRYear } from '../lib/queries';

config();

const CACHE_VERSION = 4; // keep in sync with app/api/stats/insights/route.ts

const STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
] as const;

function normalizeTypes(input: string | undefined): DashboardInsightsType[] {
  if (!input) return ['zip', 'city', 'county'];
  const raw = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const out: DashboardInsightsType[] = [];
  for (const t of raw) {
    if (t === 'zip' || t === 'city' || t === 'county') out.push(t);
  }
  return out.length ? out : ['zip', 'city', 'county'];
}

function normalizeStates(input: string | undefined): string[] {
  if (!input) return [...STATE_CODES];
  const raw = input
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const allowed = new Set(STATE_CODES);
  const out = raw.filter((s) => allowed.has(s as any));
  return out.length ? out : [...STATE_CODES];
}

function normalizeBedrooms(input: string | undefined): (number | null)[] {
  // null means "All"
  if (!input) return [null, 0, 1, 2, 3, 4];
  const raw = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const out: (number | null)[] = [];
  for (const r of raw) {
    if (r.toLowerCase() === 'all') {
      out.push(null);
      continue;
    }
    const n = parseInt(r, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 4) out.push(n);
  }
  // Ensure "All" is included if user didn't specify anything valid
  return out.length ? out : [null, 0, 1, 2, 3, 4];
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  let year: number | undefined;
  let typesRaw: string | undefined;
  let statesRaw: string | undefined;
  let bedroomsRaw: string | undefined;
  let includeNationwide = true;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--year' && args[i + 1]) {
      year = parseInt(args[i + 1], 10);
      i++;
      continue;
    }
    if (a === '--types' && args[i + 1]) {
      typesRaw = args[i + 1];
      i++;
      continue;
    }
    if (a === '--states' && args[i + 1]) {
      statesRaw = args[i + 1];
      i++;
      continue;
    }
    if (a === '--bedrooms' && args[i + 1]) {
      bedroomsRaw = args[i + 1];
      i++;
      continue;
    }
    if (a === '--no-nationwide') {
      includeNationwide = false;
      continue;
    }
  }

  return {
    year,
    types: normalizeTypes(typesRaw),
    states: normalizeStates(statesRaw),
    bedrooms: normalizeBedrooms(bedroomsRaw),
    includeNationwide,
  };
}

function makeCacheKey(year: number, type: DashboardInsightsType, stateCode: string | null, bedroomSize: number | null) {
  return `${year}:${type}:${stateCode || 'all'}:${bedroomSize !== null ? bedroomSize : 'all'}`;
}

async function ensureCacheTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS dashboard_insights_cache_v2 (
      cache_key VARCHAR(255) NOT NULL,
      year INTEGER NOT NULL,
      type VARCHAR(10) NOT NULL CHECK (type IN ('zip', 'city', 'county')),
      state_code VARCHAR(2),
      bedroom_size INTEGER,
      payload JSONB NOT NULL,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (cache_key)
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_dashboard_insights_v2_year ON dashboard_insights_cache_v2(year);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_dashboard_insights_v2_type ON dashboard_insights_cache_v2(type);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_dashboard_insights_v2_state ON dashboard_insights_cache_v2(state_code);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_dashboard_insights_v2_bedroom ON dashboard_insights_cache_v2(bedroom_size);`;
}

async function upsertPayload(opts: {
  year: number;
  type: DashboardInsightsType;
  filters: DashboardInsightsFilters;
}) {
  const { year, type, filters } = opts;
  const stateCode = filters.stateCode ?? null;
  const bedroomSize = filters.bedroomSize ?? null;
  const cacheKey = makeCacheKey(year, type, stateCode, bedroomSize);

  const payload = await computeDashboardInsights({ year, type, filters });
  (payload as any).cacheVersion = CACHE_VERSION;

  await sql.query(
    `
    INSERT INTO dashboard_insights_cache_v2 (cache_key, year, type, state_code, bedroom_size, payload, computed_at)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
    ON CONFLICT (cache_key)
    DO UPDATE SET payload = EXCLUDED.payload, computed_at = EXCLUDED.computed_at
    `,
    [cacheKey, year, type, stateCode, bedroomSize, JSON.stringify(payload)]
  );
}

async function main() {
  const args = parseArgs(process.argv);
  const year = args.year && !Number.isNaN(args.year) ? args.year : await getLatestFMRYear();
  const types = args.types;
  const bedrooms = args.bedrooms;

  const stateList: (string | null)[] = [];
  if (args.includeNationwide) stateList.push(null);
  stateList.push(...args.states);

  await ensureCacheTable();

  const total = types.length * stateList.length * bedrooms.length;
  let done = 0;
  const started = Date.now();

  console.log(`Re-indexing dashboard insights: year=${year}`);
  console.log(`- types: ${types.join(',')}`);
  console.log(`- states: ${args.includeNationwide ? 'nationwide + ' : ''}${args.states.length} states`);
  console.log(`- bedrooms: ${bedrooms.map((b) => (b === null ? 'all' : String(b))).join(',')}`);
  console.log(`- total jobs: ${total}`);

  for (const type of types) {
    for (const stateCode of stateList) {
      for (const bedroomSize of bedrooms) {
        const label = `${type} ${stateCode || 'ALL'} ${bedroomSize === null ? 'ALL' : `${bedroomSize}BR`}`;
        try {
          await upsertPayload({
            year,
            type,
            filters: { stateCode, bedroomSize },
          });
        } catch (err) {
          console.error(`❌ Failed: ${label}`);
          throw err;
        }

        done++;
        if (done % 10 === 0 || done === total) {
          const elapsedSec = Math.max(1, Math.round((Date.now() - started) / 1000));
          console.log(`✅ ${done}/${total} (${label}) • ${elapsedSec}s elapsed`);
        }
      }
    }
  }

  console.log('✅ Dashboard insights re-index complete.');
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}





