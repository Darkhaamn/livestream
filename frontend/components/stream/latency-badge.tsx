import { Badge } from "@/components/ui/badge"
import {
  getLatencyLabel,
  getLatencyLevel,
  type LatencyLevel,
} from "@/lib/stream-health"
import { cn } from "@/lib/utils"

const levelStyles: Record<LatencyLevel, string> = {
  ultra: "border-emerald-500/30 bg-emerald-500/20 text-emerald-300",
  low: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400",
  normal: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  high: "border-red-500/30 bg-red-500/20 text-red-300",
  unknown: "border-white/10 bg-black/50 text-white/70",
}

type LatencyBadgeProps = {
  latencyMs: number | null
  protocol?: "webrtc" | "hls"
  className?: string
}

export function LatencyBadge({ latencyMs, className }: LatencyBadgeProps) {
  const level = getLatencyLevel(latencyMs)
  const label = getLatencyLabel(level)
  const ms =
    latencyMs !== null && !Number.isNaN(latencyMs)
      ? `${Math.round(latencyMs)}ms`
      : null

  const shortLabel =
    level === "ultra" || level === "low"
      ? "Low latency"
      : level === "normal"
        ? "Normal"
        : level === "high"
          ? "High latency"
          : label

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 border font-medium backdrop-blur-sm",
        levelStyles[level],
        className,
      )}
    >
      {shortLabel}
      {ms ? <span className="opacity-70">{ms}</span> : null}
    </Badge>
  )
}
