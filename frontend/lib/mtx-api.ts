import type { BroadcastConfig, Dashboard, PathSummary } from "@/lib/mtx-types"

const API_BASE = process.env.NEXT_PUBLIC_MTX_API_URL ?? ""

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init })
  if (!res.ok) {
    const body = await res.text()
    if (res.status === 404) {
      throw new Error("not found")
    }
    let message = body || res.statusText
    try {
      const json = JSON.parse(body) as { error?: string }
      if (json.error) message = json.error
    } catch {
      // use raw body
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export function getDashboard() {
  return fetchJSON<Dashboard>("/api/dashboard")
}

export function getLiveStreams() {
  return fetchJSON<PathSummary[]>("/api/streams/live")
}

export function getPath(name: string) {
  return fetchJSON<PathSummary>(`/api/paths/${encodeURIComponent(name)}`)
}

export function getBroadcastConfig() {
  return fetchJSON<BroadcastConfig>("/api/broadcast")
}

export function generateStreamKey() {
  return fetchJSON<BroadcastConfig>("/api/broadcast/key", { method: "POST" })
}

export function pingViewer(path: string, viewerId: string) {
  return fetchJSON<{ id: string }>("/api/viewers/ping", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path,
      viewerId,
      userAgent: navigator.userAgent,
    }),
  })
}

export function leaveViewer(path: string, viewerId: string) {
  return fetchJSON<{ status: string }>("/api/viewers/leave", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, viewerId }),
  })
}

export interface Vod {
  id: string
  path: string
  startedAt: string
  sizeBytes: number
  url: string
  sessionId?: number
  title?: string
  category?: string
}

export function getVods(path?: string) {
  return fetchJSON<Vod[]>(
    `/api/vods${path ? `?path=${encodeURIComponent(path)}` : ""}`
  )
}

export function buildVodUrl(vod: Vod) {
  const mediaCdn = process.env.NEXT_PUBLIC_MEDIA_CDN_BASE
  if (mediaCdn) {
    return `${mediaCdn.replace(/\/+$/, "")}/recordings/${vod.id}`
  }
  return `${API_BASE}${vod.url}`
}
