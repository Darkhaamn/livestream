"use client"

import Link from "next/link"
import {
  IconArrowUp,
  IconEye,
  IconExternalLink,
  IconRefresh,
  IconVideo,
} from "@tabler/icons-react"
import { useEffect, useState } from "react"

import { HealthBadge } from "@/components/stream/health-badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { getPath } from "@/lib/mtx-api"
import type { PathSummary } from "@/lib/mtx-types"
import {
  formatViewerCount,
  getStreamHealth,
  getStreamResolution,
} from "@/lib/stream-health"
import { rollingMean } from "@/lib/stream-metrics"
import { formatBytes, formatMbps } from "@/lib/stream"
import { cn } from "@/lib/utils"

type BroadcastLiveStatsProps = {
  streamKey: string
}

const INBOUND_SMOOTH_WINDOW = 6

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
}: {
  label: string
  value: string
  sub?: string
  icon: React.ComponentType<{ className?: string }>
  tone?: "default" | "primary" | "warning"
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        tone === "primary" && "border-primary/20 bg-primary/[0.06]",
        tone === "warning" && "border-amber-500/20 bg-amber-500/[0.06]",
        tone === "default" && "border-border bg-muted/30"
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <div
          className={cn(
            "flex size-8 items-center justify-center rounded-lg",
            tone === "primary" && "bg-primary/15 text-primary-text",
            tone === "warning" &&
              "bg-amber-500/15 text-amber-600 dark:text-amber-400",
            tone === "default" && "bg-background text-muted-foreground"
          )}
        >
          <Icon className="size-4" />
        </div>
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
      </div>
      <p className="text-xl font-bold tracking-tight text-foreground tabular-nums">
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

export default function BroadcastLiveStats({
  streamKey,
}: BroadcastLiveStatsProps) {
  const [stream, setStream] = useState<PathSummary | null>(null)
  const [inboundHistory, setInboundHistory] = useState<number[]>([])
  const [outboundHistory, setOutboundHistory] = useState<number[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const data = await getPath(streamKey)
        if (!active) return
        setStream(data)
        if (data.online) {
          setInboundHistory((prev) =>
            [...prev, data.bandwidth.inboundMbps].slice(-INBOUND_SMOOTH_WINDOW)
          )
          setOutboundHistory((prev) =>
            [...prev, data.bandwidth.outboundMbps].slice(-INBOUND_SMOOTH_WINDOW)
          )
        } else {
          setInboundHistory([])
          setOutboundHistory([])
        }
      } catch {
        if (!active) return
        setStream(null)
        setInboundHistory([])
        setOutboundHistory([])
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

  const smoothedInbound = rollingMean(inboundHistory, INBOUND_SMOOTH_WINDOW)
  const smoothedOutbound = rollingMean(outboundHistory, INBOUND_SMOOTH_WINDOW)
  const health = getStreamHealth(stream, { inboundMbps: smoothedInbound })
  const resolution = getStreamResolution(stream)
  const isLive = stream?.online ?? false
  const frameErrors = stream?.inboundFramesInError ?? 0

  const healthTone =
    health.status === "healthy"
      ? "primary"
      : health.status === "warning"
        ? "warning"
        : "default"

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Live stats</CardTitle>
          <CardDescription className="mt-1">
            Real-time encoder and viewer metrics
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary-text">
              <span className="size-1.5 rounded-full bg-primary" />
              Live
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              Offline
            </span>
          )}
          <HealthBadge stream={stream} inboundMbps={smoothedInbound} />
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {loading && !stream ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            <div
              className={cn(
                "rounded-xl border px-4 py-3",
                health.status === "healthy" &&
                  "border-primary/20 bg-primary/[0.06]",
                health.status === "critical" &&
                  "border-destructive/30 bg-destructive/10",
                health.status === "warning" &&
                  "border-amber-500/20 bg-amber-500/[0.06]",
                health.status === "offline" && "border-border bg-muted/30"
              )}
            >
              <p className="text-sm font-semibold text-foreground">
                {health.label}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {health.description}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard
                label="Inbound"
                value={formatMbps(
                  smoothedInbound || stream?.bandwidth.inboundMbps || 0
                )}
                sub={`~${INBOUND_SMOOTH_WINDOW * 2}s avg`}
                icon={IconArrowUp}
                tone={healthTone}
              />
              <StatCard
                label="Outbound"
                value={formatMbps(
                  smoothedOutbound || stream?.bandwidth.outboundMbps || 0
                )}
                sub={formatBytes(stream?.bandwidth.outboundBytes ?? 0)}
                icon={IconRefresh}
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
              <div className="flex flex-col gap-3 border-t border-border pt-4">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-md border border-border bg-muted/50 px-2 py-1 font-mono text-xs text-foreground">
                    {streamKey}
                  </span>
                  {stream?.members
                    .filter((m) => m.state === "publish")
                    .map((pub) => (
                      <span
                        key={pub.id}
                        className="inline-flex items-center rounded-md bg-accent px-2 py-1 text-xs text-muted-foreground"
                      >
                        {pub.device}
                      </span>
                    ))}
                </div>
                <Button asChild className="w-full">
                  <Link href={`/watch/${encodeURIComponent(streamKey)}`}>
                    <IconExternalLink
                      className="size-4"
                      data-icon="inline-start"
                    />
                    Open viewer page
                  </Link>
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
