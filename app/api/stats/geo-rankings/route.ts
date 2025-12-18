import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

type GeoType = 'state' | 'county' | 'city' | 'zip';

function normalizeType(input: string | null): GeoType {
  return input === 'county' || input === 'city' || input === 'zip' ? input : 'state';
}

function normalizeOffset(input: string | null): number {
  const n = Number(input || '0');
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function normalizeLimit(input: string | null): number {
  const n = Number(input || '100');
  if (!Number.isFinite(n)) return 100;
  return Math.min(100, Math.max(1, Math.floor(n)));
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const type = normalizeType(sp.get('type'));
    const offset = normalizeOffset(sp.get('offset'));
    const limit = normalizeLimit(sp.get('limit'));
    const search = sp.get('search') || null;
    const stateFilter = sp.get('state') || null;
    const yearParam = sp.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : await getLatestFMRYear();

    let result;
    let totalCount = 0;

    if (type === 'state') {
      // Query states ranked by median investment score
      result = await sql.query(
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
            AND ($2::text IS NULL OR state_code ILIKE ($2::text || '%'))
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
        ORDER BY median_score DESC NULLS LAST
        OFFSET $3
        LIMIT $4
        `,
        [year, search, offset, limit]
      );

      // Get total count for states
      const countResult = await sql.query(
        `
        SELECT COUNT(DISTINCT state_code) as total
        FROM investment_score
        WHERE fmr_year = $1
          AND data_sufficient = true
          AND state_code IS NOT NULL
          AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
          AND ($2::text IS NULL OR state_code ILIKE ($2::text || '%'))
        `,
        [year, search]
      );
      totalCount = Number(countResult.rows[0]?.total || 0);

    } else if (type === 'county') {
      // Query counties ranked by median investment score
      result = await sql.query(
        `
        WITH all_county_data AS (
          SELECT
            county_fips,
            county_name,
            state_code,
            COALESCE(score_with_demand, score) as score,
            zhvi_month,
            acs_vintage
          FROM investment_score
          WHERE fmr_year = $1
            AND data_sufficient = true
            AND county_fips IS NOT NULL
            AND LENGTH(TRIM(county_fips)) = 5
            AND state_code IS NOT NULL
            AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
            AND ($2::text IS NULL OR state_code = $2::text)
            AND ($3::text IS NULL OR county_name ILIKE ('%' || $3::text || '%'))
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
            county_name,
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
        )
        SELECT
          county_fips,
          COALESCE(county_name, 'Unknown County') as county_name,
          state_code,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median_score,
          AVG(score) as avg_score,
          COUNT(*) as zip_count
        FROM filtered_data
        GROUP BY county_fips, county_name, state_code
        ORDER BY median_score DESC NULLS LAST
        OFFSET $4
        LIMIT $5
        `,
        [year, stateFilter, search, offset, limit]
      );

      // Get total count for counties
      const countResult = await sql.query(
        `
        SELECT COUNT(DISTINCT county_fips) as total
        FROM investment_score
        WHERE fmr_year = $1
          AND data_sufficient = true
          AND county_fips IS NOT NULL
          AND LENGTH(TRIM(county_fips)) = 5
          AND state_code IS NOT NULL
          AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
          AND ($2::text IS NULL OR state_code = $2::text)
          AND ($3::text IS NULL OR county_name ILIKE ('%' || $3::text || '%'))
        `,
        [year, stateFilter, search]
      );
      totalCount = Number(countResult.rows[0]?.total || 0);

    } else if (type === 'city') {
      // Query cities ranked by median investment score
      result = await sql.query(
        `
        WITH all_city_data AS (
          SELECT
            city_name,
            state_code,
            county_name,
            COALESCE(score_with_demand, score) as score,
            zhvi_month,
            acs_vintage
          FROM investment_score
          WHERE fmr_year = $1
            AND data_sufficient = true
            AND city_name IS NOT NULL
            AND state_code IS NOT NULL
            AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
            AND ($2::text IS NULL OR state_code = $2::text)
            AND ($3::text IS NULL OR city_name ILIKE ('%' || $3::text || '%'))
        ),
        latest_versions AS (
          SELECT
            MAX(zhvi_month) as latest_zhvi_month,
            MAX(acs_vintage) as latest_acs_vintage
          FROM all_city_data
        ),
        filtered_data AS (
          SELECT
            city_name,
            state_code,
            county_name,
            score
          FROM all_city_data acd
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
        city_counties AS (
          -- Get the most common county for each city (modal county)
          SELECT DISTINCT ON (city_name, state_code)
            city_name,
            state_code,
            county_name
          FROM (
            SELECT
              city_name,
              state_code,
              county_name,
              COUNT(*) as county_count
            FROM filtered_data
            GROUP BY city_name, state_code, county_name
          ) t
          ORDER BY city_name, state_code, county_count DESC
        )
        SELECT
          fd.city_name,
          fd.state_code,
          cc.county_name,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median_score,
          AVG(score) as avg_score,
          COUNT(*) as zip_count
        FROM filtered_data fd
        LEFT JOIN city_counties cc ON fd.city_name = cc.city_name AND fd.state_code = cc.state_code
        GROUP BY fd.city_name, fd.state_code, cc.county_name
        ORDER BY median_score DESC NULLS LAST
        OFFSET $4
        LIMIT $5
        `,
        [year, stateFilter, search, offset, limit]
      );

      // Get total count for cities
      const countResult = await sql.query(
        `
        SELECT COUNT(DISTINCT (city_name, state_code)) as total
        FROM investment_score
        WHERE fmr_year = $1
          AND data_sufficient = true
          AND city_name IS NOT NULL
          AND state_code IS NOT NULL
          AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
          AND ($2::text IS NULL OR state_code = $2::text)
          AND ($3::text IS NULL OR city_name ILIKE ('%' || $3::text || '%'))
        `,
        [year, stateFilter, search]
      );
      totalCount = Number(countResult.rows[0]?.total || 0);

    } else {
      // type === 'zip'
      // Query ZIPs ranked by investment score
      result = await sql.query(
        `
        WITH all_zip_data AS (
          SELECT
            zip_code,
            city_name,
            county_name,
            state_code,
            COALESCE(score_with_demand, score) as score,
            zhvi_month,
            acs_vintage
          FROM investment_score
          WHERE fmr_year = $1
            AND data_sufficient = true
            AND geo_type = 'zip'
            AND zip_code IS NOT NULL
            AND state_code IS NOT NULL
            AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
            AND ($2::text IS NULL OR state_code = $2::text)
            AND ($3::text IS NULL OR zip_code ILIKE ($3::text || '%'))
        ),
        latest_versions AS (
          SELECT
            MAX(zhvi_month) as latest_zhvi_month,
            MAX(acs_vintage) as latest_acs_vintage
          FROM all_zip_data
        ),
        filtered_data AS (
          SELECT
            zip_code,
            city_name,
            county_name,
            state_code,
            score
          FROM all_zip_data azd
          CROSS JOIN latest_versions lv
          WHERE (
            (lv.latest_zhvi_month IS NULL AND azd.zhvi_month IS NULL) OR
            (lv.latest_zhvi_month IS NOT NULL AND azd.zhvi_month = lv.latest_zhvi_month)
          )
          AND (
            (lv.latest_acs_vintage IS NULL AND azd.acs_vintage IS NULL) OR
            (lv.latest_acs_vintage IS NOT NULL AND azd.acs_vintage = lv.latest_acs_vintage)
          )
        )
        SELECT
          zip_code,
          city_name,
          county_name,
          state_code,
          score as median_score,
          score as avg_score,
          1 as zip_count
        FROM filtered_data
        ORDER BY score DESC NULLS LAST
        OFFSET $4
        LIMIT $5
        `,
        [year, stateFilter, search, offset, limit]
      );

      // Get total count for ZIPs
      const countResult = await sql.query(
        `
        SELECT COUNT(*) as total
        FROM investment_score
        WHERE fmr_year = $1
          AND data_sufficient = true
          AND geo_type = 'zip'
          AND zip_code IS NOT NULL
          AND state_code IS NOT NULL
          AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
          AND ($2::text IS NULL OR state_code = $2::text)
          AND ($3::text IS NULL OR zip_code ILIKE ($3::text || '%'))
        `,
        [year, stateFilter, search]
      );
      totalCount = Number(countResult.rows[0]?.total || 0);
    }

    // Map results to response format
    const items = result.rows.map((row: any, index: number) => {
      const rank = offset + index + 1;

      const baseItem = {
        rank,
        stateCode: row.state_code,
        medianScore: Number(row.median_score) || null,
        avgScore: Number(row.avg_score) || null,
        zipCount: Number(row.zip_count) || 0,
      };

      if (type === 'state') {
        return {
          ...baseItem,
          stateName: null, // Can add state name mapping if needed
        };
      } else if (type === 'county') {
        return {
          ...baseItem,
          countyName: row.county_name,
          countyFips: row.county_fips,
        };
      } else if (type === 'city') {
        return {
          ...baseItem,
          cityName: row.city_name,
          countyName: row.county_name,
        };
      } else {
        // type === 'zip'
        return {
          ...baseItem,
          zipCode: row.zip_code,
          cityName: row.city_name,
          countyName: row.county_name,
        };
      }
    });

    const hasMore = items.length === limit && (offset + limit) < totalCount;

    return NextResponse.json({
      year,
      type,
      items,
      total: totalCount,
      hasMore,
      offset,
      limit,
    });

  } catch (e: any) {
    console.error('Geo rankings error:', e);
    return NextResponse.json(
      {
        error: 'Failed to fetch geographic rankings',
        ...(process.env.NODE_ENV !== 'production'
          ? { details: e?.message ? String(e.message) : String(e) }
          : {}),
      },
      { status: 500 }
    );
  }
}
