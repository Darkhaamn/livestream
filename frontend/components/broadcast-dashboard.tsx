"use client"

import Link from "next/link"
import {
  IconArrowUp,
  IconEye,
  IconRefresh,
  IconVideo,
} from "@tabler/icons-react"
import { useEffect, useState } from "react"

import { HealthBadge } from "@/components/stream/health-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { getPath } from "@/lib/mtx-api"
import type { PathSummary } from "@/lib/mtx-types"
import {
  formatViewerCount,
  getStreamHealth,
  getStreamResolution,
} from "@/lib/stream-health"
import { formatBytes, formatMbps } from "@/lib/stream"

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
    <div className="rounded-lg bg-[#1c1c21] p-4">
      <div className="mb-2 flex items-center gap-2 text-white/40">
        <Icon className="size-4" />
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-xl font-bold tracking-tight ${highlight ? "text-[#53fc18]" : ""}`}>
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-white/40">{sub}</p> : null}
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
    <div className="rounded-xl border border-white/[0.06] bg-[#141417] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-bold tracking-widest text-white/40 uppercase">
          Stream health
        </p>
        <div className="flex items-center gap-2">
          {isLive ? (
            <span className="inline-flex items-center rounded-full border border-[#53fc18]/30 bg-[#53fc18]/10 px-2.5 py-0.5 text-xs font-semibold text-[#53fc18]">
              ● Live
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-white/50">
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
              <Skeleton key={i} className="h-24 rounded-lg bg-white/5" />
            ))}
          </div>
        ) : (
          <>
            <div
              className={`rounded-lg border p-4 ${
                health.status === "healthy"
                  ? "border-[#53fc18]/20 bg-[#53fc18]/5"
                  : health.status === "critical"
                    ? "border-[#eb0400]/30 bg-[#eb0400]/10"
                    : health.status === "warning"
                      ? "border-amber-500/20 bg-amber-500/5"
                      : "border-white/[0.06] bg-[#1c1c21]"
              }`}
            >
              <p className="text-sm font-semibold">{health.label}</p>
              <p className="mt-1 text-sm text-white/50">{health.description}</p>
              {!isLive ? (
                <p className="mt-3 text-xs text-white/40">
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
                <div className="h-px bg-white/[0.06]" />
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-md bg-black/40 px-2 py-0.5 font-mono text-xs text-white/70">
                    {streamKey}
                  </span>
                  {stream?.members
                    .filter((m) => m.state === "publish")
                    .map((pub) => (
                      <span
                        key={pub.id}
                        className="inline-flex items-center rounded-md bg-white/10 px-2 py-0.5 text-xs text-white/70"
                      >
                        {pub.device}
                      </span>
                    ))}
                </div>
                <Link
                  href={`/watch/${encodeURIComponent(streamKey)}`}
                  className="flex w-full items-center justify-center rounded-lg bg-[#53fc18] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#46d614]"
                >
                  Open viewer page
                </Link>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
