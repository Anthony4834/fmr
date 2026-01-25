import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { checkRateLimit, getUserTierFromToken, getUserIdFromToken, type AuthToken } from '@/lib/rate-limit';
import * as jose from 'jose';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle CORS for API routes (allow Chrome extension requests)
  if (pathname.startsWith('/api/')) {
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Skip rate limiting for cron endpoints
    if (pathname.startsWith('/api/cron/')) {
      const response = NextResponse.next();
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return response;
    }

    // Skip rate limiting for auth endpoints (they have their own rate limiting)
    if (pathname.startsWith('/api/auth/')) {
      const response = NextResponse.next();
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return response;
    }

    // Skip rate limiting for contact endpoint (it has its own separate rate limiting)
    if (pathname === '/api/contact') {
      const response = NextResponse.next();
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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

  return NextResponse.next();
}

/**
 * Validate extension Bearer token and extract user info
 * Uses jose for Edge Runtime compatibility
 */
async function validateExtensionToken(authHeader: string | null): Promise<AuthToken | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('[Middleware] No Bearer token in auth header');
    return null;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    console.log('[Middleware] Empty token after Bearer');
    return null;
  }

  try {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      console.log('[Middleware] NEXTAUTH_SECRET not configured');
      return null;
    }

    console.log('[Middleware] Attempting to verify JWT token with jose...');
    
    // Create secret key for jose
    const secretKey = new TextEncoder().encode(secret);
    
    // Verify the token
    const { payload } = await jose.jwtVerify(token, secretKey);
    
    console.log('[Middleware] JWT decoded successfully:', { type: payload.type, tier: payload.tier, sub: payload.sub });
    
    // Check if this is an extension token
    if (payload.type !== 'extension_access') {
      console.log('[Middleware] Token type is not extension_access:', payload.type);
      return null;
    }

    console.log('[Middleware] Extension token validated, tier:', payload.tier);
    return {
      id: payload.sub as string,
      email: payload.email as string,
      tier: payload.tier as string,
      role: payload.role as string,
    };
  } catch (error) {
    // Token invalid or expired
    console.log('[Middleware] JWT verification failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Handle rate limiting for API requests and page requests
 */
async function handleRateLimit(request: NextRequest): Promise<NextResponse> {
  try {
    // First check for extension Bearer token
    const authHeader = request.headers.get('authorization');
    console.log('[Middleware] Auth header present:', !!authHeader);
    let token: AuthToken | null = await validateExtensionToken(authHeader);

    // If no extension token, try NextAuth session token
    if (!token) {
      console.log('[Middleware] No extension token, trying NextAuth session');
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
        
        if (token) {
          console.log('[Middleware] NextAuth session found:', { tier: token.tier, role: token.role, id: token.id });
        }
      } catch (tokenError) {
        // If token extraction fails, treat as logged-out user
        console.warn('Failed to extract auth token:', tokenError);
      }
    }

    // Get user tier and ID from token
    const tier = getUserTierFromToken(token);
    const userId = getUserIdFromToken(token);
    console.log('[Middleware] Final tier:', tier, 'userId:', userId);
    
    const rateLimitResult = await checkRateLimit(tier, request, userId);

    const isApiRoute = request.nextUrl.pathname.startsWith('/api/');

    // Create response (will be used whether rate limited or not)
    const response = rateLimitResult.success
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

    // Add CORS headers for API routes
    if (isApiRoute) {
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
    const isApiRoute = request.nextUrl.pathname.startsWith('/api/');
    if (isApiRoute) {
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    return response;
  }
}

export const config = {
  matcher: ['/api/:path*', '/zip/:path*', '/county/:path*', '/sitemaps/zips/:path*', '/sitemaps/cities/:path*', '/sitemaps/counties/:path*'],
};


