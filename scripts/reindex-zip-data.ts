#!/usr/bin/env bun

/**
 * Reindex ZIP-level data: tax rates, property values (ZHVI), and investment scores
 *
 * This script orchestrates the reindexing of:
 * 1. Tax rates (ACS 5-year data)
 * 2. Property values (Zillow ZHVI monthly data)
 * 3. Investment scores (computed from FMR, property values, and tax rates)
 *
 * Usage:
 *   bun scripts/reindex-zip-data.ts
 *   bun scripts/reindex-zip-data.ts --year 2026
 *   bun scripts/reindex-zip-data.ts --year 2026 --state CA
 *   bun scripts/reindex-zip-data.ts --skip-tax-rates
 *   bun scripts/reindex-zip-data.ts --skip-property-values
 *   bun scripts/reindex-zip-data.ts --skip-investment-scores
 *   bun scripts/reindex-zip-data.ts --acs-vintage 2023
 *   bun scripts/reindex-zip-data.ts --bedrooms 1,2,3,4,5
 */

import { config } from 'dotenv';
import { createSchema } from '../lib/schema';
import { configureDatabase } from '../lib/db';
import { getLatestFMRYear } from '../lib/queries';

config();

interface ReindexOptions {
  year?: number;
  stateFilter?: string | null;
  skipTaxRates?: boolean;
  skipPropertyValues?: boolean;
  skipInvestmentScores?: boolean;
  acsVintage?: number | null;
  bedrooms?: number[];
  zhviUrlBase?: string;
}

async function reindexTaxRates(vintage: number | null) {
  console.log('\n=== Step 1: Reindexing Tax Rates ===\n');

  const cmd = ['bun', 'scripts/ingest-acs-tax.ts'];
  if (vintage) {
    cmd.push('--vintage', vintage.toString());
  }

  const proc = Bun.spawn(cmd, {
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const exitCode = await proc.exited;
  
  if (exitCode !== 0) {
    throw new Error(`Tax rates reindexing failed with exit code ${exitCode}`);
  }
  
  console.log('✅ Tax rates reindexed\n');
}

async function reindexPropertyValues(
  bedrooms: number[],
  zhviUrlBase: string
) {
  console.log('\n=== Step 2: Reindexing Property Values (ZHVI) ===\n');

  const cmd = [
    'bun',
    'scripts/index-zip-latest.ts',
    '--bedrooms',
    bedrooms.join(','),
  ];
  if (zhviUrlBase) {
    cmd.push('--zhviUrlBase', zhviUrlBase);
  }

  const proc = Bun.spawn(cmd, {
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const exitCode = await proc.exited;
  
  if (exitCode !== 0) {
    throw new Error(`Property values reindexing failed with exit code ${exitCode}`);
  }
  
  console.log('✅ Property values (ZHVI) reindexed\n');
}

async function reindexInvestmentScores(
  fmrYear: number,
  stateFilter: string | null
) {
  console.log('\n=== Step 3: Reindexing Investment Scores ===\n');

  const cmd = [
    'bun',
    'scripts/compute-investment-scores.ts',
    '--year',
    fmrYear.toString(),
  ];
  if (stateFilter) {
    cmd.push('--state', stateFilter);
  }

  const proc = Bun.spawn(cmd, {
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const exitCode = await proc.exited;
  
  if (exitCode !== 0) {
    throw new Error(`Investment scores reindexing failed with exit code ${exitCode}`);
  }
  
  console.log('✅ Investment scores reindexed\n');
}

function parseArgs(argv: string[]): ReindexOptions {
  const args = argv.slice(2);
  const options: ReindexOptions = {
    skipTaxRates: false,
    skipPropertyValues: false,
    skipInvestmentScores: false,
    bedrooms: [1, 2, 3, 4, 5],
    zhviUrlBase: 'https://files.zillowstatic.com/research/public_csvs/zhvi',
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    
    if (a === '--year' && args[i + 1]) {
      const n = parseInt(args[i + 1], 10);
      if (Number.isFinite(n) && n >= 2020 && n <= 2030) {
        options.year = n;
      }
      i++;
      continue;
    }
    
    if (a === '--state' && args[i + 1]) {
      options.stateFilter = args[i + 1].trim().toUpperCase();
      i++;
      continue;
    }
    
    if (a === '--skip-tax-rates') {
      options.skipTaxRates = true;
      continue;
    }
    
    if (a === '--skip-property-values') {
      options.skipPropertyValues = true;
      continue;
    }
    
    if (a === '--skip-investment-scores') {
      options.skipInvestmentScores = true;
      continue;
    }
    
    if (a === '--acs-vintage' && args[i + 1]) {
      const n = parseInt(args[i + 1], 10);
      if (Number.isFinite(n) && n >= 2009 && n <= 2100) {
        options.acsVintage = n;
      }
      i++;
      continue;
    }
    
    if (a === '--bedrooms' && args[i + 1]) {
      const bedrooms = args[i + 1]
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
      if (bedrooms.length > 0) {
        options.bedrooms = bedrooms;
      }
      i++;
      continue;
    }
    
    if (a === '--zhvi-url-base' && args[i + 1]) {
      options.zhviUrlBase = args[i + 1].trim().replace(/\/+$/, '');
      i++;
      continue;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv);
  
  // Ensure database schema exists
  if (process.env.POSTGRES_URL) {
    configureDatabase({ connectionString: process.env.POSTGRES_URL });
  }
  await createSchema();

  const fmrYear = options.year || (await getLatestFMRYear());
  
  console.log('\n' + '='.repeat(80));
  console.log('ZIP Data Reindexing');
  console.log('='.repeat(80));
  console.log(`FMR Year: ${fmrYear}`);
  if (options.stateFilter) {
    console.log(`State Filter: ${options.stateFilter}`);
  }
  console.log(`Bedrooms: ${options.bedrooms?.join(', ')}`);
  if (options.acsVintage) {
    console.log(`ACS Vintage: ${options.acsVintage}`);
  }
  console.log('='.repeat(80));

  const startTime = Date.now();

  try {
    // Step 1: Reindex tax rates
    if (!options.skipTaxRates) {
      await reindexTaxRates(options.acsVintage || null);
    } else {
      console.log('\n⏭️  Skipping tax rates reindexing\n');
    }

    // Step 2: Reindex property values
    if (!options.skipPropertyValues) {
      await reindexPropertyValues(
        options.bedrooms || [1, 2, 3, 4, 5],
        options.zhviUrlBase || 'https://files.zillowstatic.com/research/public_csvs/zhvi'
      );
    } else {
      console.log('\n⏭️  Skipping property values reindexing\n');
    }

    // Step 3: Reindex investment scores
    if (!options.skipInvestmentScores) {
      await reindexInvestmentScores(fmrYear, options.stateFilter || null);
    } else {
      console.log('\n⏭️  Skipping investment scores reindexing\n');
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '='.repeat(80));
    console.log(`✅ ZIP data reindexing complete in ${duration}s`);
    console.log('='.repeat(80) + '\n');
  } catch (error) {
    console.error('\n❌ Reindexing failed:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
    }
    process.exit(1);
  }
}

if (import.meta.main) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('❌ Fatal error:', e);
      process.exit(1);
    });
}



