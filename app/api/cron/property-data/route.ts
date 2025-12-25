import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const maxDuration = 300; // 5 minutes (Vercel hobby plan limit)

function isAuthorized(req: NextRequest) {
  const vercelCron = req.headers.get('x-vercel-cron');
  if (vercelCron === '1') return true;

  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim() === secret;
  }

  const q = req.nextUrl.searchParams.get('secret');
  return q === secret;
}

// Call existing ZHVI endpoint for each bedroom
// Note: In Vercel, we can call our own endpoints via HTTP
async function indexZHVI() {
  // Use VERCEL_URL if available, otherwise construct from request
  // For internal calls, we can use the same domain
  const baseUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'http://localhost:3000';
  
  const results: Array<{ bedroom: number; success: boolean; data?: any; error?: string }> = [];
  const secret = process.env.CRON_SECRET || '';

  // Index all bedroom counts (1-5) sequentially
  for (let bedroom = 1; bedroom <= 5; bedroom++) {
    try {
      // Call the existing endpoint with proper auth
      const url = `${baseUrl}/api/cron/zhvi?bedroom=${bedroom}${secret ? `&secret=${encodeURIComponent(secret)}` : ''}`;
      const res = await fetch(url, {
        headers: {
          'x-vercel-cron': '1',
        },
      });
      const json = await res.json();
      results.push({ 
        bedroom, 
        success: res.ok, 
        data: res.ok ? json : undefined,
        error: res.ok ? undefined : json.error || 'Unknown error'
      });
    } catch (e: any) {
      results.push({ bedroom, success: false, error: e.message });
    }
  }

  return results;
}

