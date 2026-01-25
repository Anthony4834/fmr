import { NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { checkResendAllowed, normalizeResponseTime } from '@/lib/auth-rate-limit';
import { generateVerificationCode, sendVerificationEmail } from '@/lib/email';
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
 * POST /api/auth/resend-verification
 * Resend verification code to user's email
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

    // Check if user exists and is unverified
    const users = await query<{ id: string; email_verified: string | null }>(
      'SELECT id, email_verified FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    // Rate limiting check (per email)
    const rateLimitCheck = await checkResendAllowed(email);
    if (!rateLimitCheck.allowed) {
      await normalizeResponseTime(startTime);
      return NextResponse.json(
        { error: rateLimitCheck.reason || 'Too many resend requests. Please wait before requesting another code.' },
        {
          status: 429,
          headers: {
            'Retry-After': rateLimitCheck.retryAfter?.toString() || '900',
          },
        }
      );
    }

    // Don't reveal if user doesn't exist (anti-enumeration)
    if (users.length === 0) {
      await normalizeResponseTime(startTime);
      return NextResponse.json({
        success: true,
        message: 'If an account exists, a verification code has been sent to your email',
      });
    }

    // If user is already verified, don't send code but return success
    if (users[0].email_verified !== null) {
      await normalizeResponseTime(startTime);
      return NextResponse.json({
        success: true,
        message: 'If an account exists, a verification code has been sent to your email',
      });
    }

    // Generate new code
    const code = generateVerificationCode();
    const codeHash = await bcrypt.hash(code, 10);

    // Delete existing verification tokens for this email
    await execute(
      'DELETE FROM verification_tokens WHERE identifier = $1 AND type = $2',
      [email.toLowerCase(), 'email_verification']
    );

    // Store new token with 10-minute expiry
    await execute(
      `INSERT INTO verification_tokens (identifier, token_hash, expires, type) 
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes', $3)`,
      [email.toLowerCase(), codeHash, 'email_verification']
    );

    // Send verification email (fire-and-forget)
    sendVerificationEmail(email, code).catch(err => {
      console.error('Failed to send verification email:', err);
    });

    // Normalize response time
    await normalizeResponseTime(startTime, 500, 800);

    // Return generic success message
    return NextResponse.json({
      success: true,
      message: 'If an account exists, a verification code has been sent to your email',
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    await normalizeResponseTime(startTime);
    return NextResponse.json(
      { error: 'An error occurred while sending verification code' },
      { status: 500 }
    );
  }
}
