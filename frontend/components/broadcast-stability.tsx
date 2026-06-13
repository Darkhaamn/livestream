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

export default function BroadcastStability({ streamKey, isLive: isLiveProp }: BroadcastStabilityProps) {
  const { accessToken } = useAuth()
  const [isLive, setIsLive] = useState(isLiveProp ?? false)
  const [metricSamples, setMetricSamples] = useState<StreamMetricSample[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isLiveProp !== undefined) {
      setIsLive(isLiveProp)
    }
  }, [isLiveProp])

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const data = await getPath(streamKey)
        if (!active) return
        if (isLiveProp === undefined) setIsLive(data.online)
      } catch {
        if (!active || isLiveProp !== undefined) return
        setIsLive(false)
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    if (isLiveProp === undefined) {
      const timer = window.setInterval(() => void load(), 4000)
      return () => {
        active = false
        window.clearInterval(timer)
      }
    }

    setLoading(false)
    return () => {
      active = false
    }
  }, [streamKey, isLiveProp])

  useEffect(() => {
    if (!accessToken || !isLive) {
      setMetricSamples([])
      return
    }

    let active = true

    async function loadMetrics() {
      if (!accessToken) return
      try {
        const data = await api.users.streamMetrics(accessToken)
        if (!active) return
        setMetricSamples(data.samples)
      } catch {
        if (!active) return
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
                Bandwidth and viewers over time — steady lines mean a stable broadcast.
              </CardDescription>
            </div>
          </div>
          {isLive ? (
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary-text">
              Recording metrics
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {loading ? (
          <Skeleton className="h-[280px] w-full rounded-lg md:h-[320px]" />
        ) : (
          <StreamMetricsChart samples={metricSamples} isLive={isLive} size="large" />
        )}
      </CardContent>
    </Card>
  )
}
