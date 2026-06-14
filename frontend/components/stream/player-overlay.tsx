"use client"

import {
  IconMaximize,
  IconPlayerPause,
  IconPlayerPlay,
  IconVolume,
  IconVolumeOff,
} from "@tabler/icons-react"
import { useCallback, useEffect, useState } from "react"

import { LatencyBadge } from "@/components/stream/latency-badge"
import { LiveBadge } from "@/components/stream/live-badge"
import { formatViewerCount } from "@/lib/stream-health"
import { cn } from "@/lib/utils"

type PlayerOverlayProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>
  getAudioElement?: () => HTMLAudioElement | null
  viewerCount?: number
  latencyMs: number | null
  protocol?: "webrtc" | "hls"
  isLive?: boolean
  className?: string
}

export function PlayerOverlay({
  videoRef,
  getAudioElement,
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
      const audio = getAudioElement?.() ?? null
      const isMuted = audio?.muted ?? video.muted
      setMuted(isMuted)
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
  }, [getAudioElement, videoRef])

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

  const enableAudio = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    video.muted = false
    video.volume = 1

    const audio = getAudioElement?.() ?? null
    if (audio) {
      audio.muted = false
      audio.volume = 1
      for (const track of audio.srcObject instanceof MediaStream
        ? audio.srcObject.getAudioTracks()
        : []) {
        track.enabled = true
      }
      void audio.play().catch(() => undefined)
    }

    setMuted(false)
    void video.play().catch(() => undefined)
  }, [getAudioElement, videoRef])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.muted) {
      enableAudio()
      return
    }
    video.muted = true
    const audio = getAudioElement?.() ?? null
    if (audio) audio.muted = true
    setMuted(true)
  }, [getAudioElement, videoRef, enableAudio])

  const unmuteFromGesture = useCallback(() => {
    const video = videoRef.current
    if (!video || !video.muted) return
    enableAudio()
  }, [enableAudio, videoRef])

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
      onClick={unmuteFromGesture}
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

      {/* Prominent unmute — browsers require muted autoplay until user gesture */}
      {muted ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            unmuteFromGesture()
          }}
          className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/35 backdrop-blur-[1px]"
          aria-label="Unmute stream"
        >
          <span className="flex items-center gap-2 rounded-full bg-black/85 px-5 py-3 text-sm font-semibold text-white shadow-lg ring-1 ring-white/20 transition hover:bg-black">
            <IconVolume className="size-5" />
            Click for sound
          </span>
        </button>
      ) : null}

      {/* Bottom controls — show on hover */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-3 pt-10 pb-3 transition-opacity duration-200",
          showControls || !playing || muted ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              togglePlay()
            }}
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
            onClick={(event) => {
              event.stopPropagation()
              toggleMute()
            }}
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
            onClick={(event) => {
              event.stopPropagation()
              toggleFullscreen()
            }}
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
