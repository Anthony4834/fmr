#!/usr/bin/env bun

/**
 * Index all property data - runs the same sequence as the cron job
 *
 * This script runs:
 * 1. ZHVI ingestion (property values for all bedroom counts)
 * 2. ACS tax rate ingestion
 * 3. Zillow rentals ingestion (ZORI + ZORDI)
 * 4. Investment score computation
 *
 * Usage:
 *   bun scripts/index-property-data.ts
 *   bun scripts/index-property-data.ts --skip-zhvi
 *   bun scripts/index-property-data.ts --skip-acs
 *   bun scripts/index-property-data.ts --skip-rentals
 *   bun scripts/index-property-data.ts --only-scores
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';
import { spawn } from 'child_process';

config();

interface StepResult {
  success: boolean;
  duration: number;
  output?: string;
  error?: string;
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  return {
    skipZhvi: args.includes('--skip-zhvi'),
    skipAcs: args.includes('--skip-acs'),
    skipRentals: args.includes('--skip-rentals'),
    onlyScores: args.includes('--only-scores'),
    historyMonths: args.includes('--history') ? 12 : 0,
  };
}

async function runScript(scriptPath: string, args: string[] = []): Promise<StepResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const proc = spawn('bun', [scriptPath, ...args], {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    proc.stderr?.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });

    proc.on('close', (code) => {
      const duration = Date.now() - startTime;
      if (code === 0) {
        resolve({ success: true, duration, output: stdout });
      } else {
        resolve({ success: false, duration, output: stdout, error: stderr || `Exit code: ${code}` });
      }
    });

    proc.on('error', (err) => {
      const duration = Date.now() - startTime;
      resolve({ success: false, duration, error: err.message });
    });
  });
}

async function getLatestFMRYear(): Promise<number> {
  const result = await sql`SELECT MAX(year) as year FROM fmr_data`;
  return result.rows[0]?.year || new Date().getFullYear();
}

async function main() {
  const opts = parseArgs(process.argv);
  const results: Record<string, StepResult> = {};

  console.log('========================================');
  console.log('  Property Data Indexing Pipeline');
  console.log('========================================\n');

  const totalStart = Date.now();

  // Step 1: ZHVI (property values)
  if (!opts.skipZhvi && !opts.onlyScores) {
    console.log('\n--- Step 1/4: Indexing ZHVI (property values) ---\n');
    for (let bedroom = 1; bedroom <= 5; bedroom++) {
      console.log(`\nIngesting ZHVI for ${bedroom}BR...`);
      const args = ['--bedrooms', String(bedroom)];
      if (opts.historyMonths > 0) {
        args.push('--historyMonths', String(opts.historyMonths));
      }
      const result = await runScript('scripts/ingest-zhvi.ts', args);
      results[`zhvi_${bedroom}br`] = result;
      if (!result.success) {
        console.error(`Failed to ingest ZHVI for ${bedroom}BR`);
      }
    }
  } else {
    console.log('\n--- Step 1/4: Skipping ZHVI ---\n');
  }

  // Step 2: ACS tax rates
  if (!opts.skipAcs && !opts.onlyScores) {
    console.log('\n--- Step 2/4: Indexing ACS tax rates ---\n');
    const result = await runScript('scripts/ingest-acs-tax.ts');
    results['acs_tax'] = result;
    if (!result.success) {
      console.error('Failed to ingest ACS tax data');
    }
  } else {
    console.log('\n--- Step 2/4: Skipping ACS tax ---\n');
  }

  // Step 3: Zillow rentals (ZORI + ZORDI)
  if (!opts.skipRentals && !opts.onlyScores) {
    console.log('\n--- Step 3/4: Indexing Zillow rentals (ZORI + ZORDI) ---\n');

    // ZORI (ZIP-level rent index)
    console.log('\nIngesting ZORI...');
    const zoriArgs = opts.historyMonths > 0 ? ['--historyMonths', String(opts.historyMonths)] : [];
    const zoriResult = await runScript('scripts/ingest-zori.ts', zoriArgs);
    results['zori'] = zoriResult;

    // ZORDI (Metro-level demand index)
    console.log('\nIngesting ZORDI...');
    const zordiArgs = opts.historyMonths > 0 ? ['--historyMonths', String(opts.historyMonths)] : [];
    const zordiResult = await runScript('scripts/ingest-zordi.ts', zordiArgs);
    results['zordi'] = zordiResult;

    // CBSA mapping
    console.log('\nUpdating CBSA mapping...');
    const cbsaResult = await runScript('scripts/ingest-cbsa-mapping.ts');
    results['cbsa_mapping'] = cbsaResult;
  } else {
    console.log('\n--- Step 3/4: Skipping Zillow rentals ---\n');
  }

  // Step 4: Compute investment scores
  console.log('\n--- Step 4/4: Computing investment scores ---\n');
  const year = await getLatestFMRYear();
  const scoreResult = await runScript('scripts/compute-investment-scores.ts', ['--year', String(year)]);
  results['investment_scores'] = scoreResult;

  // Summary
  const totalDuration = Date.now() - totalStart;
  console.log('\n========================================');
  console.log('  Pipeline Complete');
  console.log('========================================\n');

  console.log('Results:');
  for (const [step, result] of Object.entries(results)) {
    const status = result.success ? '✓' : '✗';
    const duration = (result.duration / 1000).toFixed(1);
    console.log(`  ${status} ${step}: ${duration}s`);
  }

  console.log(`\nTotal time: ${(totalDuration / 1000).toFixed(1)}s`);

  const failures = Object.entries(results).filter(([, r]) => !r.success);
  if (failures.length > 0) {
    console.log(`\n⚠️  ${failures.length} step(s) failed:`);
    for (const [step, result] of failures) {
      console.log(`  - ${step}: ${result.error}`);
    }
    process.exit(1);
  }

  console.log('\n✓ All steps completed successfully');
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
