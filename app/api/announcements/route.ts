import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { getGuestIdFromRequest } from '@/lib/guest-tracking';

export const dynamic = 'force-dynamic';

/**
 * GET /api/announcements
 * Public: list published announcements and latestPublishedAt (for client-side unread badge).
 * Filters by sticky/TTL, exclusive (viewer created before publish), and audience.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const guestId = getGuestIdFromRequest(request);

    let viewerCreatedAt: string | null = null;
    let isLoggedIn = false;
    let isGuest = false;

    if (session?.user?.id) {
      isLoggedIn = true;
      const userRows = await query<{ created_at: string }>(
        `SELECT created_at FROM users WHERE id = $1`,
        [session.user.id]
      );
      if (userRows.length > 0) viewerCreatedAt = userRows[0].created_at;
    } else if (guestId) {
      isGuest = true;
      const guestRows = await query<{ first_seen: string }>(
        `SELECT first_seen FROM guests WHERE guest_id = $1`,
        [guestId]
      );
      if (guestRows.length > 0) viewerCreatedAt = guestRows[0].first_seen;
    }

    const rows = await query<{
      id: string;
      title: string;
      body_markdown: string;
      published_at: string;
    }>(
      `SELECT id, title, body_markdown, published_at
       FROM announcements
       WHERE is_published = true
         AND published_at <= NOW()
         AND (
           sticky = true
           OR ttl_minutes IS NULL
           OR (published_at + (ttl_minutes * interval '1 minute') > NOW())
         )
         AND (
           audience = 'all'
           OR (audience = 'logged_in' AND $1::boolean)
           OR (audience = 'guests' AND $2::boolean)
         )
         AND (
           exclusive = false
           OR (
             $3::timestamptz IS NOT NULL
             AND $3::timestamptz < published_at
           )
         )
       ORDER BY published_at DESC`,
      [isLoggedIn, isGuest, viewerCreatedAt]
    );

    const announcements = rows.map((r) => ({
      id: r.id,
      title: r.title,
      bodyMarkdown: r.body_markdown,
      publishedAt: r.published_at,
    }));

    const latestPublishedAt =
      rows.length > 0 ? rows[0].published_at : null;

    return NextResponse.json({
      announcements,
      latestPublishedAt,
    });
  } catch (error) {
    console.error('Announcements list error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch announcements' },
      { status: 500 }
    );
  }
}
