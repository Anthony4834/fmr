import { query, execute } from './db';

/**
 * Hash a string using SHA-256 (for IP and User-Agent)
 * Uses Web Crypto API for Edge Runtime compatibility
 */
async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16); // First 16 chars
}

/**
 * Extract guest_id from request cookies
 * Works consistently across API routes, middleware, and edge runtime
 */
export function getGuestIdFromRequest(request: Request): string | undefined {
  const cookieHeader = request.headers.get('cookie') || '';
  const guestIdMatch = cookieHeader.match(/guest_id=([^;]+)/);
  return guestIdMatch ? guestIdMatch[1].trim() : undefined;
}

/**
 * Track guest activity asynchronously (fire-and-forget)
 * This should not block the request
 */
export async function trackGuestActivity(
  guestId: string,
  ip: string,
  userAgent: string,
  limitHit: boolean
): Promise<void> {
  // Run asynchronously without blocking
  Promise.resolve().then(async () => {
    try {
      const ipHash = await hashString(ip);
      const uaHash = await hashString(userAgent || 'unknown');
      
      // Upsert guest record
      await execute(
        `INSERT INTO guests (guest_id, ip_hash, ua_hash, last_seen, request_count, limit_hit_at)
         VALUES ($1, $2, $3, NOW(), 1, $4)
         ON CONFLICT (guest_id) 
         DO UPDATE SET 
           last_seen = NOW(),
           request_count = guests.request_count + 1,
           limit_hit_at = CASE 
             WHEN $4 IS NOT NULL AND guests.limit_hit_at IS NULL THEN $4
             ELSE guests.limit_hit_at
           END,
           updated_at = NOW()`,
        [guestId, ipHash, uaHash, limitHit ? new Date() : null]
      );
    } catch (error) {
      // Silently fail - don't break requests if tracking fails
      console.error('Failed to track guest activity:', error);
    }
  });
}

/**
 * Record guest conversion to user
 */
export async function recordGuestConversion(
  guestId: string,
  userId: string,
  conversionReason: 'organic' | 'after_limit_hit' | 'extension'
): Promise<void> {
  try {
    await execute(
      `UPDATE guests 
       SET converted_user_id = $1, 
           conversion_reason = $2,
           updated_at = NOW()
       WHERE guest_id = $3`,
      [userId, conversionReason, guestId]
    );
  } catch (error) {
    console.error('Failed to record guest conversion:', error);
    // Don't throw - conversion should succeed even if tracking fails
  }
}

/**
 * Get guest by guest_id
 */
export async function getGuestByGuestId(guestId: string) {
  const result = await query<{
    id: number;
    guest_id: string;
    ip_hash: string;
    ua_hash: string;
    first_seen: Date;
    last_seen: Date;
    request_count: number;
    limit_hit_at: Date | null;
    converted_user_id: string | null;
    conversion_reason: string | null;
  }>(
    `SELECT id, guest_id, ip_hash, ua_hash, first_seen, last_seen, 
            request_count, limit_hit_at, converted_user_id, conversion_reason
     FROM guests 
     WHERE guest_id = $1`,
    [guestId]
  );
  return result[0] || null;
}

/**
 * Check if guest has hit rate limit
 */
export async function hasGuestHitLimit(guestId: string): Promise<boolean> {
  const guest = await getGuestByGuestId(guestId);
  return guest?.limit_hit_at !== null;
}
