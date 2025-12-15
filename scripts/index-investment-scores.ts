#!/usr/bin/env bun

/**
 * Run the full investment score indexing sequence exactly as the cron job does.
 * 
 * This script replicates the exact sequence from app/api/cron/property-data/route.ts:
 * 1. Index ZHVI data (all bedrooms 1-5)
 * 2. Index ACS tax data
 * 3. Index Zillow rentals data (ZORI + ZORDI)
 * 4. Compute investment scores
 * 
 * Usage:
 *   bun scripts/index-investment-scores.ts [--year 2026] [--port 3000]
 * 
 * When adding new steps to the investment score process, update this script
 * to match the cron job sequence.
 */

import { config } from 'dotenv';
import { configureDatabase, query } from '../lib/db';
import { getLatestFMRYear } from '../lib/queries';
import { exec } from 'child_process';
import { promisify } from 'util';

config();

const execAsync = promisify(exec);

interface IndexResult {
  success: boolean;
  data?: any;
  error?: string;
  output?: string;
  warnings?: string;
}

async function indexZHVI(baseUrl: string, secret: string): Promise<IndexResult[]> {
  const results: Array<IndexResult> = [];

  console.log('\n📊 Step 1: Indexing ZHVI data (all bedrooms 1-5)...\n');

  // Index all bedroom counts (1-5) sequentially
  for (let bedroom = 1; bedroom <= 5; bedroom++) {
    try {
      const url = `${baseUrl}/api/cron/zhvi?bedroom=${bedroom}${secret ? `&secret=${encodeURIComponent(secret)}` : ''}`;
      console.log(`  Bedroom ${bedroom}/5: ${url}`);
      
      const res = await fetch(url, {
        headers: {
          'x-vercel-cron': '1',
        },
      });
      const json = await res.json();
      
      const result: IndexResult = {
        success: res.ok,
        data: res.ok ? json : undefined,
        error: res.ok ? undefined : json.error || 'Unknown error'
      };
      
      results.push(result);
      
      if (res.ok) {
        console.log(`  ✅ Bedroom ${bedroom} indexed successfully`);
      } else {
        console.log(`  ❌ Bedroom ${bedroom} failed: ${result.error}`);
      }
    } catch (e: any) {
      const result: IndexResult = { success: false, error: e.message };
      results.push(result);
      console.log(`  ❌ Bedroom ${bedroom} error: ${e.message}`);
    }
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`\n✅ ZHVI indexing complete: ${successCount}/5 bedrooms succeeded\n`);

  return results;
}

async function indexACSTax(baseUrl: string, secret: string): Promise<IndexResult> {
  console.log('📊 Step 2: Indexing ACS tax data...\n');

  try {
    const url = `${baseUrl}/api/cron/acs-tax${secret ? `?secret=${encodeURIComponent(secret)}` : ''}`;
    console.log(`  URL: ${url}`);

    const res = await fetch(url, {
      headers: {
        'x-vercel-cron': '1',
      },
    });
    const json = await res.json();
    
    const result: IndexResult = {
      success: res.ok,
      data: res.ok ? json : undefined,
      error: res.ok ? undefined : json.error || 'Unknown error'
    };

    if (res.ok) {
      console.log('  ✅ ACS tax indexing complete\n');
    } else {
      console.log(`  ❌ ACS tax indexing failed: ${result.error}\n`);
    }

    return result;
  } catch (e: any) {
    const result: IndexResult = { success: false, error: e.message };
    console.log(`  ❌ ACS tax indexing error: ${e.message}\n`);
    return result;
  }
}

async function indexZillowRentals(baseUrl: string, secret: string): Promise<IndexResult> {
  console.log('📊 Step 3: Indexing Zillow rentals data (ZORI + ZORDI)...\n');

  try {
    const url = `${baseUrl}/api/cron/zillow-rentals${secret ? `?secret=${encodeURIComponent(secret)}` : ''}`;
    console.log(`  URL: ${url}`);

    const res = await fetch(url, {
      headers: {
        'x-vercel-cron': '1',
      },
    });
    const json = await res.json();
    
    const result: IndexResult = {
      success: res.ok,
      data: res.ok ? json : undefined,
      error: res.ok ? undefined : json.error || 'Unknown error'
    };

    if (res.ok) {
      console.log('  ✅ Zillow rentals indexing complete\n');
    } else {
      console.log(`  ❌ Zillow rentals indexing failed: ${result.error}\n`);
    }

    return result;
  } catch (e: any) {
    const result: IndexResult = { success: false, error: e.message };
    console.log(`  ❌ Zillow rentals indexing error: ${e.message}\n`);
    return result;
  }
}

