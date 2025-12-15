import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const yearParam = req.nextUrl.searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : await getLatestFMRYear();

    // Get median investment scores by county
    // Filter to only counties with valid FIPS codes (5 digits)
    const result = await sql.query(
      `
      SELECT 
        county_fips,
        county_name,
        state_code,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median_score,
        AVG(score) as avg_score,
        COUNT(*) as zip_count,
        AVG(net_yield) as avg_yield
      FROM investment_score
      WHERE fmr_year = $1
        AND data_sufficient = true
        AND county_fips IS NOT NULL
        AND LENGTH(TRIM(county_fips)) = 5
        AND state_code IS NOT NULL
        AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
      GROUP BY county_fips, county_name, state_code
      HAVING COUNT(*) > 0
      ORDER BY state_code, county_name
      `,
      [year]
    );

    const countyScores = result.rows.map((row: any) => {
      // Ensure FIPS code is zero-padded to 5 digits
      const fips = row.county_fips 
        ? String(row.county_fips).padStart(5, '0')
        : null;
      
      return {
        countyFips: fips,
        countyName: row.county_name,
        stateCode: row.state_code,
        medianScore: Number(row.median_score) || null,
        avgScore: Number(row.avg_score) || null,
        zipCount: Number(row.zip_count) || 0,
        avgYield: Number(row.avg_yield) || null,
        avgYieldPct: row.avg_yield ? Number(row.avg_yield) * 100 : null,
      };
    }).filter(c => c.countyFips); // Filter out counties without FIPS codes

    return NextResponse.json({
      year,
      countyScores,
    });
  } catch (e: any) {
    console.error('County scores error:', e);
    return NextResponse.json(
      { error: 'Failed to fetch county scores' },
      { status: 500 }
    );
  }
}

