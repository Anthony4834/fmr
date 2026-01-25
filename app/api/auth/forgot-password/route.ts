import { NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { checkPasswordResetAllowed, normalizeResponseTime } from '@/lib/auth-rate-limit';
import { generateResetToken, sendPasswordResetEmail } from '@/lib/email';
import bcrypt from 'bcryptjs';

/**
 * Extract IP address from request headers
 */
function getClientIP(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

/**
 * POST /api/auth/forgot-password
 * Request password reset link via email
 */
export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { email } = body;

    // Validate required fields
    if (!email || typeof email !== 'string') {
      await normalizeResponseTime(startTime);
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      await normalizeResponseTime(startTime);
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Rate limiting check (per email + per IP)
    const ip = getClientIP(request);
    const rateLimitCheck = await checkPasswordResetAllowed(email, ip);
    if (!rateLimitCheck.allowed) {
      await normalizeResponseTime(startTime);
      return NextResponse.json(
        { error: rateLimitCheck.reason || 'Too many password reset requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': rateLimitCheck.retryAfter?.toString() || '3600',
          },
        }
      );
    }

    // Check if user exists (but don't reveal)
    const users = await query<{ id: string }>(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    // Generate token regardless (anti-enumeration)
    const token = generateResetToken();
    const tokenHash = await bcrypt.hash(token, 10);

    // Only store and send if user exists
    if (users.length > 0) {
      // Delete existing reset tokens
      await execute(
        'DELETE FROM verification_tokens WHERE identifier = $1 AND type = $2',
        [email.toLowerCase(), 'password_reset']
      );

      // Store with 1-hour expiry
      await execute(
        `INSERT INTO verification_tokens (identifier, token_hash, expires, type) 
         VALUES ($1, $2, NOW() + INTERVAL '1 hour', $3)`,
        [email.toLowerCase(), tokenHash, 'password_reset']
      );

      const resetUrl = `${process.env.NEXTAUTH_URL}/auth/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
      
      // Send email (fire-and-forget)
      sendPasswordResetEmail(email, resetUrl).catch(err => {
        console.error('Failed to send password reset email:', err);
      });
    }

    // Normalize response time
    await normalizeResponseTime(startTime, 500, 800);

    // Same response regardless of user existence (anti-enumeration)
    return NextResponse.json({
      success: true,
      message: 'If an account exists, you will receive a reset link',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    await normalizeResponseTime(startTime);
    return NextResponse.json(
      { error: 'An error occurred while processing your request' },
      { status: 500 }
    );
  }
}
