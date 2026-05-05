/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow per-process build dir override so two parallel `next dev` runs
  // (e.g. hide-paid review + research-room slice work) don't share `.next/`
  // and corrupt each other's webpack cache. Default unchanged.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  allowedDevOrigins: ['192.168.1.143', '100.100.120.57'],
  transpilePackages: ['react-google-recaptcha'],
  webpack(config, { dev }) {
    if (dev) {
      // Prevents chunk ID instability in dev mode when new CSS-importing
      // client components are added (was causing MODULE_NOT_FOUND crashes).
      config.optimization.moduleIds = 'deterministic'
    }
    return config
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'flagcdn.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // Catch-all: school logos and hero images come from hundreds of CDNs
      { protocol: 'https', hostname: '**' },
    ],
  },
  async redirects() {
    return [
      {
        source: '/blog/singapore-international-school-guide-2025',
        destination: '/blog/singapore-international-school-guide-2026',
        permanent: true,
      },
    ]
  },
  async headers() {
    // Baseline CSP — covers Google Maps, reCAPTCHA, GA, PostHog, Stripe.
    // 'unsafe-inline' for script + style is needed by Next 14's inline runtime
    // bootstrap and reCAPTCHA; tighten to nonces in a future hardening pass.
    const CSP = [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://www.google.com https://www.gstatic.com https://us-assets.i.posthog.com https://us.i.posthog.com https://js.stripe.com https://www.recaptcha.net",
      "connect-src 'self' https://*.supabase.co https://www.google-analytics.com https://region1.google-analytics.com https://us.i.posthog.com https://*.posthog.com https://api.stripe.com",
      "img-src 'self' data: blob: https:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "frame-src 'self' https://www.google.com https://www.recaptcha.net https://maps.google.com https://js.stripe.com https://hooks.stripe.com",
      "worker-src 'self' blob:",
    ].join('; ')

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy',    value: CSP },
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'X-Frame-Options',            value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection',           value: '1; mode=block' },
          { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',         value: 'geolocation=(), microphone=(), camera=()' },
          // 1 year, no preload/includeSubDomains until all *.nanasays.school subdomains are HTTPS-audited.
          { key: 'Strict-Transport-Security',  value: 'max-age=31536000' },
        ],
      },
      {
        // No caching on sensitive API endpoints
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
        ],
      },
    ]
  },
}

export default nextConfig
