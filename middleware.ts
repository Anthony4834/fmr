import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
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

    // Add CORS headers to all API responses
    const response = NextResponse.next();
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
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

export const config = {
  matcher: ['/api/:path*', '/sitemaps/zips/:path*', '/sitemaps/cities/:path*', '/sitemaps/counties/:path*'],
};


