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
      const result = await sql.query(
        `
        SELECT 
          zip_code,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(score_with_demand, score)) as median_score,
          AVG(COALESCE(score_with_demand, score)) as avg_score,
          COUNT(*) as bedroom_count
        FROM investment_score
        WHERE county_name ILIKE $1
          AND state_code = $2
          AND fmr_year = $3
          AND data_sufficient = true
        GROUP BY zip_code
        ORDER BY median_score DESC NULLS LAST, avg_score DESC NULLS LAST
        `,
        [`%${countyParam}%`, stateParam.toUpperCase(), year]
      );

      const zipScores = result.rows.map((row: any) => ({
        zipCode: row.zip_code,
        medianScore: row.median_score ? parseFloat(row.median_score) : null,
        avgScore: row.avg_score ? parseFloat(row.avg_score) : null,
        bedroomCount: parseInt(row.bedroom_count) || 0,
      }));

      // Calculate median score across all ZIPs
      const scores = zipScores.map(z => z.medianScore ?? z.avgScore).filter((s): s is number => s !== null);
      const sorted = [...scores].sort((a, b) => a - b);
      const medianIndex = Math.floor(sorted.length / 2);
      const areaMedianScore =
        sorted.length % 2 === 0 && sorted.length > 0
          ? (sorted[medianIndex - 1] + sorted[medianIndex]) / 2
          : sorted.length > 0
          ? sorted[medianIndex]
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
      const result = await sql.query(
        `
        WITH city_zips AS (
          SELECT DISTINCT zip_code
          FROM zip_city_mapping
          WHERE city_name ILIKE $1
            AND state_code = $2
        )
        SELECT 
          isc.zip_code,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(isc.score_with_demand, isc.score)) as median_score,
          AVG(COALESCE(isc.score_with_demand, isc.score)) as avg_score,
          COUNT(*) as bedroom_count
        FROM investment_score isc
        INNER JOIN city_zips cz ON cz.zip_code = isc.zip_code
        WHERE isc.fmr_year = $3
          AND isc.data_sufficient = true
        GROUP BY isc.zip_code
        ORDER BY median_score DESC NULLS LAST, avg_score DESC NULLS LAST
        `,
        [cityParam, stateParam.toUpperCase(), year]
      );

      const zipScores = result.rows.map((row: any) => ({
        zipCode: row.zip_code,
        medianScore: row.median_score ? parseFloat(row.median_score) : null,
        avgScore: row.avg_score ? parseFloat(row.avg_score) : null,
        bedroomCount: parseInt(row.bedroom_count) || 0,
      }));

      // Calculate median score across all ZIPs
      const scores = zipScores.map(z => z.medianScore ?? z.avgScore).filter((s): s is number => s !== null);
      const sorted = [...scores].sort((a, b) => a - b);
      const medianIndex = Math.floor(sorted.length / 2);
      const areaMedianScore =
        sorted.length % 2 === 0 && sorted.length > 0
          ? (sorted[medianIndex - 1] + sorted[medianIndex]) / 2
          : sorted.length > 0
          ? sorted[medianIndex]
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

