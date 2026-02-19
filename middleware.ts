import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { checkRateLimit, getUserTierFromToken, getUserIdFromToken, type AuthToken, getClientIP } from '@/lib/rate-limit';
import { trackGuestActivity } from '@/lib/guest-tracking';
import { trackUserActivity } from '@/lib/user-tracking';
import * as jose from 'jose';

/**
 * Generate a UUID v4 using Web Crypto API (Edge Runtime compatible)
 */
function generateUUID(): string {
  // Use Web Crypto API for Edge Runtime compatibility
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  
  // Set version (4) and variant bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10
  
  // Convert to UUID string format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32),
  ].join('-');
}

/**
 * Fixed guest_id for scripts/bots to avoid inflating the guest list
 */
const SCRIPT_GUEST_ID = '00000000-0000-4000-8000-000000000000';
const BOT_GUEST_ID = '00000000-0000-4000-8000-000000000001';

/**
 * Check if a request is from a script (by User-Agent or header)
 */
function isScriptRequest(request: NextRequest): boolean {
  const userAgent = request.headers.get('user-agent') || '';
  const scriptHeader = request.headers.get('x-script-request');
  
  return (
    userAgent.includes('fmr-search-script') ||
    scriptHeader === 'true' ||
    userAgent.includes('puppeteer') ||
    userAgent.includes('headless')
  );
}

/**
 * Check if a request is from a bot/crawler
 * These requests typically don't accept cookies and create new guest_ids on every request
 */
function isBotRequest(request: NextRequest): boolean {
  const userAgent = (request.headers.get('user-agent') || '').toLowerCase();
  
  // Common bot patterns
  const botPatterns = [
    'bot', 'crawler', 'spider', 'scraper', 'curl', 'wget', 'python', 'java',
    'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider', 'yandex',
    'facebookexternalhit', 'twitterbot', 'linkedinbot', 'whatsapp', 'telegram',
    'applebot', 'msnbot', 'semrush', 'ahrefs', 'mj12bot', 'dotbot', 'petalbot',
    'bytespider', 'gptbot', 'claudebot', 'anthropic', 'ccbot', 'dataforseo',
    'go-http-client', 'axios', 'node-fetch', 'undici', 'got',
    'headlesschrome', 'phantomjs', 'selenium', 'playwright', 'cypress',
  ];
  
  // Check if User-Agent matches any bot pattern
  if (botPatterns.some(pattern => userAgent.includes(pattern))) {
    return true;
  }
  
  // Check for missing or very short User-Agent (likely a script/bot)
  if (!userAgent || userAgent.length < 20) {
    return true;
  }
  
  // Check for requests without Accept-Language header (browsers always send this)
  const acceptLanguage = request.headers.get('accept-language');
  if (!acceptLanguage) {
    return true;
  }
  
  return false;
}

/** Allowed CORS origins: site origin + optional env list + any chrome-extension:// */
function getAllowedCorsOrigins(): string[] {
  const list: string[] = [];
  try {
    const url = process.env.NEXTAUTH_URL || process.env.VERCEL_URL;
    if (url) {
      const origin = new URL(url.startsWith('http') ? url : `https://${url}`).origin;
      list.push(origin);
    }
  } catch {
    // ignore
  }
  const extra = process.env.CORS_ALLOWED_ORIGINS;
  if (extra) {
    list.push(...extra.split(',').map((s) => s.trim()).filter(Boolean));
  }
  return list;
}

let cachedCorsOrigins: string[] | null = null;
function getCorsOrigins(): string[] {
  if (cachedCorsOrigins === null) {
    cachedCorsOrigins = getAllowedCorsOrigins();
  }
  return cachedCorsOrigins;
}

/** Return Access-Control-Allow-Origin value if request origin is allowed, else null */
function getCorsAllowOrigin(request: NextRequest): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  if (origin.startsWith('chrome-extension://')) return origin;
  return getCorsOrigins().includes(origin) ? origin : null;
}

