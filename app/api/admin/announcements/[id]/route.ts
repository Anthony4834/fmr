import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { execute } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/announcements/[id]
 * Update announcement (admin only). Supports title, bodyMarkdown, published_at, is_published, audience.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const {
      title,
      bodyMarkdown,
      published_at: publishedAt,
      isPublished,
      audience,
      sticky,
      ttlMinutes,
      exclusive,
    } = body;

    const updates: string[] = [];
    const values: (string | number | boolean)[] = [];
    let paramIndex = 1;

    if (title !== undefined) {
      if (typeof title !== 'string') {
        return NextResponse.json(
          { error: 'Title must be a string' },
          { status: 400 }
        );
      }
      updates.push(`title = $${paramIndex++}`);
      values.push(title.trim());
    }

    if (bodyMarkdown !== undefined) {
      updates.push(`body_markdown = $${paramIndex++}`);
      values.push(typeof bodyMarkdown === 'string' ? bodyMarkdown : '');
    }

    if (publishedAt !== undefined) {
      const published = new Date(publishedAt);
      if (isNaN(published.getTime())) {
        return NextResponse.json(
          { error: 'Invalid published_at date' },
          { status: 400 }
        );
      }
      updates.push(`published_at = $${paramIndex++}`);
      values.push(published.toISOString());
    }

    if (isPublished !== undefined) {
      updates.push(`is_published = $${paramIndex++}`);
      values.push(Boolean(isPublished));
    }

    if (audience !== undefined) {
      updates.push(`audience = $${paramIndex++}`);
      values.push(typeof audience === 'string' ? audience : 'all');
    }

    if (sticky !== undefined) {
      updates.push(`sticky = $${paramIndex++}`);
      values.push(Boolean(sticky));
    }
    if (ttlMinutes !== undefined) {
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
      updates.push(`ttl_minutes = $${paramIndex++}`);
      values.push(ttlVal);
    }
    if (exclusive !== undefined) {
      updates.push(`exclusive = $${paramIndex++}`);
      values.push(Boolean(exclusive));
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await execute(
      `UPDATE announcements SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update announcement error:', error);
    return NextResponse.json(
      { error: 'Failed to update announcement' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/announcements/[id]
 * Delete announcement (admin only)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;

    await execute(`DELETE FROM announcements WHERE id = $1`, [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete announcement error:', error);
    return NextResponse.json(
      { error: 'Failed to delete announcement' },
      { status: 500 }
    );
  }
}
