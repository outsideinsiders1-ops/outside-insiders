/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable static exports if needed, but we'll use SSR for now
  // output: 'export',
  
  // Increase body size limit for large file uploads
  // Note: Vercel has its own limits (10MB for Hobby, 4.5MB for Pro)
  // Large files should use chunked uploads to Supabase Storage first
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // This is for Server Actions, not API routes
    },
  },
}

export default nextConfig

