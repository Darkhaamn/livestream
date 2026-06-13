"use client"

import { IconPlayerPlay } from "@tabler/icons-react"
import { useState } from "react"

import { ChannelAvatar } from "@/components/stream/channel-avatar"
import { buildVodThumbnailUrl } from "@/lib/stream"
import { cn } from "@/lib/utils"

type VodThumbnailProps = {
  recordingPath: string
  username: string
  displayName?: string | null
  avatarUrl?: string | null
  className?: string
}

export function VodThumbnail({
  recordingPath,
  username,
  displayName,
  avatarUrl,
  className,
}: VodThumbnailProps) {
  const [failed, setFailed] = useState(false)
  const src = buildVodThumbnailUrl(recordingPath)

  if (failed) {
    return (
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-br from-muted via-muted/80 to-background",
          className
        )}
      >
        <div className="absolute inset-0 flex items-center justify-center opacity-40">
          <ChannelAvatar
            username={username}
            displayName={displayName}
            avatarUrl={avatarUrl}
            size="lg"
            className="scale-150 opacity-60"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      </div>
    )
  }

  return (
    <>
      {/* Dynamic recording thumbnail from mtx-manager */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading="lazy"
        className={cn("absolute inset-0 h-full w-full object-cover", className)}
        onError={() => setFailed(true)}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
    </>
  )
}

export function VodPlayOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
        <IconPlayerPlay className="size-6 fill-current" />
      </span>
    </div>
  )
}
