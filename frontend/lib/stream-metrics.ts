export type StreamMetricSample = {
  recorded_at: string
  inbound_mbps: number
  outbound_mbps: number
  viewer_count: number
  frame_errors: number
}

/** Rolling window for health/status (~30s at 5s sampling). */
export const METRICS_ROLLING_WINDOW = 6

/** Moving-average window for chart lines. */
export const METRICS_CHART_SMOOTH_WINDOW = 3

export type StreamMetricsResponse = {
  session_id: number
  started_at: string
  ended_at: string | null
  samples: StreamMetricSample[]
}

export type StabilityLevel = "collecting" | "stable" | "moderate" | "unstable"

export type StreamStability = {
  level: StabilityLevel
  score: number
  label: string
  description: string
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

export function rollingMean(values: number[], window: number): number {
  if (values.length === 0) return 0
  return mean(values.slice(-window))
}

export function movingAverageSeries(
  values: number[],
  window: number
): number[] {
  return values.map((_, index) => {
    const start = Math.max(0, index - window + 1)
    return mean(values.slice(start, index + 1))
  })
}

export function averageRecentInbound(
  samples: StreamMetricSample[],
  window = METRICS_ROLLING_WINDOW
): number {
  return rollingMean(
    samples.map((s) => s.inbound_mbps),
    window
  )
}

export function averageRecentOutbound(
  samples: StreamMetricSample[],
  window = METRICS_ROLLING_WINDOW
): number {
  return rollingMean(
    samples.map((s) => s.outbound_mbps),
    window
  )
}

export type SmoothedChartPoint = {
  time: string
  inbound: number
  outbound: number
  inboundRaw: number
  outboundRaw: number
  viewers: number
  frameErrors: number
}

export function buildSmoothedChartPoints(
  samples: StreamMetricSample[]
): SmoothedChartPoint[] {
  const inboundRaw = samples.map((s) => s.inbound_mbps)
  const outboundRaw = samples.map((s) => s.outbound_mbps)
  const inboundSmooth = movingAverageSeries(
    inboundRaw,
    METRICS_CHART_SMOOTH_WINDOW
  )
  const outboundSmooth = movingAverageSeries(
    outboundRaw,
    METRICS_CHART_SMOOTH_WINDOW
  )

  return samples.map((sample, index) => ({
    time: formatMetricTime(sample.recorded_at),
    inbound: Number(inboundSmooth[index].toFixed(2)),
    outbound: Number(outboundSmooth[index].toFixed(2)),
    inboundRaw: sample.inbound_mbps,
    outboundRaw: sample.outbound_mbps,
    viewers: sample.viewer_count,
    frameErrors: sample.frame_errors,
  }))
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const avg = mean(values)
  const variance =
    values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function coefficientOfVariation(values: number[]): number {
  const avg = mean(values)
  if (avg <= 0) return 0
  return stdDev(values) / avg
}

export function computeStreamStability(
  samples: StreamMetricSample[]
): StreamStability {
  if (samples.length < 5) {
    return {
      level: "collecting",
      score: 0,
      label: "Collecting data",
      description: "Metrics appear after a few seconds of streaming",
    }
  }

  const inboundRaw = samples.map((s) => s.inbound_mbps).filter((v) => v > 0)
  const inbound =
    inboundRaw.length > 0
      ? movingAverageSeries(inboundRaw, METRICS_CHART_SMOOTH_WINDOW).filter(
          (v) => v > 0
        )
      : []
  const inboundCv = coefficientOfVariation(inbound)

  const firstErrors = samples[0]?.frame_errors ?? 0
  const lastErrors = samples[samples.length - 1]?.frame_errors ?? 0
  const errorDelta = Math.max(0, lastErrors - firstErrors)

  let score = 100
  score -= Math.min(45, inboundCv * 120)
  score -= Math.min(35, errorDelta * 8)

  const recentInbound = inbound.slice(-Math.min(12, inbound.length))
  const recentAvg = mean(recentInbound)
  const overallAvg = mean(inbound)
  if (overallAvg > 0 && recentAvg / overallAvg < 0.65) {
    score -= 20
  }

  score = Math.max(0, Math.min(100, Math.round(score)))

  if (score >= 80) {
    return {
      level: "stable",
      score,
      label: "Stable",
      description: "Bitrate and delivery are consistent",
    }
  }
  if (score >= 50) {
    return {
      level: "moderate",
      score,
      label: "Moderate",
      description: "Some fluctuation in bitrate or viewers",
    }
  }
  return {
    level: "unstable",
    score,
    label: "Unstable",
    description: "Significant drops or encoding errors detected",
  }
}

export function formatMetricTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}
