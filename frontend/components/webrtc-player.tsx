"use client"

import { useEffect, useRef, useState } from "react"

import LivePlyrPlayer from "@/components/player"
import { PlayerOverlay } from "@/components/stream/player-overlay"
import { useWebRtcLatency } from "@/hooks/use-webrtc-latency"
import { cn } from "@/lib/utils"

type WebRtcPlayerProps = {
  src: string
  fallbackSrc: string
  viewerCount?: number
  className?: string
}

function waitForIceGathering(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === "complete") {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    const onStateChange = () => {
      if (peer.iceGatheringState === "complete") {
        peer.removeEventListener("icegatheringstatechange", onStateChange)
        resolve()
      }
    }

    peer.addEventListener("icegatheringstatechange", onStateChange)
  })
}

function absoluteLocation(location: string, baseUrl: string) {
  const base = new URL(baseUrl)
  if (location.startsWith("/") && base.pathname.startsWith("/webrtc/")) {
    return `${base.origin}/webrtc${location}`
  }

  return new URL(location, baseUrl).toString()
}

export default function WebRtcPlayer({
  src,
  fallbackSrc,
  viewerCount = 0,
  className,
}: WebRtcPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const sessionRef = useRef<string | null>(null)
  const [peer, setPeer] = useState<RTCPeerConnection | null>(null)
  const [error, setError] = useState<{ src: string; message: string } | null>(null)
  const [fallbackSrcUrl, setFallbackSrcUrl] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const useFallback = fallbackSrcUrl === src
  const latencyMs = useWebRtcLatency(peer)

  useEffect(() => {
    const video = videoRef.current
    if (!video || useFallback) return

    const abortController = new AbortController()
    const media = new MediaStream()
    const peer = new RTCPeerConnection()
    setPeer(peer)
    let closed = false

    const fail = (message: string) => {
      if (closed) return
      setError({ src, message })
      setFallbackSrcUrl(src)
    }

    video.srcObject = media
    video.muted = true

    peer.addTransceiver("video", { direction: "recvonly" })
    peer.addTransceiver("audio", { direction: "recvonly" })

    peer.addEventListener("track", (event) => {
      media.addTrack(event.track)
      setConnected(true)
      void video.play().catch(() => undefined)
    })

    peer.addEventListener("connectionstatechange", () => {
      if (peer.connectionState === "connected") {
        setConnected(true)
      }
      if (peer.connectionState === "failed") {
        fail("WebRTC connection failed. Falling back to HLS.")
      }
    })

    async function connect() {
      try {
        const offer = await peer.createOffer()
        await peer.setLocalDescription(offer)
        await waitForIceGathering(peer)

        if (!peer.localDescription) {
          throw new Error("WebRTC offer was not created")
        }

        const response = await fetch(src, {
          method: "POST",
          headers: {
            Accept: "application/sdp",
            "Content-Type": "application/sdp",
          },
          body: peer.localDescription.sdp,
          signal: abortController.signal,
        })

        if (!response.ok) {
          throw new Error(`WHEP returned ${response.status}`)
        }

        const location = response.headers.get("Location")
        if (location) {
          sessionRef.current = absoluteLocation(location, src)
        }

        const answer = await response.text()
        await peer.setRemoteDescription({ type: "answer", sdp: answer })
        setError((current) => (current?.src === src ? null : current))
      } catch (err) {
        if (abortController.signal.aborted) return
        fail(err instanceof Error ? err.message : "WebRTC playback failed")
      }
    }

    void connect()

    return () => {
      closed = true
      abortController.abort()
      setPeer(null)
      const session = sessionRef.current
      sessionRef.current = null

      if (session) {
        void fetch(session, { method: "DELETE" }).catch(() => undefined)
      }

      peer.close()
      media.getTracks().forEach((track) => track.stop())
      video.srcObject = null
      setConnected(false)
    }
  }, [src, useFallback])

  if (useFallback) {
    return (
      <LivePlyrPlayer
        src={fallbackSrc}
        viewerCount={viewerCount}
        className={className}
        fallbackNotice={
          error?.src === src ? `WebRTC unavailable: ${error.message}` : undefined
        }
      />
    )
  }

  return (
    <div
      data-player-shell
      className={cn(
        "group relative aspect-video w-full overflow-hidden bg-black",
        className ?? "rounded-lg ring-1 ring-white/10",
      )}
    >
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className="h-full w-full object-contain"
      />
      {connected ? (
        <PlayerOverlay
          videoRef={videoRef}
          viewerCount={viewerCount}
          latencyMs={latencyMs}
          protocol="webrtc"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            <p className="text-sm text-white/70">Connecting to stream…</p>
          </div>
        </div>
      )}
      {error?.src === src ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 px-4 text-center text-sm text-destructive">
          {error.message}
        </div>
      ) : null}
    </div>
  )
}
