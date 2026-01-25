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
 */
const RATE_LIMITS: Record<UserTier, { limit: number; window: Duration }> = {
  'logged-out': { limit: 50, window: '1 d' }, // 50 requests per day
  'free': { limit: Infinity, window: '1 d' }, // Unlimited (pending subscription model)
  'paid': { limit: Infinity, window: '1 d' }, // Unlimited
  'admin': { limit: Infinity, window: '1 d' }, // Unlimited
};

/**
 * Rate limiter instances per tier
 * Uses sliding window algorithm for smooth rate limiting
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
  
  // Create new rate limiter instance
  const ratelimit = new Ratelimit({
    redis: redis,
    limiter: Ratelimit.slidingWindow(config.limit, config.window),
    analytics: true,
    prefix: `ratelimit:${tier}`,
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
 * Get user identifier based on tier
 * For logged-out users, uses IP address
 * For authenticated users (future), will use user ID
 */
export function getUserIdentifier(tier: UserTier, request: Request, userId?: string): string {
  if (tier === 'free' || tier === 'paid') {
    // When auth is implemented, use user ID
    if (userId) {
      return `user:${userId}`;
    }
    // Fallback to IP if no user ID provided (shouldn't happen in production)
    return `ip:${getClientIP(request)}`;
  }
  
  // Logged-out users: use IP address
  return `ip:${getClientIP(request)}`;
}

/**
 * Check rate limit for a request
 * Returns result with limit information
 */
export async function checkRateLimit(
  tier: UserTier,
  request: Request,
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

  const identifier = getUserIdentifier(tier, request, userId);
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
  const identifier = userId ? `user:${userId}` : `ip:${ip}`;
  const result = await limiter.limit(identifier);

  return {
    success: result.success,
    limit: RATE_LIMITS[tier].limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}