function setCorsHeaders(response: NextResponse, request: NextRequest): void {
  const allowOrigin = getCorsAllowOrigin(request);
  if (allowOrigin) {
    response.headers.set('Access-Control-Allow-Origin', allowOrigin);
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Get or create guest_id cookie
 * Returns the guest_id and whether it was newly created
 * Scripts/bots use a fixed guest_id to avoid inflating the guest list
 */
function getOrCreateGuestId(request: NextRequest, response: NextResponse): { guestId: string; isNew: boolean } {
  // Check if this is a script request
  if (isScriptRequest(request)) {
    // Use fixed guest_id for scripts
    const isSecure = request.url.startsWith('https://');
    response.cookies.set('guest_id', SCRIPT_GUEST_ID, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
    });
    return { guestId: SCRIPT_GUEST_ID, isNew: false };
  }
  
  // Check if this is a bot/crawler request
  if (isBotRequest(request)) {
    // Use fixed guest_id for bots to avoid inflating guest list
    const isSecure = request.url.startsWith('https://');
    response.cookies.set('guest_id', BOT_GUEST_ID, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
    });
    return { guestId: BOT_GUEST_ID, isNew: false };
  }
  
  const guestIdCookie = request.cookies.get('guest_id');
  
  if (guestIdCookie?.value) {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(guestIdCookie.value)) {
      return { guestId: guestIdCookie.value, isNew: false };
    }
  }
  
  // Generate new guest_id
  const newGuestId = generateUUID();
  const isSecure = request.url.startsWith('https://');
  
  // Set cookie: HttpOnly, 1 year expiry, SameSite=Lax
  response.cookies.set('guest_id', newGuestId, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    path: '/',
  });
  
  return { guestId: newGuestId, isNew: true };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle CORS for API routes (allowlist: site origin + chrome-extension + CORS_ALLOWED_ORIGINS)
  if (pathname.startsWith('/api/')) {
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      const res = new NextResponse(null, { status: 200 });
      setCorsHeaders(res, request);
      res.headers.set('Access-Control-Max-Age', '86400');
      return res;
    }

    // Skip rate limiting for cron endpoints
    if (pathname.startsWith('/api/cron/')) {
      const response = NextResponse.next();
      setCorsHeaders(response, request);
      return response;
    }

    // Skip rate limiting for auth endpoints (they have their own rate limiting)
    if (pathname.startsWith('/api/auth/')) {
      const response = NextResponse.next();
      setCorsHeaders(response, request);
      return response;
    }

    // Skip rate limiting for contact endpoint (it has its own separate rate limiting)
    if (pathname === '/api/contact') {
      const response = NextResponse.next();
      setCorsHeaders(response, request);
      return response;
    }

    // Skip rate limiting for track endpoints (fire-and-forget analytics); still set guest_id for logged-out users
    if (pathname.startsWith('/api/track/')) {
      const response = NextResponse.next();
      setCorsHeaders(response, request);

      let token: AuthToken | null = await validateExtensionToken(request.headers.get('authorization'));
      if (!token) {
        try {
          const isSecure = request.url.startsWith('https://');
          token = await getToken({
            req: request,
            secret: process.env.NEXTAUTH_SECRET,
            cookieName: isSecure ? '__Secure-authjs.session-token' : 'authjs.session-token',
          }) as AuthToken | null;
          if (!token) {
            token = await getToken({
              req: request,
              secret: process.env.NEXTAUTH_SECRET,
              cookieName: isSecure ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
            }) as AuthToken | null;
          }
        } catch {
          token = null;
        }
      }
      const tier = getUserTierFromToken(token);
      if (tier === 'logged-out' && !isBotRequest(request) && !isScriptRequest(request)) {
        const { guestId } = getOrCreateGuestId(request, response);
        const isSecure = request.url.startsWith('https://');
        response.cookies.set('guest_id', guestId, {
          httpOnly: true,
          secure: isSecure,
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 365,
          path: '/',
        });
      }
      return response;
    }

    // Apply rate limiting to all other API routes
    return await handleRateLimit(request);
  }

  // Rate limit zip and county pages (server-side rendered pages that fetch FMR data)
  // Skip if already redirected to home with rate limit (avoid redirect loop)
  if ((pathname.startsWith('/zip/') || pathname.startsWith('/county/')) && 
      !request.nextUrl.searchParams.has('rateLimitExceeded')) {
    return await handleRateLimit(request);
  }

  // Rewrite:
  // - /sitemaps/zips/0.xml -> /sitemaps/zips/0
  // - /sitemaps/cities/CA.xml -> /sitemaps/cities/CA
  // - /sitemaps/counties/CA.xml -> /sitemaps/counties/CA
  //
  // This keeps the public URLs stable while using supported dynamic segments in the App Router.
  const zipDigitMatch = pathname.match(/^\/sitemaps\/zips\/([0-9])\.xml$/);
  if (zipDigitMatch) {
    const digit = zipDigitMatch[1];
    const url = request.nextUrl.clone();
    url.pathname = `/sitemaps/zips/${digit}`;
    return NextResponse.rewrite(url);
  }

  const cityStateMatch = pathname.match(/^\/sitemaps\/cities\/([a-zA-Z]{2})\.xml$/);
  if (cityStateMatch) {
    const state = cityStateMatch[1].toUpperCase();
    const url = request.nextUrl.clone();
    url.pathname = `/sitemaps/cities/${state}`;
    return NextResponse.rewrite(url);
  }

  const countyStateMatch = pathname.match(/^\/sitemaps\/counties\/([a-zA-Z]{2})\.xml$/);
  if (countyStateMatch) {
    const state = countyStateMatch[1].toUpperCase();
    const url = request.nextUrl.clone();
    url.pathname = `/sitemaps/counties/${state}`;
    return NextResponse.rewrite(url);
  }

  // All other matched routes (page loads): rate limit and track last_seen
  return await handleRateLimit(request);
}

