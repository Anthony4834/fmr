import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { unarchiveFlag, invalidateCache } from '@/lib/feature-flags';

function requireAdmin() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
}

function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

/**
 * POST /api/admin/feature-flags/:id/unarchive
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return requireAdmin();
  }
  const { id } = await params;
  try {
    const result = await unarchiveFlag(id, session.user.id);
    if (!result.ok) return notFound();
    invalidateCache();
    return NextResponse.json(result.flag);
  } catch (err) {
    console.error('Unarchive flag:', err);
    return NextResponse.json(
      { error: 'Failed to unarchive' },
      { status: 500 }
    );
  }
}
