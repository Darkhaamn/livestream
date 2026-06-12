import type { PathSummary } from "@/lib/mtx-types"

export type StreamHealthStatus = "offline" | "healthy" | "warning" | "critical"

export type StreamHealth = {
  status: StreamHealthStatus
  label: string
  description: string
}

export type LatencyLevel = "ultra" | "low" | "normal" | "high" | "unknown"

export function getStreamHealth(stream: PathSummary | null): StreamHealth {
  if (!stream?.online) {
    return {
      status: "offline",
      label: "Offline",
      description: "Waiting for encoder connection",
    }
  }

  const inbound = stream.bandwidth.inboundMbps
  const frameErrors = stream.inboundFramesInError ?? 0

  if (frameErrors > 0) {
    return {
      status: "critical",
      label: "Lagging",
      description: `${frameErrors} frame error${frameErrors === 1 ? "" : "s"} detected`,
    }
  }

  if (inbound < 0.3) {
    return {
      status: "warning",
      label: "Weak signal",
      description: "Inbound bitrate is very low",
    }
  }

  if (inbound < 1.0) {
    return {
      status: "warning",
      label: "Degraded",
      description: "Bitrate below recommended levels",
    }
  }

  return {
    status: "healthy",
    label: "Healthy",
    description: "Stream is stable",
  }
}

export function getLatencyLevel(latencyMs: number | null): LatencyLevel {
  if (latencyMs === null || Number.isNaN(latencyMs)) return "unknown"
  if (latencyMs < 1000) return "ultra"
  if (latencyMs < 3000) return "low"
  if (latencyMs < 8000) return "normal"
  return "high"
}

export function getLatencyLabel(level: LatencyLevel): string {
  switch (level) {
    case "ultra":
      return "Ultra low"
    case "low":
      return "Low latency"
    case "normal":
      return "Normal"
    case "high":
      return "High latency"
    default:
      return "Measuring…"
  }
}

export function formatViewerCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 10_000) return `${(count / 1_000).toFixed(1)}K`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return String(count)
}

export function getStreamResolution(stream: PathSummary | null): string | null {
  const track = stream?.tracks2?.find((t) => t.codec === "H264")
  const w = track?.codecProps?.width
  const h = track?.codecProps?.height
  if (typeof w === "number" && typeof h === "number") {
    return `${w}×${h}`
  }
  return null
}
