"use client"

import Link from "next/link"
import { IconHeart, IconShare, IconUsers } from "@tabler/icons-react"
import { useEffect, useState } from "react"

import { ChatPanel } from "@/components/stream/chat-panel"
import { LiveBadge } from "@/components/stream/live-badge"
import { VodList } from "@/components/stream/vod-list"
import { Skeleton } from "@/components/ui/skeleton"
import WebRtcPlayer from "@/components/webrtc-player"
import { api, type User } from "@/lib/api"
import { parseStreamDisplay } from "@/lib/display-stream"
import { buildVodUrl, getPath, leaveViewer, pingViewer, type Vod } from "@/lib/mtx-api"
import type { PathSummary } from "@/lib/mtx-types"
import { formatViewerCount, getStreamResolution } from "@/lib/stream-health"
import { buildHlsUrl, buildWebRtcUrl } from "@/lib/stream"
import { getViewerId } from "@/lib/viewer-id"

type StreamWatchProps = {
  streamKey: string
}

export default function StreamWatch({ streamKey }: StreamWatchProps) {
  const [stream, setStream] = useState<PathSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [following, setFollowing] = useState(false)
  const [activeVod, setActiveVod] = useState<Vod | null>(null)
  const [hasVods, setHasVods] = useState(false)
  const [channelUser, setChannelUser] = useState<User | null>(null)

  const channelUsername = streamKey.startsWith("live/") ? streamKey.slice("live/".length) : null

  useEffect(() => {
    if (!channelUsername) {
      setChannelUser(null)
      return
    }
    let active = true
    api.users
      .getByUsername(channelUsername)
      .then(data => {
        if (active) setChannelUser(data)
      })
      .catch(() => {
        if (active) setChannelUser(null)
      })
    return () => {
      active = false
    }
  }, [channelUsername])

  const fallbackDisplay = parseStreamDisplay(streamKey)
  const display =
    channelUsername && channelUser
      ? {
          title: channelUser.stream_title || fallbackDisplay.title,
          channel: channelUser.display_name ?? channelUser.username,
          avatar: channelUsername.charAt(0).toUpperCase(),
        }
      : channelUsername
        ? { ...fallbackDisplay, avatar: channelUsername.charAt(0).toUpperCase(), channel: channelUsername }
        : fallbackDisplay
  const channelHref = channelUsername ? `/${channelUsername}` : "/"
  const category = channelUser?.stream_category || null

  useEffect(() => {
    const viewerId = getViewerId()
    if (!viewerId) return

    const ping = () => {
      void pingViewer(streamKey, viewerId).catch(() => undefined)
    }

    ping()
    const heartbeat = window.setInterval(ping, 10000)

    return () => {
      window.clearInterval(heartbeat)
      void leaveViewer(streamKey, viewerId).catch(() => undefined)
    }
  }, [streamKey])

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const viewerId = getViewerId()
        if (viewerId) {
          void pingViewer(streamKey, viewerId).catch(() => undefined)
        }
        const data = await getPath(streamKey)
        if (!active) return
        setStream(data)
        setError(null)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : "Failed to load stream")
      }
    }

    void load()
    const timer = window.setInterval(() => void load(), 3000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [streamKey])

  const hlsPlaybackUrl = buildHlsUrl(streamKey)
  const webRtcPlaybackUrl = buildWebRtcUrl(streamKey)
  const resolution = getStreamResolution(stream)
  const viewerCount = stream?.viewerCount ?? 0
  const isLive = stream?.online ?? false

  async function handleShare() {
    const url = window.location.href
    if (navigator.share) {
      await navigator.share({ title: display.title, url }).catch(() => undefined)
      return
    }
    await navigator.clipboard.writeText(url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex flex-col bg-[#0b0b0f] lg:flex-row">
      {/* Main column: player + stream info */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="w-full bg-black">
          {error ? (
            <div className="border-b border-[#eb0400]/20 bg-[#eb0400]/10 px-4 py-2 text-sm text-red-400">
              {error}
            </div>
          ) : null}

          {!stream && !error ? (
            <Skeleton className="aspect-video w-full rounded-none" />
          ) : activeVod ? (
            <div>
              <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-[#141417] px-4 py-2">
                <span className="text-sm text-white/50">Watching recording</span>
                {isLive ? (
                  <button
                    onClick={() => setActiveVod(null)}
                    className="rounded-md bg-[#53fc18] px-3 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-[#46d614]"
                  >
                    Back to live
                  </button>
                ) : (
                  <span className="rounded-md bg-[#eb0400]/10 px-2 py-1 text-xs font-bold tracking-wider text-[#eb0400]">
                    Recording
                  </span>
                )}
              </div>
              <video
                key={activeVod.id}
                src={buildVodUrl(activeVod)}
                controls
                autoPlay
                className="aspect-video w-full bg-black"
              />
            </div>
          ) : stream && !isLive ? (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-black">
              <p className="text-lg font-bold tracking-tight text-white">Channel is offline</p>
              {hasVods ? (
                <p className="text-sm text-white/50">Watch a past broadcast below</p>
              ) : null}
            </div>
          ) : (
            <WebRtcPlayer
              src={webRtcPlaybackUrl}
              fallbackSrc={hlsPlaybackUrl}
              viewerCount={viewerCount}
              className="rounded-none"
            />
          )}
        </div>

        {/* Info bar */}
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-4 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <Link
              href={channelHref}
              className={`flex size-12 shrink-0 items-center justify-center rounded-full bg-[#1c1c21] text-sm font-bold text-white ${
                isLive ? "ring-2 ring-[#53fc18]" : "ring-1 ring-white/[0.06]"
              }`}
            >
              {display.avatar}
            </Link>

            <div className="min-w-0 flex-1">
              <Link href={channelHref} className="block truncate text-lg font-bold tracking-tight text-white hover:text-[#53fc18]">
                {display.channel}
              </Link>
              <p className="truncate text-sm text-white/70">{display.title}</p>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                {isLive ? (
                  <>
                    <LiveBadge size="sm" />
                    <span className="flex items-center gap-1.5 text-white/50">
                      <span className="inline-block size-1.5 rounded-full bg-[#eb0400]" />
                      <IconUsers className="size-3.5" />
                      {formatViewerCount(viewerCount)} viewers
                    </span>
                  </>
                ) : (
                  <span className="text-white/50">Offline</span>
                )}
                {category ? (
                  <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-xs font-medium text-white/50">
                    {category}
                  </span>
                ) : null}
                {resolution ? (
                  <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-xs font-medium text-white/50">
                    {resolution}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Action row */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setFollowing(prev => !prev)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                following
                  ? "bg-white/10 text-white hover:bg-white/15"
                  : "bg-[#53fc18] text-black hover:bg-[#46d614]"
              }`}
            >
              <IconHeart className="size-4" />
              {following ? "Following" : "Follow"}
            </button>
            <button
              onClick={() => void handleShare()}
              className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/15"
            >
              <IconShare className="size-4" />
              {copied ? "Copied!" : "Share"}
            </button>
          </div>
        </div>

        {/* Past broadcasts */}
        <VodList
          streamKey={streamKey}
          onSelect={setActiveVod}
          activeId={activeVod?.id ?? null}
          onLoaded={count => setHasVods(count > 0)}
        />

        {/* About panel */}
        <div className="hidden px-4 py-4 lg:block">
          <div className="rounded-lg border border-white/[0.06] bg-[#141417] p-4">
            <h2 className="mb-2 text-sm font-bold tracking-tight text-white">
              About {display.channel}
            </h2>
            <p className="text-sm leading-relaxed text-white/50">
              Live broadcast on LiveStream. Stream key{" "}
              <code className="rounded-md bg-white/[0.06] px-1 py-0.5 font-mono text-xs text-white/50">
                {streamKey}
              </code>
            </p>
          </div>
        </div>
      </div>

      {/* Chat aside */}
      <aside className="flex h-[320px] w-full shrink-0 flex-col border-t border-white/[0.06] lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:w-[340px] lg:border-l lg:border-t-0 xl:w-[380px]">
        <ChatPanel streamKey={streamKey} />
      </aside>
    </div>
  )
}
