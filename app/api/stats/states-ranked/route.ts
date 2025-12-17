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

    // Get states ranked by median investment score (using score_with_demand for demand-weighted scores)
    // Filter to latest data versions for consistency with state-scores endpoint
    const result = await sql.query(
      `
      WITH all_state_data AS (
        SELECT
          state_code,
          COALESCE(score_with_demand, score) as score,
          zhvi_month,
          acs_vintage
        FROM investment_score
        WHERE fmr_year = $1
          AND data_sufficient = true
          AND state_code IS NOT NULL
          AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
      ),
      latest_versions AS (
        SELECT
          MAX(zhvi_month) as latest_zhvi_month,
          MAX(acs_vintage) as latest_acs_vintage
        FROM all_state_data
      ),
      filtered_data AS (
        SELECT
          state_code,
          score
        FROM all_state_data asd
        CROSS JOIN latest_versions lv
        WHERE (
          (lv.latest_zhvi_month IS NULL AND asd.zhvi_month IS NULL) OR
          (lv.latest_zhvi_month IS NOT NULL AND asd.zhvi_month = lv.latest_zhvi_month)
        )
        AND (
          (lv.latest_acs_vintage IS NULL AND asd.acs_vintage IS NULL) OR
          (lv.latest_acs_vintage IS NOT NULL AND asd.acs_vintage = lv.latest_acs_vintage)
        )
      )
      SELECT 
        state_code,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median_score,
        AVG(score) as avg_score,
        COUNT(*) as zip_count
      FROM filtered_data
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

    return NextResponse.json({
      year,
      states,
    });
  } catch (e: any) {
    console.error('States ranked error:', e);
    return NextResponse.json(
      { error: 'Failed to fetch states ranking' },
      { status: 500 }
    );
  }
}
