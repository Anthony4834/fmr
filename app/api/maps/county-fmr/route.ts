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

    // Get county FMR data with FIPS codes
    // Join with zip_county_mapping to get FIPS codes
    const counties = await sql`
      SELECT DISTINCT
        fd.area_name as county_name,
        fd.state_code,
        zcm.county_fips,
        fd.bedroom_0, fd.bedroom_1, fd.bedroom_2, fd.bedroom_3, fd.bedroom_4,
        (COALESCE(fd.bedroom_0, 0) + COALESCE(fd.bedroom_1, 0) + COALESCE(fd.bedroom_2, 0) + 
         COALESCE(fd.bedroom_3, 0) + COALESCE(fd.bedroom_4, 0)) / 
        NULLIF((CASE WHEN fd.bedroom_0 IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN fd.bedroom_1 IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN fd.bedroom_2 IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN fd.bedroom_3 IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN fd.bedroom_4 IS NOT NULL THEN 1 ELSE 0 END), 0) as avg_fmr
      FROM fmr_data fd
      LEFT JOIN zip_county_mapping zcm ON (
        zcm.state_code = fd.state_code
        AND (zcm.county_name ILIKE '%' || fd.area_name || '%' 
             OR fd.area_name ILIKE '%' || zcm.county_name || '%')
      )
      WHERE fd.state_code = ${stateCode}
        AND fd.year = ${year}
        AND (fd.bedroom_0 IS NOT NULL OR fd.bedroom_1 IS NOT NULL OR 
             fd.bedroom_2 IS NOT NULL OR fd.bedroom_3 IS NOT NULL OR 
             fd.bedroom_4 IS NOT NULL)
      ORDER BY zcm.county_fips, fd.area_name
    `;

    // Group by FIPS code (some counties might have multiple FMR entries)
    const countyMap = new Map<string, {
      countyName: string;
      stateCode: string;
      fips: string;
      avgFMR: number;
      bedroom0: number | null;
      bedroom1: number | null;
      bedroom2: number | null;
      bedroom3: number | null;
      bedroom4: number | null;
    }>();

    for (const row of counties.rows as any[]) {
      const fips = row.county_fips || '';
      if (!fips) continue;

      const avgFMR = parseFloat(row.avg_fmr) || 0;
      
      // If we already have this FIPS, keep the one with higher FMR (or merge)
      if (!countyMap.has(fips) || countyMap.get(fips)!.avgFMR < avgFMR) {
        countyMap.set(fips, {
          countyName: row.county_name,
          stateCode: row.state_code,
          fips: fips.padStart(5, '0'),
          avgFMR,
          bedroom0: row.bedroom_0 ? parseFloat(row.bedroom_0) : null,
          bedroom1: row.bedroom_1 ? parseFloat(row.bedroom_1) : null,
          bedroom2: row.bedroom_2 ? parseFloat(row.bedroom_2) : null,
          bedroom3: row.bedroom_3 ? parseFloat(row.bedroom_3) : null,
          bedroom4: row.bedroom_4 ? parseFloat(row.bedroom_4) : null,
        });
      }
    }

    return NextResponse.json({
      counties: Array.from(countyMap.values()),
      year,
    });
  } catch (error) {
    console.error('Error fetching county FMR data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch county FMR data' },
      { status: 500 }
    );
  }
}

