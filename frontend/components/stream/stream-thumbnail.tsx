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

export function StreamThumbnail({
  streamKey,
  className,
  refreshMs = 15000,
}: StreamThumbnailProps) {
  const [src, setSrc] = useState(() => buildThumbnailUrl(streamKey))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
    setSrc(buildThumbnailUrl(streamKey))

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
