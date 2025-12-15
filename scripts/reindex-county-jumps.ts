#!/usr/bin/env bun

/**
 * Re-index ONLY the "Price jumps" (anomalies) metric for dashboard caches.
 *
 * Updates `payload.anomalies` for every (type × state × bedroom) cached entry in
 * `dashboard_insights_cache_v2`, using the same logic as `computeDashboardInsights`.
 *
 * Usage:
 *   bun scripts/reindex-county-jumps.ts
 *   bun scripts/reindex-county-jumps.ts --year 2026
 *   bun scripts/reindex-county-jumps.ts --types zip,city,county
 *   bun scripts/reindex-county-jumps.ts --states WA,OR
 *   bun scripts/reindex-county-jumps.ts --bedrooms all,0,1,2,3,4
 *   bun scripts/reindex-county-jumps.ts --no-nationwide
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';
import { computeDashboardInsights } from '../lib/dashboard-insights';
import { getLatestFMRYear } from '../lib/queries';

config();

const CACHE_VERSION = 4; // keep in sync with app/api/stats/insights/route.ts

type DashboardType = 'zip' | 'city' | 'county';

const STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
] as const;

function normalizeTypes(input: string | undefined): DashboardType[] {
  if (!input) return ['zip', 'city', 'county'];
  const raw = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const out: DashboardType[] = [];
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
  if (!input) return [null, 0, 1, 2, 3, 4];
  const raw = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const out: (number | null)[] = [];
  for (const r of raw) {
    if (r.toLowerCase() === 'all') out.push(null);
    else {
      const n = parseInt(r, 10);
      if (Number.isFinite(n) && n >= 0 && n <= 4) out.push(n);
    }
  }
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

function cacheKey(year: number, type: DashboardType, stateCode: string | null, bedroom: number | null) {
  return `${year}:${type}:${stateCode || 'all'}:${bedroom !== null ? bedroom : 'all'}`;
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
}

async function main() {
  const args = parseArgs(process.argv);
  const year = args.year && !Number.isNaN(args.year) ? args.year : await getLatestFMRYear();
  await ensureCacheTable();

  const states: (string | null)[] = [];
  if (args.includeNationwide) states.push(null);
  states.push(...args.states);

  const total = args.types.length * states.length * args.bedrooms.length;
  let done = 0;
  const started = Date.now();

  console.log(`Re-indexing price jumps only: year=${year}`);
  console.log(`- types: ${args.types.join(',')}`);
  console.log(`- states: ${args.includeNationwide ? 'nationwide + ' : ''}${args.states.length} states`);
  console.log(`- bedrooms: ${args.bedrooms.map((b) => (b === null ? 'all' : `${b}`)).join(',')}`);
  console.log(`- total jobs: ${total}`);

  for (const type of args.types) {
    for (const stateCode of states) {
      for (const bedroomSize of args.bedrooms) {
        const key = cacheKey(year, type, stateCode, bedroomSize);

        // Recompute full insights for this combo, but only persist anomalies back into cache.
        // If the cache row doesn't exist, we insert the full payload.
        const payload = await computeDashboardInsights({
          year,
          type,
          filters: { stateCode, bedroomSize },
        });

        const anomalies = (payload as any).anomalies || [];

        const updateRes = await sql.query(
          `
          UPDATE dashboard_insights_cache_v2
          SET payload =
            jsonb_set(
              jsonb_set(payload, '{anomalies}', $1::jsonb, true),
              '{cacheVersion}', to_jsonb($2::int), true
            ),
            computed_at = NOW()
          WHERE cache_key = $3
          `,
          [JSON.stringify(anomalies), CACHE_VERSION, key]
        );

        if ((updateRes.rowCount || 0) === 0) {
          (payload as any).cacheVersion = CACHE_VERSION;
          await sql.query(
            `
            INSERT INTO dashboard_insights_cache_v2 (cache_key, year, type, state_code, bedroom_size, payload, computed_at)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
            ON CONFLICT (cache_key)
            DO UPDATE SET payload = EXCLUDED.payload, computed_at = EXCLUDED.computed_at
            `,
            [key, year, type, stateCode, bedroomSize, JSON.stringify(payload)]
          );
        }

        done++;
        if (done % 10 === 0 || done === total) {
          const elapsedSec = Math.max(1, Math.round((Date.now() - started) / 1000));
          console.log(
            `✅ ${done}/${total} (${type} ${stateCode || 'ALL'} ${bedroomSize === null ? 'ALL' : `${bedroomSize}BR`}) • ${elapsedSec}s elapsed`
          );
        }
      }
    }
  }

  console.log('✅ Price jumps re-index complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


