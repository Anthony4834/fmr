import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { auth } from '@/lib/auth';

/**
 * PATCH /api/admin/users/[userId]/tier
 * Updates a user's tier (admin only)
 */
export async function PATCH(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await auth();

    // Check if user is admin
    if (!session || !session.user || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { tier } = body;

    if (!tier || !['free', 'paid', 'free_forever'].includes(tier)) {
      return NextResponse.json(
        { error: 'Invalid tier. Must be "free", "paid", or "free_forever"' },
        { status: 400 }
      );
    }

    const userId = params.userId;

    // Update user tier
    await query(
      'UPDATE users SET tier = $1, updated_at = NOW() WHERE id = $2',
      [tier, userId]
    );

    return NextResponse.json({
      success: true,
      message: 'User tier updated successfully',
    });
  } catch (error) {
    console.error('Update user tier error:', error);
    return NextResponse.json(
      { error: 'Failed to update user tier' },
      { status: 500 }
    );
  }
}
