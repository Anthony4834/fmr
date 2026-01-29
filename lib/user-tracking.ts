import { execute } from './db';

/**
 * Update user last_seen timestamp (fire-and-forget).
 * Call when an authenticated user makes a request (e.g. from middleware).
 */
export function trackUserActivity(userId: string): void {
  execute(
    `UPDATE users SET last_seen = NOW() WHERE id = $1`,
    [userId]
  ).catch((err) => {
    // Silently fail - don't break requests if tracking fails
    if (process.env.NODE_ENV === 'development') {
      console.error('Failed to track user activity:', err);
    }
  });
}
