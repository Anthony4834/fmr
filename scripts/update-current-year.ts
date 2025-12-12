#!/usr/bin/env bun

/**
 * Current Year Update Script
 * 
 * Reusable script to update FMR and SAFMR data for the current year.
 * This script clears old data and ingests the latest year's data.
 * Designed to be run annually (typically in October when new FMR data is released).
 * 
 * Usage:
 *   bun run update:current-year
 *   bun run update:current-year -- --year 2024
 */

import { config } from 'dotenv';
import { ingestFMRData } from './ingest-fmr';
import { ingestSAFMRData } from './ingest-safmr';
import { populateRequiredSAFMRZips } from './populate-required-safmr-zips';
import { computeAndStoreDashboardInsights } from './compute-dashboard-insights';
import { getCurrentFMRYear } from '../lib/ingestion-utils';

config();

/**
 * Updates FMR and SAFMR data for the current year
 */
export async function updateCurrentYearData(year?: number): Promise<void> {
  const targetYear = year || getCurrentFMRYear();
  const effectiveDate = new Date(targetYear, 9, 1); // October 1st

  console.log(`\n=== Updating FMR/SAFMR Data for Year ${targetYear} ===\n`);

  try {
    // Update FMR data (replace existing)
    console.log('Step 1: Updating FMR data...');
    await ingestFMRData({
      year: targetYear,
      effectiveDate,
      replaceExisting: true
    });

    // Update SAFMR data (replace existing)
    console.log('\nStep 2: Updating SAFMR data...');
    await ingestSAFMRData({
      year: targetYear,
      effectiveDate,
      replaceExisting: true
    });

    // Repopulate required SAFMR ZIPs lookup table
    console.log('\nStep 3: Repopulating required SAFMR ZIPs lookup table...');
    await populateRequiredSAFMRZips(targetYear);

    // Precompute dashboard insights (top/bottom/anomalies) so the home dashboard is instant
    console.log('\nStep 4: Computing and caching dashboard insights...');
    await computeAndStoreDashboardInsights(targetYear, ['zip', 'city', 'county']);

    console.log(`\n✅ Successfully updated all data for year ${targetYear}`);
    console.log('\n📝 Next steps:');
    console.log('   - Run "bun run create-test-views" to regenerate test coverage views');
    console.log('   - Verify data counts and test sample queries');
    console.log('   - See YEARLY_UPDATE_GUIDE.md for complete update checklist');
  } catch (error) {
    console.error(`\n❌ Error updating data for year ${targetYear}:`, error);
    throw error;
  }
}

// CLI execution
if (import.meta.main) {
  const args = process.argv.slice(2);
  let year: number | undefined;

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--year' && args[i + 1]) {
      year = parseInt(args[i + 1]);
      i++;
    }
  }

  updateCurrentYearData(year)
    .then(() => {
      console.log('\nUpdate complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\nUpdate failed:', error);
      process.exit(1);
    });
}

