#!/usr/bin/env bun

/**
 * Analyze the impact of score_with_demand vs score
 * Check how many records have score_with_demand and how scores change
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '@/lib/queries';

config();

// Color thresholds (assuming similar to what the map uses)
function getColorRank(score: number | null): number {
  if (score === null) return 0;
  if (score >= 150) return 5; // Highest
  if (score >= 120) return 4;
  if (score >= 100) return 3;
  if (score >= 80) return 2;
  if (score >= 60) return 1;
  return 0; // Lowest
}

async function analyzeScoreImpact() {
  console.log(`\n=== Analyzing Score With Demand Impact ===\n`);

  const year = await getLatestFMRYear();
  console.log(`Analyzing year: ${year}\n`);

  // Get all investment scores
  const scores = await sql`
    SELECT 
      zip_code,
      state_code,
      county_fips,
      county_name,
      score,
      score_with_demand,
      demand_score,
      demand_multiplier,
      zordi_metro
    FROM investment_score
    WHERE fmr_year = ${year}
      AND data_sufficient = true
      AND state_code IS NOT NULL
      AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
    ORDER BY zip_code, bedroom_count
  `;

  console.log(`Total investment score records: ${scores.rows.length}\n`);

  // Analyze score_with_demand coverage
  const withDemandScore = scores.rows.filter(r => r.score_with_demand !== null).length;
  const withoutDemandScore = scores.rows.length - withDemandScore;

  console.log(`Score with demand coverage:`);
  console.log(`  - Records with score_with_demand: ${withDemandScore} (${(withDemandScore / scores.rows.length * 100).toFixed(1)}%)`);
  console.log(`  - Records without score_with_demand: ${withoutDemandScore} (${(withoutDemandScore / scores.rows.length * 100).toFixed(1)}%)\n`);

  // Analyze color rank changes
  let sameRank = 0;
  let upRank = 0;
  let downRank = 0;
  let noChange = 0;
  let significantChange = 0; // Change of 2+ ranks

  const changes: Array<{
    zip: string;
    state: string;
    county: string;
    baseScore: number;
    demandScore: number;
    baseRank: number;
    demandRank: number;
    change: number;
  }> = [];

  for (const row of scores.rows) {
    const baseScore = row.score ? Number(row.score) : null;
    const demandScore = row.score_with_demand ? Number(row.score_with_demand) : baseScore;

    if (baseScore === null || demandScore === null) continue;

    const baseRank = getColorRank(baseScore);
    const demandRank = getColorRank(demandScore);
    const rankChange = demandRank - baseRank;

    if (rankChange === 0) {
      sameRank++;
      if (Math.abs(demandScore - baseScore) < 0.1) {
        noChange++;
      }
    } else if (rankChange > 0) {
      upRank++;
      if (Math.abs(rankChange) >= 2) {
        significantChange++;
      }
    } else {
      downRank++;
      if (Math.abs(rankChange) >= 2) {
        significantChange++;
      }
    }

    // Track significant changes
    if (Math.abs(rankChange) >= 1 || Math.abs(demandScore - baseScore) > 5) {
      changes.push({
        zip: row.zip_code || '',
        state: row.state_code || '',
        county: row.county_name || '',
        baseScore,
        demandScore,
        baseRank,
        demandRank,
        change: rankChange
      });
    }
  }

  console.log(`Color Rank Changes:`);
  console.log(`  - Same rank: ${sameRank} (${(sameRank / scores.rows.length * 100).toFixed(1)}%)`);
  console.log(`  - Moved up: ${upRank} (${(upRank / scores.rows.length * 100).toFixed(1)}%)`);
  console.log(`  - Moved down: ${downRank} (${(downRank / scores.rows.length * 100).toFixed(1)}%)`);
  console.log(`  - No score change: ${noChange} (${(noChange / scores.rows.length * 100).toFixed(1)}%)`);
  console.log(`  - Significant change (2+ ranks): ${significantChange}\n`);

  // Analyze by county (for map display)
  const countyMap = new Map<string, {
    countyFips: string;
    countyName: string;
    stateCode: string;
    baseScores: number[];
    demandScores: number[];
    baseRank: number;
    demandRank: number;
  }>();

  for (const row of scores.rows) {
    if (!row.county_fips || !row.state_code) continue;

    const key = `${row.county_fips}-${row.state_code}`;
    const baseScore = row.score ? Number(row.score) : null;
    const demandScore = row.score_with_demand ? Number(row.score_with_demand) : baseScore;

    if (baseScore === null || demandScore === null) continue;

    if (!countyMap.has(key)) {
      countyMap.set(key, {
        countyFips: row.county_fips,
        countyName: row.county_name || '',
        stateCode: row.state_code,
        baseScores: [],
        demandScores: [],
        baseRank: 0,
        demandRank: 0
      });
    }

    const county = countyMap.get(key)!;
    county.baseScores.push(baseScore);
    county.demandScores.push(demandScore);
  }

  // Calculate median scores and ranks for each county
  let countySameRank = 0;
  let countyUpRank = 0;
  let countyDownRank = 0;
  const countyChanges: Array<{
    county: string;
    state: string;
    baseMedian: number;
    demandMedian: number;
    baseRank: number;
    demandRank: number;
    change: number;
  }> = [];

  for (const county of countyMap.values()) {
    county.baseScores.sort((a, b) => a - b);
    county.demandScores.sort((a, b) => a - b);

    const baseMedian = county.baseScores.length % 2 === 0
      ? (county.baseScores[county.baseScores.length / 2 - 1] + county.baseScores[county.baseScores.length / 2]) / 2
      : county.baseScores[Math.floor(county.baseScores.length / 2)];

    const demandMedian = county.demandScores.length % 2 === 0
      ? (county.demandScores[county.demandScores.length / 2 - 1] + county.demandScores[county.demandScores.length / 2]) / 2
      : county.demandScores[Math.floor(county.demandScores.length / 2)];

    const baseRank = getColorRank(baseMedian);
    const demandRank = getColorRank(demandMedian);
    const rankChange = demandRank - baseRank;

    county.baseRank = baseRank;
    county.demandRank = demandRank;

    if (rankChange === 0) {
      countySameRank++;
    } else if (rankChange > 0) {
      countyUpRank++;
    } else {
      countyDownRank++;
    }

    if (rankChange !== 0 || Math.abs(demandMedian - baseMedian) > 2) {
      countyChanges.push({
        county: county.countyName,
        state: county.stateCode,
        baseMedian,
        demandMedian,
        baseRank,
        demandRank,
        change: rankChange
      });
    }
  }

  console.log(`County-Level Color Rank Changes (for map):`);
  console.log(`  - Total counties: ${countyMap.size}`);
  console.log(`  - Same rank: ${countySameRank} (${(countySameRank / countyMap.size * 100).toFixed(1)}%)`);
  console.log(`  - Moved up: ${countyUpRank} (${(countyUpRank / countyMap.size * 100).toFixed(1)}%)`);
  console.log(`  - Moved down: ${countyDownRank} (${(countyDownRank / countyMap.size * 100).toFixed(1)}%)\n`);

  // Show top changes
  console.log(`Top 20 Counties That Moved Up:`);
  countyChanges
    .filter(c => c.change > 0)
    .sort((a, b) => b.change - a.change)
    .slice(0, 20)
    .forEach(c => {
      console.log(`  ${c.county}, ${c.state}: Rank ${c.baseRank} → ${c.demandRank} (${c.baseMedian.toFixed(1)} → ${c.demandMedian.toFixed(1)})`);
    });

  console.log(`\nTop 20 Counties That Moved Down:`);
  countyChanges
    .filter(c => c.change < 0)
    .sort((a, b) => a.change - b.change)
    .slice(0, 20)
    .forEach(c => {
      console.log(`  ${c.county}, ${c.state}: Rank ${c.baseRank} → ${c.demandRank} (${c.baseMedian.toFixed(1)} → ${c.demandMedian.toFixed(1)})`);
    });

  // Check if score_with_demand is actually different from score
  const identicalScores = scores.rows.filter(r => {
    const base = r.score ? Number(r.score) : null;
    const demand = r.score_with_demand ? Number(r.score_with_demand) : null;
    return base !== null && demand !== null && Math.abs(base - demand) < 0.01;
  }).length;

  console.log(`\nScore Analysis:`);
  console.log(`  - Records where score = score_with_demand: ${identicalScores} (${(identicalScores / scores.rows.length * 100).toFixed(1)}%)`);
  console.log(`  - Records where scores differ: ${scores.rows.length - identicalScores} (${((scores.rows.length - identicalScores) / scores.rows.length * 100).toFixed(1)}%)\n`);

  // Check demand_multiplier distribution
  const multipliers = scores.rows
    .map(r => r.demand_multiplier ? Number(r.demand_multiplier) : null)
    .filter(m => m !== null) as number[];

  if (multipliers.length > 0) {
    multipliers.sort((a, b) => a - b);
    const median = multipliers.length % 2 === 0
      ? (multipliers[multipliers.length / 2 - 1] + multipliers[multipliers.length / 2]) / 2
      : multipliers[Math.floor(multipliers.length / 2)];

    console.log(`Demand Multiplier Statistics:`);
    console.log(`  - Records with multiplier: ${multipliers.length}`);
    console.log(`  - Min: ${Math.min(...multipliers).toFixed(4)}`);
    console.log(`  - Max: ${Math.max(...multipliers).toFixed(4)}`);
    console.log(`  - Median: ${median.toFixed(4)}`);
    console.log(`  - Multiplier = 1.0 (no change): ${multipliers.filter(m => Math.abs(m - 1.0) < 0.0001).length}`);
    console.log(`  - Multiplier < 1.0 (penalty): ${multipliers.filter(m => m < 0.99).length}`);
    console.log(`  - Multiplier > 1.0 (boost): ${multipliers.filter(m => m > 1.01).length}\n`);
  }

  console.log(`✅ Analysis complete!\n`);
}

analyzeScoreImpact()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
