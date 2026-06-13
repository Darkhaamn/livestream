"use client"

import { useMemo } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import { Badge } from "@/components/ui/badge"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  averageRecentInbound,
  averageRecentOutbound,
  buildSmoothedChartPoints,
  computeStreamStability,
  METRICS_ROLLING_WINDOW,
  type SmoothedChartPoint,
  type StreamMetricSample,
} from "@/lib/stream-metrics"
import {
  getInboundBitrateStatus,
  INBOUND_LAG_RISK_MBPS,
  INBOUND_RECOMMENDED_MBPS,
} from "@/lib/stream-health"
import { formatMbps } from "@/lib/stream"
import { cn } from "@/lib/utils"

type StreamMetricsChartProps = {
  samples: StreamMetricSample[]
  className?: string
  isLive?: boolean
  size?: "default" | "large"
}

type ChartPoint = SmoothedChartPoint

const chartConfig = {
  inbound: {
    label: "Inbound",
    theme: { light: "hsl(142 71% 40%)", dark: "hsl(142 65% 52%)" },
  },
  outbound: {
    label: "Outbound",
    theme: { light: "hsl(217 91% 55%)", dark: "hsl(217 85% 62%)" },
  },
  viewers: {
    label: "Viewers",
    theme: { light: "hsl(32 95% 44%)", dark: "hsl(38 92% 55%)" },
  },
  thresholdRecommended: {
    label: `Recommended min (${INBOUND_RECOMMENDED_MBPS} Mbps)`,
    theme: { light: "hsl(142 50% 50%)", dark: "hsl(142 45% 55%)" },
  },
  thresholdLag: {
    label: `Lag risk (${INBOUND_LAG_RISK_MBPS} Mbps)`,
    theme: { light: "hsl(0 72% 51%)", dark: "hsl(0 70% 58%)" },
  },
} satisfies ChartConfig

function stabilityBadgeVariant(level: ReturnType<typeof computeStreamStability>["level"]) {
  switch (level) {
    case "stable":
      return "default" as const
    case "moderate":
      return "secondary" as const
    case "unstable":
      return "destructive" as const
    default:
      return "outline" as const
  }
}

function MetricsTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: ChartPoint }>
}) {
  if (!active || !payload?.length) return null

  const point = payload[0]?.payload as ChartPoint | undefined
  if (!point) return null

  const inboundStatus = getInboundBitrateStatus(point.inbound)

  return (
    <div className="grid min-w-[240px] gap-2 rounded-lg border border-border/60 bg-background px-3 py-2.5 text-xs shadow-xl">
      <p className="font-medium text-foreground">{point.time}</p>
      <div className="grid gap-1.5">
        <TooltipRow
          color="var(--color-inbound)"
          label="Inbound"
          value={formatMbps(point.inbound)}
          subValue={`spot ${formatMbps(point.inboundRaw)}`}
          hint={inboundStatus.label}
          hintTone={inboundStatus.level}
        />
        <TooltipRow
          color="var(--color-outbound)"
          label="Outbound"
          value={formatMbps(point.outbound)}
          subValue={`spot ${formatMbps(point.outboundRaw)}`}
        />
        <TooltipRow
          color="var(--color-viewers)"
          label="Viewers"
          value={String(point.viewers)}
        />
        {point.frameErrors > 0 ? (
          <p className="text-destructive">
            {point.frameErrors} frame error{point.frameErrors === 1 ? "" : "s"} — encoder may be lagging
          </p>
        ) : null}
      </div>
    </div>
  )
}

