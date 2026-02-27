import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

/**
 * GET /api/announcements/read-state
 * Logged-in only. Returns { lastReadAt: string } (ISO). Default epoch if never read.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rows = await query<{ last_read_at: string }>(
      `SELECT last_read_at FROM announcements_last_viewed WHERE user_id = $1`,
      [session.user.id]
    );

    const lastReadAt =
      rows.length > 0 ? new Date(rows[0].last_read_at).toISOString() : EPOCH_ISO;

    return NextResponse.json({ lastReadAt });
  } catch (error) {
    console.error('Read state error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch read state' },
      { status: 500 }
    );
  }
}
