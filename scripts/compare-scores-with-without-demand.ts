#!/usr/bin/env bun

/**
 * Compare investment scores calculated with and without demand factor.
 * 
 * This script:
 * 1. Gets existing investment scores (base score without demand)
 * 2. Fetches ZORI/ZORDI data and calculates demand scores
 * 3. Computes what score_with_demand would be
 * 4. Reports the difference between the two algorithms
 * 
 * Usage:
 *   bun scripts/compare-scores-with-without-demand.ts [--year 2026] [--state IL]
 */

import { config } from 'dotenv';
import { configureDatabase, query } from '../lib/db';
import { getLatestFMRYear } from '../lib/queries';

config();

interface ScoreComparison {
  zipCode: string;
  stateCode: string;
  countyName: string;
  baseScore: number;
  scoreWithDemand: number;
  demandScore: number | null;
  demandMultiplier: number | null;
  difference: number;
  percentChange: number;
  zordiValue: number | null;
}

// Helper function for percentile rank (0-100) - same as compute-investment-scores.ts
function computePercentileRank(values: number[]): Map<number, number> {
  const sorted = [...values].filter(v => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
  const ranks = new Map<number, number>();
  for (let i = 0; i < sorted.length; i++) {
    // Percentile rank: percentage of values that fall below this value
    ranks.set(sorted[i]!, (i / (sorted.length - 1 || 1)) * 100);
  }
  return ranks;
}

async function compareScores(year?: number, stateFilter?: string) {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  const fmrYear = year || await getLatestFMRYear();

  console.log('\n' + '='.repeat(80));
  console.log('Investment Score Comparison: With vs Without Demand Factor');
  console.log('='.repeat(80));
  console.log(`FMR Year: ${fmrYear}`);
  if (stateFilter) console.log(`State Filter: ${stateFilter}`);
  console.log('='.repeat(80) + '\n');

  // Get investment scores with demand data joined
  const queryText = `
    WITH investment_scores AS (
      SELECT 
        isc.zip_code,
        isc.state_code,
        isc.county_name,
        isc.score as base_score,
        isc.net_yield,
        isc.property_value,
        isc.annual_rent,
        isc.annual_taxes
      FROM investment_score isc
      WHERE isc.fmr_year = $1
        AND isc.data_sufficient = true
        AND isc.score IS NOT NULL
        ${stateFilter ? 'AND isc.state_code = $2' : ''}
    ),
    latest_zordi_month AS (
      SELECT MAX(month) as month FROM zillow_zordi_metro_monthly
    ),
    zordi_current AS (
      SELECT
        z.region_name,
        z.zordi as zordi_value
      FROM zillow_zordi_metro_monthly z
      CROSS JOIN latest_zordi_month lzm
      WHERE z.month = lzm.month
        AND z.region_type IN ('msa', 'metro')
    ),
    zip_metro_mapping AS (
      SELECT DISTINCT ON (z.zip_code)
        z.zip_code,
        z.metro_name
      FROM zillow_zori_zip_monthly z
      WHERE z.metro_name IS NOT NULL
      ORDER BY z.zip_code, z.metro_name
    )
    SELECT 
      isc.zip_code,
      isc.state_code,
      isc.county_name,
      isc.base_score,
      isc.net_yield,
      zrd.zordi_value,
      zmm.metro_name as zordi_metro
    FROM investment_scores isc
    LEFT JOIN zip_metro_mapping zmm ON zmm.zip_code = isc.zip_code
    LEFT JOIN zordi_current zrd ON zrd.region_name = zmm.metro_name
    ORDER BY isc.zip_code
    LIMIT 10000
  `;

  const params: any[] = [fmrYear];
  if (stateFilter) {
    params.push(stateFilter.toUpperCase());
  }

  const results = await query(queryText, params);

  console.log(`Found ${results.length} investment score records\n`);

  // Collect demand metrics for percentile ranking
  const zordiValues = results
    .map((r: any) => r.zordi_value ? Number(r.zordi_value) : null)
    .filter((v): v is number => v !== null);

  const zordiRanks = computePercentileRank(zordiValues);

  // Compute demand scores and multipliers for each ZIP
  const comparisons: ScoreComparison[] = [];
  let withDemandData = 0;
  let withoutDemandData = 0;

  for (const row of results) {
    const baseScore = Number(row.base_score) || 0;
    const zordiValue = row.zordi_value ? Number(row.zordi_value) : null;

    // Compute demand score using ZORDI percentile rank
    let demandScore: number | null = null;
    let demandMultiplier: number | null = null;

    if (zordiValue !== null && zordiRanks.has(zordiValue)) {
      demandScore = zordiRanks.get(zordiValue)!;

      // Compute demand multiplier: clamp(0.90, 1.10, 1 + 0.20*(DEMAND_SCORE - 50)/100)
      const rawMultiplier = 1 + 0.20 * (demandScore - 50) / 100;
      demandMultiplier = Math.max(0.90, Math.min(1.10, rawMultiplier));

      withDemandData++;
    } else {
      // No demand data - use neutral multiplier
      demandScore = null;
      demandMultiplier = 1.0;
      withoutDemandData++;
    }

    // Calculate score_with_demand (capped at 300, same as compute-investment-scores.ts)
    const cappedScore = Math.min(baseScore, 300);
    const scoreWithDemand = Math.min(cappedScore * (demandMultiplier || 1.0), 300);

    const difference = scoreWithDemand - baseScore;
    const percentChange = baseScore !== 0 ? (difference / baseScore) * 100 : 0;

    comparisons.push({
      zipCode: String(row.zip_code),
      stateCode: String(row.state_code),
      countyName: String(row.county_name || ''),
      baseScore,
      scoreWithDemand,
      demandScore,
      demandMultiplier,
      difference,
      percentChange,
      zordiValue,
    });
  }

  // Statistics
  const differences = comparisons
    .filter(c => c.demandScore !== null)
    .map(c => c.difference);
  const percentChanges = comparisons
    .filter(c => c.demandScore !== null)
    .map(c => c.percentChange);

  console.log('=== Summary Statistics ===\n');
  console.log(`Total ZIPs analyzed: ${comparisons.length}`);
  console.log(`ZIPs with demand data: ${withDemandData}`);
  console.log(`ZIPs without demand data: ${withoutDemandData}\n`);

  if (differences.length > 0) {
    const sortedDiffs = [...differences].sort((a, b) => a - b);
    const sortedPercents = [...percentChanges].sort((a, b) => a - b);

    console.log('=== Score Differences (With Demand - Without Demand) ===\n');
    const meanDiff = differences.reduce((a, b) => a + b, 0) / differences.length;
    console.log(`Mean difference: ${meanDiff.toFixed(2)}`);
    console.log(`Median difference: ${sortedDiffs[Math.floor(sortedDiffs.length / 2)]?.toFixed(2) || 'N/A'}`);
    console.log(`Min difference: ${sortedDiffs[0]?.toFixed(2) || 'N/A'}`);
    console.log(`Max difference: ${sortedDiffs[sortedDiffs.length - 1]?.toFixed(2) || 'N/A'}`);
    const variance = differences.reduce((sum, d) => sum + Math.pow(d - meanDiff, 2), 0) / differences.length;
    console.log(`Std deviation: ${Math.sqrt(variance).toFixed(2)}\n`);

    console.log('=== Percent Changes ===\n');
    const meanPercent = percentChanges.reduce((a, b) => a + b, 0) / percentChanges.length;
    console.log(`Mean percent change: ${meanPercent.toFixed(2)}%`);
    console.log(`Median percent change: ${sortedPercents[Math.floor(sortedPercents.length / 2)]?.toFixed(2) || 'N/A'}%`);
    console.log(`Min percent change: ${sortedPercents[0]?.toFixed(2) || 'N/A'}%`);
    console.log(`Max percent change: ${sortedPercents[sortedPercents.length - 1]?.toFixed(2) || 'N/A'}%\n`);
  }

  // Top increases
  const topIncreases = [...comparisons]
    .filter(c => c.demandScore !== null && c.difference > 0)
    .sort((a, b) => b.difference - a.difference)
    .slice(0, 20);

  if (topIncreases.length > 0) {
    console.log('=== Top 20 ZIPs: Largest Score Increases from Demand ===\n');
    console.log('ZIP'.padEnd(8) + 'State'.padEnd(6) + 'County'.padEnd(30) + 'Base'.padEnd(8) + 'With Demand'.padEnd(12) + 'Diff'.padEnd(8) + '% Change'.padEnd(10) + 'Multiplier');
    console.log('-'.repeat(100));
    topIncreases.forEach(c => {
      console.log(
        c.zipCode.padEnd(8) +
        c.stateCode.padEnd(6) +
        (c.countyName.substring(0, 28)).padEnd(30) +
        c.baseScore.toFixed(2).padEnd(8) +
        c.scoreWithDemand.toFixed(2).padEnd(12) +
        `+${c.difference.toFixed(2)}`.padEnd(8) +
        `+${c.percentChange.toFixed(2)}%`.padEnd(10) +
        (c.demandMultiplier?.toFixed(3) || 'N/A')
      );
    });
    console.log();
  }

  // Top decreases
  const topDecreases = [...comparisons]
    .filter(c => c.demandScore !== null && c.difference < 0)
    .sort((a, b) => a.difference - b.difference)
    .slice(0, 20);

  if (topDecreases.length > 0) {
    console.log('=== Top 20 ZIPs: Largest Score Decreases from Demand ===\n');
    console.log('ZIP'.padEnd(8) + 'State'.padEnd(6) + 'County'.padEnd(30) + 'Base'.padEnd(8) + 'With Demand'.padEnd(12) + 'Diff'.padEnd(8) + '% Change'.padEnd(10) + 'Multiplier');
    console.log('-'.repeat(100));
    topDecreases.forEach(c => {
      console.log(
        c.zipCode.padEnd(8) +
        c.stateCode.padEnd(6) +
        (c.countyName.substring(0, 28)).padEnd(30) +
        c.baseScore.toFixed(2).padEnd(8) +
        c.scoreWithDemand.toFixed(2).padEnd(12) +
        c.difference.toFixed(2).padEnd(8) +
        `${c.percentChange.toFixed(2)}%`.padEnd(10) +
        (c.demandMultiplier?.toFixed(3) || 'N/A')
      );
    });
    console.log();
  }

  // Distribution analysis
  const ranges = [
    { min: -Infinity, max: -10, label: 'Decrease > 10 points' },
    { min: -10, max: -5, label: 'Decrease 5-10 points' },
    { min: -5, max: -1, label: 'Decrease 1-5 points' },
    { min: -1, max: 1, label: 'No change (-1 to +1)' },
    { min: 1, max: 5, label: 'Increase 1-5 points' },
    { min: 5, max: 10, label: 'Increase 5-10 points' },
    { min: 10, max: Infinity, label: 'Increase > 10 points' }
  ];

  console.log('=== Distribution of Score Changes ===\n');
  ranges.forEach(range => {
    const count = comparisons.filter(c => 
      c.demandScore !== null && 
      c.difference >= range.min && 
      c.difference < range.max
    ).length;
    const percent = withDemandData > 0 ? (count / withDemandData * 100).toFixed(1) : '0.0';
    console.log(`${range.label.padEnd(25)}: ${String(count).padStart(5)} (${percent}%)`);
  });
  console.log();

  // Demand multiplier distribution
  const multipliers = comparisons
    .map(c => c.demandMultiplier)
    .filter(m => m !== null) as number[];

  if (multipliers.length > 0) {
    const sortedMultipliers = [...multipliers].sort((a, b) => a - b);
    console.log('=== Demand Multiplier Distribution ===\n');
    console.log(`Min multiplier: ${sortedMultipliers[0]?.toFixed(3) || 'N/A'}`);
    console.log(`Max multiplier: ${sortedMultipliers[sortedMultipliers.length - 1]?.toFixed(3) || 'N/A'}`);
    console.log(`Mean multiplier: ${(multipliers.reduce((a, b) => a + b, 0) / multipliers.length).toFixed(3)}`);
    console.log(`Median multiplier: ${sortedMultipliers[Math.floor(sortedMultipliers.length / 2)]?.toFixed(3) || 'N/A'}`);
    console.log(`Multiplier = 1.0 (no change): ${multipliers.filter(m => Math.abs(m - 1.0) < 0.001).length} ZIPs`);
    console.log(`Multiplier > 1.0 (boost): ${multipliers.filter(m => m > 1.0).length} ZIPs`);
    console.log(`Multiplier < 1.0 (penalty): ${multipliers.filter(m => m < 1.0).length} ZIPs\n`);
  }

  // Impact on rankings
  const sortedByBase = [...comparisons]
    .filter(c => c.demandScore !== null)
    .sort((a, b) => b.baseScore - a.baseScore)
    .map((c, i) => ({ ...c, baseRank: i + 1 }));

  const sortedByDemand = [...comparisons]
    .filter(c => c.demandScore !== null)
    .sort((a, b) => b.scoreWithDemand - a.scoreWithDemand)
    .map((c, i) => ({ ...c, demandRank: i + 1 }));

  const rankChanges = sortedByBase.map(base => {
    const demand = sortedByDemand.find(d => d.zipCode === base.zipCode);
    return {
      zipCode: base.zipCode,
      stateCode: base.stateCode,
      countyName: base.countyName,
      baseRank: base.baseRank,
      demandRank: demand?.demandRank || base.baseRank,
      rankChange: (demand?.demandRank || base.baseRank) - base.baseRank
    };
  });

  const largestRankIncreases = [...rankChanges]
    .filter(r => r.rankChange < 0)
    .sort((a, b) => a.rankChange - b.rankChange)
    .slice(0, 10);

  const largestRankDecreases = [...rankChanges]
    .filter(r => r.rankChange > 0)
    .sort((a, b) => b.rankChange - a.rankChange)
    .slice(0, 10);

  if (largestRankIncreases.length > 0) {
    console.log('=== Top 10 ZIPs: Largest Ranking Improvements (lower rank = better) ===\n');
    console.log('ZIP'.padEnd(8) + 'State'.padEnd(6) + 'County'.padEnd(30) + 'Base Rank'.padEnd(12) + 'Demand Rank'.padEnd(12) + 'Rank Change');
    console.log('-'.repeat(80));
    largestRankIncreases.forEach(r => {
      console.log(
        r.zipCode.padEnd(8) +
        r.stateCode.padEnd(6) +
        (r.countyName.substring(0, 28)).padEnd(30) +
        String(r.baseRank).padEnd(12) +
        String(r.demandRank).padEnd(12) +
        String(r.rankChange)
      );
    });
    console.log();
  }

  if (largestRankDecreases.length > 0) {
    console.log('=== Top 10 ZIPs: Largest Ranking Declines (lower rank = better) ===\n');
    console.log('ZIP'.padEnd(8) + 'State'.padEnd(6) + 'County'.padEnd(30) + 'Base Rank'.padEnd(12) + 'Demand Rank'.padEnd(12) + 'Rank Change');
    console.log('-'.repeat(80));
    largestRankDecreases.forEach(r => {
      console.log(
        r.zipCode.padEnd(8) +
        r.stateCode.padEnd(6) +
        (r.countyName.substring(0, 28)).padEnd(30) +
        String(r.baseRank).padEnd(12) +
        String(r.demandRank).padEnd(12) +
        `+${r.rankChange}`
      );
    });
    console.log();
  }

  console.log('='.repeat(80));
  console.log('Analysis Complete');
  console.log('='.repeat(80));
}

const args = process.argv.slice(2);
let year: number | undefined;
let state: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--year' && args[i + 1]) {
    year = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--state' && args[i + 1]) {
    state = args[i + 1];
    i++;
  }
}

compareScores(year, state).catch(console.error);