// Call existing ACS tax endpoint
async function indexACSTax() {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  const secret = process.env.CRON_SECRET || '';

  try {
    const url = `${baseUrl}/api/cron/acs-tax${secret ? `?secret=${encodeURIComponent(secret)}` : ''}`;
    const res = await fetch(url, {
      headers: {
        'x-vercel-cron': '1',
      },
    });
    const json = await res.json();
    return { success: res.ok, ...json };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// Call Zillow rentals endpoint (ZORI + ZORDI)
async function indexZillowRentals() {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  const secret = process.env.CRON_SECRET || '';

  try {
    const url = `${baseUrl}/api/cron/zillow-rentals${secret ? `?secret=${encodeURIComponent(secret)}` : ''}`;
    const res = await fetch(url, {
      headers: {
        'x-vercel-cron': '1',
      },
    });
    const json = await res.json();
    return { success: res.ok, ...json };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// Fetch and cache mortgage rate from API Ninjas
async function indexMortgageRate() {
  try {
    // Ensure table exists
    await sql`
      CREATE TABLE IF NOT EXISTS mortgage_rates (
        id SERIAL PRIMARY KEY,
        rate_type VARCHAR(50) NOT NULL DEFAULT '30_year_fixed',
        rate_annual_pct NUMERIC(10, 6) NOT NULL,
        source VARCHAR(100) NOT NULL DEFAULT 'API Ninjas',
        fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    // Fetch from API Ninjas
    const key = process.env.API_NINJAS_KEY || process.env.API_NINJAS_API_KEY;
    if (!key) {
      throw new Error('Missing API_NINJAS_KEY');
    }

    const url = 'https://api.api-ninjas.com/v1/mortgagerate';
    const res = await fetch(url, {
      headers: { 'X-Api-Key': key, 'Accept': 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`API Ninjas returned ${res.status}`);
    }

    const json = await res.json();

    // Parse the 30-year fixed rate
    let rate: number | null = null;
    if (Array.isArray(json) && json.length > 0) {
      const row = json[0];
      const r = row?.data?.frm_30 ?? row?.data?.FRM_30 ?? row?.frm_30 ?? row?.FRM_30;
      const n = typeof r === 'number' ? r : Number(String(r ?? '').replace(/[^0-9.\-]/g, ''));
      if (Number.isFinite(n)) rate = n;
    }

    if (rate === null) {
      throw new Error('Failed to parse mortgage rate from API Ninjas');
    }

    // Insert into database
    await sql`
      INSERT INTO mortgage_rates (rate_type, rate_annual_pct, source, fetched_at, created_at)
      VALUES ('30_year_fixed', ${rate}, 'API Ninjas', NOW(), NOW())
    `;

    return { success: true, rate_annual_pct: rate, rate_type: '30_year_fixed' };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// Compute investment scores by calling the script via exec
async function computeInvestmentScores(year: number) {
  try {
    // Get the latest ZHVI month and ACS vintage to pass to the script
    const latestZhvi = await sql`
      SELECT MAX(month) as latest_month
      FROM zhvi_zip_bedroom_monthly
      WHERE zhvi IS NOT NULL
    `;
    const latestMonth = latestZhvi.rows[0]?.latest_month
      ? new Date(latestZhvi.rows[0].latest_month).toISOString().split('T')[0]
      : null;

    const latestAcs = await sql`
      SELECT MAX(acs_vintage) as latest_vintage
      FROM acs_tax_zcta_latest
    `;
    const acsVintage = latestAcs.rows[0]?.latest_vintage
      ? Number(latestAcs.rows[0].latest_vintage)
      : null;

    // Build command arguments
    const args = [`--year`, String(year)];
    if (latestMonth) {
      args.push(`--zhvi-month`, latestMonth);
    }
    if (acsVintage) {
      args.push(`--acs-vintage`, String(acsVintage));
    }

    // Use dynamic import for child_process (Node.js built-in)
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const command = `bun scripts/compute-investment-scores.ts ${args.join(' ')}`;
    const { stdout, stderr } = await execAsync(command, {
      env: { ...process.env, POSTGRES_URL: process.env.POSTGRES_URL },
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    return {
      success: true,
      year,
      zhviMonth: latestMonth,
      acsVintage,
      output: stdout,
      warnings: stderr
    };
  } catch (e: any) {
    return { success: false, error: e.message, stderr: e.stderr, stdout: e.stdout };
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if today is the 18th of the month (for property data indexing)
    const today = new Date();
    const dayOfMonth = today.getUTCDate();
    const isIndexingDay = dayOfMonth === 18;

    const results: any = {
      mortgageRate: null,
      zhvi: null,
      acsTax: null,
      zillowRentals: null,
      cbsaMapping: null,
      investmentScores: null,
      skippedPropertyData: !isIndexingDay,
    };

    // Always index mortgage rate (runs daily)
    try {
      console.log('[daily cron] Indexing mortgage rate...');
      results.mortgageRate = await indexMortgageRate();
      console.log('[daily cron] Mortgage rate indexed');
    } catch (e: any) {
      console.error('[daily cron] Mortgage rate error:', e);
      results.mortgageRate = { error: e.message };
    }

    // Only run property data indexing on the 18th of each month
    if (isIndexingDay) {
      console.log('[daily cron] Running monthly property data indexing (day 18)...');

      // Step 1: Index ZHVI (property values) for all bedrooms
      try {
        console.log('[property-data cron] Starting ZHVI indexing...');
        results.zhvi = await indexZHVI();
        console.log('[property-data cron] ZHVI indexing complete');
      } catch (e: any) {
        console.error('[property-data cron] ZHVI indexing error:', e);
        results.zhvi = { error: e.message };
      }

      // Step 2: Index ACS tax rates
      try {
        console.log('[property-data cron] Starting ACS tax indexing...');
        results.acsTax = await indexACSTax();
        console.log('[property-data cron] ACS tax indexing complete');
      } catch (e: any) {
        console.error('[property-data cron] ACS tax indexing error:', e);
        results.acsTax = { error: e.message };
      }

      // Step 3: Index Zillow rentals data (ZORI + ZORDI for demand scoring)
      try {
        console.log('[property-data cron] Starting Zillow rentals indexing...');
        results.zillowRentals = await indexZillowRentals();
        console.log('[property-data cron] Zillow rentals indexing complete');
      } catch (e: any) {
        console.error('[property-data cron] Zillow rentals indexing error:', e);
        results.zillowRentals = { error: e.message };
      }

      // Step 3.5: Update CBSA mappings (for metro fallback in demand scoring)
      try {
        console.log('[property-data cron] Starting CBSA mapping update...');
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        const command = 'bun scripts/ingest-cbsa-mapping.ts';
        const { stdout, stderr } = await execAsync(command, {
          env: { ...process.env, POSTGRES_URL: process.env.POSTGRES_URL },
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        });

        results.cbsaMapping = {
          success: true,
          output: stdout,
          warnings: stderr
        };
        console.log('[property-data cron] CBSA mapping update complete');
      } catch (e: any) {
        console.error('[property-data cron] CBSA mapping update error:', e);
        results.cbsaMapping = { error: e.message, stderr: e.stderr, stdout: e.stdout };
      }

      // Step 4: Compute investment scores (depends on ZHVI, tax, rentals, and CBSA data)
      try {
        console.log('[property-data cron] Starting investment score computation...');
        const year = await getLatestFMRYear();
        results.investmentScores = await computeInvestmentScores(year);
        console.log('[property-data cron] Investment score computation complete');
      } catch (e: any) {
        console.error('[property-data cron] Investment score computation error:', e);
        results.investmentScores = { error: e.message };
      }
    } else {
      console.log(`[daily cron] Skipping property data indexing (today is day ${dayOfMonth}, not 18)`);
    }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      dayOfMonth,
      isIndexingDay,
      results,
    });
  } catch (e: any) {
    console.error('[daily cron] Error:', e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}





