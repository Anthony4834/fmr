import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, execute } from '@/lib/db';
import { hashPassword, validatePassword } from '@/lib/auth';
import { generateResetToken, sendPasswordResetEmail } from '@/lib/email';
import bcrypt from 'bcryptjs';

/**
 * POST /api/admin/users
 * Create a new user (admin only)
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    
    // Check if user is admin
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email, name, tier, role, password, sendSetupEmail } = body;

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

    // Validate tier
    if (tier && !['free', 'paid'].includes(tier)) {
      return NextResponse.json(
        { error: 'Invalid tier' },
        { status: 400 }
      );
    }

    // Validate role
    if (role && !['user', 'admin'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existing = await query<{ id: string }>(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    let passwordHash: string | null = null;
    let emailVerified = new Date(); // Admin-created users are trusted

    // Handle password setup
    if (sendSetupEmail) {
      // Generate reset token for setup email
      const token = generateResetToken();
      const tokenHash = await bcrypt.hash(token, 10);

      // Store reset token
      await execute(
        `INSERT INTO verification_tokens (identifier, token_hash, expires, type) 
         VALUES ($1, $2, NOW() + INTERVAL '7 days', $3)`,
        [email.toLowerCase(), tokenHash, 'password_reset']
      );

      // Send setup email
      const setupUrl = `${process.env.NEXTAUTH_URL}/auth/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
      await sendPasswordResetEmail(email, setupUrl);
    } else if (password) {
      // Validate password if provided
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        return NextResponse.json(
          { error: passwordValidation.error },
          { status: 400 }
        );
      }
      passwordHash = await hashPassword(password);
    } else {
      return NextResponse.json(
        { error: 'Either password or sendSetupEmail must be provided' },
        { status: 400 }
      );
    }

    // Create user
    const result = await query<{ id: string; email: string }>(
      `INSERT INTO users (email, name, password_hash, tier, role, email_verified, signup_method)
       VALUES (LOWER($1), $2, $3, $4, $5, $6, 'admin_created')
       RETURNING id, email`,
      [
        email,
        name || null,
        passwordHash,
        tier || 'free',
        role || 'user',
        emailVerified,
      ]
    );

    return NextResponse.json({
      success: true,
      user: {
        id: result[0].id,
        email: result[0].email,
      },
    });
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json(
      { error: 'An error occurred while creating the user' },
      { status: 500 }
    );
  }
}