async function computeInvestmentScores(year: number): Promise<IndexResult> {
  console.log(`📊 Step 4: Computing investment scores for year ${year}...\n`);

  try {
    // Get the latest ZHVI month and ACS vintage to pass to the script
    const latestZhvi = await query(`
      SELECT MAX(month) as latest_month
      FROM zhvi_zip_bedroom_monthly
      WHERE zhvi IS NOT NULL
    `);
    const latestMonth = latestZhvi[0]?.latest_month 
      ? new Date(latestZhvi[0].latest_month).toISOString().split('T')[0]
      : null;

    const latestAcs = await query(`
      SELECT MAX(acs_vintage) as latest_vintage
      FROM acs_tax_zcta_latest
    `);
    const acsVintage = latestAcs[0]?.latest_vintage 
      ? Number(latestAcs[0].latest_vintage) 
      : null;

    // Build command arguments
    const args = [`--year`, String(year)];
    if (latestMonth) {
      args.push(`--zhvi-month`, latestMonth);
    }
    if (acsVintage) {
      args.push(`--acs-vintage`, String(acsVintage));
    }

    const command = `bun scripts/compute-investment-scores.ts ${args.join(' ')}`;
    console.log(`  Command: ${command}`);
    if (latestMonth) console.log(`  Using ZHVI month: ${latestMonth}`);
    if (acsVintage) console.log(`  Using ACS vintage: ${acsVintage}`);
    console.log();

    const { stdout, stderr } = await execAsync(command, {
      env: { ...process.env, POSTGRES_URL: process.env.POSTGRES_URL },
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    const result: IndexResult = {
      success: true,
      year,
      zhviMonth: latestMonth,
      acsVintage,
      output: stdout,
      warnings: stderr
    };

    console.log('  ✅ Investment score computation complete\n');
    if (stderr) {
      console.log('  ⚠️  Warnings:', stderr);
    }

    return result;
  } catch (e: any) {
    const result: IndexResult = {
      success: false,
      error: e.message,
      stderr: e.stderr,
      output: e.stdout
    };
    console.log(`  ❌ Investment score computation error: ${e.message}\n`);
    if (e.stderr) {
      console.log('  Error output:', e.stderr);
    }
    return result;
  }
}

async function main() {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  // Parse arguments
  const args = process.argv.slice(2);
  let year: number | undefined;
  let port = 3000;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--year' && args[i + 1]) {
      year = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    }
  }

  // Get year if not specified
  if (!year || Number.isNaN(year)) {
    year = await getLatestFMRYear();
    console.log(`No --year specified, using latest available year: ${year}\n`);
  }

  // Determine base URL
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : `http://localhost:${port}`;

  const secret = process.env.CRON_SECRET || '';

  console.log('='.repeat(60));
  console.log('Investment Score Indexing Sequence');
  console.log('='.repeat(60));
  console.log(`Year: ${year}`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  const results: any = {
    zhvi: null,
    acsTax: null,
    zillowRentals: null,
    investmentScores: null,
  };

  // Step 1: Index ZHVI (property values) for all bedrooms
  try {
    results.zhvi = await indexZHVI(baseUrl, secret);
  } catch (e: any) {
    console.error('ZHVI indexing error:', e);
    results.zhvi = { error: e.message };
  }

  // Step 2: Index ACS tax rates
  try {
    results.acsTax = await indexACSTax(baseUrl, secret);
  } catch (e: any) {
    console.error('ACS tax indexing error:', e);
    results.acsTax = { error: e.message };
  }

  // Step 3: Index Zillow rentals data (ZORI + ZORDI for demand scoring)
  try {
    results.zillowRentals = await indexZillowRentals(baseUrl, secret);
  } catch (e: any) {
    console.error('Zillow rentals indexing error:', e);
    results.zillowRentals = { error: e.message };
  }

  // Step 4: Compute investment scores (depends on ZHVI, tax, and rentals data)
  try {
    results.investmentScores = await computeInvestmentScores(year);
  } catch (e: any) {
    console.error('Investment score computation error:', e);
    results.investmentScores = { error: e.message };
  }

  // Summary
  console.log('='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`ZHVI: ${results.zhvi?.filter((r: IndexResult) => r.success).length || 0}/5 bedrooms succeeded`);
  console.log(`ACS Tax: ${results.acsTax?.success ? '✅' : '❌'}`);
  console.log(`Zillow Rentals: ${results.zillowRentals?.success ? '✅' : '❌'}`);
  console.log(`Investment Scores: ${results.investmentScores?.success ? '✅' : '❌'}`);
  console.log('='.repeat(60));

  // Exit with error code if any step failed
  const allSuccess = 
    results.zhvi?.some((r: IndexResult) => r.success) &&
    results.acsTax?.success &&
    results.zillowRentals?.success &&
    results.investmentScores?.success;

  if (!allSuccess) {
    console.error('\n❌ Some steps failed. Check the output above for details.');
    process.exit(1);
  } else {
    console.log('\n✅ All steps completed successfully!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
