import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/announcements/[id]/readers
 * List readers (users and guests) who viewed this announcement (admin only).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id: announcementId } = await params;

    const rows = await query<{
      user_id: string | null;
      guest_id: string | null;
      read_at: string;
      email: string | null;
      name: string | null;
    }>(
      `SELECT ar.user_id, ar.guest_id, ar.read_at, u.email, u.name
       FROM announcement_reads ar
       LEFT JOIN users u ON u.id = ar.user_id
       WHERE ar.announcement_id = $1
       ORDER BY ar.read_at DESC`,
      [announcementId]
    );

    const readers = rows.map((r) => ({
      userId: r.user_id ?? undefined,
      guestId: r.guest_id ?? undefined,
      readAt: r.read_at,
      email: r.email ?? undefined,
      name: r.name ?? undefined,
    }));

    return NextResponse.json({ readers });
  } catch (error) {
    console.error('Announcement readers error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch readers' },
      { status: 500 }
    );
  }
}
