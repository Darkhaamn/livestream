import type { PathSummary } from "@/lib/mtx-types"

export type StreamHealthStatus = "offline" | "healthy" | "warning" | "critical"

export type StreamHealth = {
  status: StreamHealthStatus
  label: string
  description: string
}

export type LatencyLevel = "ultra" | "low" | "normal" | "high" | "unknown"

/** Minimum inbound Mbps before the stream is considered degraded. */
export const INBOUND_RECOMMENDED_MBPS = 1.0

/** Inbound Mbps below this often causes lag / weak signal. */
export const INBOUND_LAG_RISK_MBPS = 0.3

export function getStreamHealth(
  stream: PathSummary | null,
  options?: { inboundMbps?: number },
): StreamHealth {
  if (!stream?.online) {
    return {
      status: "offline",
      label: "Offline",
      description: "Waiting for encoder connection",
    }
  }

  const inbound = options?.inboundMbps ?? stream.bandwidth.inboundMbps
  const frameErrors = stream.inboundFramesInError ?? 0

  if (frameErrors > 0) {
    return {
      status: "critical",
      label: "Lagging",
      description: `${frameErrors} frame error${frameErrors === 1 ? "" : "s"} detected`,
    }
  }

  if (inbound < INBOUND_LAG_RISK_MBPS) {
    return {
      status: "warning",
      label: "Weak signal",
      description: "Average inbound bitrate is very low",
    }
  }

  if (inbound < INBOUND_RECOMMENDED_MBPS) {
    return {
      status: "warning",
      label: "Degraded",
      description: "Average inbound bitrate below recommended",
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

export function getInboundBitrateStatus(mbps: number): {
  level: "healthy" | "degraded" | "critical"
  label: string
} {
  if (mbps < INBOUND_LAG_RISK_MBPS) {
    return { level: "critical", label: "Lag risk — bitrate very low" }
  }
  if (mbps < INBOUND_RECOMMENDED_MBPS) {
    return { level: "degraded", label: "Below recommended — may stutter" }
  }
  return { level: "healthy", label: "Bitrate OK" }
}
