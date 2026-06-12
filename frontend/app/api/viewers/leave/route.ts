import { NextResponse } from "next/server"

const mtxApiUrl = process.env.MTX_API_URL ?? "http://localhost:8080"

export async function POST(request: Request) {
  const body = await request.text()

  const response = await fetch(`${mtxApiUrl}/api/viewers/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    cache: "no-store",
  })

  const text = await response.text()
  return new NextResponse(text, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  })
}
