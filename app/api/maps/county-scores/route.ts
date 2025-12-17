import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const ALLOWED_STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
]);

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawStateCode = searchParams.get('state');
    const stateCode = rawStateCode ? rawStateCode.toUpperCase() : null;
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : await getLatestFMRYear();

    if (!stateCode || !ALLOWED_STATE_CODES.has(stateCode)) {
      return NextResponse.json(
        { error: 'Invalid state code' },
        { status: 400 }
      );
    }

    // Get county investment score data
    // Group only by FIPS and state_code to avoid duplicates from county_name variations
    // Filter to latest data versions for consistency with other endpoints
    const counties = await sql.query(
      `
      WITH all_county_data AS (
        SELECT
          county_fips,
          state_code,
          COALESCE(score_with_demand, score) as score,
          zhvi_month,
          acs_vintage
        FROM investment_score
        WHERE state_code = $1
          AND fmr_year = $2
          AND data_sufficient = true
          AND county_fips IS NOT NULL
          AND LENGTH(TRIM(county_fips)) = 5
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
          score
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
          COUNT(*) as zip_count
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
        WHERE state_code = $1
          AND fmr_year = $2
          AND county_fips IS NOT NULL
          AND LENGTH(TRIM(county_fips)) = 5
        ORDER BY county_fips, state_code, county_name
      )
      SELECT
        cs.county_fips,
        COALESCE(cn.county_name, 'Unknown County') as county_name,
        cs.state_code,
        cs.median_score,
        cs.avg_score,
        cs.zip_count
      FROM county_scores cs
      LEFT JOIN county_names cn ON cs.county_fips = cn.county_fips AND cs.state_code = cn.state_code
      ORDER BY cs.county_fips
      `,
      [stateCode, year]
    );

    // Deduplicate by FIPS in case there are still any duplicates
    const countyMap = new Map<string, {
      countyName: string;
      stateCode: string;
      fips: string;
      medianScore: number | null;
      avgScore: number | null;
      zipCount: number;
    }>();

    (counties.rows as any[]).forEach((row) => {
      const fips = row.county_fips ? String(row.county_fips).padStart(5, '0') : null;
      if (!fips) return;
      
      // If we already have this FIPS, keep the one with more ZIPs or higher score
      const existing = countyMap.get(fips);
      if (!existing || 
          (row.zip_count > existing.zipCount) ||
          (row.zip_count === existing.zipCount && (row.median_score ?? 0) > (existing.medianScore ?? 0))) {
        countyMap.set(fips, {
          countyName: row.county_name || 'Unknown County',
          stateCode: row.state_code,
          fips: fips,
          medianScore: row.median_score ? parseFloat(row.median_score) : null,
          avgScore: row.avg_score ? parseFloat(row.avg_score) : null,
          zipCount: parseInt(row.zip_count) || 0,
        });
      }
    });

    const countyData = Array.from(countyMap.values());

    return NextResponse.json({
      counties: countyData,
      year,
    });
  } catch (error) {
    console.error('Error fetching county score data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch county score data' },
      { status: 500 }
    );
  }
}

