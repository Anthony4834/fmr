import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const yearParam = req.nextUrl.searchParams.get('year');
    const limitParam = req.nextUrl.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50;
    const year = yearParam ? parseInt(yearParam, 10) : await getLatestFMRYear();

    const result = await sql.query(
      `
      SELECT
        state_code,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY adjusted_score) as median_score,
        AVG(adjusted_score) as avg_score,
        COUNT(*) as zip_count
      FROM investment_score
      WHERE fmr_year = $1
        AND bedroom_count = 3
        AND state_code IS NOT NULL
        AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
      GROUP BY state_code
      HAVING COUNT(*) > 0
      ORDER BY median_score DESC NULLS LAST
      LIMIT $2
      `,
      [year, limit]
    );

    const states = result.rows.map((row: any) => ({
      stateCode: row.state_code,
      medianScore: Number(row.median_score) || null,
      avgScore: Number(row.avg_score) || null,
      zipCount: Number(row.zip_count) || 0,
    }));

    return NextResponse.json({ year, states });
  } catch (e: any) {
    console.error('States ranked error:', e);
    return NextResponse.json({ error: 'Failed to fetch states ranking' }, { status: 500 });
  }
}
