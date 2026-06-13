"use client"

import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

import "plyr/dist/plyr.css"

type VodPlayerProps = {
  src: string
  title?: string
  poster?: string
  className?: string
  autoPlay?: boolean
}

type PlyrInstance = {
  play: () => Promise<void> | void
  destroy: () => void
}

export function VodPlayer({
  src,
  title,
  poster,
  className,
  autoPlay = true,
}: VodPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<PlyrInstance | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let cancelled = false
    setReady(false)

    video.src = src
    if (poster) video.poster = poster
    else video.removeAttribute("poster")

    void import("plyr").then(({ default: Plyr }) => {
      if (cancelled || !videoRef.current) return

      playerRef.current?.destroy()
      playerRef.current = null

      const player = new Plyr(videoRef.current, {
        autoplay: autoPlay,
        clickToPlay: true,
        hideControls: true,
        controls: [
          "play-large",
          "play",
          "progress",
          "current-time",
          "duration",
          "mute",
          "volume",
          "settings",
          "pip",
          "fullscreen",
        ],
        settings: ["speed"],
        speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
        keyboard: { focused: true, global: false },
      })
      playerRef.current = player
      if (!cancelled) setReady(true)
      if (autoPlay) void player.play()?.catch(() => undefined)
    })

    return () => {
      cancelled = true
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [src, poster, autoPlay])

  return (
    <div
      className={cn(
        "vod-player relative aspect-video w-full overflow-hidden bg-black",
        className,
      )}
      data-player-shell
    >
      <video
        ref={videoRef}
        playsInline
        title={title}
        className="absolute inset-0 h-full w-full object-contain"
      />
      {!ready ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-white/70">Loading recording…</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
