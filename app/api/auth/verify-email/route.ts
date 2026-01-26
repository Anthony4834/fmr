import { NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import {
  checkVerificationAllowed,
  recordVerificationAttempt,
  getRecentFailedAttempts,
  updateLastAttemptSuccess,
  normalizeResponseTime,
} from '@/lib/auth-rate-limit';
import { hasGuestHitLimit, recordGuestConversion } from '@/lib/guest-tracking';
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
 * POST /api/auth/verify-email
 * Verify email address with 6-digit code
 */
export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { email, code } = body;

    // Validate required fields
    if (!email || typeof email !== 'string') {
      await normalizeResponseTime(startTime);
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!code || typeof code !== 'string' || code.length !== 6 || !/^\d{6}$/.test(code)) {
      await normalizeResponseTime(startTime);
      return NextResponse.json(
        { error: 'Invalid verification code format' },
        { status: 400 }
      );
    }

    // Rate limiting check
    const ip = getClientIP(request);
    const rateLimitCheck = await checkVerificationAllowed(email, ip);
    if (!rateLimitCheck.allowed) {
      await normalizeResponseTime(startTime);
      return NextResponse.json(
        { error: rateLimitCheck.reason || 'Too many verification attempts. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': rateLimitCheck.retryAfter?.toString() || '3600',
          },
        }
      );
    }

    // Get token from DB
    const tokens = await query<{ token_hash: string; expires: Date }>(
      `SELECT token_hash, expires FROM verification_tokens 
       WHERE identifier = $1 AND type = $2`,
      [email.toLowerCase(), 'email_verification']
    );

    // Record attempt BEFORE validation (prevents timing attacks)
    await recordVerificationAttempt(email, ip, false);

    // Check if token exists and not expired
    if (!tokens.length || new Date(tokens[0].expires) < new Date()) {
      await normalizeResponseTime(startTime);
      return NextResponse.json(
        { error: 'Invalid or expired verification code' },
        { status: 400 }
      );
    }

    // Compare with constant-time comparison via bcrypt.compare
    const isValid = await bcrypt.compare(code, tokens[0].token_hash);
    
    if (!isValid) {
      // Check attempt count - invalidate after 5 wrong attempts
      const attempts = await getRecentFailedAttempts(email);
      if (attempts >= 5) {
        await execute(
          'DELETE FROM verification_tokens WHERE identifier = $1 AND type = $2',
          [email.toLowerCase(), 'email_verification']
        );
      }
      await normalizeResponseTime(startTime);
      return NextResponse.json(
        { error: 'Invalid or expired verification code' },
        { status: 400 }
      );
    }

    // Success - update attempt record
    await updateLastAttemptSuccess(email, ip);

    // Delete token (single-use)
    await execute(
      'DELETE FROM verification_tokens WHERE identifier = $1 AND type = $2',
      [email.toLowerCase(), 'email_verification']
    );

    // Set email_verified timestamp and get user ID
    const updatedUsers = await query<{ id: string }>(
      'UPDATE users SET email_verified = NOW() WHERE LOWER(email) = LOWER($1) RETURNING id',
      [email]
    );

    // Track guest conversion if guest_id exists
    const { getGuestIdFromRequest } = await import('@/lib/guest-tracking');
    const guestId = getGuestIdFromRequest(request);
    if (guestId && updatedUsers[0]?.id) {
      const hitLimit = await hasGuestHitLimit(guestId);
      const conversionReason = hitLimit ? 'after_limit_hit' : 'organic';
      // Fire and forget - don't block verification
      recordGuestConversion(guestId, updatedUsers[0].id, conversionReason).catch(err => {
        console.error('Failed to record guest conversion:', err);
      });
    }

    await normalizeResponseTime(startTime);

    // Return success (client will auto-login)
    return NextResponse.json({
      success: true,
      verified: true,
      message: 'Email verified successfully',
    });
  } catch (error) {
    console.error('Verify email error:', error);
    await normalizeResponseTime(startTime);
    return NextResponse.json(
      { error: 'An error occurred while verifying your email' },
      { status: 500 }
    );
  }
}
