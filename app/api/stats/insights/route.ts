import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { computeDashboardInsights, type DashboardInsightsType } from '../../../../lib/dashboard-insights';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawType = (searchParams.get('type') || 'zip') as DashboardInsightsType;
    const year = parseInt(searchParams.get('year') || '2026', 10);
    const refresh = searchParams.get('refresh') === 'true';

    const type: DashboardInsightsType =
      rawType === 'zip' || rawType === 'city' || rawType === 'county' ? rawType : 'zip';

    // Ensure cache table exists (cheap; safe for dev environments)
    await sql`
      CREATE TABLE IF NOT EXISTS dashboard_insights_cache (
        year INTEGER NOT NULL,
        type VARCHAR(10) NOT NULL CHECK (type IN ('zip', 'city', 'county')),
        payload JSONB NOT NULL,
        computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (year, type)
      );
    `;

    if (!refresh) {
      const cached = await sql.query(
        `SELECT payload FROM dashboard_insights_cache WHERE year = $1 AND type = $2`,
        [year, type]
      );
      if (cached.rows[0]?.payload) {
        return NextResponse.json(cached.rows[0].payload);
      }
    }

    const payload = await computeDashboardInsights({ year, type });

    await sql.query(
      `
      INSERT INTO dashboard_insights_cache (year, type, payload, computed_at)
      VALUES ($1, $2, $3::jsonb, NOW())
      ON CONFLICT (year, type)
      DO UPDATE SET payload = EXCLUDED.payload, computed_at = EXCLUDED.computed_at
      `,
      [year, type, JSON.stringify(payload)]
    );

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error fetching insights:', error);
    return NextResponse.json(
      { error: 'Failed to fetch insights' },
      { status: 500 }
    );
  }
}
