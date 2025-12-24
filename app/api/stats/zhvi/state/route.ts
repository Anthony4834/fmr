import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const stateParam = req.nextUrl.searchParams.get('state');
    const bedroomsParam = req.nextUrl.searchParams.get('bedrooms');
    if (!stateParam) return NextResponse.json({ error: 'Missing state' }, { status: 400 });
    if (!bedroomsParam) return NextResponse.json({ error: 'Missing bedrooms' }, { status: 400 });

    const state = stateParam.trim().toUpperCase();
    const bedrooms = parseInt(bedroomsParam, 10);
    if (!/^[A-Z]{2}$/.test(state)) return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
    if (!Number.isFinite(bedrooms) || bedrooms < 1 || bedrooms > 5) {
      return NextResponse.json({ error: 'Invalid bedrooms (1–5)' }, { status: 400 });
    }

    const rows = await sql.query(
      `
      SELECT month, zhvi_median, zhvi_p25, zhvi_p75, zip_count
      FROM zhvi_rollup_monthly
      WHERE geo_type = 'state'
        AND geo_key = $1
        AND bedroom_count = $2
      ORDER BY month ASC
      `,
      [state, bedrooms]
    );

    return NextResponse.json({
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
    console.error('ZHVI state error:', e);
    return NextResponse.json({ error: 'Failed to fetch ZHVI state series' }, { status: 500 });
  }
}