/**
 * Validate extension Bearer token and extract user info
 * Uses jose for Edge Runtime compatibility
 */
async function validateExtensionToken(authHeader: string | null): Promise<AuthToken | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Middleware] No Bearer token in auth header');
    }
    return null;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Middleware] Empty token after Bearer');
    }
    return null;
  }

  try {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Middleware] NEXTAUTH_SECRET not configured');
      }
      return null;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[Middleware] Attempting to verify JWT token with jose...');
    }

    // Create secret key for jose
    const secretKey = new TextEncoder().encode(secret);
    
    // Verify the token
    const { payload } = await jose.jwtVerify(token, secretKey);

    if (process.env.NODE_ENV === 'development') {
      console.log('[Middleware] JWT decoded successfully:', { type: payload.type, tier: payload.tier, sub: payload.sub });
    }

    // Check if this is an extension token
    if (payload.type !== 'extension_access') {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Middleware] Token type is not extension_access:', payload.type);
      }
      return null;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[Middleware] Extension token validated, tier:', payload.tier);
    }
    return {
      id: payload.sub as string,
      email: payload.email as string,
      tier: payload.tier as string,
      role: payload.role as string,
    };
  } catch (error) {
    // Token invalid or expired
    if (process.env.NODE_ENV === 'development') {
      console.log('[Middleware] JWT verification failed:', error instanceof Error ? error.message : error);
    }
    return null;
  }
}

/**
 * Handle rate limiting for API requests and page requests
 */
