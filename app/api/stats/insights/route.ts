import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { computeDashboardInsights, type DashboardInsightsType } from '../../../../lib/dashboard-insights';
import { getLatestFMRYear } from '@/lib/queries';

export const dynamic = 'force-dynamic';
// Neon/@neondatabase queries can return multi‑MB responses during computation; Next's fetch cache
// has a 2MB limit and will spam warnings/errors in dev if it tries to cache them.
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const DASHBOARD_INSIGHTS_CACHE_VERSION = 4;

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
    const rawType = (searchParams.get('type') || 'zip') as DashboardInsightsType;
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : await getLatestFMRYear();
    const refresh = searchParams.get('refresh') === 'true';
    const rawStateCode = searchParams.get('state');
    const stateCode = rawStateCode ? rawStateCode.toUpperCase() : null;
    const bedroomSizeParam = searchParams.get('bedroom');
    const bedroomSize = bedroomSizeParam ? parseInt(bedroomSizeParam, 10) : null;

    const type: DashboardInsightsType =
      rawType === 'zip' || rawType === 'city' || rawType === 'county' ? rawType : 'zip';

    const filters = {
      stateCode: stateCode && ALLOWED_STATE_CODES.has(stateCode) ? stateCode : null,
      bedroomSize: (bedroomSize !== null && bedroomSize >= 0 && bedroomSize <= 4) ? bedroomSize : null,
    };

    // Build cache key that includes filters
    const cacheKey = `${year}:${type}:${filters.stateCode || 'all'}:${filters.bedroomSize !== null ? filters.bedroomSize : 'all'}`;

    // Ensure cache table exists (cheap; safe for dev environments)
    // NOTE: use a v2 table name to avoid having to migrate the older (year,type) primary key schema.
    await sql`
      CREATE TABLE IF NOT EXISTS dashboard_insights_cache_v2 (
        cache_key VARCHAR(255) NOT NULL,
        year INTEGER NOT NULL,
        type VARCHAR(10) NOT NULL CHECK (type IN ('zip', 'city', 'county')),
        state_code VARCHAR(2),
        bedroom_size INTEGER,
        payload JSONB NOT NULL,
        computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (cache_key)
      );
    `;

    if (!refresh) {
      const cached = await sql.query(
        `SELECT payload FROM dashboard_insights_cache_v2 WHERE cache_key = $1`,
        [cacheKey]
      );
      const payload = cached.rows[0]?.payload as any;
      if (payload && payload.cacheVersion === DASHBOARD_INSIGHTS_CACHE_VERSION) {
        return NextResponse.json(payload);
      }
    }

    const payload = await computeDashboardInsights({ year, type, filters });
    (payload as any).cacheVersion = DASHBOARD_INSIGHTS_CACHE_VERSION;

    await sql.query(
      `
      INSERT INTO dashboard_insights_cache_v2 (cache_key, year, type, state_code, bedroom_size, payload, computed_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
      ON CONFLICT (cache_key)
      DO UPDATE SET payload = EXCLUDED.payload, computed_at = EXCLUDED.computed_at
      `,
      [cacheKey, year, type, filters.stateCode, filters.bedroomSize, JSON.stringify(payload)]
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
