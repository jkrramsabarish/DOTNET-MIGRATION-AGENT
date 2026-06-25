/** @type {import('next').NextConfig} */
// NOTE (for upgrade testing): this config intentionally uses patterns that
// change across Next.js 13 -> 15:
//   - `images.domains`  is deprecated in favor of `images.remotePatterns`
//   - `swcMinify`       is the default (and the option is removed) in Next 15
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['images.unsplash.com', 'cdn.example.com'],
  },
};

module.exports = nextConfig;
