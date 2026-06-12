"use client"

import { useEffect, useState } from "react"

export function useWebRtcLatency(peer: RTCPeerConnection | null) {
  const [latencyMs, setLatencyMs] = useState<number | null>(null)

  useEffect(() => {
    if (!peer) {
      setLatencyMs(null)
      return
    }

    let active = true

    async function sample() {
      if (!peer) return
      try {
        const stats = await peer.getStats()
        let rttMs: number | null = null

        stats.forEach((report) => {
          if (report.type === "candidate-pair" && report.state === "succeeded") {
            const rtt = report.currentRoundTripTime
            if (typeof rtt === "number" && rtt > 0) {
              rttMs = rtt * 1000
            }
          }
          if (report.type === "inbound-rtp" && report.kind === "video") {
            const jitter = report.jitter
            if (typeof jitter === "number" && jitter > 0 && rttMs === null) {
              rttMs = jitter * 1000
            }
          }
        })

        if (active) setLatencyMs(rttMs)
      } catch {
        if (active) setLatencyMs(null)
      }
    }

    void sample()
    const timer = window.setInterval(() => void sample(), 2000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [peer])

  return latencyMs
}
