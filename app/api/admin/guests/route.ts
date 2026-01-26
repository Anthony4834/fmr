import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(request: NextRequest) {
  // Require admin access
  const session = await auth();
  if (!session || !session.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = (page - 1) * limit;
  
  // Filters
  const limitHit = searchParams.get('limit_hit'); // 'true' or 'false'
  const converted = searchParams.get('converted'); // 'true' or 'false'
  const search = searchParams.get('search'); // Search by guest_id

  // Build WHERE clause
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (limitHit === 'true') {
    conditions.push(`limit_hit_at IS NOT NULL`);
  } else if (limitHit === 'false') {
    conditions.push(`limit_hit_at IS NULL`);
  }

  if (converted === 'true') {
    conditions.push(`converted_user_id IS NOT NULL`);
  } else if (converted === 'false') {
    conditions.push(`converted_user_id IS NULL`);
  }

  if (search) {
    conditions.push(`guest_id::text ILIKE $${paramIndex}`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM guests ${whereClause}`,
    params
  );
  const total = parseInt(countResult[0]?.count || '0', 10);
  const totalPages = Math.ceil(total / limit);

  // Get guests
  const guests = await query<{
    id: number;
    guest_id: string;
    ip_hash: string;
    ua_hash: string;
    first_seen: Date;
    last_seen: Date;
    request_count: number;
    limit_hit_at: Date | null;
    converted_user_id: string | null;
    conversion_reason: string | null;
    user_email: string | null;
  }>(
    `SELECT 
      g.id,
      g.guest_id,
      g.ip_hash,
      g.ua_hash,
      g.first_seen,
      g.last_seen,
      g.request_count,
      g.limit_hit_at,
      g.converted_user_id,
      g.conversion_reason,
      u.email as user_email
    FROM guests g
    LEFT JOIN users u ON g.converted_user_id = u.id
    ${whereClause}
    ORDER BY g.last_seen DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  return NextResponse.json({
    guests,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  });
}
