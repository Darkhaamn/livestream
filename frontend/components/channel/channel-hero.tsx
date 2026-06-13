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

export function ChannelHero({ user, streamKey, isLive, activeVod, onClearVod }: ChannelHeroProps) {
  const [stream, setStream] = useState<PathSummary | null>(null)
  const displayName = user.display_name ?? user.username
  const webRtcPlaybackUrl = buildWebRtcUrl(streamKey)
  const hlsPlaybackUrl = buildHlsUrl(streamKey)

  useEffect(() => {
    if (!isLive) {
      setStream(null)
      return
    }

    let active = true
    const load = () => {
      if (document.hidden) return
      getPath(streamKey)
        .then(data => {
          if (active) setStream(data)
        })
        .catch(() => {
          if (active) setStream(null)
        })
    }
    load()
    const timer = window.setInterval(load, 10000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [isLive, streamKey])

  useViewerPresence(streamKey, isLive && !activeVod && (stream?.online ?? user.is_live))

  if (isLive) {
    const poster = activeVod?.id ? buildVodThumbnailUrl(activeVod.id) : undefined

    return (
      <div className="relative aspect-video w-full bg-black">
        {/* Keep live player mounted so "Back to live" is instant */}
        <div
          className={cn(
            "absolute inset-0",
            activeVod && "invisible pointer-events-none",
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
              className="absolute right-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-lg hover:bg-primary/90"
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
    <div
      className={cn(
        "relative w-full overflow-hidden border-b border-border",
        "bg-muted/40 px-4 py-8 sm:px-6 sm:py-10",
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_50%,rgba(83,252,24,0.06),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_20%_50%,rgba(83,252,24,0.1),transparent_55%)]" />

      <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-2 text-center sm:flex-row sm:justify-center sm:gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          <IconBroadcast className="size-3.5" />
          Offline
        </div>
        <p className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
          {displayName} is offline
        </p>
        <span className="hidden text-muted-foreground/50 sm:inline" aria-hidden>
          ·
        </span>
        <p className="text-sm text-muted-foreground">
          Check past broadcasts below
        </p>
      </div>
    </div>
  )
}
