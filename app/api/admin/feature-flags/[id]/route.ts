import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getAllForAdmin,
  updateFlag,
  archiveFlag,
  unarchiveFlag,
  invalidateCache,
  type RolloutTier,
} from '@/lib/feature-flags';

const VALID_TIERS: RolloutTier[] = ['admin', 'users', 'ga'];

function requireAdmin() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
}

function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

/**
 * GET /api/admin/feature-flags/:id
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return requireAdmin();
  }
  const { id } = await params;
  const flags = await getAllForAdmin();
  const flag = flags.find((f) => f.id === id);
  if (!flag) return notFound();
  return NextResponse.json(flag);
}

/**
 * PATCH /api/admin/feature-flags/:id
 * Body: { name?, description?, isEnabled?, rolloutTier? } + version for optimistic lock
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return requireAdmin();
  }
  const { id } = await params;
  try {
    const body = await request.json();
    const version = typeof body?.version === 'number' ? body.version : undefined;
    if (version === undefined) {
      return NextResponse.json(
        { error: 'version required for optimistic lock' },
        { status: 400 }
      );
    }

    const updates: {
      name?: string;
      description?: string;
      isEnabled?: boolean;
      rolloutTier?: RolloutTier;
    } = {};
    if (body?.name !== undefined)
      updates.name = typeof body.name === 'string' ? body.name : '';
    if (body?.description !== undefined)
      updates.description =
        typeof body.description === 'string' ? body.description : '';
    if (body?.isEnabled === true || body?.isEnabled === false)
      updates.isEnabled = body.isEnabled;
    if (VALID_TIERS.includes(body?.rolloutTier))
      updates.rolloutTier = body.rolloutTier;

    if (Object.keys(updates).length === 0) {
      const flags = await getAllForAdmin();
      const flag = flags.find((f) => f.id === id);
      if (!flag) return notFound();
      return NextResponse.json(flag);
    }

    const result = await updateFlag(
      id,
      updates,
      version,
      session.user.id
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: 'Conflict: flag was modified by another user' },
        { status: 409 }
      );
    }

    invalidateCache();
    return NextResponse.json(result.flag);
  } catch (err) {
    console.error('Admin feature-flags PATCH:', err);
    return NextResponse.json(
      { error: 'Failed to update flag' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/feature-flags/:id
 * Soft delete (archive).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return requireAdmin();
  }
  const { id } = await params;
  try {
    const result = await archiveFlag(id, session.user.id);

    if (!result.ok) {
      return notFound();
    }

    invalidateCache();
    return NextResponse.json(result.flag);
  } catch (err) {
    console.error('Admin feature-flags DELETE:', err);
    return NextResponse.json(
      { error: 'Failed to archive flag' },
      { status: 500 }
    );
  }
}
