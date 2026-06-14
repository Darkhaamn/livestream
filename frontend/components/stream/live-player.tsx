"use client"

import LivePlyrPlayer from "@/components/player"
import WebRtcPlayer from "@/components/webrtc-player"
import { buildHlsUrl, buildWebRtcUrl, preferHlsPlayback } from "@/lib/stream"

type LivePlayerProps = {
  streamKey: string
  viewerCount?: number
  className?: string
  suspended?: boolean
}

export function LivePlayer({
  streamKey,
  viewerCount = 0,
  className,
  suspended = false,
}: LivePlayerProps) {
  const hlsPlaybackUrl = buildHlsUrl(streamKey)

  if (preferHlsPlayback()) {
    return (
      <LivePlyrPlayer
        src={hlsPlaybackUrl}
        viewerCount={viewerCount}
        className={className}
      />
    )
  }

  return (
    <WebRtcPlayer
      src={buildWebRtcUrl(streamKey)}
      fallbackSrc={hlsPlaybackUrl}
      viewerCount={viewerCount}
      className={className}
      suspended={suspended}
    />
  )
}
