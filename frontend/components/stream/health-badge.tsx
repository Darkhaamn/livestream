import { Badge } from "@/components/ui/badge"
import { getStreamHealth, type StreamHealthStatus } from "@/lib/stream-health"
import type { PathSummary } from "@/lib/mtx-types"
import { cn } from "@/lib/utils"

const statusStyles: Record<StreamHealthStatus, string> = {
  offline: "border-zinc-500/30 bg-zinc-500/15 text-zinc-400",
  healthy: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400",
  warning: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  critical: "border-red-500/30 bg-red-500/20 text-red-300",
}

type HealthBadgeProps = {
  stream: PathSummary | null
  className?: string
  showDot?: boolean
  /** Smoothed inbound Mbps — avoids flicker from instant samples. */
  inboundMbps?: number
}

export function HealthBadge({
  stream,
  className,
  showDot = true,
  inboundMbps,
}: HealthBadgeProps) {
  const health = getStreamHealth(stream, { inboundMbps })

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 border font-medium",
        statusStyles[health.status],
        className
      )}
    >
      {showDot ? (
        <span
          className={cn(
            "inline-block size-2 rounded-full",
            health.status === "healthy" && "bg-emerald-400",
            health.status === "warning" && "bg-amber-400",
            health.status === "critical" && "bg-red-500",
            health.status === "offline" && "bg-zinc-500"
          )}
        />
      ) : null}
      {health.label}
    </Badge>
  )
}
