import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * Returns when each data source was last indexed.
 * Used by FMR results page for the "last updated" footer.
 */
export async function GET() {
  try {
    const [mortgageRes, zhviRes, acsRes] = await Promise.all([
      sql.query(
        `SELECT fetched_at FROM mortgage_rates
         WHERE rate_type = '30_year_fixed'
         ORDER BY fetched_at DESC LIMIT 1`
      ),
      sql.query(
        `SELECT MAX(month) as latest_month FROM zhvi_zip_bedroom_monthly`
      ),
      sql.query(
        `SELECT MAX(acs_vintage) as latest_vintage FROM acs_tax_zcta_latest`
      ),
    ]);

    const mortgageRow = mortgageRes.rows[0];
    const zhviRow = zhviRes.rows[0];
    const acsRow = acsRes.rows[0];

    const mortgageFetchedAt = mortgageRow?.fetched_at
      ? (typeof mortgageRow.fetched_at === 'string'
          ? mortgageRow.fetched_at
          : (mortgageRow.fetched_at as Date)?.toISOString?.())
      : null;

    const zhviLatestMonth = zhviRow?.latest_month
      ? (typeof zhviRow.latest_month === 'string'
          ? zhviRow.latest_month.slice(0, 7)
          : (zhviRow.latest_month as Date)?.toISOString?.()?.slice(0, 7))
      : null;

    const acsLatestVintage = acsRow?.latest_vintage != null
      ? Number(acsRow.latest_vintage)
      : null;

    return NextResponse.json({
      mortgageFetchedAt,
      zhviLatestMonth,
      acsLatestVintage,
    });
  } catch (e) {
    console.error('Data freshness error:', e);
    return NextResponse.json(
      { error: 'Failed to fetch data freshness' },
      { status: 500 }
    );
  }
}
