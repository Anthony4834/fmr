#!/usr/bin/env bun

/**
 * Analyze the revised demand algorithm for investment scores
 * 
 * This script analyzes how the new demand multiplier logic affects scores:
 * - Green threshold (score >= 100): positive demand = small increase, negative = heavy penalty
 * - Red threshold (score < 100): positive demand = no change, negative = heavy penalty
 * 
 * Usage:
 *   bun scripts/analyze-revised-demand-algorithm.ts [--file investment-scores-revised.csv]
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';
import { configureDatabase } from '../lib/db';
import { readFileSync } from 'fs';

config();

if (process.env.POSTGRES_URL) {
  configureDatabase({ connectionString: process.env.POSTGRES_URL });
}

interface ScoreRecord {
  score: number;
  score_with_demand: number;
  demand_score: number | null;
  demand_multiplier: number | null;
  zip_code: string;
  state_code: string;
}

async function analyzeFromDatabase() {
  console.log(`\n=== Analyzing Revised Demand Algorithm ===\n`);

  const result = await sql`
    SELECT 
      zip_code,
      state_code,
      score,
      score_with_demand,
      demand_score,
      demand_multiplier
    FROM investment_score
    WHERE geo_type = 'zip'
      AND fmr_year = 2026
    ORDER BY score DESC
  `;

  if (result.rows.length === 0) {
    console.log('❌ No investment scores found in database.');
    return;
  }

  const records: ScoreRecord[] = result.rows.map((row: any) => ({
    zip_code: row.zip_code,
    state_code: row.state_code,
    score: Number(row.score),
    score_with_demand: Number(row.score_with_demand),
    demand_score: row.demand_score ? Number(row.demand_score) : null,
    demand_multiplier: row.demand_multiplier ? Number(row.demand_multiplier) : null,
  }));

  console.log(`Total records: ${records.length}\n`);

  // Categorize records
  const greenThreshold = records.filter(r => r.score >= 100);
  const redThreshold = records.filter(r => r.score < 100);

  console.log(`Score Threshold Distribution:`);
  console.log(`  - Green (score >= 100): ${greenThreshold.length} (${((greenThreshold.length / records.length) * 100).toFixed(1)}%)`);
  console.log(`  - Red (score < 100): ${redThreshold.length} (${((redThreshold.length / records.length) * 100).toFixed(1)}%)\n`);

  // Analyze green threshold
  console.log(`=== Green Threshold Analysis (score >= 100) ===\n`);
  
  const greenWithPositiveDemand = greenThreshold.filter(r => r.demand_score !== null && r.demand_score > 50);
  const greenWithNegativeDemand = greenThreshold.filter(r => r.demand_score !== null && r.demand_score <= 50);
  const greenNoDemandData = greenThreshold.filter(r => r.demand_score === null);

  console.log(`Demand distribution:`);
  console.log(`  - Positive demand (score > 50): ${greenWithPositiveDemand.length}`);
  console.log(`  - Negative demand (score <= 50): ${greenWithNegativeDemand.length}`);
  console.log(`  - No demand data: ${greenNoDemandData.length}\n`);

  if (greenWithPositiveDemand.length > 0) {
    const multipliers = greenWithPositiveDemand.map(r => r.demand_multiplier || 1.0);
    const avgMultiplier = multipliers.reduce((a, b) => a + b, 0) / multipliers.length;
    const minMultiplier = Math.min(...multipliers);
    const maxMultiplier = Math.max(...multipliers);
    
    const scoreChanges = greenWithPositiveDemand.map(r => r.score_with_demand - r.score);
    const avgChange = scoreChanges.reduce((a, b) => a + b, 0) / scoreChanges.length;
    const maxIncrease = Math.max(...scoreChanges);

    console.log(`Positive demand (should have marginal increase):`);
    console.log(`  - Multiplier range: ${minMultiplier.toFixed(3)} to ${maxMultiplier.toFixed(3)}`);
    console.log(`  - Average multiplier: ${avgMultiplier.toFixed(3)}`);
    console.log(`  - Average score increase: ${avgChange.toFixed(2)}`);
    console.log(`  - Max score increase: ${maxIncrease.toFixed(2)}\n`);
  }

  if (greenWithNegativeDemand.length > 0) {
    const multipliers = greenWithNegativeDemand.map(r => r.demand_multiplier || 1.0);
    const avgMultiplier = multipliers.reduce((a, b) => a + b, 0) / multipliers.length;
    const minMultiplier = Math.min(...multipliers);
    const maxMultiplier = Math.max(...multipliers);
    
    const scoreChanges = greenWithNegativeDemand.map(r => r.score_with_demand - r.score);
    const avgChange = scoreChanges.reduce((a, b) => a + b, 0) / scoreChanges.length;
    const maxPenalty = Math.min(...scoreChanges);

    console.log(`Negative demand (should have heavy penalty):`);
    console.log(`  - Multiplier range: ${minMultiplier.toFixed(3)} to ${maxMultiplier.toFixed(3)}`);
    console.log(`  - Average multiplier: ${avgMultiplier.toFixed(3)}`);
    console.log(`  - Average score penalty: ${avgChange.toFixed(2)}`);
    console.log(`  - Max score penalty: ${maxPenalty.toFixed(2)}\n`);
  }

  // Analyze red threshold
  console.log(`=== Red Threshold Analysis (score < 100) ===\n`);
  
  const redWithPositiveDemand = redThreshold.filter(r => r.demand_score !== null && r.demand_score > 50);
  const redWithNegativeDemand = redThreshold.filter(r => r.demand_score !== null && r.demand_score <= 50);
  const redNoDemandData = redThreshold.filter(r => r.demand_score === null);

  console.log(`Demand distribution:`);
  console.log(`  - Positive demand (score > 50): ${redWithPositiveDemand.length}`);
  console.log(`  - Negative demand (score <= 50): ${redWithNegativeDemand.length}`);
  console.log(`  - No demand data: ${redNoDemandData.length}\n`);

  if (redWithPositiveDemand.length > 0) {
    const multipliers = redWithPositiveDemand.map(r => r.demand_multiplier || 1.0);
    const avgMultiplier = multipliers.reduce((a, b) => a + b, 0) / multipliers.length;
    const allOne = multipliers.every(m => Math.abs(m - 1.0) < 0.001);

    const scoreChanges = redWithPositiveDemand.map(r => r.score_with_demand - r.score);
    const avgChange = scoreChanges.reduce((a, b) => a + b, 0) / scoreChanges.length;
    const maxChange = Math.max(...scoreChanges.map(Math.abs));

    console.log(`Positive demand (should have NO increase, multiplier = 1.0):`);
    console.log(`  - Multiplier range: ${Math.min(...multipliers).toFixed(3)} to ${Math.max(...multipliers).toFixed(3)}`);
    console.log(`  - Average multiplier: ${avgMultiplier.toFixed(3)}`);
    console.log(`  - All multipliers = 1.0: ${allOne ? '✅ YES' : '❌ NO'}`);
    console.log(`  - Average score change: ${avgChange.toFixed(2)}`);
    console.log(`  - Max absolute change: ${maxChange.toFixed(2)}\n`);
  }

  if (redWithNegativeDemand.length > 0) {
    const multipliers = redWithNegativeDemand.map(r => r.demand_multiplier || 1.0);
    const avgMultiplier = multipliers.reduce((a, b) => a + b, 0) / multipliers.length;
    const minMultiplier = Math.min(...multipliers);
    const maxMultiplier = Math.max(...multipliers);
    
    const scoreChanges = redWithNegativeDemand.map(r => r.score_with_demand - r.score);
    const avgChange = scoreChanges.reduce((a, b) => a + b, 0) / scoreChanges.length;
    const maxPenalty = Math.min(...scoreChanges);

    console.log(`Negative demand (should have heavy penalty):`);
    console.log(`  - Multiplier range: ${minMultiplier.toFixed(3)} to ${maxMultiplier.toFixed(3)}`);
    console.log(`  - Average multiplier: ${avgMultiplier.toFixed(3)}`);
    console.log(`  - Average score penalty: ${avgChange.toFixed(2)}`);
    console.log(`  - Max score penalty: ${maxPenalty.toFixed(2)}\n`);
  }

  // Overall statistics
  console.log(`=== Overall Impact ===\n`);
  
  const allMultipliers = records.map(r => r.demand_multiplier || 1.0);
  const multiplierDistribution: Record<string, number> = {};
  for (const m of allMultipliers) {
    const bucket = m < 0.75 ? '< 0.75' :
                   m < 0.85 ? '0.75-0.85' :
                   m < 0.95 ? '0.85-0.95' :
                   m < 1.0 ? '0.95-1.0' :
                   m === 1.0 ? '1.0' :
                   m <= 1.05 ? '1.0-1.05' : '> 1.05';
    multiplierDistribution[bucket] = (multiplierDistribution[bucket] || 0) + 1;
  }

  console.log(`Demand multiplier distribution:`);
  for (const [bucket, count] of Object.entries(multiplierDistribution).sort((a, b) => {
    const order: Record<string, number> = {
      '< 0.75': 0, '0.75-0.85': 1, '0.85-0.95': 2, '0.95-1.0': 3,
      '1.0': 4, '1.0-1.05': 5, '> 1.05': 6
    };
    return (order[a[0]] || 99) - (order[b[0]] || 99);
  })) {
    console.log(`  - ${bucket}: ${count} (${((count / records.length) * 100).toFixed(1)}%)`);
  }

  // Score changes
  const scoreChanges = records.map(r => r.score_with_demand - r.score);
  const increased = scoreChanges.filter(c => c > 0.1).length;
  const decreased = scoreChanges.filter(c => c < -0.1).length;
  const unchanged = scoreChanges.filter(c => Math.abs(c) <= 0.1).length;

  console.log(`\nScore changes (score_with_demand - score):`);
  console.log(`  - Increased: ${increased} (${((increased / records.length) * 100).toFixed(1)}%)`);
  console.log(`  - Decreased: ${decreased} (${((decreased / records.length) * 100).toFixed(1)}%)`);
  console.log(`  - Unchanged: ${unchanged} (${((unchanged / records.length) * 100).toFixed(1)}%)`);

  const avgChange = scoreChanges.reduce((a, b) => a + b, 0) / scoreChanges.length;
  console.log(`  - Average change: ${avgChange.toFixed(2)}`);

  // Examples
  console.log(`\n=== Examples ===\n`);
  
  // Green with positive demand
  const greenPositiveExample = greenWithPositiveDemand
    .sort((a, b) => b.demand_score! - a.demand_score!)
    .slice(0, 3);
  if (greenPositiveExample.length > 0) {
    console.log(`Green threshold with positive demand (marginal increase):`);
    for (const ex of greenPositiveExample) {
      console.log(`  ZIP ${ex.zip_code} (${ex.state_code}): score=${ex.score.toFixed(1)}, demand=${ex.demand_score!.toFixed(1)}, multiplier=${ex.demand_multiplier!.toFixed(3)}, score_with_demand=${ex.score_with_demand.toFixed(1)} (+${(ex.score_with_demand - ex.score).toFixed(1)})`);
    }
    console.log();
  }

  // Green with negative demand
  const greenNegativeExample = greenWithNegativeDemand
    .sort((a, b) => a.demand_score! - b.demand_score!)
    .slice(0, 3);
  if (greenNegativeExample.length > 0) {
    console.log(`Green threshold with negative demand (heavy penalty):`);
    for (const ex of greenNegativeExample) {
      console.log(`  ZIP ${ex.zip_code} (${ex.state_code}): score=${ex.score.toFixed(1)}, demand=${ex.demand_score!.toFixed(1)}, multiplier=${ex.demand_multiplier!.toFixed(3)}, score_with_demand=${ex.score_with_demand.toFixed(1)} (${(ex.score_with_demand - ex.score).toFixed(1)})`);
    }
    console.log();
  }

  // Red with positive demand
  const redPositiveExample = redWithPositiveDemand
    .sort((a, b) => b.demand_score! - a.demand_score!)
    .slice(0, 3);
  if (redPositiveExample.length > 0) {
    console.log(`Red threshold with positive demand (no change):`);
    for (const ex of redPositiveExample) {
      console.log(`  ZIP ${ex.zip_code} (${ex.state_code}): score=${ex.score.toFixed(1)}, demand=${ex.demand_score!.toFixed(1)}, multiplier=${ex.demand_multiplier!.toFixed(3)}, score_with_demand=${ex.score_with_demand.toFixed(1)} (${(ex.score_with_demand - ex.score).toFixed(1)})`);
    }
    console.log();
  }

  // Red with negative demand
  const redNegativeExample = redWithNegativeDemand
    .sort((a, b) => a.demand_score! - b.demand_score!)
    .slice(0, 3);
  if (redNegativeExample.length > 0) {
    console.log(`Red threshold with negative demand (heavy penalty):`);
    for (const ex of redNegativeExample) {
      console.log(`  ZIP ${ex.zip_code} (${ex.state_code}): score=${ex.score.toFixed(1)}, demand=${ex.demand_score!.toFixed(1)}, multiplier=${ex.demand_multiplier!.toFixed(3)}, score_with_demand=${ex.score_with_demand.toFixed(1)} (${(ex.score_with_demand - ex.score).toFixed(1)})`);
    }
    console.log();
  }

  console.log(`✅ Analysis complete!\n`);
}

// CLI
const args = process.argv.slice(2);
let useFile: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file' && args[i + 1]) {
    useFile = args[i + 1];
    i++;
  }
}

analyzeFromDatabase()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