async function handleRateLimit(request: NextRequest): Promise<NextResponse> {
  try {
    // Skip rate limiting entirely for bots/crawlers (Google, Bing, etc.)
    // We want search engines to index our pages without hitting rate limits
    if (isBotRequest(request)) {
      const response = NextResponse.next();
      if (request.nextUrl.pathname.startsWith('/api/')) {
        setCorsHeaders(response, request);
      }
      // No rate limit headers, no guest tracking for bots
      return response;
    }
    
    // Create response early so we can set cookies
    let response: NextResponse;
    
    // First check for extension Bearer token
    const authHeader = request.headers.get('authorization');
    if (process.env.NODE_ENV === 'development') {
      console.log('[Middleware] Auth header present:', !!authHeader);
    }
    let token: AuthToken | null = await validateExtensionToken(authHeader);

    // If no extension token, try NextAuth session token
    if (!token) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Middleware] No extension token, trying NextAuth session');
      }
      try {
        // NextAuth v5 uses 'authjs' cookie prefix, try both v5 and v4 cookie names
        // The secureCookie option matches what NextAuth uses in production (HTTPS)
        const isSecure = request.url.startsWith('https://');
        
        // Try v5 cookie name first (authjs prefix)
        token = await getToken({ 
          req: request,
          secret: process.env.NEXTAUTH_SECRET,
          cookieName: isSecure ? '__Secure-authjs.session-token' : 'authjs.session-token',
        }) as AuthToken | null;
        
        // If not found, try v4 cookie name (next-auth prefix) for backwards compatibility
        if (!token) {
          token = await getToken({ 
            req: request,
            secret: process.env.NEXTAUTH_SECRET,
            cookieName: isSecure ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
          }) as AuthToken | null;
        }
        
        if (token && process.env.NODE_ENV === 'development') {
          console.log('[Middleware] NextAuth session found:', { tier: token.tier, role: token.role, id: token.id });
        }
      } catch (tokenError) {
        // If token extraction fails, treat as logged-out user
        if (process.env.NODE_ENV === 'development') {
          console.warn('Failed to extract auth token:', tokenError);
        }
      }
    }

    // Get user tier and ID from token
    const tier = getUserTierFromToken(token);
    const userId = getUserIdFromToken(token);
    if (process.env.NODE_ENV === 'development') {
      console.log('[Middleware] Final tier:', tier, 'userId:', userId);
    }

    // Get or create guest_id cookie (for logged-out users)
    // Create a temporary response to set cookies
    const tempResponse = NextResponse.next();
    let guestId: string | undefined;

    if (tier === 'logged-out') {
      const { guestId: id, isNew } = getOrCreateGuestId(request, tempResponse);
      guestId = id;
      if (isNew && process.env.NODE_ENV === 'development') {
        console.log('[Middleware] Created new guest_id:', guestId);
      }
    }
    
    const rateLimitResult = await checkRateLimit(tier, request, userId, guestId);

    // Update user last_seen (authenticated users)
    if (userId) {
      trackUserActivity(userId);
    }

    // Track guest activity asynchronously (for logged-out users)
    if (tier === 'logged-out' && guestId) {
      const ip = getClientIP(request);
      const userAgent = request.headers.get('user-agent') || 'unknown';
      const limitHit = !rateLimitResult.success;
      // Fire and forget - don't await
      trackGuestActivity(guestId, ip, userAgent, limitHit).catch(err => {
        console.error('Failed to track guest activity:', err);
      });
    }

    const isApiRoute = request.nextUrl.pathname.startsWith('/api/');

    // Create final response (will be used whether rate limited or not)
    response = rateLimitResult.success
      ? NextResponse.next()
      : isApiRoute
        ? new NextResponse(
            JSON.stringify({
              error: 'Rate limit exceeded',
              message: 'Too many requests. Please try again later.',
            }),
            {
              status: 429,
              headers: {
                'Content-Type': 'application/json',
              },
            }
          )
        : // For page routes, redirect to home with rate limit error
          NextResponse.redirect(
            new URL(`/?rateLimitExceeded=true&resetTime=${rateLimitResult.reset}`, request.url)
          );

    // Copy guest_id cookie to final response if it was set
    if (tier === 'logged-out' && guestId) {
      const isSecure = request.url.startsWith('https://');
      response.cookies.set('guest_id', guestId, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365, // 1 year
        path: '/',
      });
    }

    // Add CORS headers for API routes
    if (isApiRoute) {
      setCorsHeaders(response, request);
    }

    // Add rate limit headers
    response.headers.set('X-RateLimit-Limit', rateLimitResult.limit === Infinity ? 'unlimited' : rateLimitResult.limit.toString());
    response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining === Infinity ? 'unlimited' : rateLimitResult.remaining.toString());
    response.headers.set('X-RateLimit-Reset', rateLimitResult.reset.toString());

    // If rate limited, add Retry-After header (seconds until reset)
    if (!rateLimitResult.success) {
      const retryAfter = Math.ceil((rateLimitResult.reset - Date.now()) / 1000);
      response.headers.set('Retry-After', retryAfter.toString());
    }

    return response;
  } catch (error) {
    // If rate limiting fails, fail open (allow request) but log error
    console.error('Rate limiting error:', error);
    const response = NextResponse.next();
    if (request.nextUrl.pathname.startsWith('/api/')) {
      setCorsHeaders(response, request);
    }
    return response;
  }
}

// Run on every request except Next.js internals and static assets (so last_seen and rate limits apply to all routes without hardcoding)
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot)$).*)',
  ],
};


