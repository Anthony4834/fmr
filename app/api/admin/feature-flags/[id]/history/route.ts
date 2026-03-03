import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getFlagHistory } from '@/lib/feature-flags';

function requireAdmin() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
}

/**
 * GET /api/admin/feature-flags/:id/history
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
  const history = await getFlagHistory(id);
  return NextResponse.json(history);
}
