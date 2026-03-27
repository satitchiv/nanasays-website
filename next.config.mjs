/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['react-google-recaptcha'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'flagcdn.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
}

export default nextConfig
