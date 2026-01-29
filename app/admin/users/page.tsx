import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import UsersAdminClient from './UsersAdminClient';

export const metadata: Metadata = {
  title: 'User Management | Admin | fmr.fyi',
  description: 'Manage users, roles, and tiers',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function UsersAdminPage({
  searchParams,
}: {
  searchParams: { page?: string; search?: string };
}) {
  // Require admin access
  const session = await auth();
  if (!session || !session.user || session.user.role !== 'admin') {
    redirect('/');
  }

  const page = parseInt(searchParams.page || '1', 10);
  const search = searchParams.search || '';
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  let whereClause = '1=1';
  const params: any[] = [];
  let paramIndex = 1;

  if (search) {
    whereClause += ` AND LOWER(email) LIKE LOWER($${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  const users = await query<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    tier: string;
    signup_method: string | null;
    created_at: string;
    last_seen: string | null;
  }>(
    `SELECT id, email, name, role, tier, signup_method, created_at, last_seen 
     FROM users 
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, pageSize, offset]
  );

  const countResult = await query<{ total: string }>(
    `SELECT COUNT(*) as total FROM users WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult[0]?.total || '0', 10);
  const totalPages = Math.ceil(total / pageSize);

  const formattedUsers = users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tier: user.tier,
    signupMethod: user.signup_method,
    createdAt: user.created_at,
    lastSeen: user.last_seen,
  }));

  return (
    <UsersAdminClient
      initialUsers={formattedUsers}
      initialPage={page}
      initialTotal={total}
      initialTotalPages={totalPages}
      initialSearch={search}
    />
  );
}
