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

    const results: any = {
      zhvi: null,
      acsTax: null,
      investmentScores: null,
    };

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

    // Step 3: Compute investment scores (depends on ZHVI and tax data)
    try {
      console.log('[property-data cron] Starting investment score computation...');
      const year = await getLatestFMRYear();
      results.investmentScores = await computeInvestmentScores(year);
      console.log('[property-data cron] Investment score computation complete');
    } catch (e: any) {
      console.error('[property-data cron] Investment score computation error:', e);
      results.investmentScores = { error: e.message };
    }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (e: any) {
    console.error('[property-data cron] Error:', e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
