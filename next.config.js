/** @type {import('next').NextConfig} */
const nextConfig = {
  // Force server output so `next build` doesn't behave like a static export.
  // This prevents "Cannot find module for page: /..." errors when you have App Router routes
  // (including route handlers like `/api/*` and metadata routes like `/sitemap.xml`).
  output: 'standalone',
};

module.exports = nextConfig;


