#!/usr/bin/env bun

/**
 * Count how many counties cross the color thresholds (95 and 130)
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '@/lib/queries';

config();

async function countThresholdCrossings() {
  console.log(`\n=== Counting Color Threshold Crossings ===\n`);

  const year = await getLatestFMRYear();

  // Get county medians
  const counties = await sql`
    WITH county_scores AS (
      SELECT 
        county_fips,
        state_code,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median_base,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(score_with_demand, score)) as median_demand,
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
      COALESCE(cn.county_name, 'Unknown') as county_name,
      cs.state_code,
      cs.median_base,
      cs.median_demand,
      cs.zip_count
    FROM county_scores cs
    LEFT JOIN county_names cn ON cs.county_fips = cn.county_fips AND cs.state_code = cn.state_code
    ORDER BY cs.county_fips, cs.state_code, cs.zip_count DESC
  `;

  const THRESHOLD_95 = 95;
  const THRESHOLD_130 = 130;

  let crossed95 = 0; // Crossed 95 threshold (red <-> green boundary)
  let crossed130 = 0; // Crossed 130 threshold (light green <-> dark green boundary)
  let crossedBoth = 0;
  let noThresholdCross = 0;

  const crossings: Array<{
    county: string;
    state: string;
    base: number;
    demand: number;
    crossing: string;
  }> = [];

  for (const row of counties.rows) {
    const base = Number(row.median_base);
    const demand = Number(row.median_demand);

    const baseBelow95 = base < THRESHOLD_95;
    const baseBelow130 = base < THRESHOLD_130;
    const demandBelow95 = demand < THRESHOLD_95;
    const demandBelow130 = demand < THRESHOLD_130;

    const crossed95Threshold = baseBelow95 !== demandBelow95;
    const crossed130Threshold = (base < THRESHOLD_130 && demand >= THRESHOLD_130) || 
                                (base >= THRESHOLD_130 && demand < THRESHOLD_130);

    if (crossed95Threshold && crossed130Threshold) {
      crossedBoth++;
      crossings.push({
        county: row.county_name || '',
        state: row.state_code || '',
        base,
        demand,
        crossing: 'Both 95 and 130'
      });
    } else if (crossed95Threshold) {
      crossed95++;
      crossings.push({
        county: row.county_name || '',
        state: row.state_code || '',
        base,
        demand,
        crossing: '95 threshold'
      });
    } else if (crossed130Threshold) {
      crossed130++;
      crossings.push({
        county: row.county_name || '',
        state: row.state_code || '',
        base,
        demand,
        crossing: '130 threshold'
      });
    } else {
      noThresholdCross++;
    }
  }

  console.log(`Total counties: ${counties.rows.length}\n`);
  console.log(`Threshold Crossings:`);
  console.log(`  - Crossed 95 threshold (red <-> green): ${crossed95} (${(crossed95 / counties.rows.length * 100).toFixed(1)}%)`);
  console.log(`  - Crossed 130 threshold (light <-> dark green): ${crossed130} (${(crossed130 / counties.rows.length * 100).toFixed(1)}%)`);
  console.log(`  - Crossed both: ${crossedBoth} (${(crossedBoth / counties.rows.length * 100).toFixed(1)}%)`);
  console.log(`  - No threshold cross: ${noThresholdCross} (${(noThresholdCross / counties.rows.length * 100).toFixed(1)}%)\n`);

  console.log(`Total counties that should show different colors: ${crossed95 + crossed130} (${((crossed95 + crossed130) / counties.rows.length * 100).toFixed(1)}%)\n`);

  console.log(`Sample counties crossing 95 threshold (should be most visible):`);
  crossings
    .filter(c => c.crossing === '95 threshold')
    .slice(0, 20)
    .forEach(c => {
      const direction = c.demand < THRESHOLD_95 ? '→ Red' : '→ Green';
      console.log(`  ${c.county}, ${c.state}: ${c.base.toFixed(1)} → ${c.demand.toFixed(1)} ${direction}`);
    });

  console.log(`\nSample counties crossing 130 threshold:`);
  crossings
    .filter(c => c.crossing === '130 threshold')
    .slice(0, 20)
    .forEach(c => {
      const direction = c.demand >= THRESHOLD_130 ? '→ Dark Green' : '→ Light Green';
      console.log(`  ${c.county}, ${c.state}: ${c.base.toFixed(1)} → ${c.demand.toFixed(1)} ${direction}`);
    });

  console.log(`\n✅ Analysis complete!\n`);
}

countThresholdCrossings()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
