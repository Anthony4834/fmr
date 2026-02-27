import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { execute } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/announcements/mark-all-read
 * Logged-in only. Body { lastReadAt: string } (ISO). Monotonic: server keeps max(existing, input).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const lastReadAt = body?.lastReadAt;
    if (typeof lastReadAt !== 'string' || !lastReadAt.trim()) {
      return NextResponse.json(
        { error: 'lastReadAt (ISO string) required' },
        { status: 400 }
      );
    }

    const date = new Date(lastReadAt);
    if (isNaN(date.getTime())) {
      return NextResponse.json(
        { error: 'Invalid lastReadAt' },
        { status: 400 }
      );
    }

    const iso = date.toISOString();

    await execute(
      `INSERT INTO announcements_last_viewed (user_id, last_read_at, updated_at)
       VALUES ($1, $2::timestamptz, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET last_read_at = greatest(announcements_last_viewed.last_read_at, $2::timestamptz),
           updated_at = NOW()`,
      [session.user.id, iso]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Mark all read error:', error);
    return NextResponse.json(
      { error: 'Failed to mark all read' },
      { status: 500 }
    );
  }
}
