"use client"

import { IconBroadcast, IconPlayerPlay } from "@tabler/icons-react"
import { useEffect, useState } from "react"

import { VodPlayer } from "@/components/stream/vod-player"
import WebRtcPlayer from "@/components/webrtc-player"
import { useViewerPresence } from "@/hooks/use-viewer-presence"
import type { User } from "@/lib/api"
import { buildVodUrl, getPath, type Vod } from "@/lib/mtx-api"
import type { PathSummary } from "@/lib/mtx-types"
import { buildHlsUrl, buildWebRtcUrl, buildVodThumbnailUrl } from "@/lib/stream"
import { cn } from "@/lib/utils"

type ChannelHeroProps = {
  user: User
  streamKey: string
  isLive: boolean
  activeVod: Vod | null
  onClearVod: () => void
}

export function ChannelHero({
  user,
  streamKey,
  isLive,
  activeVod,
  onClearVod,
}: ChannelHeroProps) {
  const [liveStream, setLiveStream] = useState<PathSummary | null>(null)
  const stream = isLive ? liveStream : null
  const displayName = user.display_name ?? user.username
  const webRtcPlaybackUrl = buildWebRtcUrl(streamKey)
  const hlsPlaybackUrl = buildHlsUrl(streamKey)

  useEffect(() => {
    if (!isLive) return

    let active = true
    const load = () => {
      if (document.hidden) return
      getPath(streamKey)
        .then((data) => {
          if (active) setLiveStream(data)
        })
        .catch(() => {
          if (active) setLiveStream(null)
        })
    }
    load()
    const timer = window.setInterval(load, 10000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [isLive, streamKey])

  useViewerPresence(
    streamKey,
    isLive && !activeVod && (stream?.online ?? user.is_live)
  )

  if (isLive) {
    const poster = activeVod?.id
      ? buildVodThumbnailUrl(activeVod.id)
      : undefined

    return (
      <div className="relative aspect-video w-full bg-black">
        {/* Keep live player mounted so "Back to live" is instant */}
        <div
          className={cn(
            "absolute inset-0",
            activeVod && "pointer-events-none invisible"
          )}
          aria-hidden={!!activeVod}
        >
          <WebRtcPlayer
            src={webRtcPlaybackUrl}
            fallbackSrc={hlsPlaybackUrl}
            viewerCount={stream?.viewerCount ?? 0}
            className="h-full w-full rounded-none"
            suspended={!!activeVod}
          />
        </div>

        {activeVod ? (
          <div className="absolute inset-0 z-10">
            <button
              type="button"
              onClick={onClearVod}
              className="absolute top-4 right-4 z-20 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-lg hover:bg-primary/90"
            >
              <IconPlayerPlay className="size-3.5" />
              Back to live
            </button>
            <VodPlayer
              key={activeVod.id}
              src={buildVodUrl(activeVod)}
              title={activeVod.title ?? displayName}
              poster={poster}
            />
          </div>
        ) : null}
      </div>
    )
  }

  if (activeVod) {
    const poster = activeVod.id ? buildVodThumbnailUrl(activeVod.id) : undefined
    return (
      <div className="relative w-full bg-black">
        <VodPlayer
          key={activeVod.id}
          src={buildVodUrl(activeVod)}
          title={activeVod.title ?? displayName}
          poster={poster}
        />
      </div>
    )
  }

  return (
    <div className="relative flex min-h-[200px] w-full items-center justify-center overflow-hidden border-b border-border bg-muted/30 sm:min-h-[240px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(83,252,24,0.08),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_50%_0%,rgba(83,252,24,0.12),transparent_60%)]" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-4 py-10 text-center md:px-6 md:py-14">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-bold tracking-widest text-muted-foreground uppercase">
          <IconBroadcast className="size-3.5" />
          Offline
        </div>
        <div className="space-y-2">
          <p className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {displayName} is offline
          </p>
          <p className="text-sm text-muted-foreground sm:text-base">
            Check past broadcasts below
          </p>
        </div>
      </div>
    </div>
  )
}
