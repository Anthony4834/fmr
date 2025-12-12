import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

type Segment = 'zip' | 'city' | 'county';

export const dynamic = 'force-dynamic';

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

function normalizeYear(input: string | null): number {
  const n = Number(input || '2026');
  if (!Number.isFinite(n)) return 2026;
  return Math.min(2100, Math.max(2000, Math.floor(n)));
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const type = normalizeSegment(sp.get('type'));
    const limit = normalizeLimit(sp.get('limit'));
    const days = normalizeDays(sp.get('days'));
    const year = normalizeYear(sp.get('year'));

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
        ),
        rates AS (
          SELECT zip_code, bedroom_0, bedroom_1, bedroom_2, bedroom_3, bedroom_4
          FROM safmr_data
          WHERE year = $4
        )
        SELECT
          p.query,
          p.count,
          p.last_seen,
          m.county_name,
          m.state_code,
          r.bedroom_0,
          r.bedroom_2,
          r.bedroom_4
        FROM popular p
        LEFT JOIN mapping m ON p.query = m.zip_code
        LEFT JOIN rates r ON p.query = r.zip_code
        ORDER BY p.count DESC, p.last_seen DESC
        `,
        [type, days, limit, year]
      );
    } else if (type === 'city') {
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
        parsed AS (
          SELECT
            p.query,
            p.count,
            p.last_seen,
            btrim(split_part(p.query, ',', 1)) AS city_name,
            upper(btrim(split_part(p.query, ',', 2))) AS state_code
          FROM popular p
        ),
        zips AS (
          SELECT
            pr.query,
            pr.count,
            pr.last_seen,
            pr.city_name,
            pr.state_code,
            unnest(c.zip_codes)::text AS zip_code
          FROM parsed pr
          JOIN cities c
            ON c.city_name ILIKE pr.city_name
           AND c.state_code = pr.state_code
          WHERE c.zip_codes IS NOT NULL AND array_length(c.zip_codes, 1) > 0
        ),
        agg AS (
          SELECT
            z.query,
            z.count,
            z.last_seen,
            z.city_name,
            z.state_code,
            AVG(sd.bedroom_0) AS bedroom_0,
            AVG(sd.bedroom_2) AS bedroom_2,
            AVG(sd.bedroom_4) AS bedroom_4,
            COUNT(DISTINCT sd.zip_code)::int AS zip_count
          FROM zips z
          JOIN safmr_data sd
            ON sd.zip_code = z.zip_code
           AND sd.year = $4
          GROUP BY z.query, z.count, z.last_seen, z.city_name, z.state_code
        )
        SELECT * FROM agg
        ORDER BY count DESC, last_seen DESC
        `,
        [type, days, limit, year]
      );
    } else if (type === 'county') {
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
        parsed AS (
          SELECT
            p.query,
            p.count,
            p.last_seen,
            btrim(split_part(p.query, ',', 1)) AS county_raw,
            upper(btrim(split_part(p.query, ',', 2))) AS state_code,
            regexp_replace(btrim(split_part(p.query, ',', 1)), '\\s+County\\s*$', '', 'i') AS county_base
          FROM popular p
        )
        SELECT DISTINCT ON (pr.query)
          pr.query,
          pr.count,
          pr.last_seen,
          pr.county_raw AS county_name,
          pr.state_code,
          fd.bedroom_0,
          fd.bedroom_2,
          fd.bedroom_4
        FROM parsed pr
        LEFT JOIN fmr_data fd
          ON fd.year = $4
         AND fd.state_code = pr.state_code
         AND (
           fd.area_name ILIKE pr.county_raw
           OR fd.area_name ILIKE (pr.county_base || ' County%')
         )
        ORDER BY pr.query,
          CASE WHEN fd.area_name ILIKE (pr.county_base || ' County%') THEN 1 ELSE 2 END
        `,
        [type, days, limit, year]
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
      year,
      items: rows.rows.map((r: any) => ({
        query: r.query,
        count: Number(r.count || 0),
        lastSeen: r.last_seen,
        countyName: r.county_name || null,
        stateCode: r.state_code || null,
        zipCount: r.zip_count ?? null,
        bedroom0: r.bedroom_0 !== undefined && r.bedroom_0 !== null ? Number(r.bedroom_0) : null,
        bedroom2: r.bedroom_2 !== undefined && r.bedroom_2 !== null ? Number(r.bedroom_2) : null,
        bedroom4: r.bedroom_4 !== undefined && r.bedroom_4 !== null ? Number(r.bedroom_4) : null,
      })),
    });
  } catch (error) {
    console.error('Popular searches error:', error);
    return NextResponse.json({ error: 'Failed to fetch popular searches' }, { status: 500 });
  }
}


