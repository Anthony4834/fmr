import { query, execute } from './db';
import crypto from 'crypto';

/**
 * Normalize response time to prevent timing attacks
 * Ensures responses take between minMs and maxMs regardless of operation speed
 */
export async function normalizeResponseTime(
  startTime: number,
  minMs: number = 500,
  maxMs: number = 800
): Promise<void> {
  const elapsed = Date.now() - startTime;
  const targetDelay = crypto.randomInt(minMs, maxMs);
  const delayNeeded = Math.max(0, targetDelay - elapsed);
  
  if (delayNeeded > 0) {
    await new Promise(resolve => setTimeout(resolve, delayNeeded));
  }
}

/**
 * Auth rate limiting configuration - all values from environment variables
 */
const MAX_FAILED_ATTEMPTS = parseInt(process.env.AUTH_MAX_FAILED_ATTEMPTS || '5', 10);
const LOCKOUT_DURATION_MINUTES = parseInt(process.env.AUTH_LOCKOUT_DURATION_MINUTES || '15', 10);
const ATTEMPT_WINDOW_MINUTES = parseInt(process.env.AUTH_ATTEMPT_WINDOW_MINUTES || '60', 10);

export interface LoginCheckResult {
  allowed: boolean;
  reason?: string;
  retryAfter?: number; // seconds until retry allowed
}

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfter?: number; // seconds until retry allowed
}

/**
 * Check if a login attempt is allowed based on recent failures.
 * Checks both by email AND by IP to prevent distributed attacks.
 */
export async function checkLoginAllowed(
  email: string,
  ip: string
): Promise<LoginCheckResult> {
  try {
    // Check if account is locked
    const userResult = await query<{ locked_until: string | null }>(
      'SELECT locked_until FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (userResult.length > 0 && userResult[0].locked_until) {
      const lockedUntil = new Date(userResult[0].locked_until);
      if (lockedUntil > new Date()) {
        const retryAfter = Math.ceil((lockedUntil.getTime() - Date.now()) / 1000);
        return {
          allowed: false,
          reason: 'Account temporarily locked due to too many failed attempts',
          retryAfter,
        };
      }
    }

    // Check recent failed attempts (by email OR by IP)
    const recentFailures = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM login_attempts 
       WHERE identifier IN ($1, $2) 
       AND success = false 
       AND attempted_at > NOW() - INTERVAL '${ATTEMPT_WINDOW_MINUTES} minutes'`,
      [email.toLowerCase(), ip]
    );

    const failureCount = parseInt(recentFailures[0]?.count || '0', 10);

    if (failureCount >= MAX_FAILED_ATTEMPTS) {
      return {
        allowed: false,
        reason: 'Too many failed login attempts. Please try again later.',
        retryAfter: LOCKOUT_DURATION_MINUTES * 60,
      };
    }

    return { allowed: true };
  } catch (error) {
    // Fail open - allow login if rate limit check fails
    console.error('Error checking login rate limit:', error);
    return { allowed: true };
  }
}

/**
 * Record a login attempt (success or failure).
 * If too many failures, locks the account.
 */
export async function recordLoginAttempt(
  email: string,
  ip: string,
  success: boolean
): Promise<void> {
  try {
    // Record both email and IP attempts
    await execute(
      `INSERT INTO login_attempts (identifier, identifier_type, success)
       VALUES ($1, 'email', $2), ($3, 'ip', $2)`,
      [email.toLowerCase(), success, ip]
    );

    // If failed, check if we should lock the account
    if (!success) {
      const failures = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM login_attempts 
         WHERE identifier = $1 
         AND success = false 
         AND attempted_at > NOW() - INTERVAL '${ATTEMPT_WINDOW_MINUTES} minutes'`,
        [email.toLowerCase()]
      );

      const failureCount = parseInt(failures[0]?.count || '0', 10);

      if (failureCount >= MAX_FAILED_ATTEMPTS) {
        // Lock the account
        await execute(
          `UPDATE users 
           SET locked_until = NOW() + INTERVAL '${LOCKOUT_DURATION_MINUTES} minutes'
           WHERE LOWER(email) = LOWER($1)`,
          [email]
        );
      }
    } else {
      // On successful login, clear the lockout
      await execute(
        `UPDATE users SET locked_until = NULL WHERE LOWER(email) = LOWER($1)`,
        [email]
      );
    }
  } catch (error) {
    // Don't fail the login if recording fails
    console.error('Error recording login attempt:', error);
  }
}

/**
 * Clean up old login attempts (should be run periodically via cron).
 * Deletes attempts older than 7 days.
 */
export async function cleanupOldLoginAttempts(): Promise<number> {
  try {
    const result = await query<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM login_attempts 
         WHERE attempted_at < NOW() - INTERVAL '7 days'
         RETURNING *
       )
       SELECT COUNT(*) as count FROM deleted`
    );
    return parseInt(result[0]?.count || '0', 10);
  } catch (error) {
    console.error('Error cleaning up login attempts:', error);
    return 0;
  }
}

/**
 * Check if signup is allowed for an IP address.
 * Limits: 5 signups per IP per hour
 */
export async function checkSignupAllowed(ip: string): Promise<RateLimitResult> {
  try {
    const recentSignups = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM login_attempts 
       WHERE identifier = $1 
       AND identifier_type = 'ip'
       AND attempted_at > NOW() - INTERVAL '1 hour'`,
      [ip]
    );

    const signupCount = parseInt(recentSignups[0]?.count || '0', 10);

    if (signupCount >= 5) {
      return {
        allowed: false,
        reason: 'Too many signup attempts. Please try again later.',
        retryAfter: 3600, // 1 hour
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking signup rate limit:', error);
    return { allowed: true }; // Fail open
  }
}

