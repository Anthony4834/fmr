import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { auth } from '@/lib/auth';

/**
 * POST /api/admin/promote
 * Promotes a user to admin role using the admin secret.
 * 
 * Body: { email: string, secret: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, secret } = body;

    // Validate inputs
    if (!email || !secret) {
      return NextResponse.json(
        { error: 'Email and secret are required' },
        { status: 400 }
      );
    }

    // Validate admin secret
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) {
      console.error('ADMIN_SECRET environment variable is not set');
      return NextResponse.json(
        { error: 'Admin promotion is not configured' },
        { status: 500 }
      );
    }

    if (secret !== adminSecret) {
      return NextResponse.json(
        { error: 'Invalid admin secret' },
        { status: 403 }
      );
    }

    // Check if user exists
    const users = await query<{ id: string; email: string; role: string }>(
      'SELECT id, email, role FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (users.length === 0) {
      return NextResponse.json(
        { error: 'User not found. Please register first.' },
        { status: 404 }
      );
    }

    const user = users[0];

    // If already admin, return success
    if (user.role === 'admin') {
      return NextResponse.json({
        success: true,
        message: 'User is already an admin',
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      });
    }

    // Promote to admin
    await query(
      'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2',
      ['admin', user.id]
    );

    return NextResponse.json({
      success: true,
      message: 'User promoted to admin successfully',
      user: {
        id: user.id,
        email: user.email,
        role: 'admin',
      },
    });
  } catch (error) {
    console.error('Admin promotion error:', error);
    return NextResponse.json(
      { error: 'Failed to promote user' },
      { status: 500 }
    );
  }
}
