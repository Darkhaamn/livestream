"use client"

import { useEffect, useRef, useState } from "react"

import LivePlyrPlayer from "@/components/player"
import { PlayerOverlay } from "@/components/stream/player-overlay"
import { useWebRtcLatency } from "@/hooks/use-webrtc-latency"
import {
  acquireWebRtcSession,
  dropWebRtcSession,
  type WebRtcLease,
} from "@/lib/webrtc-session"
import { cn } from "@/lib/utils"

type WebRtcPlayerProps = {
  src: string
  fallbackSrc: string
  viewerCount?: number
  className?: string
  /** Hidden behind a VOD overlay — keeps connection alive, skips loading UI churn. */
  suspended?: boolean
}

export default function WebRtcPlayer({
  src,
  fallbackSrc,
  viewerCount = 0,
  className,
  suspended = false,
}: WebRtcPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const leaseRef = useRef<WebRtcLease | null>(null)
  const suspendedRef = useRef(suspended)
  const [peer, setPeer] = useState<RTCPeerConnection | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [useFallback, setUseFallback] = useState(false)
  const [connected, setConnected] = useState(false)
  const latencyMs = useWebRtcLatency(peer)

  suspendedRef.current = suspended

  useEffect(() => {
    setUseFallback(false)
    setError(null)
    setConnected(false)

    const video = videoRef.current
    if (!video) return

    let cancelled = false
    const lease = acquireWebRtcSession(src)
    leaseRef.current = lease
    setPeer(lease.peer)

    video.muted = true
    video.srcObject = lease.media

    if (lease.isConnected()) {
      setConnected(true)
      void video.play().catch(() => undefined)
    }

    void lease
      .waitConnected()
      .then(() => {
        if (cancelled) return
        setConnected(true)
        setError(null)
        void video.play().catch(() => undefined)
      })
      .catch((err) => {
        if (cancelled || suspendedRef.current) return
        dropWebRtcSession(src)
        leaseRef.current = null
        setPeer(null)
        video.srcObject = null
        const message = err instanceof Error ? err.message : "WebRTC playback failed"
        setError(message)
        setUseFallback(true)
      })

    return () => {
      cancelled = true
      lease.release()
      leaseRef.current = null
      setPeer(null)
      if (video.srcObject === lease.media) {
        video.srcObject = null
      }
      setConnected(false)
    }
  }, [src])

  if (useFallback) {
    return (
      <LivePlyrPlayer
        src={fallbackSrc}
        viewerCount={viewerCount}
        className={className}
        fallbackNotice={error ? `WebRTC unavailable: ${error}` : undefined}
      />
    )
  }

  const showConnecting = !connected && !suspended

  return (
    <div
      data-player-shell
      className={cn(
        "group relative aspect-video w-full overflow-hidden bg-black",
        className ?? "rounded-lg ring-1 ring-white/10",
      )}
    >
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className="h-full w-full object-contain"
      />
      {connected ? (
        <PlayerOverlay
          videoRef={videoRef}
          viewerCount={viewerCount}
          latencyMs={latencyMs}
          protocol="webrtc"
        />
      ) : showConnecting ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            <p className="text-sm text-white/70">Connecting to stream…</p>
          </div>
        </div>
      ) : null}
      {error && !suspended ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 px-4 text-center text-sm text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  )
}
