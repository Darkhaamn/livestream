import type { NextConfig } from "next"

const mtxApiUrl = process.env.MTX_API_URL ?? "http://localhost:8080"

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/health", destination: `${mtxApiUrl}/api/health` },
      { source: "/api/dashboard", destination: `${mtxApiUrl}/api/dashboard` },
      {
        source: "/api/paths/:path*",
        destination: `${mtxApiUrl}/api/paths/:path*`,
      },
      {
        source: "/api/streams/:path*",
        destination: `${mtxApiUrl}/api/streams/:path*`,
      },
      { source: "/api/members", destination: `${mtxApiUrl}/api/members` },
      { source: "/api/broadcast", destination: `${mtxApiUrl}/api/broadcast` },
      {
        source: "/api/broadcast/:path*",
        destination: `${mtxApiUrl}/api/broadcast/:path*`,
      },
      {
        source: "/api/thumbnails/:path*",
        destination: `${mtxApiUrl}/api/thumbnails/:path*`,
      },
      // /api/viewers/* handled by app/api/viewers route handlers (real client IP)
    ]
  },
  allowedDevOrigins: ["http://localhost:3000", "http://localhost:3000"],
}

export default nextConfig
