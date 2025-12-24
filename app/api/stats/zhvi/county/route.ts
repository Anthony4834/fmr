import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

function normalizeCounty(county: string) {
  return county.replace(/\s+County\s*$/i, '').trim();
}

export async function GET(req: NextRequest) {
  try {
    const countyParam = req.nextUrl.searchParams.get('county');
    const stateParam = req.nextUrl.searchParams.get('state');
    const bedroomsParam = req.nextUrl.searchParams.get('bedrooms');
    if (!countyParam) return NextResponse.json({ error: 'Missing county' }, { status: 400 });
    if (!stateParam) return NextResponse.json({ error: 'Missing state' }, { status: 400 });
    if (!bedroomsParam) return NextResponse.json({ error: 'Missing bedrooms' }, { status: 400 });

    const county = normalizeCounty(countyParam);
    const state = stateParam.trim().toUpperCase();
    const bedrooms = parseInt(bedroomsParam, 10);
    if (!county) return NextResponse.json({ error: 'Invalid county' }, { status: 400 });
    if (!/^[A-Z]{2}$/.test(state)) return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
    if (!Number.isFinite(bedrooms) || bedrooms < 1 || bedrooms > 5) {
      return NextResponse.json({ error: 'Invalid bedrooms (1–5)' }, { status: 400 });
    }

    // Find a stable geo_key for this county + state (handles possible “County” suffix variants).
    const pattern1 = `${county}%`;
    const pattern2 = `${county} County%`;
    const keyLookup = await sql.query(
      `
      SELECT geo_key, county_name
      FROM zhvi_rollup_monthly
      WHERE geo_type = 'county'
        AND state_code = $1
        AND bedroom_count = $2
        AND (county_name ILIKE $3 OR county_name ILIKE $4)
      ORDER BY month DESC, zip_count DESC
      LIMIT 1
      `,
      [state, bedrooms, pattern1, pattern2]
    );

    const geoKey = (keyLookup.rows?.[0] as any)?.geo_key as string | undefined;
    const resolvedCountyName = (keyLookup.rows?.[0] as any)?.county_name as string | undefined;
    if (!geoKey) {
      return NextResponse.json({ county, state, bedrooms, series: [] });
    }

    const rows = await sql.query(
      `
      SELECT month, zhvi_median, zhvi_p25, zhvi_p75, zip_count
      FROM zhvi_rollup_monthly
      WHERE geo_type = 'county'
        AND geo_key = $1
        AND bedroom_count = $2
      ORDER BY month ASC
      `,
      [geoKey, bedrooms]
    );

    return NextResponse.json({
      county: resolvedCountyName || county,
      state,
      bedrooms,
      series: (rows.rows as any[]).map((r) => ({
        month: r.month,
        median: r.zhvi_median !== null ? Number(r.zhvi_median) : null,
        p25: r.zhvi_p25 !== null ? Number(r.zhvi_p25) : null,
        p75: r.zhvi_p75 !== null ? Number(r.zhvi_p75) : null,
        zipCount: r.zip_count !== null ? Number(r.zip_count) : null,
      })),
    });
  } catch (e: any) {
    console.error('ZHVI county error:', e);
    return NextResponse.json({ error: 'Failed to fetch ZHVI county series' }, { status: 500 });
  }
}




