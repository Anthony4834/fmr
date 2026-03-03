import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { archiveFlag, invalidateCache } from '@/lib/feature-flags';

function requireAdmin() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
}

function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

/**
 * POST /api/admin/feature-flags/:id/archive
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
    const result = await archiveFlag(id, session.user.id);
    if (!result.ok) return notFound();
    invalidateCache();
    return NextResponse.json(result.flag);
  } catch (err) {
    console.error('Archive flag:', err);
    return NextResponse.json(
      { error: 'Failed to archive' },
      { status: 500 }
    );
  }
}
