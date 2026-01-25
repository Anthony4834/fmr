import { NextResponse } from 'next/server';
import { sendContactEmail } from '@/lib/email';
import { normalizeResponseTime } from '@/lib/auth-rate-limit';
import { checkContactFormRateLimit } from '@/lib/rate-limit';
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
 * Generate a unique reference ID starting with "fyi_"
 * Format: fyi_ followed by 8 alphanumeric characters
 */
function generateReferenceId(): string {
  const randomBytes = crypto.randomBytes(4);
  const randomHex = randomBytes.toString('hex');
  return `fyi_${randomHex}`;
}

/**
 * POST /api/contact
 * Handle contact form submissions
 */
export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { email, subject, message } = body;

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

    if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
      await normalizeResponseTime(startTime);
      return NextResponse.json(
        { error: 'Subject is required' },
        { status: 400 }
      );
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      await normalizeResponseTime(startTime);
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Validate length limits
    if (subject.length > 200) {
      await normalizeResponseTime(startTime);
      return NextResponse.json(
        { error: 'Subject must be 200 characters or less' },
        { status: 400 }
      );
    }

    if (message.length > 2000) {
      await normalizeResponseTime(startTime);
      return NextResponse.json(
        { error: 'Message must be 2000 characters or less' },
        { status: 400 }
      );
    }

    // Check contact form rate limit (separate from general API rate limits)
    const rateLimitResult = await checkContactFormRateLimit(request);
    if (!rateLimitResult.success) {
      await normalizeResponseTime(startTime);
      const retryAfter = Math.ceil((rateLimitResult.reset - Date.now()) / 1000);
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: 'Too many contact form submissions. Please try again later.',
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.reset.toString(),
            'Retry-After': retryAfter.toString(),
          },
        }
      );
    }

    // Get IP for email logging
    const ip = getClientIP(request);

    // Generate reference ID
    const referenceId = generateReferenceId();

    // Send email
    const emailSent = await sendContactEmail(
      email.trim(),
      subject.trim(),
      message.trim(),
      ip,
      referenceId
    );

    if (!emailSent) {
      await normalizeResponseTime(startTime);
      return NextResponse.json(
        { error: 'Failed to send message. Please try again later.' },
        { status: 500 }
      );
    }

    // Normalize response time
    await normalizeResponseTime(startTime, 500, 800);

    return NextResponse.json({
      success: true,
      message: 'Your message has been sent successfully',
      referenceId,
    });
  } catch (error) {
    console.error('Contact form error:', error);
    await normalizeResponseTime(startTime);
    return NextResponse.json(
      { error: 'An error occurred while sending your message' },
      { status: 500 }
    );
  }
}
