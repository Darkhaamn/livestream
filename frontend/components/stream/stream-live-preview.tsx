"use client"

import Hls from "hls.js"
import { useEffect, useRef, useState } from "react"

import { buildHlsUrl } from "@/lib/stream"
import { cn } from "@/lib/utils"

type StreamLivePreviewProps = {
  streamKey: string
  className?: string
}

export function StreamLivePreview({
  streamKey,
  className,
}: StreamLivePreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [active, setActive] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => setActive(entry?.isIntersecting ?? false),
      { rootMargin: "100px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !active) return

    const src = buildHlsUrl(streamKey)
    let hls: Hls | null = null
    let cancelled = false

    video.muted = true
    video.playsInline = true

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        maxBufferLength: 4,
        maxMaxBufferLength: 6,
      })
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!cancelled) void video.play().catch(() => undefined)
      })
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src
      void video.play().catch(() => undefined)
    }

    return () => {
      cancelled = true
      hls?.destroy()
      video.removeAttribute("src")
      video.load()
    }
  }, [streamKey, active])

  return (
    <div ref={containerRef} className={cn("absolute inset-0", className)}>
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
    </div>
  )
}
