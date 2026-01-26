import { Ratelimit, type Duration } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export type UserTier = 'logged-out' | 'free' | 'paid' | 'admin';

/**
 * Upstash Redis client instance
 * Uses KV_REST_API_URL and KV_REST_API_TOKEN (Upstash Redis REST API credentials)
 */
const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

/**
 * Rate limit configuration per tier
 * Using fixed window for logged-out users to reset at midnight UTC
 * 
 * Fixed window behavior:
 * - Window duration: 1 day (86400000 ms)
 * - Reset time: (bucket + 1) * windowDuration where bucket = floor(now / windowDuration)
 * - This means resets occur at midnight UTC (00:00:00 UTC), not rolling 24 hours
 * - Example: If you hit limit at 3 PM UTC on Jan 24, it resets at midnight UTC (00:00:00) on Jan 25
 */
const RATE_LIMITS: Record<UserTier, { limit: number; window: Duration }> = {
  'logged-out': { limit: 50, window: '1 d' }, // 50 requests per day, resets at midnight UTC (fixed window)
  'free': { limit: Infinity, window: '1 d' }, // Unlimited (pending subscription model)
  'paid': { limit: Infinity, window: '1 d' }, // Unlimited
  'admin': { limit: Infinity, window: '1 d' }, // Unlimited
};

/**
 * Rate limiter instances per tier
 * Uses fixed window for logged-out users (resets at midnight UTC)
 * Uses sliding window for other tiers (though they're unlimited)
 */
const rateLimiters: Partial<Record<UserTier, Ratelimit>> = {};

/**
 * Contact form rate limiter (separate from general API rate limits)
 * Allows 10 submissions per hour per IP
 */
let contactFormRateLimiter: Ratelimit | null = null;

function getContactFormRateLimiter(): Ratelimit {
  if (!contactFormRateLimiter) {
    contactFormRateLimiter = new Ratelimit({
      redis: redis,
      limiter: Ratelimit.slidingWindow(10, '1 h'), // 10 submissions per hour
      analytics: true,
      prefix: 'ratelimit:contact',
    });
  }
  return contactFormRateLimiter;
}

/**
 * Get or create a rate limiter for a specific tier
 * Uses fixed window for logged-out users (resets at midnight UTC)
 */
function getRateLimiter(tier: UserTier): Ratelimit | null {
  // Paid users, free users (pending subscription), and admins have unlimited requests
  if (tier === 'paid' || tier === 'free' || tier === 'admin') {
    return null;
  }

  // Return cached instance if available
  if (rateLimiters[tier]) {
    return rateLimiters[tier]!;
  }

  const config = RATE_LIMITS[tier];
  
  // Use fixed window for logged-out users to reset at midnight UTC
  // Fixed window resets at the start of each time window (midnight UTC for '1 d')
  const limiter = tier === 'logged-out' 
    ? Ratelimit.fixedWindow(config.limit, config.window)
    : Ratelimit.slidingWindow(config.limit, config.window);
  
  // Create new rate limiter instance
  // Disable ephemeral cache to ensure resets work reliably
  // The cache can cause issues where blocked identifiers persist in memory
  // even after Redis keys are deleted
  const ratelimit = new Ratelimit({
    redis: redis,
    limiter: limiter,
    analytics: true,
    prefix: `ratelimit:${tier}`,
    ephemeralCache: false,
  });

  rateLimiters[tier] = ratelimit;
  return ratelimit;
}

/**
 * Extract IP address from request headers
 * Handles Vercel's proxy headers (x-forwarded-for, x-real-ip)
 */
export function getClientIP(request: Request): string {
  const headers = {
    'x-forwarded-for': request.headers.get('x-forwarded-for'),
    'x-real-ip': request.headers.get('x-real-ip'),
    'cf-connecting-ip': request.headers.get('cf-connecting-ip'),
  };

  // x-forwarded-for can contain multiple IPs, take the first one
  if (headers['x-forwarded-for']) {
    const ips = headers['x-forwarded-for'].split(',').map(ip => ip.trim());
    return ips[0] || 'unknown';
  }

  // Fallback to other headers
  return headers['x-real-ip'] || headers['cf-connecting-ip'] || 'unknown';
}

