import { query, execute } from './db';

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
