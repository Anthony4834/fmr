#!/usr/bin/env bun
/**
 * Run insights indexing locally (same logic as cron on day 19).
 * Populates insights_index for zip, city, and county from FMR/ZHVI data.
 *
 * Usage:
 *   bun run index:insights
 *   bun scripts/index-insights.ts
 */

import { config } from 'dotenv';
config();

async function main() {
  console.log('[index-insights] Starting...');
  // Dynamic import so env is loaded before @vercel/postgres is used
  const { indexInsights } = await import('../lib/insights-index');
  const result = await indexInsights();
  if (result.success) {
    console.log('[index-insights] Done.', result.counts);
    process.exit(0);
  } else {
    console.error('[index-insights] Failed:', result.error);
    process.exit(1);
  }
}

main();
