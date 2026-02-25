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
    const sp = request.nextUrl.searchParams;
    const rawState = sp.get('state');
    const stateCode = rawState ? rawState.toUpperCase() : null;
    if (!stateCode || !ALLOWED_STATE_CODES.has(stateCode)) {
      return NextResponse.json({ error: 'Invalid state code' }, { status: 400 });
    }

    const year = await getLatestFMRYear();

    const result = await sql.query(
      `
      WITH base AS (
        SELECT DISTINCT ON (zcm.zip_code)
          zcm.zip_code,
          zcm.county_fips,
          zcm.state_code
        FROM zip_county_mapping zcm
        WHERE zcm.state_code = $1
        ORDER BY zcm.zip_code
      ),
      fmr AS (
        SELECT
          b.zip_code,
          COALESCE(CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_0 END, fd.bedroom_0) AS b0,
          COALESCE(CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_1 END, fd.bedroom_1) AS b1,
          COALESCE(CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_2 END, fd.bedroom_2) AS b2,
          COALESCE(CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_3 END, fd.bedroom_3) AS b3,
          COALESCE(CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_4 END, fd.bedroom_4) AS b4
        FROM base b
        LEFT JOIN required_safmr_zips rsz ON b.zip_code = rsz.zip_code AND rsz.year = $2
        LEFT JOIN safmr_data sd ON b.zip_code = sd.zip_code AND sd.year = $2
        LEFT JOIN fmr_data fd ON b.county_fips = fd.county_code AND b.state_code = fd.state_code AND fd.year = $2
      ),
      amr AS (
        SELECT
          zip_code,
          MAX(estimated_monthly_rent) FILTER (WHERE bedroom_count = 0) AS a0,
          MAX(estimated_monthly_rent) FILTER (WHERE bedroom_count = 1) AS a1,
          MAX(estimated_monthly_rent) FILTER (WHERE bedroom_count = 2) AS a2,
          MAX(estimated_monthly_rent) FILTER (WHERE bedroom_count = 3) AS a3,
          MAX(estimated_monthly_rent) FILTER (WHERE bedroom_count = 4) AS a4
        FROM rentcast_market_rents
        WHERE zip_code IN (SELECT zip_code FROM base)
          AND bedroom_count BETWEEN 0 AND 4
          AND estimated_monthly_rent IS NOT NULL
        GROUP BY zip_code
      )
      SELECT
        f.zip_code,
        f.b0, f.b1, f.b2, f.b3, f.b4,
        a.a0, a.a1, a.a2, a.a3, a.a4
      FROM fmr f
      LEFT JOIN amr a ON f.zip_code = a.zip_code
      WHERE (f.b0 IS NOT NULL OR f.b1 IS NOT NULL OR f.b2 IS NOT NULL OR f.b3 IS NOT NULL OR f.b4 IS NOT NULL)
      ORDER BY f.zip_code
      `,
      [stateCode, year]
    );

    type ChartRow = { br: number; fmr: number | null; amr: number | null; zipCode: string };
    const rows: ChartRow[] = [];

    for (const r of result.rows) {
      const zipCode = String(r.zip_code).padStart(5, '0');
      const fmrCols = [r.b0, r.b1, r.b2, r.b3, r.b4];
      const amrCols = [r.a0, r.a1, r.a2, r.a3, r.a4];
      for (let br = 0; br < 5; br++) {
        const fmr = fmrCols[br] != null ? Number(fmrCols[br]) : null;
        const amr = amrCols[br] != null ? Number(amrCols[br]) : null;
        if (fmr != null) {
          rows.push({ br, fmr, amr, zipCode });
        }
      }
    }

    return NextResponse.json({ rows });
  } catch (e) {
    console.error('Error fetching state alignment data:', e);
    return NextResponse.json({ error: 'Failed to fetch state alignment data' }, { status: 500 });
  }
}
