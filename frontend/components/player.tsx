"use client"

import Hls from "hls.js"
import { useEffect, useRef, useState } from "react"

import { PlayerOverlay } from "@/components/stream/player-overlay"
import { cn } from "@/lib/utils"

type PlyrPlayer = {
  destroy: () => void
  play: () => void | Promise<void>
  on: (event: string, callback: () => void) => void
}

type LivePlyrPlayerProps = {
  src: string
  viewerCount?: number
  fallbackNotice?: string
  className?: string
}

export default function LivePlyrPlayer({
  src,
  viewerCount = 0,
  fallbackNotice,
  className,
}: LivePlyrPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [latencyMs, setLatencyMs] = useState<number | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let cancelled = false
    let removeNativeListeners: (() => void) | null = null
    let latencyTimer: number | null = null

    setError(null)
    setReady(false)
    video.muted = true

    const teardown = () => {
      if (latencyTimer) window.clearInterval(latencyTimer)
      hlsRef.current?.destroy()
      hlsRef.current = null
    }

    const fail = (message: string) => {
      teardown()
      if (!cancelled) {
        setError(message)
      }
    }

    const tryPlay = () => {
      void video.play().catch(() => undefined)
    }

    const sampleLatency = () => {
      const hls = hlsRef.current
      if (hls && hls.latency > 0) {
        setLatencyMs(hls.latency * 1000)
      }
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        liveSyncDuration: 1.5,
        liveMaxLatencyDuration: 5,
      })
      hlsRef.current = hls

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        tryPlay()
        if (!cancelled) setReady(true)
      })
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal || cancelled) return

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          fail("Stream ended or is offline.")
          return
        }

        fail("Unable to play this stream.")
      })

      hls.loadSource(src)
      hls.attachMedia(video)
      latencyTimer = window.setInterval(sampleLatency, 2000)
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      const onMetadata = () => {
        tryPlay()
        if (!cancelled) setReady(true)
      }
      const onVideoError = () => fail("Stream ended or is offline.")

      video.addEventListener("loadedmetadata", onMetadata)
      video.addEventListener("error", onVideoError)
      video.src = src

      removeNativeListeners = () => {
        video.removeEventListener("loadedmetadata", onMetadata)
        video.removeEventListener("error", onVideoError)
      }
    } else {
      fail("HLS playback is not supported in this browser.")
    }

    return () => {
      cancelled = true
      removeNativeListeners?.()
      teardown()
    }
  }, [src])

  return (
    <div className="space-y-2">
      <div
        data-player-shell
        className={cn(
          "relative aspect-video w-full overflow-hidden bg-black",
          className ?? "rounded-lg ring-1 ring-white/10",
        )}
      >
        <video ref={videoRef} playsInline className="h-full w-full object-contain" />
        {ready && !error ? (
          <PlayerOverlay
            videoRef={videoRef}
            viewerCount={viewerCount}
            latencyMs={latencyMs}
            protocol="hls"
          />
        ) : !error ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="flex flex-col items-center gap-3">
              <div className="size-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
              <p className="text-sm text-white/70">Loading stream…</p>
            </div>
          </div>
        ) : null}
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 px-4 text-center text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </div>
      {fallbackNotice ? (
        <p className="text-xs text-muted-foreground">{fallbackNotice}</p>
      ) : null}
    </div>
  )
}
