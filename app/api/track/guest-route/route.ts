import { NextRequest, NextResponse } from 'next/server';
import { getGuestIdFromRequest } from '@/lib/guest-tracking';
import { execute } from '@/lib/db';

/** Script/bot guest IDs we do not track (from middleware) */
const SCRIPT_GUEST_ID = '00000000-0000-4000-8000-000000000000';
const BOT_GUEST_ID = '00000000-0000-4000-8000-000000000001';

const MAX_PATH_LENGTH = 500;

function normalizePath(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const path = input.trim();
  if (!path || path.startsWith('/api') || path.startsWith('/_next')) return null;
  return path.slice(0, MAX_PATH_LENGTH) || null;
}

async function ensureTable(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS guest_route_hits (
      id BIGSERIAL PRIMARY KEY,
      guest_id UUID NOT NULL,
      path TEXT NOT NULL,
      hit_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await execute(
    `CREATE INDEX IF NOT EXISTS idx_guest_route_hits_guest_id_hit_at ON guest_route_hits(guest_id, hit_at DESC)`
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const path = normalizePath(body.path);
    if (!path) {
      return NextResponse.json({ ok: true });
    }

    const guestId = getGuestIdFromRequest(request);
    if (!guestId || guestId === SCRIPT_GUEST_ID || guestId === BOT_GUEST_ID) {
      return NextResponse.json({ ok: true });
    }

    // Return immediately; write in background (fire-and-forget)
    Promise.resolve().then(async () => {
      try {
        await ensureTable();
        await execute(
          `INSERT INTO guest_route_hits (guest_id, path, hit_at) VALUES ($1, $2, NOW())`,
          [guestId, path]
        );
      } catch (err) {
        console.error('Guest route track error:', err);
      }
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
