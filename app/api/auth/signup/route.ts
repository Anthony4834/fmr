import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { hashPassword, validatePassword, PASSWORD_MIN_LENGTH } from '@/lib/auth';

/**
 * POST /api/auth/signup
 * Create a new user account with email/password.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    // Validate required fields
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.error },
        { status: 400 }
      );
    }

    // Check for existing user (case-insensitive)
    const existing = await query<{ id: string }>(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (existing.length > 0) {
      // SECURITY: Generic error to prevent email enumeration
      // Don't reveal that the email already exists
      return NextResponse.json(
        { error: 'Unable to create account. Please try again or use a different email.' },
        { status: 400 }
      );
    }

    // Hash password with bcrypt
    const passwordHash = await hashPassword(password);

    // Create user
    const result = await query<{ id: string; email: string }>(
      `INSERT INTO users (email, name, password_hash, tier)
       VALUES (LOWER($1), $2, $3, 'free')
       RETURNING id, email`,
      [email, name || null, passwordHash]
    );

    return NextResponse.json({
      success: true,
      user: {
        id: result[0].id,
        email: result[0].email,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'An error occurred while creating your account' },
      { status: 500 }
    );
  }
}
