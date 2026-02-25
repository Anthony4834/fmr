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
      result = await sql.query(
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
          AND ($2::text IS NULL OR state_code ILIKE ($2::text || '%'))
        GROUP BY state_code
        ORDER BY median_score DESC NULLS LAST
        OFFSET $3
        LIMIT $4
        `,
        [year, search, offset, limit]
      );

      const countResult = await sql.query(
        `SELECT COUNT(DISTINCT state_code) as total FROM investment_score
         WHERE fmr_year = $1 AND bedroom_count = 3
           AND state_code IS NOT NULL AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
           AND ($2::text IS NULL OR state_code ILIKE ($2::text || '%'))`,
        [year, search]
      );
      totalCount = Number(countResult.rows[0]?.total || 0);

    } else if (type === 'county') {
      result = await sql.query(
        `
        SELECT
          isc.county_fips,
          isc.county_name,
          isc.state_code,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY isc.adjusted_score) as median_score,
          AVG(isc.adjusted_score) as avg_score,
          COUNT(*) as zip_count
        FROM investment_score isc
        INNER JOIN fmr_data fd ON isc.county_fips = fd.county_code AND isc.state_code = fd.state_code AND fd.year = $1
        WHERE isc.fmr_year = $1
          AND isc.bedroom_count = 3
          AND isc.county_fips IS NOT NULL
          AND LENGTH(TRIM(isc.county_fips)) = 5
          AND isc.state_code IS NOT NULL
          AND isc.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
          AND ($2::text IS NULL OR isc.state_code = $2::text)
          AND ($3::text IS NULL OR isc.county_name ILIKE ('%' || $3::text || '%'))
        GROUP BY isc.county_fips, isc.county_name, isc.state_code
        ORDER BY median_score DESC NULLS LAST
        OFFSET $4
        LIMIT $5
        `,
        [year, stateFilter, search, offset, limit]
      );

      const countResult = await sql.query(
        `SELECT COUNT(DISTINCT isc.county_fips) as total
         FROM investment_score isc
         INNER JOIN fmr_data fd ON isc.county_fips = fd.county_code AND isc.state_code = fd.state_code AND fd.year = $1
         WHERE isc.fmr_year = $1 AND isc.bedroom_count = 3
           AND isc.county_fips IS NOT NULL AND LENGTH(TRIM(isc.county_fips)) = 5
           AND isc.state_code IS NOT NULL AND isc.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
           AND ($2::text IS NULL OR isc.state_code = $2::text)
           AND ($3::text IS NULL OR isc.county_name ILIKE ('%' || $3::text || '%'))`,
        [year, stateFilter, search]
      );
      totalCount = Number(countResult.rows[0]?.total || 0);

    } else if (type === 'city') {
      result = await sql.query(
        `
        WITH city_scores AS (
          SELECT
            isc.city_name,
            isc.state_code,
            isc.county_name,
            isc.adjusted_score as score
          FROM investment_score isc
          INNER JOIN cities c ON LOWER(TRIM(isc.city_name)) = LOWER(TRIM(c.city_name))
            AND isc.state_code = c.state_code
            AND c.zip_codes IS NOT NULL AND array_length(c.zip_codes, 1) > 0
          WHERE isc.fmr_year = $1
            AND isc.bedroom_count = 3
            AND isc.city_name IS NOT NULL
            AND isc.state_code IS NOT NULL
            AND isc.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
            AND ($2::text IS NULL OR isc.state_code = $2::text)
            AND ($3::text IS NULL OR isc.city_name ILIKE ('%' || $3::text || '%'))
        ),
        city_counties AS (
          SELECT DISTINCT ON (city_name, state_code)
            city_name, state_code, county_name
          FROM (
            SELECT city_name, state_code, county_name, COUNT(*) as cnt
            FROM city_scores GROUP BY city_name, state_code, county_name
          ) t
          ORDER BY city_name, state_code, cnt DESC
        )
        SELECT
          cs.city_name,
          cs.state_code,
          cc.county_name,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cs.score) as median_score,
          AVG(cs.score) as avg_score,
          COUNT(*) as zip_count
        FROM city_scores cs
        LEFT JOIN city_counties cc ON cs.city_name = cc.city_name AND cs.state_code = cc.state_code
        GROUP BY cs.city_name, cs.state_code, cc.county_name
        ORDER BY median_score DESC NULLS LAST
        OFFSET $4
        LIMIT $5
        `,
        [year, stateFilter, search, offset, limit]
      );

      const countResult = await sql.query(
        `SELECT COUNT(DISTINCT (isc.city_name, isc.state_code)) as total
         FROM investment_score isc
         INNER JOIN cities c ON LOWER(TRIM(isc.city_name)) = LOWER(TRIM(c.city_name))
           AND isc.state_code = c.state_code
           AND c.zip_codes IS NOT NULL AND array_length(c.zip_codes, 1) > 0
         WHERE isc.fmr_year = $1 AND isc.bedroom_count = 3
           AND isc.city_name IS NOT NULL AND isc.state_code IS NOT NULL
           AND isc.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
           AND ($2::text IS NULL OR isc.state_code = $2::text)
           AND ($3::text IS NULL OR isc.city_name ILIKE ('%' || $3::text || '%'))`,
        [year, stateFilter, search]
      );
      totalCount = Number(countResult.rows[0]?.total || 0);

    } else {
      // type === 'zip'
      result = await sql.query(
        `
        SELECT
          zip_code,
          city_name,
          county_name,
          state_code,
          adjusted_score as median_score,
          adjusted_score as avg_score,
          1 as zip_count
        FROM investment_score
        WHERE fmr_year = $1
          AND bedroom_count = 3
          AND geo_type = 'zip'
          AND zip_code IS NOT NULL
          AND state_code IS NOT NULL
          AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
          AND ($2::text IS NULL OR state_code = $2::text)
          AND ($3::text IS NULL OR zip_code ILIKE ($3::text || '%'))
        ORDER BY adjusted_score DESC NULLS LAST
        OFFSET $4
        LIMIT $5
        `,
        [year, stateFilter, search, offset, limit]
      );

      const countResult = await sql.query(
        `SELECT COUNT(*) as total FROM investment_score
         WHERE fmr_year = $1 AND bedroom_count = 3 AND geo_type = 'zip'
           AND zip_code IS NOT NULL AND state_code IS NOT NULL
           AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
           AND ($2::text IS NULL OR state_code = $2::text)
           AND ($3::text IS NULL OR zip_code ILIKE ($3::text || '%'))`,
        [year, stateFilter, search]
      );
      totalCount = Number(countResult.rows[0]?.total || 0);
    }

    const items = result.rows.map((row: any, index: number) => {
      const rank = offset + index + 1;
      const baseItem = {
        rank,
        stateCode: row.state_code,
        medianScore: Number(row.median_score) || null,
        avgScore: Number(row.avg_score) || null,
        zipCount: Number(row.zip_count) || 0,
      };

      if (type === 'state') return { ...baseItem, stateName: null };
      if (type === 'county') return { ...baseItem, countyName: row.county_name, countyFips: row.county_fips };
      if (type === 'city') return { ...baseItem, cityName: row.city_name, countyName: row.county_name };
      return { ...baseItem, zipCode: row.zip_code, cityName: row.city_name, countyName: row.county_name };
    });

    const hasMore = items.length === limit && (offset + limit) < totalCount;

    return NextResponse.json({ year, type, items, total: totalCount, hasMore, offset, limit });

  } catch (e: any) {
    console.error('Geo rankings error:', e);
    return NextResponse.json(
      { error: 'Failed to fetch geographic rankings', ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message ?? e) } : {}) },
      { status: 500 }
    );
  }
}
