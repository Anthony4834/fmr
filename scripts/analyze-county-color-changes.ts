#!/usr/bin/env bun

/**
 * Analyze county color changes with exact thresholds matching the map
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '@/lib/queries';

config();

// Exact color thresholds from USStateMap.tsx
function getColorForScore(score: number | null): string {
  if (score === null) return '#e5e5e5'; // Gray
  if (score >= 150) return '#1a9850'; // Dark green
  if (score >= 130) return '#44e37e'; // Light green
  if (score >= 95) return '#91cf60'; // Yellow-green
  if (score >= 80) return '#fee08b'; // Yellow
  if (score >= 60) return '#fc8d59'; // Orange
  return '#d73027'; // Red
}

function getColorName(score: number | null): string {
  if (score === null) return 'Gray';
  if (score >= 150) return 'Dark Green';
  if (score >= 130) return 'Light Green';
  if (score >= 95) return 'Yellow-Green';
  if (score >= 80) return 'Yellow';
  if (score >= 60) return 'Orange';
  return 'Red';
}

async function analyzeCountyColorChanges() {
  console.log(`\n=== Analyzing County Color Changes ===\n`);

  const year = await getLatestFMRYear();
  console.log(`Year: ${year}\n`);

  // Get county-level median scores (matching the API query)
  const counties = await sql`
    WITH county_scores AS (
      SELECT 
        county_fips,
        state_code,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(score_with_demand, score)) as median_score_demand,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median_score_base,
        COUNT(*) as zip_count
      FROM investment_score
      WHERE fmr_year = ${year}
        AND data_sufficient = true
        AND county_fips IS NOT NULL
        AND LENGTH(TRIM(county_fips)) = 5
        AND state_code IS NOT NULL
        AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
      GROUP BY county_fips, state_code
      HAVING COUNT(*) > 0
    ),
    county_names AS (
      SELECT DISTINCT ON (county_fips, state_code)
        county_fips,
        state_code,
        county_name
      FROM investment_score
      WHERE fmr_year = ${year}
        AND county_fips IS NOT NULL
        AND LENGTH(TRIM(county_fips)) = 5
        AND state_code IS NOT NULL
        AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
      ORDER BY county_fips, state_code, county_name
    )
    SELECT DISTINCT ON (cs.county_fips, cs.state_code)
      cs.county_fips,
      COALESCE(cn.county_name, 'Unknown County') as county_name,
      cs.state_code,
      cs.median_score_demand,
      cs.median_score_base,
      cs.zip_count
    FROM county_scores cs
    LEFT JOIN county_names cn ON cs.county_fips = cn.county_fips AND cs.state_code = cn.state_code
    ORDER BY cs.county_fips, cs.state_code, cs.zip_count DESC
  `;

  console.log(`Total counties: ${counties.rows.length}\n`);

  let sameColor = 0;
  let changedColor = 0;
  const changes: Array<{
    county: string;
    state: string;
    baseScore: number;
    demandScore: number;
    baseColor: string;
    demandColor: string;
    change: string;
  }> = [];

  for (const row of counties.rows) {
    const baseScore = row.median_score_base ? Number(row.median_score_base) : null;
    const demandScore = row.median_score_demand ? Number(row.median_score_demand) : null;

    if (baseScore === null || demandScore === null) continue;

    const baseColor = getColorForScore(baseScore);
    const demandColor = getColorForScore(demandScore);
    const baseColorName = getColorName(baseScore);
    const demandColorName = getColorName(demandScore);

    if (baseColor === demandColor) {
      sameColor++;
    } else {
      changedColor++;
      changes.push({
        county: row.county_name || '',
        state: row.state_code || '',
        baseScore,
        demandScore,
        baseColor: baseColorName,
        demandColor: demandColorName,
        change: `${baseColorName} → ${demandColorName}`
      });
    }
  }

  console.log(`Color Changes:`);
  console.log(`  - Same color: ${sameColor} (${(sameColor / counties.rows.length * 100).toFixed(1)}%)`);
  console.log(`  - Changed color: ${changedColor} (${(changedColor / counties.rows.length * 100).toFixed(1)}%)\n`);

  // Group by color change type
  const changeTypes = new Map<string, number>();
  for (const c of changes) {
    changeTypes.set(c.change, (changeTypes.get(c.change) || 0) + 1);
  }

  console.log(`Color Change Breakdown:`);
  const sortedChanges = Array.from(changeTypes.entries()).sort((a, b) => b[1] - a[1]);
  for (const [change, count] of sortedChanges) {
    console.log(`  ${change}: ${count} counties`);
  }

  console.log(`\nTop 30 Counties With Color Changes:`);
  changes
    .sort((a, b) => Math.abs(b.demandScore - b.baseScore) - Math.abs(a.demandScore - a.baseScore))
    .slice(0, 30)
    .forEach(c => {
      const diff = c.demandScore - c.baseScore;
      const sign = diff >= 0 ? '+' : '';
      console.log(`  ${c.county}, ${c.state}: ${c.baseColor} → ${c.demandColor} (${c.baseScore.toFixed(1)} → ${c.demandScore.toFixed(1)}, ${sign}${diff.toFixed(1)})`);
    });

  // Check if scores are actually different
  const identicalScores = counties.rows.filter(r => {
    const base = r.median_score_base ? Number(r.median_score_base) : null;
    const demand = r.median_score_demand ? Number(r.median_score_demand) : null;
    return base !== null && demand !== null && Math.abs(base - demand) < 0.01;
  }).length;

  console.log(`\nScore Differences:`);
  console.log(`  - Counties with identical scores: ${identicalScores} (${(identicalScores / counties.rows.length * 100).toFixed(1)}%)`);
  console.log(`  - Counties with different scores: ${counties.rows.length - identicalScores} (${((counties.rows.length - identicalScores) / counties.rows.length * 100).toFixed(1)}%)\n`);

  // Sample some counties to verify
  console.log(`Sample County Scores (Base vs Demand):`);
  for (const row of counties.rows.slice(0, 10)) {
    const base = row.median_score_base ? Number(row.median_score_base).toFixed(1) : 'null';
    const demand = row.median_score_demand ? Number(row.median_score_demand).toFixed(1) : 'null';
    const baseColor = getColorName(row.median_score_base ? Number(row.median_score_base) : null);
    const demandColor = getColorName(row.median_score_demand ? Number(row.median_score_demand) : null);
    console.log(`  ${row.county_name}, ${row.state_code}: ${base} (${baseColor}) → ${demand} (${demandColor})`);
  }

  console.log(`\n✅ Analysis complete!\n`);
}

analyzeCountyColorChanges()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
