import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
  matcher: ['/sitemaps/zips/:path*', '/sitemaps/cities/:path*', '/sitemaps/counties/:path*'],
};


