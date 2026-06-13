"use client"

import Link from "next/link"
import { IconArrowUp, IconEye, IconRefresh, IconVideo } from "@tabler/icons-react"
import { useEffect, useState } from "react"

import { HealthBadge } from "@/components/stream/health-badge"
import { StreamInfoEditor } from "@/components/stream/stream-info-editor"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getPath } from "@/lib/mtx-api"
import type { PathSummary } from "@/lib/mtx-types"
import { formatViewerCount, getStreamHealth, getStreamResolution } from "@/lib/stream-health"
import { formatBytes, formatMbps } from "@/lib/stream"
import { cn } from "@/lib/utils"

type BroadcastDashboardProps = {
  streamKey: string
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  highlight = false,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ComponentType<{ className?: string }>
  highlight?: boolean
}) {
  return (
    <div className="surface-muted p-4">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className={cn("text-xl font-bold tracking-tight text-foreground", highlight && "text-primary-text")}>
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

export default function BroadcastDashboard({ streamKey }: BroadcastDashboardProps) {
  const [stream, setStream] = useState<PathSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const data = await getPath(streamKey)
        if (!active) return
        setStream(data)
      } catch {
        if (!active) return
        setStream(null)
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    const timer = window.setInterval(() => void load(), 2000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [streamKey])

  const health = getStreamHealth(stream)
  const resolution = getStreamResolution(stream)
  const isLive = stream?.online ?? false
  const frameErrors = stream?.inboundFramesInError ?? 0

  return (
    <div className="surface-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Stream health
        </p>
        <div className="flex items-center gap-2">
          {isLive ? (
            <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary-text">
              ● Live
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              Offline
            </span>
          )}
          <HealthBadge stream={stream} />
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {loading && !stream ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            <div
              className={cn(
                "rounded-lg border p-4",
                health.status === "healthy" && "border-primary/20 bg-primary/5",
                health.status === "critical" && "border-destructive/30 bg-destructive/10",
                health.status === "warning" && "border-amber-500/20 bg-amber-500/5",
                health.status === "offline" && "surface-muted border-border",
              )}
            >
              <p className="text-sm font-semibold text-foreground">{health.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{health.description}</p>
              {!isLive ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Start streaming in OBS to see live metrics here.
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard
                label="Inbound"
                value={formatMbps(stream?.bandwidth.inboundMbps ?? 0)}
                sub={`${formatBytes(stream?.bandwidth.inboundBytes ?? 0)} total`}
                icon={IconArrowUp}
                highlight={health.status === "healthy"}
              />
              <StatCard
                label="Outbound"
                value={formatMbps(stream?.bandwidth.outboundMbps ?? 0)}
                sub={`${formatBytes(stream?.bandwidth.outboundBytes ?? 0)} total`}
                icon={IconRefresh}
                highlight={health.status === "healthy"}
              />
              <StatCard
                label="Viewers"
                value={formatViewerCount(stream?.viewerCount ?? 0)}
                sub={`${stream?.viewers.length ?? 0} connected`}
                icon={IconEye}
              />
              <StatCard
                label="Quality"
                value={resolution ?? "—"}
                sub={
                  frameErrors > 0
                    ? `${frameErrors} frame error${frameErrors === 1 ? "" : "s"}`
                    : isLive
                      ? "No frame errors"
                      : "Waiting for stream"
                }
                icon={IconVideo}
              />
            </div>

            {isLive ? (
              <>
                <div className="h-px bg-border" />
                <div>
                  <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Edit stream info
                  </p>
                  <StreamInfoEditor compact />
                </div>
                <div className="h-px bg-border" />
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                    {streamKey}
                  </span>
                  {stream?.members
                    .filter(m => m.state === "publish")
                    .map(pub => (
                      <span
                        key={pub.id}
                        className="inline-flex items-center rounded-md bg-accent px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {pub.device}
                      </span>
                    ))}
                </div>
                <Button asChild className="w-full">
                  <Link href={`/watch/${encodeURIComponent(streamKey)}`}>Open viewer page</Link>
                </Button>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
