import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

function normalizeYear(input: string | null): number | null {
  if (!input) return null;
  const n = Number(input);
  if (!Number.isFinite(n)) return null;
  const y = Math.floor(n);
  if (y < 2000 || y > 2100) return null;
  return y;
}

export async function GET(req: NextRequest) {
  try {
    const yearParam = normalizeYear(req.nextUrl.searchParams.get('year'));
    const year = yearParam ?? (await getLatestFMRYear());

    const res = await sql.query(
      `
      SELECT MAX(computed_at) AS computed_at
      FROM investment_score
      WHERE fmr_year = $1
      `,
      [year]
    );

    const computedAt = res.rows?.[0]?.computed_at ?? null;

    return NextResponse.json({
      year,
      computedAt: computedAt ? new Date(computedAt).toISOString() : null,
    });
  } catch (e) {
    console.error('Investment score index error:', e);
    return NextResponse.json({ error: 'Failed to fetch index status' }, { status: 500 });
  }
}


