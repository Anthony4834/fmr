import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, execute } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/announcements
 * List all announcements (admin only, including future-dated)
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const rows = await query<{
      id: string;
      title: string;
      body_markdown: string;
      published_at: string;
      is_published: boolean;
      audience: string;
      sticky: boolean;
      ttl_minutes: number | null;
      exclusive: boolean;
      created_at: string;
      updated_at: string;
      read_count: string;
    }>(
      `SELECT a.id, a.title, a.body_markdown, a.published_at, a.is_published, a.audience,
              a.sticky, a.ttl_minutes, a.exclusive, a.created_at, a.updated_at,
              (SELECT COUNT(*)::int FROM announcement_reads ar WHERE ar.announcement_id = a.id) AS read_count
       FROM announcements a
       ORDER BY a.published_at DESC`
    );

    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        bodyMarkdown: r.body_markdown,
        publishedAt: r.published_at,
        isPublished: r.is_published,
        audience: r.audience,
        sticky: r.sticky,
        ttlMinutes: r.ttl_minutes,
        exclusive: r.exclusive,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        readCount: Number(r.read_count),
      }))
    );
  } catch (error) {
    console.error('Admin announcements list error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch announcements' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/announcements
 * Create announcement (admin only). Body: { title, bodyMarkdown, audience?, publishedAt? }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const {
      title,
      bodyMarkdown,
      audience,
      published_at: publishedAt,
      sticky,
      ttlMinutes,
      exclusive,
    } = body;

    if (!title || typeof title !== 'string') {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    const bodyContent =
      typeof bodyMarkdown === 'string' ? bodyMarkdown : '';
    const audienceVal =
      typeof audience === 'string' && audience ? audience : 'all';
    const published = publishedAt ? new Date(publishedAt) : new Date();
    if (isNaN(published.getTime())) {
      return NextResponse.json(
        { error: 'Invalid published_at date' },
        { status: 400 }
      );
    }
    const stickyVal = Boolean(sticky);
    const exclusiveVal = Boolean(exclusive);
    const ttlVal =
      ttlMinutes == null || ttlMinutes === ''
        ? null
        : (typeof ttlMinutes === 'number' ? ttlMinutes : parseInt(String(ttlMinutes), 10));
    if (ttlVal != null && (isNaN(ttlVal) || ttlVal < 1)) {
      return NextResponse.json(
        { error: 'ttlMinutes must be null or a positive integer' },
        { status: 400 }
      );
    }

    const result = await query<{ id: string }>(
      `INSERT INTO announcements (title, body_markdown, published_at, is_published, audience, sticky, ttl_minutes, exclusive, created_by_user_id)
       VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        title.trim(),
        bodyContent,
        published.toISOString(),
        audienceVal,
        stickyVal,
        ttlVal,
        exclusiveVal,
        session.user.id,
      ]
    );

    return NextResponse.json({
      success: true,
      id: result[0].id,
    });
  } catch (error) {
    console.error('Create announcement error:', error);
    return NextResponse.json(
      { error: 'Failed to create announcement' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/announcements
 * Delete all announcements (admin only).
 */
export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await execute(`DELETE FROM announcements`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete all announcements error:', error);
    return NextResponse.json(
      { error: 'Failed to delete announcements' },
      { status: 500 }
    );
  }
}