/**
 * Hash a string using SHA-256 (for IP and User-Agent)
 * Uses Web Crypto API for Edge Runtime compatibility
 */
async function hashString(input: string): Promise<string> {
  // Use Web Crypto API for Edge Runtime compatibility
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16); // First 16 chars
}

/**
 * Get user identifier based on tier
 * For logged-out users: uses guest_id cookie (primary) + IP hash + UA hash (secondary signals)
 * For authenticated users: uses user ID
 */
export async function getUserIdentifier(
  tier: UserTier, 
  request: Request, 
  userId?: string,
  guestId?: string
): Promise<string> {
  if (tier === 'free' || tier === 'paid' || tier === 'admin') {
    // Authenticated users: use user ID
    if (userId) {
      return `user:${userId}`;
    }
    // Fallback to IP if no user ID provided (shouldn't happen in production)
    return `ip:${getClientIP(request)}`;
  }
  
  // Logged-out users: use guest_id cookie as identifier
  // IP/UA tracking for abuse detection is handled separately via trackGuestActivity()
  if (guestId) {
    return `guest:${guestId}`;
  }
  
  // Fallback: if no guest_id cookie, use IP hash + UA hash
  const ip = getClientIP(request);
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const ipHash = await hashString(ip);
  const uaHash = await hashString(userAgent);
  return `ip:${ipHash}:${uaHash}`;
}

/**
 * Check rate limit for a request
 * Returns result with limit information
 */
