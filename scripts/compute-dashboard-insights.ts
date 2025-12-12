#!/usr/bin/env bun

/**
 * Precompute and store the home dashboard insights in the database.
 *
 * Why: `/api/stats/insights` is expensive (multi-join + aggregation + JS post-processing).
 * We want these metrics to be indexed annually as part of the yearly ingestion workflow.
 *
 * Usage:
 *   bun scripts/compute-dashboard-insights.ts --year 2026
 *   bun scripts/compute-dashboard-insights.ts --year 2026 --types zip,city,county
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';
import { computeDashboardInsights, type DashboardInsightsType } from '../lib/dashboard-insights';

config();

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  let year: number | undefined;
  let types: DashboardInsightsType[] = ['zip', 'city', 'county'];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--year' && args[i + 1]) {
      year = parseInt(args[i + 1], 10);
      i++;
      continue;
    }
    if (a === '--types' && args[i + 1]) {
      const raw = args[i + 1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as DashboardInsightsType[];
      if (raw.length > 0) types = raw;
      i++;
      continue;
    }
  }

  if (!year || Number.isNaN(year)) {
    throw new Error('Missing required --year <YYYY>');
  }

  return { year, types };
}

export async function ensureDashboardInsightsCacheTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS dashboard_insights_cache (
      year INTEGER NOT NULL,
      type VARCHAR(10) NOT NULL CHECK (type IN ('zip', 'city', 'county')),
      payload JSONB NOT NULL,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (year, type)
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_dashboard_insights_year ON dashboard_insights_cache(year);`;
}

export async function computeAndStoreDashboardInsights(year: number, types: DashboardInsightsType[] = ['zip', 'city', 'county']) {
  await ensureDashboardInsightsCacheTable();

  for (const t of types) {
    console.log(`Computing dashboard insights: year=${year} type=${t}...`);
    const payload = await computeDashboardInsights({ year, type: t });
    await sql.query(
      `
      INSERT INTO dashboard_insights_cache (year, type, payload, computed_at)
      VALUES ($1, $2, $3::jsonb, NOW())
      ON CONFLICT (year, type)
      DO UPDATE SET payload = EXCLUDED.payload, computed_at = EXCLUDED.computed_at
      `,
      [year, t, JSON.stringify(payload)]
    );
  }
}

if (import.meta.main) {
  const { year, types } = parseArgs(process.argv);
  computeAndStoreDashboardInsights(year, types)
    .then(() => {
      console.log('✅ Dashboard insights cached.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Failed to cache dashboard insights:', err);
      process.exit(1);
    });
}