function TooltipRow({
  color,
  label,
  value,
  subValue,
  hint,
  hintTone,
}: {
  color: string
  label: string
  value: string
  subValue?: string
  hint?: string
  hintTone?: "healthy" | "degraded" | "critical"
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          {label}
        </span>
        <div className="text-right">
          <span className="font-mono font-medium tabular-nums text-foreground">{value}</span>
          {subValue ? <p className="text-[10px] text-muted-foreground">{subValue}</p> : null}
        </div>
      </div>
      {hint ? (
        <p
          className={cn(
            "pl-4 text-[11px]",
            hintTone === "critical" && "text-destructive",
            hintTone === "degraded" && "text-amber-600 dark:text-amber-400",
            hintTone === "healthy" && "text-muted-foreground",
          )}
        >
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function StreamMetricsChart({
  samples,
  className,
  isLive = true,
  size = "default",
}: StreamMetricsChartProps) {
  const stability = computeStreamStability(samples)
  const isLarge = size === "large"
  const chartHeight = isLarge ? 320 : 200

  const chartData = useMemo(() => buildSmoothedChartPoints(samples), [samples])

  if (!isLive) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-6 text-center",
          isLarge ? "min-h-[280px] py-16 md:min-h-[320px]" : "py-10",
          className,
        )}
      >
        <p className={cn("font-medium text-foreground", isLarge ? "text-base" : "text-sm")}>
          No live data yet
        </p>
        <p className={cn("mt-2 max-w-md text-muted-foreground", isLarge ? "text-sm" : "text-xs")}>
          Go live in OBS to track bandwidth and viewer stability here.
        </p>
      </div>
    )
  }

  if (samples.length < 2) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-muted/30 px-6 text-center",
          isLarge ? "min-h-[280px] py-16 md:min-h-[320px]" : "py-8",
          className,
        )}
      >
        <Badge variant={stabilityBadgeVariant(stability.level)} className={isLarge ? "text-sm" : undefined}>
          {stability.label}
        </Badge>
        <p className={cn("text-muted-foreground", isLarge ? "text-sm" : "text-xs")}>
          {stability.description}
        </p>
      </div>
    )
  }

  const avgInbound = averageRecentInbound(samples)
  const avgOutbound = averageRecentOutbound(samples)
  const latestInboundStatus = getInboundBitrateStatus(avgInbound)
  const rollingLabel = `last ${Math.min(samples.length, METRICS_ROLLING_WINDOW)} samples (~${Math.min(samples.length, METRICS_ROLLING_WINDOW) * 5}s)`

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={stabilityBadgeVariant(stability.level)} className={isLarge ? "text-sm" : undefined}>
            {stability.label}
          </Badge>
          <Badge
            variant={
              latestInboundStatus.level === "critical"
                ? "destructive"
                : latestInboundStatus.level === "degraded"
                  ? "secondary"
                  : "outline"
            }
          >
            {latestInboundStatus.label}
          </Badge>
        </div>
        <p className={cn("text-muted-foreground", isLarge ? "text-sm" : "text-xs")}>
          {stability.description}. Status uses {rollingLabel} average — not a single spike. Dashed lines:
          recommended ({INBOUND_RECOMMENDED_MBPS} Mbps) and lag-risk ({INBOUND_LAG_RISK_MBPS} Mbps).
        </p>
      </div>

      <ChartContainer
        config={chartConfig}
        className={cn("aspect-auto w-full", isLarge ? "h-[280px] md:h-[320px]" : "h-[200px]")}
        initialDimension={{ width: 640, height: chartHeight }}
      >
        <LineChart
          data={chartData}
          margin={{ left: 8, right: 8, top: 16, bottom: 4 }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="time"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            minTickGap={isLarge ? 64 : 48}
            tick={{ fontSize: isLarge ? 12 : 10 }}
          />
          <YAxis
            yAxisId="bandwidth"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={isLarge ? 44 : 36}
            tick={{ fontSize: isLarge ? 12 : 10 }}
            tickFormatter={value => `${value}`}
            label={{
              value: "Mbps",
              angle: -90,
              position: "insideLeft",
              offset: 12,
              style: { fontSize: 10, fill: "var(--muted-foreground)" },
            }}
          />
          <YAxis
            yAxisId="viewers"
            orientation="right"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={isLarge ? 36 : 28}
            tick={{ fontSize: isLarge ? 12 : 10 }}
            label={{
              value: "Viewers",
              angle: 90,
              position: "insideRight",
              offset: 8,
              style: { fontSize: 10, fill: "var(--muted-foreground)" },
            }}
          />
          <ReferenceLine
            yAxisId="bandwidth"
            y={INBOUND_RECOMMENDED_MBPS}
            stroke="var(--color-thresholdRecommended)"
            strokeDasharray="6 4"
            strokeWidth={1.5}
            label={{
              value: `${INBOUND_RECOMMENDED_MBPS} Mbps min`,
              position: "insideTopRight",
              fill: "var(--color-thresholdRecommended)",
              fontSize: 10,
            }}
          />
          <ReferenceLine
            yAxisId="bandwidth"
            y={INBOUND_LAG_RISK_MBPS}
            stroke="var(--color-thresholdLag)"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            label={{
              value: "Lag risk",
              position: "insideBottomRight",
              fill: "var(--color-thresholdLag)",
              fontSize: 10,
            }}
          />
          <ChartTooltip content={<MetricsTooltip />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Line
            yAxisId="bandwidth"
            type="monotone"
            dataKey="inbound"
            stroke="var(--color-inbound)"
            strokeWidth={isLarge ? 2.5 : 2}
            dot={false}
            activeDot={{ r: isLarge ? 4 : 3 }}
            isAnimationActive={false}
          />
          <Line
            yAxisId="bandwidth"
            type="monotone"
            dataKey="outbound"
            stroke="var(--color-outbound)"
            strokeWidth={isLarge ? 2.5 : 2}
            dot={false}
            activeDot={{ r: isLarge ? 4 : 3 }}
            isAnimationActive={false}
          />
          <Line
            yAxisId="viewers"
            type="monotone"
            dataKey="viewers"
            stroke="var(--color-viewers)"
            strokeWidth={isLarge ? 2.5 : 2}
            strokeDasharray="5 4"
            dot={false}
            activeDot={{ r: isLarge ? 4 : 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>

      <div
        className={cn(
          "flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground",
          isLarge ? "text-sm" : "text-xs",
        )}
      >
        <span>
          Inbound{" "}
          <span className="font-mono font-medium text-foreground">{formatMbps(avgInbound)}</span>
          <span className="text-muted-foreground/80"> avg</span>
        </span>
        <span>
          Outbound{" "}
          <span className="font-mono font-medium text-foreground">{formatMbps(avgOutbound)}</span>
          <span className="text-muted-foreground/80"> avg</span>
        </span>
        <span>
          Viewers{" "}
          <span className="font-mono font-medium text-foreground">
            {samples[samples.length - 1].viewer_count}
          </span>
        </span>
      </div>
    </div>
  )
}
