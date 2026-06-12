'use client'

import Link from 'next/link'
import { IconBroadcast, IconEye, IconUsers } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'

import { LiveBadge } from '@/components/stream/live-badge'
import { StreamThumbnail } from '@/components/stream/stream-thumbnail'
import { parseStreamDisplay } from '@/lib/display-stream'
import { api, type User } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getLiveStreams } from '@/lib/mtx-api'
import type { PathSummary } from '@/lib/mtx-types'
import { formatViewerCount, getStreamResolution } from '@/lib/stream-health'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'

function liveUsername(path: string): string | null {
  return path.startsWith('live/') ? path.slice('live/'.length) : null
}

type EnrichedDisplay = {
  title: string
  channel: string
  avatar: string
  category: string | null
  username: string | null
}

function enrichDisplay(stream: PathSummary, users: Map<string, User>): EnrichedDisplay {
  const fallback = parseStreamDisplay(stream.name)
  const username = liveUsername(stream.name)
  if (!username) return { ...fallback, category: null, username: null }
  const user = users.get(username)
  return {
    title: user?.stream_title || fallback.title,
    channel: user?.display_name ?? username,
    avatar: username.charAt(0).toUpperCase() || fallback.avatar,
    category: user?.stream_category || null,
    username,
  }
}

function FeaturedStream({ stream, users }: { stream: PathSummary; users: Map<string, User> }) {
  const resolution = getStreamResolution(stream)
  const display = enrichDisplay(stream, users)
  const watchUrl = `/watch/${encodeURIComponent(stream.name)}`

  return (
    <div className="grid overflow-hidden rounded-xl border border-white/[0.06] bg-[#141417] lg:grid-cols-2">
      <Link href={watchUrl} className="group relative block w-full max-w-[720px] overflow-hidden bg-[#0b0b0f]">
        <div className="relative aspect-video">
          <StreamThumbnail streamKey={stream.name} />
          <div className="absolute left-3 top-3">
            <LiveBadge size="sm" />
          </div>
          <div className="absolute right-3 top-3 flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm">
            <IconEye className="size-3 text-[#53fc18]" />
            {formatViewerCount(stream.viewerCount)}
          </div>
          {resolution && (
            <div className="absolute bottom-3 right-3 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white/70 backdrop-blur-sm">
              {resolution}
            </div>
          )}
        </div>
      </Link>

      <div className="flex flex-col justify-center gap-4 p-6 lg:p-8">
        <div className="flex items-center gap-3">
          {display.username ? (
            <Link
              href={`/${display.username}`}
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#53fc18]/10 text-base font-bold text-[#53fc18] ring-1 ring-[#53fc18]/30"
            >
              {display.avatar}
            </Link>
          ) : (
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#53fc18]/10 text-base font-bold text-[#53fc18] ring-1 ring-[#53fc18]/30">
              {display.avatar}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-white/90">{display.title}</h1>
            <div className="flex items-center gap-2">
              {display.username ? (
                <Link href={`/${display.username}`} className="truncate text-sm text-white/50 hover:text-[#53fc18]">
                  {display.channel}
                </Link>
              ) : (
                <p className="truncate text-sm text-white/50">{display.channel}</p>
              )}
              {display.category ? (
                <span className="shrink-0 rounded bg-white/[0.06] px-1.5 text-xs text-white/50">
                  {display.category}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-white/50">
          <span className="size-2 rounded-full bg-[#53fc18]" />
          <span className="font-semibold text-white/90">{formatViewerCount(stream.viewerCount)}</span>
          <span>viewers</span>
        </div>

        <div>
          <Button asChild className="bg-[#53fc18] px-6 font-semibold text-black hover:bg-[#46d614]">
            <Link href={watchUrl}>Watch now</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

function StreamCard({ stream, users }: { stream: PathSummary; users: Map<string, User> }) {
  const resolution = getStreamResolution(stream)
  const display = enrichDisplay(stream, users)
  const watchUrl = `/watch/${encodeURIComponent(stream.name)}`

  const channelRow = (
    <>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#1c1c21] text-xs font-bold text-[#53fc18] ring-1 ring-white/[0.06]">
        {display.avatar}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-white/90 transition-colors group-hover:text-[#53fc18]">
          {display.title}
        </h2>
        <div className="mt-0.5 flex items-center gap-1.5">
          <p className="truncate text-xs text-white/40">{display.channel}</p>
          {display.category ? (
            <span className="shrink-0 rounded bg-white/[0.06] px-1.5 text-xs text-white/50">
              {display.category}
            </span>
          ) : null}
        </div>
      </div>
    </>
  )

  return (
    <div className="group overflow-hidden rounded-lg bg-transparent">
      <Link href={watchUrl} className="block">
        <div
          className={cn(
            'relative aspect-video overflow-hidden rounded-lg bg-[#141417] transition-all duration-200',
            'group-hover:-translate-y-0.5 group-hover:ring-2 group-hover:ring-[#53fc18]'
          )}
        >
          <StreamThumbnail streamKey={stream.name} />

          <div className="absolute left-2.5 top-2.5">
            <LiveBadge size="sm" />
          </div>

          <div className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm">
            <IconEye className="size-3 text-[#53fc18]" />
            {formatViewerCount(stream.viewerCount)}
          </div>

          {resolution && (
            <div className="absolute bottom-2.5 right-2.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white/70 backdrop-blur-sm">
              {resolution}
            </div>
          )}
        </div>
      </Link>

      {display.username ? (
        <Link href={`/${display.username}`} className="flex items-start gap-2.5 pt-2.5">
          {channelRow}
        </Link>
      ) : (
        <Link href={watchUrl} className="flex items-start gap-2.5 pt-2.5">
          {channelRow}
        </Link>
      )}
    </div>
  )
}

function StreamCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg">
      <Skeleton className="aspect-video rounded-lg bg-white/[0.05]" />
      <div className="flex items-center gap-2.5 pt-2.5">
        <Skeleton className="size-8 rounded-full bg-white/[0.05]" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-3/4 bg-white/[0.05]" />
          <Skeleton className="h-3 w-1/2 bg-white/[0.05]" />
        </div>
      </div>
    </div>
  )
}

export default function LiveStreamGrid() {
  const { user } = useAuth()
  const [streams, setStreams] = useState<PathSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<Map<string, User>>(new Map())
  const usersRef = useRef<Map<string, User>>(new Map())
  const lastUserRefreshRef = useRef(0)

  useEffect(() => {
    let active = true

    async function enrichUsers(data: PathSummary[]) {
      const usernames = data
        .map(s => (s.name.startsWith('live/') ? s.name.slice('live/'.length) : null))
        .filter((u): u is string => Boolean(u))
      if (usernames.length === 0) return

      const now = Date.now()
      const refreshAll = now - lastUserRefreshRef.current >= 60000
      const toFetch = refreshAll ? usernames : usernames.filter(u => !usersRef.current.has(u))
      if (toFetch.length === 0) return
      if (refreshAll) lastUserRefreshRef.current = now

      const results = await Promise.all(
        toFetch.map(async u => {
          try {
            return [u, await api.users.getByUsername(u)] as const
          } catch {
            return null
          }
        })
      )
      if (!active) return
      const fetched = results.filter((r): r is readonly [string, User] => r !== null)
      if (fetched.length === 0) return
      const next = new Map(usersRef.current)
      for (const [u, info] of fetched) next.set(u, info)
      usersRef.current = next
      setUsers(next)
    }

    async function load() {
      try {
        const data = await getLiveStreams()
        if (!active) return
        setStreams(data)
        setError(null)
        void enrichUsers(data)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load streams')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  const totalViewers = streams.reduce((s, st) => s + (st.viewerCount ?? 0), 0)
  const gridStreams = streams.slice(1)

  return (
    <div className="w-full max-w-[1600px] px-4 py-6 md:px-6">
      {error && (
        <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => <StreamCardSkeleton key={i} />)}
        </div>
      )}

      {!loading && streams.length > 0 && (
        <>
          <FeaturedStream stream={streams[0]} users={users} />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-xs text-white/60">
              <span className="size-1.5 animate-pulse rounded-full bg-[#53fc18]" />
              {streams.length} live {streams.length === 1 ? 'channel' : 'channels'}
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-xs text-white/60">
              <IconUsers className="size-3.5" />
              {formatViewerCount(totalViewers)} viewers
            </span>
          </div>

          {gridStreams.length > 0 && (
            <section className="mt-8">
              <div className="mb-4">
                <h2 className="text-xl font-bold tracking-tight text-white/90">Live channels</h2>
                <div className="mt-1.5 h-1 w-8 rounded-full bg-[#53fc18]" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {gridStreams.map((stream) => (
                  <StreamCard key={stream.name} stream={stream} users={users} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {!loading && !error && streams.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-[#141417]/50 py-24 text-center">
          <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-[#53fc18]/10">
            <IconBroadcast className="size-8 text-[#53fc18]" />
          </div>
          <p className="text-lg font-bold tracking-tight text-white/90">No live streams right now</p>
          <p className="mt-2 max-w-sm text-sm text-white/50">
            Be the first to go live. Set up your encoder and start streaming in minutes.
          </p>
          <Button asChild className="mt-6 bg-[#53fc18] font-semibold text-black hover:bg-[#46d614]">
            <Link href="/broadcast">
              <IconBroadcast className="mr-1.5 size-4" />
              {user ? 'Go live' : 'Start streaming'}
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}
