import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

function normalizeZip(zip: string) {
  const digits = zip.trim().replace(/\D/g, '');
  if (digits.length === 5) return digits;
  if (digits.length < 5) return digits.padStart(5, '0');
  return digits.slice(0, 5);
}

export async function GET(req: NextRequest) {
  try {
    const zipParam = req.nextUrl.searchParams.get('zip');
    const bedroomsParam = req.nextUrl.searchParams.get('bedrooms');
    if (!zipParam) return NextResponse.json({ error: 'Missing zip' }, { status: 400 });
    if (!bedroomsParam) return NextResponse.json({ error: 'Missing bedrooms' }, { status: 400 });

    const zip = normalizeZip(zipParam);
    const bedrooms = parseInt(bedroomsParam, 10);
    if (!Number.isFinite(bedrooms) || bedrooms < 1 || bedrooms > 5) {
      return NextResponse.json({ error: 'Invalid bedrooms (1–5)' }, { status: 400 });
    }

    const rows = await sql.query(
      `
      SELECT month, zhvi, state_code, city_name, county_name
      FROM zhvi_zip_bedroom_monthly
      WHERE zip_code = $1
        AND bedroom_count = $2
      ORDER BY month ASC
      `,
      [zip, bedrooms]
    );

    const series = (rows.rows as any[]).map((r) => ({
      month: r.month,
      zhvi: r.zhvi !== null ? Number(r.zhvi) : null,
    }));

    const meta = rows.rows?.[rows.rows.length - 1] as any;

    return NextResponse.json({
      zip,
      bedrooms,
      stateCode: meta?.state_code || null,
      cityName: meta?.city_name || null,
      countyName: meta?.county_name || null,
      series,
    });
  } catch (e: any) {
    console.error('ZHVI zip error:', e);
    return NextResponse.json({ error: 'Failed to fetch ZHVI zip series' }, { status: 500 });
  }
}




