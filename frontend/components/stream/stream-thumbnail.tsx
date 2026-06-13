"use client"

import { useEffect, useState } from "react"

import { buildThumbnailUrl } from "@/lib/stream"
import { cn } from "@/lib/utils"

type StreamThumbnailProps = {
  streamKey: string
  className?: string
  refreshMs?: number
}

function ThumbnailFallback({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "absolute inset-0 bg-gradient-to-br from-muted via-muted/80 to-background",
        className,
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
    </div>
  )
}

function StreamThumbnailInner({
  streamKey,
  className,
  refreshMs,
}: StreamThumbnailProps) {
  const [src, setSrc] = useState(() => buildThumbnailUrl(streamKey))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden) return
      setSrc(buildThumbnailUrl(streamKey))
    }, refreshMs)

    return () => window.clearInterval(timer)
  }, [streamKey, refreshMs])

  if (failed) {
    return <ThumbnailFallback className={className} />
  }

  return (
    <>
      {/* Dynamic live thumbnail URL; next/image not used for polling mtx snapshots */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className={cn("absolute inset-0 h-full w-full object-cover", className)}
        loading="lazy"
        onError={() => setFailed(true)}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
    </>
  )
}

export function StreamThumbnail(props: StreamThumbnailProps) {
  return <StreamThumbnailInner key={props.streamKey} {...props} />
}
