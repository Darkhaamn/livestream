"use client"

import { IconBroadcast, IconUsers } from "@tabler/icons-react"
import Link from "next/link"
import { useSyncExternalStore } from "react"

import { ChannelAvatar } from "@/components/stream/channel-avatar"
import { LiveBadge } from "@/components/stream/live-badge"
import { StreamThumbnail } from "@/components/stream/stream-thumbnail"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth-context"
import {
  getLiveStreamsSnapshot,
  subscribeLiveStreams,
} from "@/lib/live-streams-store"
import { formatViewerCount } from "@/lib/stream-health"
import { cn } from "@/lib/utils"
import type { LiveStream } from "@/lib/api"

function ViewerPill({ count }: { count: number }) {
  return (
    <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded bg-black/75 px-1.5 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
      <span className="size-1.5 rounded-full bg-destructive" />
      {formatViewerCount(count)}
    </div>
  )
}

function CategoryChip({ category }: { category: string }) {
  if (!category) return null
  return (
    <span className="inline-block w-fit max-w-full truncate rounded bg-accent px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary-text">
      {category}
    </span>
  )
}

function FeaturedStream({ stream }: { stream: LiveStream }) {
  const channel = stream.display_name ?? stream.username
  const watchUrl = `/watch/${encodeURIComponent(stream.path)}`

  return (
    <div className="group grid overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-[1.6fr_1fr]">
      <Link
        href={watchUrl}
        className="relative block w-full overflow-hidden bg-background"
      >
        <div className="relative aspect-video">
          <StreamThumbnail
            streamKey={stream.path}
            className="transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute top-3 left-3">
            <LiveBadge size="md" />
          </div>
          <ViewerPill count={stream.viewer_count} />
        </div>
      </Link>

      <div className="flex flex-col justify-center gap-5 p-6 lg:p-8">
        <div className="flex items-center gap-3">
          <Link href={`/${stream.username}`}>
            <ChannelAvatar
              username={stream.username}
              displayName={stream.display_name}
              avatarUrl={stream.avatar_url}
              size="md"
              live
            />
          </Link>
          <div className="min-w-0">
            <Link
              href={`/${stream.username}`}
              className="block truncate text-base font-bold text-foreground hover:text-primary-text"
            >
              {channel}
            </Link>
            <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="size-2 rounded-full bg-destructive" />
              <span className="font-semibold text-foreground">
                {formatViewerCount(stream.viewer_count)}
              </span>
              viewers
            </div>
          </div>
        </div>

        <h1 className="line-clamp-2 text-xl leading-tight font-bold tracking-tight text-foreground lg:text-2xl">
          {stream.stream_title}
        </h1>

        <CategoryChip category={stream.stream_category} />

        <Button
          asChild
          className="w-fit bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Link href={watchUrl}>Watch now</Link>
        </Button>
      </div>
    </div>
  )
}

function StreamCard({ stream }: { stream: LiveStream }) {
  const channel = stream.display_name ?? stream.username
  const watchUrl = `/watch/${encodeURIComponent(stream.path)}`

  return (
    <div className="group flex flex-col gap-2.5">
      <Link href={watchUrl} className="block">
        <div
          className={cn(
            "relative aspect-video overflow-hidden rounded-lg bg-card",
            "ring-0 ring-primary transition-all duration-200 group-hover:ring-2"
          )}
        >
          <StreamThumbnail
            streamKey={stream.path}
            className="transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute top-2.5 left-2.5">
            <LiveBadge size="sm" />
          </div>
          <ViewerPill count={stream.viewer_count} />
        </div>
      </Link>

      <div className="flex items-start gap-2.5">
        <Link href={`/${stream.username}`} className="shrink-0">
          <ChannelAvatar
            username={stream.username}
            displayName={stream.display_name}
            avatarUrl={stream.avatar_url}
            size="sm"
            live
            className="!size-9"
          />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Link
            href={watchUrl}
            className="truncate text-sm leading-tight font-semibold text-foreground transition-colors group-hover:text-primary-text"
            title={stream.stream_title}
          >
            {stream.stream_title}
          </Link>
          <Link
            href={`/${stream.username}`}
            className="truncate text-xs text-muted-foreground hover:text-foreground"
          >
            {channel}
          </Link>
          <CategoryChip category={stream.stream_category} />
        </div>
      </div>
    </div>
  )
}

function StreamCardSkeleton() {
  return (
    <div className="flex flex-col gap-2.5">
      <Skeleton className="aspect-video rounded-lg bg-muted" />
      <div className="flex items-start gap-2.5">
        <Skeleton className="size-9 rounded-full bg-muted" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-3/4 bg-muted" />
          <Skeleton className="h-3 w-1/2 bg-muted" />
          <Skeleton className="h-3 w-1/3 bg-muted" />
        </div>
      </div>
    </div>
  )
}

export default function LiveStreamGrid() {
  const { user } = useAuth()
  const snapshot = useSyncExternalStore(
    subscribeLiveStreams,
    getLiveStreamsSnapshot,
    getLiveStreamsSnapshot
  )

  const { streams, error, loaded, refreshing } = snapshot
  const showSkeleton = !loaded && streams.length === 0
  const totalViewers = streams.reduce(
    (sum, stream) => sum + (stream.viewer_count ?? 0),
    0
  )
  const gridStreams = streams.slice(1)

  return (
    <div className="w-full max-w-[1600px] px-4 py-6 md:px-6">
      {error && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {refreshing && streams.length > 0 ? (
        <p className="mb-4 text-xs text-muted-foreground">
          Updating live channels…
        </p>
      ) : null}

      {showSkeleton && (
        <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <StreamCardSkeleton key={index} />
          ))}
        </div>
      )}

      {!showSkeleton && streams.length > 0 && (
        <>
          <section>
            <div className="mb-4 flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-foreground">
                Featured
              </h2>
              <span className="h-1 w-6 rounded-full bg-primary" />
            </div>
            <FeaturedStream stream={streams[0]} />
          </section>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs text-accent-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              {streams.length} live{" "}
              {streams.length === 1 ? "channel" : "channels"}
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs text-accent-foreground">
              <IconUsers className="size-3.5" />
              {formatViewerCount(totalViewers)} viewers
            </span>
          </div>

          {gridStreams.length > 0 && (
            <section className="mt-8">
              <div className="mb-4 flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-foreground">
                  Live channels
                </h2>
                <span className="h-1 w-6 rounded-full bg-primary" />
              </div>

              <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {gridStreams.map((stream) => (
                  <StreamCard key={stream.path} stream={stream} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {!showSkeleton && !error && streams.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 py-24 text-center">
          <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-primary/10">
            <IconBroadcast className="size-8 text-primary-text" />
          </div>
          <p className="text-lg font-bold tracking-tight text-foreground">
            No live streams right now
          </p>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Be the first to go live. Set up your encoder and start streaming in
            minutes.
          </p>
          <Button
            asChild
            className="mt-6 bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Link href="/broadcast">
              <IconBroadcast className="mr-1.5 size-4" />
              {user ? "Go live" : "Start streaming"}
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}
