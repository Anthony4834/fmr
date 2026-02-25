import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const yearParam = req.nextUrl.searchParams.get('year');
    const level = req.nextUrl.searchParams.get('level') || 'county';
    const year = yearParam ? parseInt(yearParam, 10) : await getLatestFMRYear();

    if (level === 'state') {
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
        ORDER BY state_code
        `,
        [year]
      );

      const stateScores = result.rows.map((row: any) => ({
        stateCode: row.state_code,
        medianScore: Number(row.median_score) || null,
        avgScore: Number(row.avg_score) || null,
        zipCount: Number(row.zip_count) || 0,
      }));

      return NextResponse.json({ year, stateScores, _debug: { timestamp: new Date().toISOString(), count: stateScores.length } });
    }

    // County level
    const result = await sql.query(
      `
      WITH county_scores AS (
        SELECT
          county_fips,
          state_code,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY adjusted_score) as median_score,
          AVG(adjusted_score) as avg_score,
          COUNT(*) as zip_count,
          AVG(net_yield) as avg_yield
        FROM investment_score
        WHERE fmr_year = $1
          AND bedroom_count = 3
          AND county_fips IS NOT NULL
          AND LENGTH(TRIM(county_fips)) = 5
          AND state_code IS NOT NULL
          AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
        GROUP BY county_fips, state_code
        HAVING COUNT(*) > 0
      ),
      county_names AS (
        SELECT DISTINCT ON (county_fips, state_code)
          county_fips, state_code, county_name
        FROM investment_score
        WHERE fmr_year = $1
          AND county_fips IS NOT NULL AND LENGTH(TRIM(county_fips)) = 5
          AND state_code IS NOT NULL AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
        ORDER BY county_fips, state_code, county_name
      )
      SELECT
        cs.county_fips,
        COALESCE(cn.county_name, 'Unknown County') as county_name,
        cs.state_code,
        cs.median_score,
        cs.avg_score,
        cs.zip_count,
        cs.avg_yield
      FROM county_scores cs
      LEFT JOIN county_names cn ON cs.county_fips = cn.county_fips AND cs.state_code = cn.state_code
      ORDER BY cs.median_score DESC NULLS LAST
      `,
      [year]
    );

    const countyScores = result.rows.map((row: any) => ({
      countyFips: row.county_fips ? String(row.county_fips).padStart(5, '0') : null,
      countyName: row.county_name || 'Unknown County',
      stateCode: String(row.state_code).toUpperCase().trim(),
      medianScore: row.median_score ? parseFloat(row.median_score) : null,
      avgScore: row.avg_score ? parseFloat(row.avg_score) : null,
      zipCount: parseInt(row.zip_count) || 0,
      avgYield: row.avg_yield ? parseFloat(row.avg_yield) : null,
      avgYieldPct: row.avg_yield ? parseFloat(row.avg_yield) * 100 : null,
    }));

    return NextResponse.json({
      year,
      countyScores,
      _debug: { timestamp: new Date().toISOString(), count: countyScores.length },
    });
  } catch (e: any) {
    console.error('Scores error:', e);
    return NextResponse.json({ error: 'Failed to fetch scores' }, { status: 500 });
  }
}
