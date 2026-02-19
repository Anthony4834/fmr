/** @type {import('next').NextConfig} */
const nextConfig = {
  // Force server output so `next build` doesn't behave like a static export.
  // This prevents "Cannot find module for page: /..." errors when you have App Router routes
  // (including route handlers like `/api/*` and metadata routes like `/sitemap.xml`).
  output: 'standalone',

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },

  async rewrites() {
    return [
      // Keep pretty *.xml URLs while using supported dynamic segments in the App Router.
      {
        source: '/sitemaps/zips/:digit(\\d).xml',
        destination: '/sitemaps/zips/:digit',
      },
      {
        source: '/sitemaps/cities/:state([a-zA-Z]{2}).xml',
        destination: '/sitemaps/cities/:state',
      },
      {
        source: '/sitemaps/counties/:state([a-zA-Z]{2}).xml',
        destination: '/sitemaps/counties/:state',
      },
    ];
  },
};

module.exports = nextConfig;


