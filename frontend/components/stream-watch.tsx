"use client"

import Link from "next/link"
import { IconHeart, IconShare, IconUsers } from "@tabler/icons-react"
import { useEffect, useState } from "react"

import { ChatPanel } from "@/components/stream/chat-panel"
import { LiveBadge } from "@/components/stream/live-badge"
import { VodList } from "@/components/stream/vod-list"
import { VodPlayer } from "@/components/stream/vod-player"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import WebRtcPlayer from "@/components/webrtc-player"
import { ChannelAvatar } from "@/components/stream/channel-avatar"
import { useViewerPresence } from "@/hooks/use-viewer-presence"
import { api, type StreamSession, type User } from "@/lib/api"
import { findSessionForVod } from "@/lib/vod-session"
import { useAuth } from "@/lib/auth-context"
import { parseStreamDisplay } from "@/lib/display-stream"
import { buildVodUrl, getPath, type Vod } from "@/lib/mtx-api"
import type { PathSummary } from "@/lib/mtx-types"
import { formatViewerCount, getStreamResolution } from "@/lib/stream-health"
import { buildHlsUrl, buildWebRtcUrl, buildVodThumbnailUrl } from "@/lib/stream"
import { cn } from "@/lib/utils"

type StreamWatchProps = {
  streamKey: string
}

