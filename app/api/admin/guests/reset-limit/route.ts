import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { execute, query } from '@/lib/db';
import { resetGuestRateLimit, resetAllGuestRateLimits } from '@/lib/rate-limit';

/**
 * POST /api/admin/guests/reset-limit
 * Reset rate limit for a specific guest or all guests
 */
export async function POST(request: NextRequest) {
  // Require admin access
  const session = await auth();
  if (!session || !session.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { guestId, resetAll } = body;

    if (resetAll) {
      // Reset all guest rate limits
      await resetAllGuestRateLimits();
      
      // Clear limit_hit_at for all guests in database
      await execute(
        `UPDATE guests SET limit_hit_at = NULL, updated_at = NOW() WHERE limit_hit_at IS NOT NULL`
      );

      // Get count of guests that had limits reset (those that had limit_hit_at set)
      const resetCountResult = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM guests WHERE updated_at >= NOW() - INTERVAL '1 second' AND limit_hit_at IS NULL`
      );
      const resetCount = parseInt(resetCountResult[0]?.count || '0', 10);

      return NextResponse.json({
        success: true,
        message: 'All guest rate limits reset successfully',
        resetCount,
      });
    } else if (guestId) {
      // Reset specific guest rate limit
      await resetGuestRateLimit(guestId);
      
      // Clear limit_hit_at for this guest in database
      await execute(
        `UPDATE guests SET limit_hit_at = NULL, updated_at = NOW() WHERE guest_id = $1`,
        [guestId]
      );

      return NextResponse.json({
        success: true,
        message: 'Guest rate limit reset successfully',
        guestId,
      });
    } else {
      return NextResponse.json(
        { error: 'Either guestId or resetAll must be provided' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error resetting rate limit:', error);
    return NextResponse.json(
      { error: 'Failed to reset rate limit' },
      { status: 500 }
    );
  }
}
