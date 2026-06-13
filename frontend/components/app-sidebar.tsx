"use client"

import {
  IconCompass,
  IconEyeOff,
  IconHeart,
  IconHome,
} from "@tabler/icons-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useState, useSyncExternalStore } from "react"

import { ChannelAvatar } from "@/components/stream/channel-avatar"
import { api, type FollowingChannel } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import {
  getLiveStreamsSnapshot,
  subscribeLiveStreams,
} from "@/lib/live-streams-store"
import { formatViewerCount } from "@/lib/stream-health"
import { cn } from "@/lib/utils"

const POLL_MS = 30_000
const COLLAPSED_COUNT = 10

const NAV_ITEMS = [
  {
    label: "Home",
    href: "/",
    icon: IconHome,
    match: (path: string) => path === "/",
  },
  { label: "Browse", href: "/", icon: IconCompass, match: () => false },
  { label: "Following", href: "/", icon: IconHeart, match: () => false },
]

type SidebarStreamer = {
  username: string
  display_name: string | null
  avatar_url: string | null
  stream_category: string
  is_live: boolean
  viewer_count: number
}

function toSidebarStreamer(
  channel: FollowingChannel,
  isLive: boolean
): SidebarStreamer {
  return {
    username: channel.username,
    display_name: channel.display_name,
    avatar_url: channel.avatar_url,
    stream_category: channel.stream_category,
    is_live: isLive,
    viewer_count: channel.viewer_count,
  }
}

function liveStreamToSidebarStreamer(
  stream: ReturnType<typeof getLiveStreamsSnapshot>["streams"][number]
): SidebarStreamer {
  return {
    username: stream.username,
    display_name: stream.display_name,
    avatar_url: stream.avatar_url,
    stream_category: stream.stream_category,
    is_live: true,
    viewer_count: stream.viewer_count,
  }
}

function SidebarStreamerRow({ streamer }: { streamer: SidebarStreamer }) {
  const name = streamer.display_name ?? streamer.username
  const href = `/${streamer.username}`

  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-accent",
        !streamer.is_live && "opacity-55 hover:opacity-80"
      )}
    >
      <ChannelAvatar
        username={streamer.username}
        displayName={streamer.display_name}
        avatarUrl={streamer.avatar_url}
        size="sm"
        live={streamer.is_live}
        className="!size-8 text-xs"
      />

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm leading-tight",
            streamer.is_live
              ? "font-semibold text-foreground"
              : "font-medium text-muted-foreground"
          )}
        >
          {name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {streamer.stream_category}
        </p>
      </div>

      {streamer.is_live ? (
        <div className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-primary-text">
          <span className="size-2 rounded-full bg-primary shadow-[0_0_6px_rgba(83,252,24,0.8)]" />
          <span>{formatViewerCount(streamer.viewer_count)}</span>
        </div>
      ) : (
        <IconEyeOff
          className="size-4 shrink-0 text-muted-foreground/70"
          aria-label="Offline"
        />
      )}
    </Link>
  )
}

function StreamerSection({
  title,
  streamers,
  emptyMessage,
}: {
  title: string
  streamers: SidebarStreamer[]
  emptyMessage?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? streamers : streamers.slice(0, COLLAPSED_COUNT)
  const hasMore = streamers.length > COLLAPSED_COUNT

  if (streamers.length === 0) {
    return emptyMessage ? (
      <div className="px-2 py-1">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {emptyMessage}
        </p>
      </div>
    ) : null
  }

  return (
    <section className="mt-4">
      <h3 className="mb-1 px-2 text-xs font-bold tracking-wider text-muted-foreground uppercase">
        {title}
      </h3>
      <div className="space-y-0.5">
        {visible.map((streamer) => (
          <SidebarStreamerRow key={streamer.username} streamer={streamer} />
        ))}
      </div>
      {hasMore ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 px-2 text-xs font-semibold text-primary-text hover:underline"
        >
          {expanded ? "Show Less" : "Show More"}
        </button>
      ) : null}
    </section>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const { user, accessToken } = useAuth()
  const [following, setFollowing] = useState<FollowingChannel[]>([])
  const liveSnapshot = useSyncExternalStore(
    subscribeLiveStreams,
    getLiveStreamsSnapshot,
    getLiveStreamsSnapshot
  )

  useEffect(() => {
    let active = true

    const loadFollowing = async () => {
      if (document.hidden || !accessToken) {
        if (active) setFollowing([])
        return
      }
      try {
        const channels = await api.users.myFollowing(accessToken)
        if (active) setFollowing(channels)
      } catch {
        if (!active) return
      }
    }

    void loadFollowing()
    const timer = window.setInterval(() => void loadFollowing(), POLL_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [accessToken])

  const followingStreamers = useMemo(() => {
    const live = following
      .filter((ch) => ch.is_live)
      .sort((a, b) => b.viewer_count - a.viewer_count)
      .map((ch) => toSidebarStreamer(ch, true))
    const offline = following
      .filter((ch) => !ch.is_live)
      .map((ch) => toSidebarStreamer(ch, false))
    return [...live, ...offline]
  }, [following])

  const recommendedStreamers = useMemo(() => {
    const followingUsernames = new Set(following.map((ch) => ch.username))
    return liveSnapshot.streams
      .filter(
        (stream) =>
          stream.username !== user?.username &&
          !followingUsernames.has(stream.username)
      )
      .sort((a, b) => b.viewer_count - a.viewer_count)
      .map(liveStreamToSidebarStreamer)
  }, [liveSnapshot.streams, following, user?.username])

  return (
    <aside className="fixed top-14 bottom-0 z-20 hidden w-[260px] flex-col border-r border-border bg-sidebar lg:flex">
      <div className="flex flex-1 flex-col overflow-y-auto py-3">
        <nav className="space-y-0.5 px-2">
          {NAV_ITEMS.map(({ label, href, icon: Icon, match }) => {
            const isActive = match(pathname)
            return (
              <Link
                key={label}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-accent text-primary-text"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                )}
              >
                <Icon className="size-5 shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>

        <StreamerSection
          title="Following"
          streamers={followingStreamers}
          emptyMessage={
            user
              ? "Follow channels to see them here when they go live."
              : "Log in to see channels you follow."
          }
        />

        <StreamerSection title="Recommended" streamers={recommendedStreamers} />
      </div>
    </aside>
  )
}