export async function checkRateLimit(
  tier: UserTier,
  request: Request,
  userId?: string,
  guestId?: string
): Promise<{
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}> {
  // Paid users, free users (pending subscription), and admins bypass rate limiting
  if (tier === 'paid' || tier === 'free' || tier === 'admin') {
    return {
      success: true,
      limit: Infinity,
      remaining: Infinity,
      reset: Date.now() + 86400000, // 24 hours from now
    };
  }

  const limiter = getRateLimiter(tier);
  if (!limiter) {
    // Should not happen, but fail open if limiter not available
    console.warn(`Rate limiter not available for tier: ${tier}`);
    return {
      success: true,
      limit: RATE_LIMITS[tier].limit,
      remaining: RATE_LIMITS[tier].limit,
      reset: Date.now() + 86400000,
    };
  }

  const identifier = await getUserIdentifier(tier, request, userId, guestId);
  const result = await limiter.limit(identifier);

  return {
    success: result.success,
    limit: RATE_LIMITS[tier].limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}

/**
 * Check rate limit for contact form submissions
 * Uses a separate rate limit (10 per hour per IP) independent of general API limits
 */
export async function checkContactFormRateLimit(
  request: Request
): Promise<{
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}> {
  const limiter = getContactFormRateLimiter();
  const ip = getClientIP(request);
  const identifier = `ip:${ip}`;
  const result = await limiter.limit(identifier);

  return {
    success: result.success,
    limit: 10,
    remaining: result.remaining,
    reset: result.reset,
  };
}

/**
 * Helper function to scan all keys matching a pattern using SCAN (safer than KEYS for large datasets)
 */
async function scanKeys(pattern: string): Promise<string[]> {
  const allKeys: string[] = [];
  let cursor = 0;
  
  do {
    const [nextCursor, keys] = await redis.scan(cursor, { match: pattern, count: 100 });
    cursor = typeof nextCursor === 'string' ? parseInt(nextCursor, 10) : nextCursor;
    if (Array.isArray(keys)) {
      allKeys.push(...keys);
    }
  } while (cursor !== 0);
  
  return allKeys;
}

/**
 * Reset rate limit for a specific guest
 * Deletes all Redis keys matching the guest pattern to fully reset the counter
 */
export async function resetGuestRateLimit(guestId: string): Promise<void> {
  try {
    const limiter = getRateLimiter('logged-out');
    if (!limiter) {
      throw new Error('Rate limiter not available');
    }

    // With simplified identifier format, keys are: ratelimit:logged-out:guest:{guestId}:{windowId}
    // Simple pattern to find all keys for this guest
    const pattern = `ratelimit:logged-out:guest:${guestId}:*`;
    const keys = await scanKeys(pattern);
    
    if (!keys || keys.length === 0) {
      return;
    }

    // The identifier is simply: guest:{guestId}
    const identifier = `guest:${guestId}`;

    // Call resetUsedTokens to reset Upstash Ratelimit's internal state
    try {
      if (typeof (limiter as any).resetUsedTokens === 'function') {
        await (limiter as any).resetUsedTokens(identifier);
        // Wait a moment for Redis operations to complete
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (resetError) {
      console.warn(`[Reset] resetUsedTokens failed:`, resetError);
    }

    // Delete all matching keys to ensure complete reset
    if (keys.length === 1) {
      await redis.del(keys[0]);
    } else {
      const batchSize = 100;
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        if (batch.length === 1) {
          await redis.del(batch[0]);
        } else {
          await redis.del(...batch);
        }
      }
    }

    // Verify deletion - only log if there's an issue
    const verifyKeys = await scanKeys(pattern);
    if (verifyKeys && verifyKeys.length > 0) {
      console.warn(`[Reset] WARNING: ${verifyKeys.length} keys still exist after deletion!`, verifyKeys.slice(0, 3));
      const verifyBatchSize = 100;
      for (let i = 0; i < verifyKeys.length; i += verifyBatchSize) {
        const batch = verifyKeys.slice(i, i + verifyBatchSize);
        if (batch.length === 1) {
          await redis.del(batch[0]);
        } else {
          await redis.del(...batch);
        }
      }
    }
  } catch (error) {
    console.error('Failed to reset guest rate limit:', error);
    throw error;
  }
}

/**
 * Reset rate limits for all guests
 * Uses Ratelimit's resetUsedTokens() method to properly reset counters
 * Uses SCAN instead of KEYS to handle large datasets safely
 */
export async function resetAllGuestRateLimits(): Promise<void> {
  try {
    const limiter = getRateLimiter('logged-out');
    if (!limiter) {
      throw new Error('Rate limiter not available');
    }

    // With simplified identifier format:
    // Guest keys: ratelimit:logged-out:guest:{guestId}:{windowId}
    // IP fallback keys: ratelimit:logged-out:ip:{ipHash}:{uaHash}:{windowId}
    const guestPattern = 'ratelimit:logged-out:guest:*';
    const ipPattern = 'ratelimit:logged-out:ip:*';
    
    // Use SCAN instead of KEYS to handle large datasets
    const guestKeys = await scanKeys(guestPattern);
    const ipKeys = await scanKeys(ipPattern);
    
    const allKeys = Array.from(new Set([...guestKeys, ...ipKeys]));
    
    if (allKeys.length === 0) {
      return;
    }

    // Extract unique identifiers from keys (remove windowId from end)
    const identifiers = new Set<string>();
    for (const key of allKeys) {
      let identifier = key.replace('ratelimit:logged-out:', '');
      // Remove windowId from the end (format: ...:windowId)
      identifier = identifier.replace(/:\d+$/, '');
      // Also handle case where windowId might be at the beginning
      const windowIdMatch = identifier.match(/^(\d+):/);
      if (windowIdMatch) {
        identifier = identifier.substring(windowIdMatch[0].length);
      }
      identifiers.add(identifier);
    }

    // Call resetUsedTokens for each unique identifier
    const identifierArray = Array.from(identifiers);
    const resetBatchSize = 50;
    for (let i = 0; i < identifierArray.length; i += resetBatchSize) {
      const batch = identifierArray.slice(i, i + resetBatchSize);
      await Promise.all(
        batch.map(async (identifier) => {
          try {
            if (typeof (limiter as any).resetUsedTokens === 'function') {
              await (limiter as any).resetUsedTokens(identifier);
            }
          } catch (resetError) {
            console.warn(`[Reset All] resetUsedTokens failed:`, resetError);
          }
        })
      );
    }

    // Delete all keys directly to ensure complete reset
    const deleteBatchSize = 100;
    for (let i = 0; i < allKeys.length; i += deleteBatchSize) {
      const batch = allKeys.slice(i, i + deleteBatchSize);
      if (batch.length === 1) {
        await redis.del(batch[0]);
      } else {
        await redis.del(...batch);
      }
    }
  } catch (error) {
    console.error('Failed to reset all guest rate limits:', error);
    throw error;
  }
}

/**
 * JWT token type from NextAuth
 */
export interface AuthToken {
  id?: string;
  tier?: string;
  role?: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Determine user tier from JWT token.
 * Returns 'logged-out' if no valid token is present.
 * Admins always get 'admin' tier regardless of paid status.
 */
export function getUserTierFromToken(token: AuthToken | null): UserTier {
  if (!token || !token.id) {
    return 'logged-out';
  }
  
  // Admins bypass all rate limiting
  const role = token.role as string | undefined;
  if (role === 'admin') {
    return 'admin';
  }
  
  // Get tier from token, default to 'free' for authenticated users
  const tier = token.tier as string | undefined;
  
  if (tier === 'paid') {
    return 'paid';
  }
  
  // Any authenticated user without paid tier is 'free'
  return 'free';
}

/**
 * Get user ID from JWT token.
 */
export function getUserIdFromToken(token: AuthToken | null): string | undefined {
  return token?.id as string | undefined;
}

/**
 * Legacy function for backward compatibility.
 * @deprecated Use getUserTierFromToken instead
 */
export function getUserTier(request: Request): UserTier {
  // Without token context, assume logged-out
  return 'logged-out';
}

/**
 * Extract IP address from headers (for server components)
 * Handles Vercel's proxy headers (x-forwarded-for, x-real-ip)
 */
export function getClientIPFromHeaders(headers: Headers): string {
  const xForwardedFor = headers.get('x-forwarded-for');
  const xRealIp = headers.get('x-real-ip');
  const cfConnectingIp = headers.get('cf-connecting-ip');

  // x-forwarded-for can contain multiple IPs, take the first one
  if (xForwardedFor) {
    const ips = xForwardedFor.split(',').map(ip => ip.trim());
    return ips[0] || 'unknown';
  }

  // Fallback to other headers
  return xRealIp || cfConnectingIp || 'unknown';
}

/**
 * Check rate limit using headers (for server components)
 * Returns result with limit information
 */
export async function checkRateLimitFromHeaders(
  headers: Headers,
  tier: UserTier = 'logged-out',
  userId?: string
): Promise<{
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}> {
  // Paid users, free users (pending subscription), and admins bypass rate limiting
  if (tier === 'paid' || tier === 'free' || tier === 'admin') {
    return {
      success: true,
      limit: Infinity,
      remaining: Infinity,
      reset: Date.now() + 86400000, // 24 hours from now
    };
  }

  const limiter = getRateLimiter(tier);
  if (!limiter) {
    // Should not happen, but fail open if limiter not available
    console.warn(`Rate limiter not available for tier: ${tier}`);
    return {
      success: true,
      limit: RATE_LIMITS[tier].limit,
      remaining: RATE_LIMITS[tier].limit,
      reset: Date.now() + 86400000,
    };
  }

  const ip = getClientIPFromHeaders(headers);
  // For server components, use simplified identifier (no guest_id available)
  const identifier = userId ? `user:${userId}` : `ip:${ip}`;
  const result = await limiter.limit(identifier);

  return {
    success: result.success,
    limit: RATE_LIMITS[tier].limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}
