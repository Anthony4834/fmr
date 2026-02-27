import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/announcements
 * Public: list published announcements and latestPublishedAt (for client-side unread badge).
 */
export async function GET() {
  try {
    const rows = await query<{
      id: string;
      title: string;
      body_markdown: string;
      published_at: string;
    }>(
      `SELECT id, title, body_markdown, published_at
       FROM announcements
       WHERE is_published = true AND published_at <= NOW()
       ORDER BY published_at DESC`
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
