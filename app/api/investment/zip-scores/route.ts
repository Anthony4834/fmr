import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const countyParam = searchParams.get('county');
    const cityParam = searchParams.get('city');
    const stateParam = searchParams.get('state');
    const yearParam = searchParams.get('year');

    if (!stateParam) {
      return NextResponse.json({ error: 'State parameter is required' }, { status: 400 });
    }

    const year = yearParam ? parseInt(yearParam, 10) : await getLatestFMRYear();

    if (countyParam && stateParam) {
      // Get investment scores for all ZIPs in the county
      // Filter to latest data versions for consistency
      const result = await sql.query(
        `
        WITH county_data AS (
          SELECT
            zip_code,
            COALESCE(score_with_demand, score) as score,
            zhvi_month,
            acs_vintage
          FROM investment_score
          WHERE county_name ILIKE $1
            AND state_code = $2
            AND fmr_year = $3
            AND data_sufficient = true
        ),
        latest_versions AS (
          SELECT
            MAX(zhvi_month) as latest_zhvi_month,
            MAX(acs_vintage) as latest_acs_vintage
          FROM county_data
        ),
        filtered_data AS (
          SELECT
            zip_code,
            score
          FROM county_data cd
          CROSS JOIN latest_versions lv
          WHERE (
            (lv.latest_zhvi_month IS NULL AND cd.zhvi_month IS NULL) OR
            (lv.latest_zhvi_month IS NOT NULL AND cd.zhvi_month = lv.latest_zhvi_month)
          )
          AND (
            (lv.latest_acs_vintage IS NULL AND cd.acs_vintage IS NULL) OR
            (lv.latest_acs_vintage IS NOT NULL AND cd.acs_vintage = lv.latest_acs_vintage)
          )
        ),
        zip_aggregates AS (
          SELECT
            zip_code,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median_score,
            AVG(score) as avg_score,
            COUNT(*) as bedroom_count
          FROM filtered_data
          GROUP BY zip_code
        ),
        area_median AS (
          SELECT
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as area_median_score
          FROM filtered_data
        )
        SELECT
          za.zip_code,
          za.median_score,
          za.avg_score,
          za.bedroom_count,
          am.area_median_score
        FROM zip_aggregates za
        CROSS JOIN area_median am
        ORDER BY za.median_score DESC NULLS LAST, za.avg_score DESC NULLS LAST
        `,
        [`%${countyParam}%`, stateParam.toUpperCase(), year]
      );

      const zipScores = result.rows.map((row: any) => ({
        zipCode: row.zip_code,
        medianScore: row.median_score ? parseFloat(row.median_score) : null,
        avgScore: row.avg_score ? parseFloat(row.avg_score) : null,
        bedroomCount: parseInt(row.bedroom_count) || 0,
      }));

      // Get area median score from the first row (same for all rows due to CROSS JOIN)
      const areaMedianScore = result.rows.length > 0 && result.rows[0]?.area_median_score
        ? parseFloat(String(result.rows[0].area_median_score))
        : null;

      return NextResponse.json({
        found: true,
        geoType: 'county',
        county: countyParam,
        stateCode: stateParam.toUpperCase(),
        year,
        areaMedianScore,
        zipScores,
      });
    }

    if (cityParam && stateParam) {
      // Get investment scores for all ZIPs in the city
      // Filter to latest data versions for consistency
      const result = await sql.query(
        `
        WITH city_zips AS (
          SELECT DISTINCT zip_code
          FROM zip_city_mapping
          WHERE city_name ILIKE $1
            AND state_code = $2
        ),
        city_data AS (
          SELECT
            isc.zip_code,
            COALESCE(isc.score_with_demand, isc.score) as score,
            isc.zhvi_month,
            isc.acs_vintage
          FROM investment_score isc
          INNER JOIN city_zips cz ON cz.zip_code = isc.zip_code
          WHERE isc.fmr_year = $3
            AND isc.data_sufficient = true
        ),
        latest_versions AS (
          SELECT
            MAX(zhvi_month) as latest_zhvi_month,
            MAX(acs_vintage) as latest_acs_vintage
          FROM city_data
        ),
        filtered_data AS (
          SELECT
            zip_code,
            score
          FROM city_data cd
          CROSS JOIN latest_versions lv
          WHERE (
            (lv.latest_zhvi_month IS NULL AND cd.zhvi_month IS NULL) OR
            (lv.latest_zhvi_month IS NOT NULL AND cd.zhvi_month = lv.latest_zhvi_month)
          )
          AND (
            (lv.latest_acs_vintage IS NULL AND cd.acs_vintage IS NULL) OR
            (lv.latest_acs_vintage IS NOT NULL AND cd.acs_vintage = lv.latest_acs_vintage)
          )
        ),
        zip_aggregates AS (
          SELECT
            zip_code,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median_score,
            AVG(score) as avg_score,
            COUNT(*) as bedroom_count
          FROM filtered_data
          GROUP BY zip_code
        ),
        area_median AS (
          SELECT
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as area_median_score
          FROM filtered_data
        )
        SELECT
          za.zip_code,
          za.median_score,
          za.avg_score,
          za.bedroom_count,
          am.area_median_score
        FROM zip_aggregates za
        CROSS JOIN area_median am
        ORDER BY za.median_score DESC NULLS LAST, za.avg_score DESC NULLS LAST
        `,
        [cityParam, stateParam.toUpperCase(), year]
      );

      const zipScores = result.rows.map((row: any) => ({
        zipCode: row.zip_code,
        medianScore: row.median_score ? parseFloat(row.median_score) : null,
        avgScore: row.avg_score ? parseFloat(row.avg_score) : null,
        bedroomCount: parseInt(row.bedroom_count) || 0,
      }));

      // Get area median score from the first row (same for all rows due to CROSS JOIN)
      const areaMedianScore = result.rows.length > 0 && result.rows[0]?.area_median_score
        ? parseFloat(String(result.rows[0].area_median_score))
        : null;

      return NextResponse.json({
        found: true,
        geoType: 'city',
        city: cityParam,
        stateCode: stateParam.toUpperCase(),
        year,
        areaMedianScore,
        zipScores,
      });
    }

    return NextResponse.json({ error: 'County or city parameter is required' }, { status: 400 });
  } catch (e: any) {
    console.error('ZIP scores error:', e);
    return NextResponse.json({ error: 'Failed to fetch ZIP scores' }, { status: 500 });
  }
}

