import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { execute, query } from '@/lib/db';
import { getGuestIdFromRequest } from '@/lib/guest-tracking';

export const dynamic = 'force-dynamic';

/**
 * POST /api/announcements/view
 * Record that the current viewer (user or guest) viewed an announcement. Idempotent.
 * Body: { announcementId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const guestId = getGuestIdFromRequest(request);

    if (!session?.user?.id && !guestId) {
      return NextResponse.json(
        { error: 'No viewer to record' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const announcementId = body?.announcementId;
    if (typeof announcementId !== 'string' || !announcementId.trim()) {
      return NextResponse.json(
        { error: 'announcementId is required' },
        { status: 400 }
      );
    }

    // Verify announcement exists and is published (optional: only count views for visible announcements)
    const exists = await query<{ id: string }>(
      `SELECT id FROM announcements WHERE id = $1 AND is_published = true AND published_at <= NOW()`,
      [announcementId]
    );
    if (exists.length === 0) {
      return NextResponse.json({ success: true }); // idempotent: don't leak existence
    }

    if (session?.user?.id) {
      await execute(
        `INSERT INTO announcement_reads (announcement_id, user_id, read_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (announcement_id, user_id) WHERE user_id IS NOT NULL DO NOTHING`,
        [announcementId, session.user.id]
      );
    } else if (guestId) {
      await execute(
        `INSERT INTO announcement_reads (announcement_id, guest_id, read_at)
         VALUES ($1, $2::uuid, NOW())
         ON CONFLICT (announcement_id, guest_id) WHERE guest_id IS NOT NULL DO NOTHING`,
        [announcementId, guestId]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Announcement view error:', error);
    return NextResponse.json(
      { error: 'Failed to record view' },
      { status: 500 }
    );
  }
}
