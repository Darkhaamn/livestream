"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import LivePlyrPlayer from "@/components/player"
import { PlayerOverlay } from "@/components/stream/player-overlay"
import { useWebRtcLatency } from "@/hooks/use-webrtc-latency"
import { cn } from "@/lib/utils"
import {
  acquireWebRtcSession,
  dropWebRtcSession,
  type WebRtcLease,
} from "@/lib/webrtc-session"

type WebRtcPlayerProps = {
  src: string
  fallbackSrc: string
  viewerCount?: number
  className?: string
  /** Hidden behind a VOD overlay — keeps connection alive, skips loading UI churn. */
  suspended?: boolean
}

function attachStream(
  video: HTMLVideoElement,
  audio: HTMLAudioElement,
  stream: MediaStream,
  muted: boolean
) {
  const videoStream = new MediaStream(stream.getVideoTracks())
  const audioStream = new MediaStream(stream.getAudioTracks())

  video.srcObject = videoStream
  video.muted = muted
  video.volume = 1

  audio.srcObject = audioStream
  audio.muted = muted
  audio.volume = 1

  void video.play().catch(() => undefined)
  void audio.play().catch(() => undefined)
}

function WebRtcPlayerSession({
  src,
  fallbackSrc,
  viewerCount = 0,
  className,
  suspended = false,
}: WebRtcPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const leaseRef = useRef<WebRtcLease | null>(null)
  const suspendedRef = useRef(suspended)
  const [peer, setPeer] = useState<RTCPeerConnection | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [useFallback, setUseFallback] = useState(false)
  const [connected, setConnected] = useState(false)
  const latencyMs = useWebRtcLatency(peer)
  const getAudioElement = useCallback(() => audioRef.current, [])

  useEffect(() => {
    suspendedRef.current = suspended
  }, [suspended])

  useEffect(() => {
    const video = videoRef.current
    const audio = audioRef.current
    if (!video || !audio) return

    let cancelled = false

    const lease = acquireWebRtcSession(src)
    leaseRef.current = lease
    const detachMediaListener = lease.onMediaStream((stream) => {
      if (cancelled) return
      attachStream(video, audio, stream, true)
    })

    void Promise.resolve().then(() => {
      if (cancelled) return
      setPeer(lease.peer)
      if (lease.media.getTracks().length > 0) {
        attachStream(video, audio, lease.media, true)
      }
      if (lease.isConnected()) {
        setConnected(true)
      }
    })

    void lease
      .waitConnected()
      .then(() => {
        if (cancelled) return
        setConnected(true)
        setError(null)
        if (lease.media.getTracks().length > 0) {
          attachStream(video, audio, lease.media, true)
        }
      })
      .catch((err) => {
        if (cancelled || suspendedRef.current) return
        dropWebRtcSession(src)
        leaseRef.current = null
        setPeer(null)
        video.srcObject = null
        audio.srcObject = null
        const message =
          err instanceof Error ? err.message : "WebRTC playback failed"
        setError(message)
        setUseFallback(true)
      })

    return () => {
      cancelled = true
      detachMediaListener?.()
      lease.release()
      leaseRef.current = null
      void Promise.resolve().then(() => {
        setPeer(null)
        setConnected(false)
      })
      video.srcObject = null
      audio.srcObject = null
    }
  }, [src])

  if (useFallback) {
    return (
      <LivePlyrPlayer
        src={fallbackSrc}
        viewerCount={viewerCount}
        className={className}
        fallbackNotice={error ? `WebRTC unavailable: ${error}` : undefined}
      />
    )
  }

  const showConnecting = !connected && !suspended

  return (
    <div
      data-player-shell
      className={cn(
        "group relative aspect-video w-full overflow-hidden bg-black",
        className ?? "rounded-lg ring-1 ring-white/10"
      )}
    >
      <video
        ref={videoRef}
        playsInline
        autoPlay
        className="h-full w-full object-contain"
      />
      <audio ref={audioRef} autoPlay className="hidden" aria-hidden />
      {connected ? (
        <PlayerOverlay
          videoRef={videoRef}
          getAudioElement={getAudioElement}
          viewerCount={viewerCount}
          latencyMs={latencyMs}
          protocol="webrtc"
        />
      ) : showConnecting ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            <p className="text-sm text-white/70">Connecting to stream…</p>
          </div>
        </div>
      ) : null}
      {error && !suspended ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 px-4 text-center text-sm text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  )
}

export default function WebRtcPlayer(props: WebRtcPlayerProps) {
  return <WebRtcPlayerSession key={props.src} {...props} />
}
