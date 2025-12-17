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

    // Get all counties for the state with investment score data
    // Use DISTINCT ON to ensure exactly one row per county_fips
    // This handles cases where the same FIPS appears with different county_name variations or data versions
    const counties = await sql.query(
      `
      WITH all_county_data AS (
        SELECT
          county_fips,
          state_code,
          county_name,
          COALESCE(score_with_demand, score) as score,
          zhvi_month,
          acs_vintage,
          computed_at
        FROM investment_score
        WHERE state_code = $1
          AND fmr_year = $2
          AND data_sufficient = true
          AND county_fips IS NOT NULL
          AND LENGTH(TRIM(county_fips)) = 5
      ),
      latest_versions AS (
        -- Get the latest zhvi_month and acs_vintage for this state/year
        SELECT 
          MAX(zhvi_month) as latest_zhvi_month,
          MAX(acs_vintage) as latest_acs_vintage
        FROM all_county_data
      ),
      filtered_data AS (
        -- Filter to only the latest data version
        SELECT 
          county_fips,
          state_code,
          county_name,
          score,
          computed_at
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
      county_names AS (
        -- Get one county_name per FIPS (prefer the most common one)
        SELECT DISTINCT ON (county_fips, state_code)
          county_fips,
          state_code,
          county_name,
          COUNT(*) as name_count
        FROM filtered_data
        GROUP BY county_fips, state_code, county_name
        ORDER BY county_fips, state_code, name_count DESC, county_name
      ),
      county_aggregates AS (
        SELECT 
          fd.county_fips,
          fd.state_code,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fd.score) as median_score,
          AVG(fd.score) as avg_score,
          COUNT(*) as zip_count
        FROM filtered_data fd
        GROUP BY fd.county_fips, fd.state_code
        HAVING COUNT(*) > 0
      )
      SELECT 
        ca.county_fips,
        COALESCE(cn.county_name, 'Unknown County') as county_name,
        ca.state_code,
        ca.median_score,
        ca.avg_score,
        ca.zip_count
      FROM county_aggregates ca
      LEFT JOIN county_names cn ON ca.county_fips = cn.county_fips AND ca.state_code = cn.state_code
      ORDER BY ca.median_score DESC NULLS LAST
      `,
      [stateCode, year]
    );

    // Final deduplication: first by FIPS, then by county name to handle data quality issues
    // where the same county name appears with multiple FIPS codes
    const fipsMap = new Map<string, {
      countyName: string;
      stateCode: string;
      countyFips: string;
      medianScore: number | null;
      avgScore: number | null;
      zipCount: number;
    }>();

    // First pass: deduplicate by FIPS
    (counties.rows as any[]).forEach((row) => {
      const fips = row.county_fips ? String(row.county_fips).padStart(5, '0') : null;
      if (!fips) return;
      
      // If we already have this FIPS, keep the one with more ZIPs or higher score
      const existing = fipsMap.get(fips);
      if (!existing || 
          (row.zip_count > existing.zipCount) ||
          (row.zip_count === existing.zipCount && (row.median_score ?? 0) > (existing.medianScore ?? 0))) {
        fipsMap.set(fips, {
          countyName: row.county_name || 'Unknown County',
          stateCode: row.state_code,
          countyFips: fips,
          medianScore: row.median_score ? parseFloat(String(row.median_score)) : null,
          avgScore: row.avg_score ? parseFloat(String(row.avg_score)) : null,
          zipCount: parseInt(String(row.zip_count)) || 0,
        });
      }
    });

    // Second pass: deduplicate by county name (normalized) to handle cases where
    // the same county name appears with multiple FIPS codes due to data quality issues
    const nameMap = new Map<string, {
      countyName: string;
      stateCode: string;
      countyFips: string;
      medianScore: number | null;
      avgScore: number | null;
      zipCount: number;
    }>();

    const normalizeCountyName = (name: string): string => {
      return name.toLowerCase().trim().replace(/\s+/g, ' ');
    };

    Array.from(fipsMap.values()).forEach((county) => {
      const normalizedName = normalizeCountyName(county.countyName);
      const key = `${normalizedName}|${county.stateCode}`;
      
      const existing = nameMap.get(key);
      if (!existing || 
          (county.zipCount > existing.zipCount) ||
          (county.zipCount === existing.zipCount && (county.medianScore ?? 0) > (existing.medianScore ?? 0))) {
        nameMap.set(key, county);
      }
    });

    const countyRows = Array.from(nameMap.values());

    // Calculate state median score (median of ALL ZIPs in the state, not median of county medians)
    // This ensures consistency with the USA map state-level scores
    const stateMedianResult = await sql.query(
      `
      WITH all_state_data AS (
        SELECT
          COALESCE(score_with_demand, score) as score,
          zhvi_month,
          acs_vintage
        FROM investment_score
        WHERE state_code = $1
          AND fmr_year = $2
          AND data_sufficient = true
      ),
      latest_versions AS (
        SELECT
          MAX(zhvi_month) as latest_zhvi_month,
          MAX(acs_vintage) as latest_acs_vintage
        FROM all_state_data
      ),
      filtered_data AS (
        SELECT
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
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median_score
      FROM filtered_data
      `,
      [stateCode, year]
    );
    const stateMedianScore = stateMedianResult.rows[0]?.median_score
      ? parseFloat(String(stateMedianResult.rows[0].median_score))
      : null;

    // Add percent diff vs median and sort by highest score -> lowest score
    const rankings = countyRows
      .map((c) => ({
        ...c,
        percentDiff: stateMedianScore && c.medianScore
          ? ((c.medianScore - stateMedianScore) / stateMedianScore) * 100
          : 0,
      }))
      .sort((a, b) => {
        const scoreA = a.medianScore ?? 0;
        const scoreB = b.medianScore ?? 0;
        return scoreB - scoreA;
      });

    return NextResponse.json({
      rankings,
      stateMedianScore,
      count: rankings.length,
      year,
    });
  } catch (error) {
    console.error('Error fetching state counties:', error);
    return NextResponse.json(
      { error: 'Failed to fetch state counties' },
      { status: 500 }
    );
  }
}