export default function StreamWatch({ streamKey }: StreamWatchProps) {
  const { user, accessToken } = useAuth()
  const [stream, setStream] = useState<PathSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [following, setFollowing] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  const [activeVod, setActiveVod] = useState<Vod | null>(null)
  const [hasVods, setHasVods] = useState(false)
  const [channelUser, setChannelUser] = useState<User | null>(null)
  const [sessions, setSessions] = useState<StreamSession[]>([])

  const channelUsername = streamKey.startsWith("live/") ? streamKey.slice("live/".length) : null
  const isOwnChannel = !!user && !!channelUsername && user.username === channelUsername

  useEffect(() => {
    if (!channelUsername || !accessToken || isOwnChannel) {
      setFollowing(false)
      return
    }
    let active = true
    api.users
      .followStatus(accessToken, channelUsername)
      .then(r => { if (active) setFollowing(r.following) })
      .catch(() => { if (active) setFollowing(false) })
    return () => { active = false }
  }, [channelUsername, accessToken, isOwnChannel])

  async function toggleFollow() {
    if (!channelUsername || !accessToken || followBusy) return
    setFollowBusy(true)
    const next = !following
    setFollowing(next)
    try {
      if (next) await api.users.follow(accessToken, channelUsername)
      else await api.users.unfollow(accessToken, channelUsername)
    } catch {
      setFollowing(!next)
    } finally {
      setFollowBusy(false)
    }
  }

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

  useEffect(() => {
    if (!channelUsername) {
      setSessions([])
      return
    }
    let active = true
    const load = () => {
      api.users
        .sessions(channelUsername)
        .then(data => {
          if (active) setSessions(Array.isArray(data) ? data : [])
        })
        .catch(() => {
          if (active) setSessions([])
        })
    }
    load()
    const timer = window.setInterval(load, 10000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [channelUsername])

  const activeSession = activeVod ? findSessionForVod(activeVod, sessions) : null

  const fallbackDisplay = parseStreamDisplay(streamKey)
  const streamTitle = activeSession?.title ?? channelUser?.stream_title ?? fallbackDisplay.title
  const category = activeSession?.category ?? channelUser?.stream_category ?? null
  const streamDescription =
    activeSession?.description ?? channelUser?.stream_description ?? null
  const display =
    channelUsername && channelUser
      ? {
          title: streamTitle,
          channel: channelUser.display_name ?? channelUser.username,
          avatar: channelUsername.charAt(0).toUpperCase(),
        }
      : channelUsername
        ? { ...fallbackDisplay, title: streamTitle, avatar: channelUsername.charAt(0).toUpperCase(), channel: channelUsername }
        : { ...fallbackDisplay, title: streamTitle }
  const channelHref = channelUsername ? `/${channelUsername}` : "/"

  useEffect(() => {
    let active = true

    async function load() {
      if (document.hidden) return
      try {
        const data = await getPath(streamKey)
        if (!active) return
        setStream(data)
        setError(null)
      } catch (err) {
        if (!active) return
        const message = err instanceof Error ? err.message : "Failed to load stream"
        if (message === "not found") {
          setStream(null)
          setError(null)
        } else {
          setError(message)
        }
      }
    }

    void load()
    const timer = window.setInterval(() => void load(), 10000)
    const onVisibility = () => {
      if (!document.hidden) void load()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [streamKey])

  const hlsPlaybackUrl = buildHlsUrl(streamKey)
  const webRtcPlaybackUrl = buildWebRtcUrl(streamKey)
  const resolution = getStreamResolution(stream)
  const viewerCount = stream?.viewerCount ?? 0
  const isLive = stream?.online ?? false
  const showLivePlayer = isLive || (channelUser?.is_live ?? false)

  useViewerPresence(streamKey, isLive && !activeVod)

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
    <div className="flex flex-col bg-background lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative w-full player-stage">
          {error ? (
            <div className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="relative aspect-video w-full">
            {showLivePlayer ? (
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
                  viewerCount={viewerCount}
                  className="h-full w-full rounded-none"
                  suspended={!!activeVod}
                />
              </div>
            ) : null}

            {activeVod ? (
              <div className="absolute inset-0 z-10">
                <VodPlayer
                  key={activeVod.id}
                  src={buildVodUrl(activeVod)}
                  title={display.title}
                  poster={buildVodThumbnailUrl(activeVod.id)}
                />
              </div>
            ) : !showLivePlayer && !stream && !error ? (
              <Skeleton className="aspect-video w-full rounded-none bg-muted" />
            ) : !showLivePlayer && stream && !isLive ? (
              <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-black">
                <p className="text-lg font-bold tracking-tight text-neutral-100">Channel is offline</p>
                {hasVods ? (
                  <p className="text-sm text-neutral-400">Watch a past broadcast below</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-start justify-between gap-4 border-b border-border bg-card px-4 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {channelUsername && channelUser ? (
              <Link href={channelHref} className="shrink-0">
                <ChannelAvatar
                  username={channelUser.username}
                  displayName={channelUser.display_name}
                  avatarUrl={channelUser.avatar_url}
                  size="md"
                  live={isLive && !activeVod}
                />
              </Link>
            ) : (
              <Link
                href={channelHref}
                className={cn(
                  "flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground",
                  isLive ? "ring-2 ring-primary" : "ring-1 ring-border",
                )}
              >
                {display.avatar}
              </Link>
            )}

            <div className="min-w-0 flex-1">
              <Link
                href={channelHref}
                className="block truncate text-lg font-bold tracking-tight text-foreground hover:text-primary-text"
              >
                {display.channel}
              </Link>
              <p className="truncate text-sm text-muted-foreground">{display.title}</p>
              {streamDescription ? (
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                  {streamDescription}
                </p>
              ) : null}

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                {activeVod ? (
                  <>
                    <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-xs font-bold tracking-wider text-destructive">
                      Recording
                    </span>
                    {isLive ? (
                      <button
                        type="button"
                        onClick={() => setActiveVod(null)}
                        className="text-xs font-semibold text-primary-text hover:underline"
                      >
                        Back to live
                      </button>
                    ) : null}
                  </>
                ) : isLive ? (
                  <>
                    <LiveBadge size="sm" />
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="inline-block size-1.5 rounded-full bg-destructive" />
                      <IconUsers className="size-3.5" />
                      {formatViewerCount(viewerCount)} viewers
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Offline</span>
                )}
                {category ? (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {category}
                  </span>
                ) : null}
                {resolution ? (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {resolution}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {user && !isOwnChannel ? (
              <Button
                type="button"
                variant={following ? "secondary" : "default"}
                size="sm"
                onClick={() => void toggleFollow()}
                disabled={followBusy}
                className="gap-1.5"
              >
                <IconHeart className={cn("size-4", !following && "fill-current")} />
                {following ? "Following" : "Follow"}
              </Button>
            ) : null}
            <Button type="button" variant="secondary" size="sm" onClick={() => void handleShare()} className="gap-1.5">
              <IconShare className="size-4" />
              {copied ? "Copied!" : "Share"}
            </Button>
          </div>
        </div>

        {!isLive ? (
          <VodList
            streamKey={streamKey}
            channel={channelUser}
            sessions={sessions}
            onSelect={setActiveVod}
            activeId={activeVod?.id ?? null}
            onLoaded={count => setHasVods(count > 0)}
          />
        ) : null}

        <div className="hidden px-4 py-4 lg:block">
          <div className="surface-card p-4">
            <h2 className="mb-2 text-sm font-bold tracking-tight text-foreground">
              About {display.channel}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Live broadcast on LiveStream. Stream key{" "}
              <code className="rounded-md bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
                {streamKey}
              </code>
            </p>
          </div>
        </div>
      </div>

      <aside className="flex h-[320px] w-full shrink-0 flex-col border-t border-border lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:w-[340px] lg:border-l lg:border-t-0 xl:w-[380px]">
        <ChatPanel streamKey={streamKey} />
      </aside>
    </div>
  )
}
