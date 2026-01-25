import { NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { validatePassword, hashPassword } from '@/lib/auth';
import { sendPasswordChangedEmail } from '@/lib/email';
import bcrypt from 'bcryptjs';

/**
 * POST /api/auth/reset-password
 * Reset password using token from email link
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, token, password } = body;

    // Validate required fields
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Reset token is required' },
        { status: 400 }
      );
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    // Validate password meets requirements
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.error },
        { status: 400 }
      );
    }

    // Get token from DB
    const tokens = await query<{ token_hash: string; expires: Date }>(
      `SELECT token_hash, expires FROM verification_tokens 
       WHERE identifier = $1 AND type = $2`,
      [email.toLowerCase(), 'password_reset']
    );

    // Check if token exists and not expired
    if (!tokens.length || new Date(tokens[0].expires) < new Date()) {
      return NextResponse.json(
        { error: 'Invalid or expired reset link' },
        { status: 400 }
      );
    }

    // Verify token with bcrypt
    const isValid = await bcrypt.compare(token, tokens[0].token_hash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid or expired reset link' },
        { status: 400 }
      );
    }

    // Delete token (single-use)
    await execute(
      'DELETE FROM verification_tokens WHERE identifier = $1 AND type = $2',
      [email.toLowerCase(), 'password_reset']
    );

    // Hash new password
    const passwordHash = await hashPassword(password);

    // Update password and clear any lockout
    await execute(
      `UPDATE users 
       SET password_hash = $1, locked_until = NULL 
       WHERE LOWER(email) = LOWER($2)`,
      [passwordHash, email]
    );

    // Invalidate all existing sessions by deleting OAuth accounts
    // Note: NextAuth sessions are JWT-based, so they'll expire naturally
    // For more aggressive invalidation, we could add a session_version column
    // and increment it here, then check it in the JWT callback

    // Send confirmation email (security notification)
    sendPasswordChangedEmail(email).catch(err => {
      console.error('Failed to send password changed email:', err);
    });

    // Return success - NO auto-login per OWASP
    return NextResponse.json({
      success: true,
      message: 'Password updated. Please log in with your new password.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: 'An error occurred while resetting your password' },
      { status: 500 }
    );
  }
}
