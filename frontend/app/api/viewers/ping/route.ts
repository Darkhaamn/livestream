import { headers } from "next/headers"
import { NextResponse } from "next/server"

const mtxApiUrl = process.env.MTX_API_URL ?? "http://localhost:8080"

function resolveClientIP(incoming: Headers, request: Request) {
  return (
    incoming.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    incoming.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("true-client-ip") ||
    ""
  )
}

export async function POST(request: Request) {
  const incoming = await headers()
  const body = await request.text()
  const clientIP = resolveClientIP(incoming, request)

  const forwardHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": incoming.get("user-agent") ?? request.headers.get("user-agent") ?? "",
  }
  if (clientIP) {
    forwardHeaders["X-Forwarded-For"] = clientIP
    forwardHeaders["X-Real-IP"] = clientIP
  }

  const response = await fetch(`${mtxApiUrl}/api/viewers/ping`, {
    method: "POST",
    headers: forwardHeaders,
    body,
    cache: "no-store",
  })

  const text = await response.text()
  return new NextResponse(text, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  })
}
