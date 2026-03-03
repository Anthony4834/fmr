import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getAllForAdmin,
  createFlag,
  invalidateCache,
  type RolloutTier,
} from '@/lib/feature-flags';

const VALID_TIERS: RolloutTier[] = ['admin', 'users', 'ga'];

function requireAdmin() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
}

/**
 * GET /api/admin/feature-flags
 * Admin only. Returns all flags (including archived). Always 200.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return requireAdmin();
  }
  try {
    const flags = await getAllForAdmin();
    return NextResponse.json(flags);
  } catch {
    return NextResponse.json([]);
  }
}

/**
 * POST /api/admin/feature-flags
 * Admin only. Create flag. Body: { key, name?, description?, isEnabled?, rolloutTier? }
 * Defaults: isEnabled=false, rolloutTier=admin
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return requireAdmin();
  }
  try {
    const body = await request.json();
    const key = typeof body?.key === 'string' ? body.key.trim() : '';
    if (!key || key.length > 100) {
      return NextResponse.json(
        { error: 'key is required, max 100 chars' },
        { status: 400 }
      );
    }

    const isEnabled = body?.isEnabled === true;
    const rolloutTier = VALID_TIERS.includes(body?.rolloutTier)
      ? body.rolloutTier
      : 'admin';
    const flag = await createFlag(
      {
        key,
        name: body?.name,
        description: body?.description,
        isEnabled,
        rolloutTier,
      },
      session.user.id
    );

    if (!flag) {
      return NextResponse.json(
        { error: 'Failed to create flag (maybe key exists)' },
        { status: 500 }
      );
    }

    invalidateCache();
    return NextResponse.json(flag);
  } catch (err) {
    console.error('Admin feature-flags POST:', err);
    return NextResponse.json(
      { error: 'Failed to create flag' },
      { status: 500 }
    );
  }
}
