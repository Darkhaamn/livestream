'use client'

import Link from 'next/link'
import { IconUsers } from '@tabler/icons-react'
import { useEffect, useState } from 'react'

import { LiveBadge } from '@/components/stream/live-badge'
import { VodList } from '@/components/stream/vod-list'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type StreamSession, type User } from '@/lib/api'
import { buildVodUrl, type Vod } from '@/lib/mtx-api'

type ChannelPageProps = {
  username: string
}

function formatSessionRange(session: StreamSession): string {
  const start = new Date(session.started_at)
  const startStr = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`
  if (!session.ended_at) return startStr
  const end = new Date(session.ended_at)
  const endStr = end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${startStr} – ${endStr}`
}

export default function ChannelPage({ username }: ChannelPageProps) {
  const [user, setUser] = useState<User | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<StreamSession[]>([])
  const [activeVod, setActiveVod] = useState<Vod | null>(null)
  const [vodCount, setVodCount] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    let haveUser = false
    async function load() {
      try {
        const data = await api.users.getByUsername(username)
        if (!active) return
        haveUser = true
        setUser(data)
        setNotFound(false)
      } catch {
        if (!active) return
        if (!haveUser) setNotFound(true)
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 10000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [username])

  useEffect(() => {
    let active = true
    api.users
      .sessions(username)
      .then(data => {
        if (active) setSessions(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (active) setSessions([])
      })
    return () => {
      active = false
    }
  }, [username])

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-20 rounded-full bg-white/[0.05]" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48 bg-white/[0.05]" />
            <Skeleton className="h-4 w-32 bg-white/[0.05]" />
          </div>
        </div>
      </div>
    )
  }

  if (notFound || !user) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-16 md:px-6">
        <div className="flex flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-[#141417] py-20 text-center">
          <p className="text-xl font-bold tracking-tight text-white">Channel not found</p>
          <p className="mt-2 text-sm text-white/50">
            There is no channel named @{username}.
          </p>
          <Link
            href="/"
            className="mt-6 rounded-md bg-[#53fc18] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#46d614]"
          >
            Browse channels
          </Link>
        </div>
      </div>
    )
  }

  const name = user.display_name ?? user.username
  const watchUrl = `/watch/${encodeURIComponent(`live/${username}`)}`

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-5">
        <div
          className={`flex size-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#1c1c21] to-[#141417] text-2xl font-bold text-[#53fc18] ${
            user.is_live ? 'ring-2 ring-[#53fc18]' : 'ring-1 ring-white/[0.06]'
          }`}
        >
          {username.charAt(0).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">{name}</h1>
            {user.is_live ? (
              <>
                <LiveBadge size="sm" />
                <Link
                  href={watchUrl}
                  className="rounded-md bg-[#53fc18] px-4 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-[#46d614]"
                >
                  Watch
                </Link>
              </>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-white/40">@{user.username}</p>
          {user.bio ? (
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/50">{user.bio}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-white/50">
            <span className="flex items-center gap-1.5">
              <IconUsers className="size-3.5" />
              <span className="font-semibold text-white/90">{user.follower_count}</span> followers
            </span>
            {user.is_live ? (
              <>
                <span className="truncate font-semibold text-white/90">{user.stream_title}</span>
                {user.stream_category ? (
                  <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-xs text-white/50">
                    {user.stream_category}
                  </span>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* Past broadcasts */}
      <section className="mt-10">
        {activeVod ? (
          <div className="mb-4 overflow-hidden rounded-xl border border-white/[0.06] bg-black">
            <video
              key={activeVod.id}
              src={buildVodUrl(activeVod)}
              controls
              autoPlay
              className="aspect-video w-full bg-black"
            />
          </div>
        ) : null}
        <VodList
          streamKey={`live/${username}`}
          onSelect={setActiveVod}
          activeId={activeVod?.id ?? null}
          onLoaded={count => setVodCount(count)}
        />
        {vodCount === 0 ? (
          <div className="px-4 py-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/50">
              Past broadcasts
            </h2>
            <p className="text-sm text-white/40">No recordings yet</p>
          </div>
        ) : null}
      </section>

      {/* Stream history */}
      {sessions.length > 0 ? (
        <section className="mt-6 px-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/50">
            Stream history
          </h2>
          <div className="space-y-2">
            {sessions.map(session => (
              <div
                key={session.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-white/[0.06] bg-[#141417] px-4 py-3"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                  {session.title}
                </span>
                {session.category ? (
                  <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-xs text-white/50">
                    {session.category}
                  </span>
                ) : null}
                {session.ended_at ? (
                  <span className="text-xs text-white/50">{formatSessionRange(session)}</span>
                ) : (
                  <span className="text-xs font-semibold text-[#53fc18]">Live now</span>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