/**
 * Check if verification attempt is allowed.
 * Limits: 10 per IP per hour, 5 per email/code combo
 */
export async function checkVerificationAllowed(
  email: string,
  ip: string
): Promise<RateLimitResult> {
  try {
    // Check per-IP limit
    const ipAttempts = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM verification_attempts 
       WHERE ip_address = $1 
       AND attempted_at > NOW() - INTERVAL '1 hour'`,
      [ip]
    );

    const ipCount = parseInt(ipAttempts[0]?.count || '0', 10);
    if (ipCount >= 10) {
      return {
        allowed: false,
        reason: 'Too many verification attempts. Please try again later.',
        retryAfter: 3600,
      };
    }

    // Check per-email limit (failed attempts only)
    const emailAttempts = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM verification_attempts 
       WHERE email = $1 
       AND success = false
       AND attempted_at > NOW() - INTERVAL '1 hour'`,
      [email.toLowerCase()]
    );

    const emailCount = parseInt(emailAttempts[0]?.count || '0', 10);
    if (emailCount >= 5) {
      return {
        allowed: false,
        reason: 'Too many failed verification attempts. Please request a new code.',
        retryAfter: 3600,
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking verification rate limit:', error);
    return { allowed: true }; // Fail open
  }
}

/**
 * Check if password reset request is allowed.
 * Limits: 3 per email per hour, 10 per IP per hour
 */
export async function checkPasswordResetAllowed(
  email: string,
  ip: string
): Promise<RateLimitResult> {
  try {
    // Check per-email limit (using login_attempts table with a marker)
    const emailResets = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM login_attempts 
       WHERE identifier = $1 
       AND identifier_type = 'email'
       AND attempted_at > NOW() - INTERVAL '1 hour'`,
      [email.toLowerCase()]
    );

    const emailCount = parseInt(emailResets[0]?.count || '0', 10);
    if (emailCount >= 3) {
      return {
        allowed: false,
        reason: 'Too many password reset requests. Please try again later.',
        retryAfter: 3600,
      };
    }

    // Check per-IP limit
    const ipResets = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM login_attempts 
       WHERE identifier = $1 
       AND identifier_type = 'ip'
       AND attempted_at > NOW() - INTERVAL '1 hour'`,
      [ip]
    );

    const ipCount = parseInt(ipResets[0]?.count || '0', 10);
    if (ipCount >= 10) {
      return {
        allowed: false,
        reason: 'Too many password reset requests. Please try again later.',
        retryAfter: 3600,
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking password reset rate limit:', error);
    return { allowed: true }; // Fail open
  }
}

/**
 * Check if resend verification is allowed.
 * Limits: 3 per email per 15 minutes
 */
export async function checkResendAllowed(email: string): Promise<RateLimitResult> {
  try {
    const recentResends = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM verification_tokens 
       WHERE identifier = $1 
       AND type = 'email_verification'
       AND expires > NOW() - INTERVAL '15 minutes'`,
      [email.toLowerCase()]
    );

    const resendCount = parseInt(recentResends[0]?.count || '0', 10);
    if (resendCount >= 3) {
      return {
        allowed: false,
        reason: 'Too many resend requests. Please wait before requesting another code.',
        retryAfter: 900, // 15 minutes
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking resend rate limit:', error);
    return { allowed: true }; // Fail open
  }
}

/**
 * Record a verification attempt
 */
export async function recordVerificationAttempt(
  email: string,
  ip: string,
  success: boolean
): Promise<void> {
  try {
    await execute(
      `INSERT INTO verification_attempts (email, ip_address, success)
       VALUES ($1, $2, $3)`,
      [email.toLowerCase(), ip, success]
    );
  } catch (error) {
    console.error('Error recording verification attempt:', error);
  }
}

/**
 * Get recent failed verification attempts for an email
 */
export async function getRecentFailedAttempts(email: string): Promise<number> {
  try {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM verification_attempts 
       WHERE email = $1 
       AND success = false 
       AND attempted_at > NOW() - INTERVAL '1 hour'`,
      [email.toLowerCase()]
    );
    return parseInt(result[0]?.count || '0', 10);
  } catch (error) {
    console.error('Error getting failed attempts:', error);
    return 0;
  }
}

/**
 * Update last verification attempt to success
 */
export async function updateLastAttemptSuccess(
  email: string,
  ip: string
): Promise<void> {
  try {
    // Update the most recent attempt for this email/IP combo
    await execute(
      `UPDATE verification_attempts 
       SET success = true 
       WHERE email = $1 
       AND ip_address = $2 
       AND attempted_at = (
         SELECT MAX(attempted_at) 
         FROM verification_attempts 
         WHERE email = $1 AND ip_address = $2
       )`,
      [email.toLowerCase(), ip]
    );
  } catch (error) {
    console.error('Error updating attempt success:', error);
  }
}
