import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type RentDisplayMode = 'effective' | 'fmr';

function isValidRentDisplayMode(v: unknown): v is RentDisplayMode {
  return v === 'effective' || v === 'fmr';
}

/**
 * GET /api/user/preferences
 * Returns the authenticated user's preferences.
 * Returns 401 (unauthenticated) or 200 with defaults when no row exists yet.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await query<{ rent_display_mode: RentDisplayMode }>(
    'SELECT rent_display_mode FROM user_preferences WHERE user_id = $1',
    [session.user.id]
  );

  const rentDisplayMode: RentDisplayMode = rows[0]?.rent_display_mode ?? 'effective';
  return NextResponse.json({ rentDisplayMode });
}

/**
 * PATCH /api/user/preferences
 * Upserts the authenticated user's preferences.
 * Body: { rentDisplayMode: 'effective' | 'fmr' }
 */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { rentDisplayMode } = body;
  if (!isValidRentDisplayMode(rentDisplayMode)) {
    return NextResponse.json(
      { error: 'rentDisplayMode must be "effective" or "fmr"' },
      { status: 400 }
    );
  }

  await query(
    `INSERT INTO user_preferences (user_id, rent_display_mode, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET rent_display_mode = EXCLUDED.rent_display_mode, updated_at = NOW()`,
    [session.user.id, rentDisplayMode]
  );

  return NextResponse.json({ rentDisplayMode });
}
