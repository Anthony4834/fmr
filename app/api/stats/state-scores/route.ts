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
      // Get median investment scores by state (using score_with_demand for demand-weighted scores)
      // Filter to latest data versions for consistency
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

      return NextResponse.json({
        year,
        stateScores,
        _debug: {
          timestamp: new Date().toISOString(),
          count: stateScores.length,
        },
      });
    }

    // Get median investment scores by county
    // Group only by FIPS and state_code to avoid duplicates from county_name variations
    // This matches the approach used in the state view for consistency
    // Filter to latest data versions for consistency
    console.log('[state-scores API] Executing county query with score_with_demand, year:', year);
    const result = await sql.query(
      `
      WITH all_county_data AS (
        SELECT
          county_fips,
          state_code,
          COALESCE(score_with_demand, score) as score,
          net_yield,
          zhvi_month,
          acs_vintage
        FROM investment_score
        WHERE fmr_year = $1
          AND data_sufficient = true
          AND county_fips IS NOT NULL
          AND LENGTH(TRIM(county_fips)) = 5
          AND state_code IS NOT NULL
          AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
      ),
      latest_versions AS (
        SELECT
          MAX(zhvi_month) as latest_zhvi_month,
          MAX(acs_vintage) as latest_acs_vintage
        FROM all_county_data
      ),
      filtered_data AS (
        SELECT
          county_fips,
          state_code,
          score,
          net_yield
        FROM all_county_data acd
        CROSS JOIN latest_versions lv
        WHERE (
          (lv.latest_zhvi_month IS NULL AND acd.zhvi_month IS NULL) OR
          (lv.latest_zhvi_month IS NOT NULL AND acd.zhvi_month = lv.latest_zhvi_month)
        )
        AND (
          (lv.latest_acs_vintage IS NULL AND acd.acs_vintage IS NULL) OR
          (lv.latest_acs_vintage IS NOT NULL AND acd.acs_vintage = lv.latest_acs_vintage)
        )
      ),
      county_scores AS (
        SELECT
          county_fips,
          state_code,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median_score,
          AVG(score) as avg_score,
          COUNT(*) as zip_count,
          AVG(net_yield) as avg_yield
        FROM filtered_data
        GROUP BY county_fips, state_code
        HAVING COUNT(*) > 0
      ),
      county_names AS (
        SELECT DISTINCT ON (county_fips, state_code)
          county_fips,
          state_code,
          county_name
        FROM investment_score
        WHERE fmr_year = $1
          AND county_fips IS NOT NULL
          AND LENGTH(TRIM(county_fips)) = 5
          AND state_code IS NOT NULL
          AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
        ORDER BY county_fips, state_code, county_name
      )
      SELECT DISTINCT ON (cs.county_fips, cs.state_code)
        cs.county_fips,
        COALESCE(cn.county_name, 'Unknown County') as county_name,
        cs.state_code,
        cs.median_score,
        cs.avg_score,
        cs.zip_count,
        cs.avg_yield
      FROM county_scores cs
      LEFT JOIN county_names cn ON cs.county_fips = cn.county_fips AND cs.state_code = cn.state_code
      ORDER BY cs.county_fips, cs.state_code, cs.zip_count DESC
      `,
      [year]
    );

    // Deduplicate by FIPS+state (composite key) in case there are still any duplicates
    // FIPS codes should be unique across the US, but use composite key for safety
    const countyMap = new Map<string, {
      countyFips: string;
      countyName: string;
      stateCode: string;
      medianScore: number | null;
      avgScore: number | null;
      zipCount: number;
      avgYield: number | null;
      avgYieldPct: number | null;
    }>();

    (result.rows as any[]).forEach((row) => {
      const fips = row.county_fips ? String(row.county_fips).padStart(5, '0') : null;
      const stateCode = row.state_code ? String(row.state_code).toUpperCase().trim() : null;
      if (!fips || !stateCode) return;
      
      // Use FIPS as key (FIPS codes are unique across the US)
      // If duplicates exist, keep the one with more ZIPs or higher score
      const existing = countyMap.get(fips);
      if (!existing || 
          (row.zip_count > existing.zipCount) ||
          (row.zip_count === existing.zipCount && (row.median_score ?? 0) > (existing.medianScore ?? 0))) {
        countyMap.set(fips, {
          countyFips: fips,
          countyName: row.county_name || 'Unknown County',
          stateCode: stateCode,
          medianScore: row.median_score ? parseFloat(row.median_score) : null,
          avgScore: row.avg_score ? parseFloat(row.avg_score) : null,
          zipCount: parseInt(row.zip_count) || 0,
          avgYield: row.avg_yield ? parseFloat(row.avg_yield) : null,
          avgYieldPct: row.avg_yield ? parseFloat(row.avg_yield) * 100 : null,
        });
      }
    });

    const countyScores = Array.from(countyMap.values());

    // Debug: Check Butte, CA specifically
    const butte = countyScores.find(c => c.countyFips === '06007');
    if (butte) {
      console.log('[state-scores API] Butte, CA (FIPS 06007):', {
        medianScore: butte.medianScore,
        avgScore: butte.avgScore,
      });
    }

    // Add timestamp to help debug caching issues
    return NextResponse.json({
      year,
      countyScores,
      _debug: {
        timestamp: new Date().toISOString(),
        count: countyScores.length,
        sample: countyScores.slice(0, 3).map(c => ({
          fips: c.countyFips,
          name: c.countyName,
          score: c.medianScore,
        })),
      },
    });
  } catch (e: any) {
    console.error('Scores error:', e);
    return NextResponse.json(
      { error: 'Failed to fetch scores' },
      { status: 500 }
    );
  }
}

