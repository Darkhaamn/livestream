import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers)

  if (!headers.get("x-forwarded-for")) {
    const ip =
      headers.get("x-real-ip") ||
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-vercel-forwarded-for")

    if (ip) {
      headers.set("x-forwarded-for", ip)
      headers.set("x-real-ip", ip)
    }
  }

  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: "/api/viewers/:path*",
}
