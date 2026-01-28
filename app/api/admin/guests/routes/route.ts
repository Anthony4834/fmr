import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

const DEFAULT_LIMIT = 200;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const guestId = request.nextUrl.searchParams.get('guest_id');
  if (!guestId?.trim()) {
    return NextResponse.json({ error: 'guest_id required' }, { status: 400 });
  }

  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
    500
  );

  try {
    const rows = await query<{ path: string; hit_at: Date }>(
      `SELECT path, hit_at
       FROM guest_route_hits
       WHERE guest_id = $1
       ORDER BY hit_at DESC
       LIMIT $2`,
      [guestId.trim(), limit]
    );
    return NextResponse.json({ routes: rows });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('does not exist') || msg.includes('relation')) {
      return NextResponse.json({ routes: [] });
    }
    console.error('Admin guests routes error:', err);
    return NextResponse.json({ error: 'Failed to fetch routes' }, { status: 500 });
  }
}
