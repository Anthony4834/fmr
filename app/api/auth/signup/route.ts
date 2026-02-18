import { NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { hashPassword, validatePassword } from '@/lib/auth';
import { getDefaultSignupTier } from '@/lib/default-signup-tier';
import { checkSignupAllowed, normalizeResponseTime } from '@/lib/auth-rate-limit';
import { generateVerificationCode, sendVerificationEmail } from '@/lib/email';
import { hasGuestHitLimit, recordGuestConversion } from '@/lib/guest-tracking';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

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
 * POST /api/auth/signup
 * Create a new user account with email/password.
 * Requires email verification before login.
 */
export async function POST(request: Request) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { email, password, name } = body;

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

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      await normalizeResponseTime(startTime);
      return NextResponse.json(
        { error: passwordValidation.error },
        { status: 400 }
      );
    }

    // Rate limiting check (per IP)
    const ip = getClientIP(request);
    const rateLimitCheck = await checkSignupAllowed(ip);
    if (!rateLimitCheck.allowed) {
      await normalizeResponseTime(startTime);
      return NextResponse.json(
        { error: rateLimitCheck.reason || 'Too many signup attempts. Please try again later.' },
        { 
          status: 429,
          headers: {
            'Retry-After': rateLimitCheck.retryAfter?.toString() || '3600',
          },
        }
      );
    }

    // Check existing user - but DON'T reveal this (anti-enumeration)
    const existing = await query<{ id: string; email_verified: string | null }>(
      'SELECT id, email_verified FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    const userExists = existing.length > 0;
    const isVerified = userExists && existing[0].email_verified !== null;

    // If user exists and is verified, return generic success (don't reveal)
    if (userExists && isVerified) {
      await normalizeResponseTime(startTime);
      return NextResponse.json({
        success: true,
        requiresVerification: true,
        message: 'Check your email for verification code',
      });
    }

    // Generate cryptographically secure 6-digit code
    const code = generateVerificationCode();
    const codeHash = await bcrypt.hash(code, 10);

    // Delete any existing verification tokens for this email
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

    // Get guest_id from cookie to track conversion
    const { getGuestIdFromRequest } = await import('@/lib/guest-tracking');
    const guestId = getGuestIdFromRequest(request);

    // If user doesn't exist, create new user
    let userId: string | null = null;
    if (!userExists) {
      const passwordHash = await hashPassword(password);
      const defaultTier = getDefaultSignupTier();
      const result = await query<{ id: string }>(
        `INSERT INTO users (email, name, password_hash, tier, signup_method)
         VALUES (LOWER($1), $2, $3, $4, 'credentials')
         RETURNING id`,
        [email, name || null, passwordHash, defaultTier]
      );
      userId = result[0]?.id || null;
    } else {
      // User exists but unverified - update signup_method if needed
      const result = await query<{ id: string }>(
        `UPDATE users SET signup_method = 'credentials' WHERE LOWER(email) = LOWER($1) AND signup_method IS NULL
         RETURNING id`,
        [email]
      );
      userId = result[0]?.id || existing[0]?.id || null;
    }

    // Track guest conversion if guest_id exists
    if (guestId && userId) {
      const hitLimit = await hasGuestHitLimit(guestId);
      const conversionReason = hitLimit ? 'after_limit_hit' : 'organic';
      // Fire and forget - don't block signup
      recordGuestConversion(guestId, userId, conversionReason).catch(err => {
        console.error('Failed to record guest conversion:', err);
      });
    }

    // Send verification email (fire-and-forget, don't block)
    sendVerificationEmail(email, code).catch(err => {
      console.error('Failed to send verification email:', err);
    });

    // Normalize response time to prevent timing attacks
    await normalizeResponseTime(startTime, 500, 800);

    // Always return same response shape (anti-enumeration)
    return NextResponse.json({
      success: true,
      requiresVerification: true,
      message: 'Check your email for verification code',
    });
  } catch (error) {
    console.error('Signup error:', error);
    await normalizeResponseTime(startTime);
    return NextResponse.json(
      { error: 'An error occurred while creating your account' },
      { status: 500 }
    );
  }
}
