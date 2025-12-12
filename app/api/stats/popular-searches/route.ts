import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

type Segment = 'zip' | 'city' | 'county';

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS search_events (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      type VARCHAR(10) NOT NULL CHECK (type IN ('zip', 'city', 'county', 'address')),
      query TEXT NOT NULL,
      canonical_path TEXT
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_search_events_type_created ON search_events(type, created_at DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_search_events_query ON search_events(query);`;
}

function normalizeSegment(input: string | null): Segment {
  return input === 'city' || input === 'county' || input === 'zip' ? input : 'zip';
}

function normalizeLimit(input: string | null): number {
  const n = Number(input || '10');
  if (!Number.isFinite(n)) return 10;
  return Math.min(25, Math.max(3, Math.floor(n)));
}

function normalizeDays(input: string | null): number {
  const n = Number(input || '30');
  if (!Number.isFinite(n)) return 30;
  return Math.min(365, Math.max(1, Math.floor(n)));
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const type = normalizeSegment(sp.get('type'));
    const limit = normalizeLimit(sp.get('limit'));
    const days = normalizeDays(sp.get('days'));

    await ensureTable();

    let rows;
    if (type === 'zip') {
      // ZIPs can map to multiple counties. If we join directly, we can duplicate rows and
      // destabilize React keys in the UI. Instead: compute top queries first, then join a
      // deterministic "one row per ZIP" mapping.
      rows = await sql.query(
        `
        WITH popular AS (
          SELECT query, COUNT(*)::int AS count, MAX(created_at) AS last_seen
          FROM search_events
          WHERE type = $1
            AND created_at >= (NOW() - ($2::int * INTERVAL '1 day'))
          GROUP BY query
          ORDER BY count DESC, last_seen DESC
          LIMIT $3
        ),
        mapping AS (
          SELECT DISTINCT ON (zip_code) zip_code, county_name, state_code
          FROM zip_county_mapping
          ORDER BY zip_code, county_name
        )
        SELECT
          p.query,
          p.count,
          p.last_seen,
          m.county_name,
          m.state_code
        FROM popular p
        LEFT JOIN mapping m ON p.query = m.zip_code
        ORDER BY p.count DESC, p.last_seen DESC
        `,
        [type, days, limit]
      );
    } else {
      rows = await sql.query(
        `
        SELECT query, COUNT(*)::int AS count, MAX(created_at) AS last_seen
        FROM search_events
        WHERE type = $1
          AND created_at >= (NOW() - ($2::int * INTERVAL '1 day'))
        GROUP BY query
        ORDER BY count DESC, last_seen DESC
        LIMIT $3
        `,
        [type, days, limit]
      );
    }

    return NextResponse.json({
      type,
      days,
      items: rows.rows.map((r: any) => ({
        query: r.query,
        count: Number(r.count || 0),
        lastSeen: r.last_seen,
        countyName: r.county_name || null,
        stateCode: r.state_code || null,
      })),
    });
  } catch (error) {
    console.error('Popular searches error:', error);
    return NextResponse.json({ error: 'Failed to fetch popular searches' }, { status: 500 });
  }
}


