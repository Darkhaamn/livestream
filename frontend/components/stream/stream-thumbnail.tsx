"use client"

import { useEffect, useState } from "react"

import { StreamLivePreview } from "@/components/stream/stream-live-preview"
import { buildThumbnailUrl } from "@/lib/stream"
import { cn } from "@/lib/utils"

type StreamThumbnailProps = {
  streamKey: string
  className?: string
  refreshMs?: number
}

export function StreamThumbnail({
  streamKey,
  className,
  refreshMs = 10000,
}: StreamThumbnailProps) {
  const [src, setSrc] = useState(() => buildThumbnailUrl(streamKey))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
    setSrc(buildThumbnailUrl(streamKey))

    const timer = window.setInterval(() => {
      setSrc(buildThumbnailUrl(streamKey))
    }, refreshMs)

    return () => window.clearInterval(timer)
  }, [streamKey, refreshMs])

  if (failed) {
    return <StreamLivePreview streamKey={streamKey} className={className} />
  }

  return (
    <>
      <img
        src={src}
        alt=""
        className={cn("absolute inset-0 h-full w-full object-cover", className)}
        onError={() => setFailed(true)}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
    </>
  )
}
