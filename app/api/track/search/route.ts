import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

type TrackType = 'zip' | 'city' | 'county' | 'address';

function normalizeType(input: unknown): TrackType | null {
  if (input === 'zip' || input === 'city' || input === 'county' || input === 'address') return input;
  return null;
}

function normalizeQuery(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const q = input.trim();
  if (!q) return null;
  // Hard cap to keep row sizes small.
  return q.slice(0, 200);
}

async function ensureTable() {
  // Safe for dev environments: create-if-not-exists
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const type = normalizeType(body.type);
    const query = normalizeQuery(body.query);
    const canonicalPath = typeof body.canonicalPath === 'string' ? body.canonicalPath.slice(0, 300) : null;

    if (!type || !query) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // Avoid storing specific addresses.
    if (type === 'address') {
      return NextResponse.json({ ok: true });
    }

    await ensureTable();
    await sql`
      INSERT INTO search_events (type, query, canonical_path)
      VALUES (${type}, ${query}, ${canonicalPath})
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Never fail the UI because tracking failed.
    console.error('Search tracking error:', error);
    return NextResponse.json({ ok: true });
  }
}


