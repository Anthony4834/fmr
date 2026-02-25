import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

type GeoType = 'city' | 'county';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const type = sp.get('type') === 'county' ? 'county' : 'city';
    const stateFilter = sp.get('state') || null;
    const yearParam = sp.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : await getLatestFMRYear();
    const limit = Math.min(500, Math.max(1, parseInt(sp.get('limit') || '100', 10)));
    const offset = Math.max(0, parseInt(sp.get('offset') || '0', 10));

    let result;
    let totalCount = 0;

    if (type === 'city') {
      // Find cities in investment_score that are NOT in cities table (or have no zip_codes)
      result = await sql.query(
        `
        WITH investment_cities AS (
          SELECT DISTINCT
            city_name,
            state_code,
            county_name,
            adjusted_score as score
          FROM investment_score
          WHERE fmr_year = $1
            AND bedroom_count = 3
            AND city_name IS NOT NULL
            AND state_code IS NOT NULL
            AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
            AND ($2::text IS NULL OR state_code = $2::text)
        ),
        cities_with_zips AS (
          SELECT LOWER(TRIM(city_name)) as city_name_lower, state_code
          FROM cities
          WHERE zip_codes IS NOT NULL
            AND array_length(zip_codes, 1) > 0
        ),
        incomplete_cities AS (
          SELECT
            ic.city_name,
            ic.state_code,
            ic.county_name,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ic.score) as median_score,
            COUNT(*) as zip_count
          FROM investment_cities ic
          LEFT JOIN cities_with_zips cwz
            ON LOWER(TRIM(ic.city_name)) = cwz.city_name_lower
            AND ic.state_code = cwz.state_code
          WHERE cwz.city_name_lower IS NULL
          GROUP BY ic.city_name, ic.state_code, ic.county_name
        )
        SELECT *
        FROM incomplete_cities
        ORDER BY median_score DESC NULLS LAST
        OFFSET $3
        LIMIT $4
        `,
        [year, stateFilter, offset, limit]
      );

      // Get total count
      const countResult = await sql.query(
        `
        WITH investment_cities AS (
          SELECT DISTINCT city_name, state_code
          FROM investment_score
          WHERE fmr_year = $1
            AND bedroom_count = 3
            AND city_name IS NOT NULL
            AND state_code IS NOT NULL
            AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
            AND ($2::text IS NULL OR state_code = $2::text)
        ),
        cities_with_zips AS (
          SELECT LOWER(TRIM(city_name)) as city_name_lower, state_code
          FROM cities
          WHERE zip_codes IS NOT NULL
            AND array_length(zip_codes, 1) > 0
        )
        SELECT COUNT(DISTINCT (ic.city_name, ic.state_code)) as total
        FROM investment_cities ic
        LEFT JOIN cities_with_zips cwz
          ON LOWER(TRIM(ic.city_name)) = cwz.city_name_lower
          AND ic.state_code = cwz.state_code
        WHERE cwz.city_name_lower IS NULL
        `,
        [year, stateFilter]
      );
      totalCount = Number(countResult.rows[0]?.total || 0);

    } else {
      // For counties - find counties in investment_score without proper FMR data
      // This is more complex since county matching is by name, not direct FK
      result = await sql.query(
        `
        WITH investment_counties AS (
          SELECT DISTINCT
            county_name,
            county_fips,
            state_code,
            adjusted_score as score
          FROM investment_score
          WHERE fmr_year = $1
            AND bedroom_count = 3
            AND county_name IS NOT NULL
            AND state_code IS NOT NULL
            AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
            AND ($2::text IS NULL OR state_code = $2::text)
        ),
        fmr_counties AS (
          SELECT DISTINCT
            LOWER(REGEXP_REPLACE(area_name, '\\s+County.*$', '', 'i')) as county_base,
            state_code
          FROM fmr_data
          WHERE year = $1
        ),
        incomplete_counties AS (
          SELECT
            ic.county_name,
            ic.county_fips,
            ic.state_code,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ic.score) as median_score,
            COUNT(*) as zip_count
          FROM investment_counties ic
          LEFT JOIN fmr_counties fc
            ON LOWER(REGEXP_REPLACE(ic.county_name, '\\s+County.*$', '', 'i')) = fc.county_base
            AND ic.state_code = fc.state_code
          WHERE fc.county_base IS NULL
          GROUP BY ic.county_name, ic.county_fips, ic.state_code
        )
        SELECT *
        FROM incomplete_counties
        ORDER BY median_score DESC NULLS LAST
        OFFSET $3
        LIMIT $4
        `,
        [year, stateFilter, offset, limit]
      );

      const countResult = await sql.query(
        `
        WITH investment_counties AS (
          SELECT DISTINCT county_name, state_code
          FROM investment_score
          WHERE fmr_year = $1
            AND bedroom_count = 3
            AND county_name IS NOT NULL
            AND state_code IS NOT NULL
            AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
            AND ($2::text IS NULL OR state_code = $2::text)
        ),
        fmr_counties AS (
          SELECT DISTINCT
            LOWER(REGEXP_REPLACE(area_name, '\\s+County.*$', '', 'i')) as county_base,
            state_code
          FROM fmr_data
          WHERE year = $1
        )
        SELECT COUNT(DISTINCT (ic.county_name, ic.state_code)) as total
        FROM investment_counties ic
        LEFT JOIN fmr_counties fc
          ON LOWER(REGEXP_REPLACE(ic.county_name, '\\s+County.*$', '', 'i')) = fc.county_base
          AND ic.state_code = fc.state_code
        WHERE fc.county_base IS NULL
        `,
        [year, stateFilter]
      );
      totalCount = Number(countResult.rows[0]?.total || 0);
    }

    const items = result.rows.map((row: any, index: number) => ({
      rank: offset + index + 1,
      name: type === 'city' ? row.city_name : row.county_name,
      stateCode: row.state_code,
      countyName: row.county_name,
      countyFips: row.county_fips,
      medianScore: row.median_score ? Number(row.median_score) : null,
      zipCount: Number(row.zip_count) || 0,
    }));

    return NextResponse.json({
      year,
      type,
      items,
      total: totalCount,
      hasMore: items.length === limit && (offset + limit) < totalCount,
      offset,
      limit,
    });

  } catch (e: any) {
    console.error('Incomplete geos error:', e);
    return NextResponse.json(
      {
        error: 'Failed to fetch incomplete geos',
        ...(process.env.NODE_ENV !== 'production'
          ? { details: e?.message ? String(e.message) : String(e) }
          : {}),
      },
      { status: 500 }
    );
  }
}
