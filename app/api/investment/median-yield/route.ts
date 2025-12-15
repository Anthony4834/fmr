import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

/**
 * Get the median net yield used for investment score normalization.
 * This is calculated from the investment_score table.
 */
export async function GET(req: NextRequest) {
  try {
    const yearParam = req.nextUrl.searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : null;

    let query = `
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY net_yield) as median_yield
      FROM investment_score
      WHERE data_sufficient = true
    `;
    const params: any[] = [];

    if (year) {
      query += ` AND fmr_year = $1`;
      params.push(year);
    }

    const result = await sql.query(query, params);
    const row = result.rows[0];

    if (!row || row.median_yield === null || row.median_yield === undefined) {
      // Default fallback if no data
      return NextResponse.json({
        found: false,
        medianYield: 0.05, // 5% default
        medianYieldPct: 5.0,
        year: year || null,
        source: 'default',
      });
    }

    const medianYield = Number(row.median_yield);

    return NextResponse.json({
      found: true,
      medianYield,
      medianYieldPct: medianYield * 100,
      year: year || null,
      source: 'database',
    });
  } catch (e: any) {
    console.error('Median yield error:', e);
    // Return default on error
    return NextResponse.json({
      found: false,
      medianYield: 0.05, // 5% default
      medianYieldPct: 5.0,
      year: null,
      source: 'default (error)',
      error: e?.message || 'Failed to fetch median yield',
    });
  }
}

