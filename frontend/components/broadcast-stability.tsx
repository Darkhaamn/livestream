"use client"

import { IconChartLine } from "@tabler/icons-react"
import { useEffect, useState } from "react"

import { StreamMetricsChart } from "@/components/stream/stream-metrics-chart"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { getPath } from "@/lib/mtx-api"
import type { StreamMetricSample } from "@/lib/stream-metrics"

type BroadcastStabilityProps = {
  streamKey: string
  isLive?: boolean
}

export default function BroadcastStability({
  streamKey,
  isLive: isLiveProp,
}: BroadcastStabilityProps) {
  const { accessToken } = useAuth()
  const [polledLive, setPolledLive] = useState(false)
  const [polledLoading, setPolledLoading] = useState(isLiveProp === undefined)
  const [fetchedSamples, setFetchedSamples] = useState<StreamMetricSample[]>([])

  const isLive = isLiveProp ?? polledLive
  const loading = isLiveProp !== undefined ? false : polledLoading
  const metricSamples = accessToken && isLive ? fetchedSamples : []

  useEffect(() => {
    if (isLiveProp !== undefined) return

    let active = true

    async function load() {
      try {
        const data = await getPath(streamKey)
        if (!active) return
        setPolledLive(data.online)
      } catch {
        if (!active) return
        setPolledLive(false)
      } finally {
        if (active) setPolledLoading(false)
      }
    }

    void load()
    const timer = window.setInterval(() => void load(), 4000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [streamKey, isLiveProp])

  useEffect(() => {
    if (!accessToken || !isLive) return

    let active = true

    async function loadMetrics() {
      if (!accessToken) return
      try {
        const data = await api.users.streamMetrics(accessToken)
        if (!active) return
        setFetchedSamples(data.samples)
      } catch {
        // keep last samples on transient errors
      }
    }

    void loadMetrics()
    const timer = window.setInterval(() => void loadMetrics(), 5000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [accessToken, isLive, streamKey])

  return (
    <Card className="overflow-hidden border-primary/15">
      <CardHeader className="border-b border-border/60 bg-muted/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary-text">
              <IconChartLine className="size-5" />
            </div>
            <div>
              <CardTitle>Stream stability</CardTitle>
              <CardDescription className="mt-1">
                Bandwidth and viewers over time — steady lines mean a stable
                broadcast.
              </CardDescription>
            </div>
          </div>
          {isLive ? (
            <Badge
              variant="outline"
              className="border-primary/30 bg-primary/10 text-primary-text"
            >
              Recording metrics
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {loading ? (
          <Skeleton className="h-[280px] w-full rounded-lg md:h-[320px]" />
        ) : (
          <StreamMetricsChart
            samples={metricSamples}
            isLive={isLive}
            size="large"
          />
        )}
      </CardContent>
    </Card>
  )
}
