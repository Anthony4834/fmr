import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const cityParam = req.nextUrl.searchParams.get('city');
    const stateParam = req.nextUrl.searchParams.get('state');
    const bedroomsParam = req.nextUrl.searchParams.get('bedrooms');
    if (!cityParam) return NextResponse.json({ error: 'Missing city' }, { status: 400 });
    if (!stateParam) return NextResponse.json({ error: 'Missing state' }, { status: 400 });
    if (!bedroomsParam) return NextResponse.json({ error: 'Missing bedrooms' }, { status: 400 });

    const city = cityParam.trim();
    const state = stateParam.trim().toUpperCase();
    const bedrooms = parseInt(bedroomsParam, 10);
    if (!city) return NextResponse.json({ error: 'Invalid city' }, { status: 400 });
    if (!/^[A-Z]{2}$/.test(state)) return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
    if (!Number.isFinite(bedrooms) || bedrooms < 1 || bedrooms > 5) {
      return NextResponse.json({ error: 'Invalid bedrooms (1–5)' }, { status: 400 });
    }

    const geoKey = `${city}|${state}`;
    const rows = await sql.query(
      `
      SELECT month, zhvi_median, zhvi_p25, zhvi_p75, zip_count
      FROM zhvi_rollup_monthly
      WHERE geo_type = 'city'
        AND geo_key = $1
        AND bedroom_count = $2
      ORDER BY month ASC
      `,
      [geoKey, bedrooms]
    );

    return NextResponse.json({
      city,
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
    console.error('ZHVI city error:', e);
    return NextResponse.json({ error: 'Failed to fetch ZHVI city series' }, { status: 500 });
  }
}




