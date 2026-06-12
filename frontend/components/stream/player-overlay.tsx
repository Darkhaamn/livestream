"use client"

import {
  IconMaximize,
  IconPlayerPause,
  IconPlayerPlay,
  IconVolume,
  IconVolumeOff,
} from "@tabler/icons-react"
import { useCallback, useEffect, useState } from "react"

import { LiveBadge } from "@/components/stream/live-badge"
import { LatencyBadge } from "@/components/stream/latency-badge"
import { formatViewerCount } from "@/lib/stream-health"
import { cn } from "@/lib/utils"

type PlayerOverlayProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>
  viewerCount?: number
  latencyMs: number | null
  protocol?: "webrtc" | "hls"
  isLive?: boolean
  className?: string
}

export function PlayerOverlay({
  videoRef,
  viewerCount = 0,
  latencyMs,
  protocol,
  isLive = true,
  className,
}: PlayerOverlayProps) {
  const [playing, setPlaying] = useState(true)
  const [muted, setMuted] = useState(true)
  const [showControls, setShowControls] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const sync = () => {
      setMuted(video.muted)
      setPlaying(!video.paused)
    }

    video.addEventListener("volumechange", sync)
    video.addEventListener("play", sync)
    video.addEventListener("pause", sync)
    sync()

    return () => {
      video.removeEventListener("volumechange", sync)
      video.removeEventListener("play", sync)
      video.removeEventListener("pause", sync)
    }
  }, [videoRef])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play()
      setPlaying(true)
    } else {
      video.pause()
      setPlaying(false)
    }
  }, [videoRef])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
  }, [videoRef])

  const toggleFullscreen = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const container = video.closest("[data-player-shell]")
    const target = container ?? video
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void target.requestFullscreen?.()
    }
  }, [videoRef])

  return (
    <div
      className={cn("absolute inset-0 z-10", className)}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      onTouchStart={() => setShowControls(true)}
    >
      {/* Top badges — always visible, non-blocking */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
        <div className="flex items-center gap-2">
          {isLive ? <LiveBadge size="sm" /> : null}
          <span className="rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur-sm">
            {formatViewerCount(viewerCount)} viewers
          </span>
        </div>
        <LatencyBadge
          latencyMs={latencyMs}
          protocol={protocol}
          className="text-[10px]"
        />
      </div>

      {/* Subtle unmute pill — bottom-left, not center */}
      {muted ? (
        <button
          type="button"
          onClick={toggleMute}
          className="pointer-events-auto absolute bottom-14 left-3 flex items-center gap-1.5 rounded bg-black/75 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-black/90"
        >
          <IconVolume className="size-3.5" />
          Unmute
        </button>
      ) : null}

      {/* Bottom controls — show on hover */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-3 pb-3 pt-10 transition-opacity duration-200",
          showControls || !playing || muted ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={togglePlay}
            className="rounded p-1.5 text-white transition hover:bg-white/15"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <IconPlayerPause className="size-5" />
            ) : (
              <IconPlayerPlay className="size-5" />
            )}
          </button>
          <button
            type="button"
            onClick={toggleMute}
            className="rounded p-1.5 text-white transition hover:bg-white/15"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? (
              <IconVolumeOff className="size-5" />
            ) : (
              <IconVolume className="size-5" />
            )}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded p-1.5 text-white transition hover:bg-white/15"
            aria-label="Fullscreen"
          >
            <IconMaximize className="size-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
