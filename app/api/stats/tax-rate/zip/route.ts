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
    if (!zipParam) return NextResponse.json({ error: 'Missing zip' }, { status: 400 });
    const zip = normalizeZip(zipParam);

    const r = await sql.query(
      `
      SELECT acs_vintage, zcta, median_home_value, median_real_estate_taxes_paid, effective_tax_rate, computed_at
      FROM acs_tax_zcta_latest
      WHERE zcta = $1
      ORDER BY acs_vintage DESC
      LIMIT 1
      `,
      [zip]
    );

    const row = r.rows?.[0] as any | undefined;
    if (!row) {
      return NextResponse.json({
        zip,
        found: false,
        acsVintage: null,
        medianHomeValue: null,
        medianRealEstateTaxesPaid: null,
        effectiveTaxRate: null,
        effectiveTaxRatePct: null,
        computedAt: null,
      });
    }

    const effective = row.effective_tax_rate !== null ? Number(row.effective_tax_rate) : null;

    return NextResponse.json({
      zip,
      found: true,
      acsVintage: row.acs_vintage !== null ? Number(row.acs_vintage) : null,
      medianHomeValue: row.median_home_value !== null ? Number(row.median_home_value) : null,
      medianRealEstateTaxesPaid: row.median_real_estate_taxes_paid !== null ? Number(row.median_real_estate_taxes_paid) : null,
      effectiveTaxRate: effective,
      effectiveTaxRatePct: effective !== null ? effective * 100 : null,
      computedAt: row.computed_at || null,
    });
  } catch (e: any) {
    console.error('Tax rate zip error:', e);
    return NextResponse.json({ error: 'Failed to fetch tax rate' }, { status: 500 });
  }
}






