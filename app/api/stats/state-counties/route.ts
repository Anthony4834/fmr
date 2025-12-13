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

    // Get all counties for the state with FMR data
    const counties = await sql`
      SELECT 
        area_name,
        state_code,
        county_code,
        bedroom_0, bedroom_1, bedroom_2, bedroom_3, bedroom_4,
        (COALESCE(bedroom_0, 0) + COALESCE(bedroom_1, 0) + COALESCE(bedroom_2, 0) + 
         COALESCE(bedroom_3, 0) + COALESCE(bedroom_4, 0)) / 
        NULLIF((CASE WHEN bedroom_0 IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN bedroom_1 IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN bedroom_2 IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN bedroom_3 IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN bedroom_4 IS NOT NULL THEN 1 ELSE 0 END), 0) as avg_fmr
      FROM fmr_data
      WHERE state_code = ${stateCode}
        AND year = ${year}
        AND (bedroom_0 IS NOT NULL OR bedroom_1 IS NOT NULL OR bedroom_2 IS NOT NULL OR 
             bedroom_3 IS NOT NULL OR bedroom_4 IS NOT NULL)
      ORDER BY avg_fmr DESC
    `;

    const countyRows = (counties.rows as any[]).map((row) => ({
      countyName: row.area_name,
      stateCode: row.state_code,
      countyFips: row.county_code ? String(row.county_code).padStart(5, '0').slice(-5) : null,
      avgFMR: parseFloat(row.avg_fmr) || 0,
      bedroom0: parseFloat(row.bedroom_0) || null,
      bedroom1: parseFloat(row.bedroom_1) || null,
      bedroom2: parseFloat(row.bedroom_2) || null,
      bedroom3: parseFloat(row.bedroom_3) || null,
      bedroom4: parseFloat(row.bedroom_4) || null,
    }));

    // Calculate median
    const sorted = [...countyRows].sort((a, b) => a.avgFMR - b.avgFMR);
    const medianIndex = Math.floor(sorted.length / 2);
    const medianAvgFMR =
      sorted.length % 2 === 0
        ? (sorted[medianIndex - 1].avgFMR + sorted[medianIndex].avgFMR) / 2
        : sorted[medianIndex].avgFMR;

    // Add percent diff vs median and sort by most expensive -> least expensive
    const rankings = countyRows
      .map((c) => ({
        ...c,
        percentDiff: medianAvgFMR > 0 ? ((c.avgFMR - medianAvgFMR) / medianAvgFMR) * 100 : 0,
      }))
      .sort((a, b) => b.avgFMR - a.avgFMR);

    return NextResponse.json({
      rankings,
      medianAvgFMR,
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

