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
      const result = await sql.query(
        `
        SELECT
          isc.zip_code,
          isc.adjusted_score as score
        FROM investment_score isc
        WHERE isc.county_name ILIKE $1
          AND isc.state_code = $2
          AND isc.fmr_year = $3
          AND isc.bedroom_count = 3
        ORDER BY isc.adjusted_score DESC NULLS LAST
        `,
        [`%${countyParam}%`, stateParam.toUpperCase(), year]
      );

      const scores = result.rows
        .map((r: any) => r.score != null ? parseFloat(r.score) : null)
        .filter((s): s is number => s != null);
      const sorted = [...scores].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const areaMedianScore = sorted.length > 0
        ? (sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2)
        : null;

      const zipScores = result.rows.map((row: any) => ({
        zipCode: row.zip_code,
        medianScore: row.score ? parseFloat(row.score) : null,
        avgScore: row.score ? parseFloat(row.score) : null,
        bedroomCount: 3,
      }));

      return NextResponse.json({ found: true, geoType: 'county', county: countyParam, stateCode: stateParam.toUpperCase(), year, areaMedianScore, zipScores });
    }

    if (cityParam && stateParam) {
      const result = await sql.query(
        `
        SELECT
          isc.zip_code,
          isc.adjusted_score as score
        FROM investment_score isc
        INNER JOIN zip_city_mapping zcm ON zcm.zip_code = isc.zip_code
        WHERE zcm.city_name ILIKE $1
          AND zcm.state_code = $2
          AND isc.fmr_year = $3
          AND isc.bedroom_count = 3
        ORDER BY isc.adjusted_score DESC NULLS LAST
        `,
        [cityParam, stateParam.toUpperCase(), year]
      );

      const scores = result.rows
        .map((r: any) => r.score != null ? parseFloat(r.score) : null)
        .filter((s): s is number => s != null);
      const sorted = [...scores].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const areaMedianScore = sorted.length > 0
        ? (sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2)
        : null;

      const zipScores = result.rows.map((row: any) => ({
        zipCode: row.zip_code,
        medianScore: row.score ? parseFloat(row.score) : null,
        avgScore: row.score ? parseFloat(row.score) : null,
        bedroomCount: 3,
      }));

      return NextResponse.json({ found: true, geoType: 'city', city: cityParam, stateCode: stateParam.toUpperCase(), year, areaMedianScore, zipScores });
    }

    return NextResponse.json({ error: 'County or city parameter is required' }, { status: 400 });
  } catch (e: any) {
    console.error('ZIP scores error:', e);
    return NextResponse.json({ error: 'Failed to fetch ZIP scores' }, { status: 500 });
  }
}
