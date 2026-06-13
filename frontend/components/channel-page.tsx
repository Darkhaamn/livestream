'use client'

import Link from 'next/link'
import { IconHeart, IconShare, IconUsers } from '@tabler/icons-react'
import { useEffect, useState } from 'react'

import { ChannelHero } from '@/components/channel/channel-hero'
import { ChannelVodGrid } from '@/components/channel/channel-vod-grid'
import { ChannelAvatar } from '@/components/stream/channel-avatar'
import { ChatPanel } from '@/components/stream/chat-panel'
import { LiveBadge } from '@/components/stream/live-badge'
import { StreamInfoEditor } from '@/components/stream/stream-info-editor'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type StreamSession, type User } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { Vod } from '@/lib/mtx-api'
import { findSessionForVod } from '@/lib/vod-session'
import { formatRelativeTime, formatSessionDuration } from '@/lib/time-format'
import { cn } from '@/lib/utils'

type ChannelPageProps = {
  username: string
}

type ChannelTab = 'home' | 'videos' | 'about'

const TABS: { id: ChannelTab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'videos', label: 'Videos' },
  { id: 'about', label: 'About' },
]

function lastEndedSession(sessions: StreamSession[]): StreamSession | null {
  return sessions.find(session => session.ended_at) ?? null
}

export default function ChannelPage({ username }: ChannelPageProps) {
  const { user: viewer, accessToken } = useAuth()
  const [user, setUser] = useState<User | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<StreamSession[]>([])
  const [activeVod, setActiveVod] = useState<Vod | null>(null)
  const [tab, setTab] = useState<ChannelTab>('home')
  const [following, setFollowing] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)

  const streamKey = `live/${username}`
  const isOwnChannel = !!viewer && viewer.username === username
  const activeSession = activeVod ? findSessionForVod(activeVod, sessions) : null

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
    const timer = window.setInterval(() => void load(), 15000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [username])

  useEffect(() => {
    let active = true
    const load = () => {
      if (document.hidden) return
      api.users
        .sessions(username)
        .then(data => {
          if (active) setSessions(Array.isArray(data) ? data : [])
        })
        .catch(() => {
          if (active) setSessions([])
        })
    }
    load()
    const timer = window.setInterval(load, 15000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [username])

  useEffect(() => {
    if (!accessToken || isOwnChannel) {
      setFollowing(false)
      return
    }
    let active = true
    api.users
      .followStatus(accessToken, username)
      .then(r => {
        if (active) setFollowing(r.following)
      })
      .catch(() => {
        if (active) setFollowing(false)
      })
    return () => {
      active = false
    }
  }, [username, accessToken, isOwnChannel])

  async function toggleFollow() {
    if (!accessToken || followBusy || isOwnChannel) return
    setFollowBusy(true)
    const next = !following
    setFollowing(next)
    try {
      if (next) await api.users.follow(accessToken, username)
      else await api.users.unfollow(accessToken, username)
      const refreshed = await api.users.getByUsername(username)
      setUser(refreshed)
    } catch {
      setFollowing(!next)
    } finally {
      setFollowBusy(false)
    }
  }

  function handleSelectVod(vod: Vod) {
    setActiveVod(vod)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (loading) {
    return (
      <div>
        <Skeleton className="aspect-video w-full rounded-none bg-muted" />
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 rounded-full bg-muted" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48 bg-muted" />
              <Skeleton className="h-4 w-32 bg-muted" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (notFound || !user) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-20">
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <p className="text-xl font-bold text-foreground">Channel not found</p>
          <p className="mt-2 text-sm text-muted-foreground">
            There is no channel named @{username}.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Browse channels
          </Link>
        </div>
      </div>
    )
  }

  const name = user.display_name ?? user.username
  const lastLive = lastEndedSession(sessions)
  const showChat = user.is_live && !activeVod
  const recordingDuration = activeSession ? formatSessionDuration(activeSession) : null
  const streamTitle = activeSession?.title ?? user.stream_title
  const streamCategory = activeSession?.category ?? user.stream_category
  const streamDescription = activeSession?.description ?? user.stream_description

  async function reloadUser() {
    try {
      const data = await api.users.getByUsername(username)
      setUser(data)
    } catch {
      // keep current profile
    }
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      {/* Player stage */}
      <section className="border-b border-border bg-black">
        <div className="mx-auto flex max-w-[1600px] flex-col lg:flex-row">
          <div className="min-w-0 flex-1">
            <ChannelHero
              user={user}
              streamKey={streamKey}
              isLive={user.is_live}
              activeVod={activeVod}
              onClearVod={() => setActiveVod(null)}
            />

            {(activeVod && activeSession) || user.is_live ? (
              <div className="player-chrome border-t px-4 py-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      {activeVod ? (
                        <span className="rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white">
                          RECORDING
                        </span>
                      ) : (
                        <LiveBadge size="sm" />
                      )}
                      {recordingDuration ? (
                        <span className="text-xs text-neutral-400">{recordingDuration}</span>
                      ) : null}
                      {streamCategory ? (
                        <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs text-neutral-300">
                          {streamCategory}
                        </span>
                      ) : null}
                    </div>
                    <h2 className="text-lg font-bold text-neutral-100 sm:text-xl">{streamTitle}</h2>
                    {streamDescription ? (
                      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-400">
                        {streamDescription}
                      </p>
                    ) : null}
                    {activeVod && activeSession ? (
                      <p className="mt-1 text-sm text-neutral-500">
                        Streamed {formatRelativeTime(activeSession.ended_at ?? activeSession.started_at)}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(window.location.href)
                    }}
                    className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-neutral-100 transition-colors hover:bg-white/15"
                  >
                    <IconShare className="size-4" />
                    Share
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {showChat ? (
            <aside className="flex h-[360px] w-full shrink-0 flex-col border-t border-white/10 lg:h-auto lg:min-h-[420px] lg:w-[340px] lg:border-l lg:border-t-0 xl:w-[380px]">
              <ChatPanel streamKey={streamKey} />
            </aside>
          ) : null}
        </div>
      </section>

      {/* Profile + tabs */}
      <section className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <ChannelAvatar
                username={user.username}
                displayName={user.display_name}
                avatarUrl={user.avatar_url}
                size="lg"
                live={user.is_live}
                className="!size-14 shrink-0 sm:!size-16"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-xl font-bold text-foreground sm:text-2xl">{name}</h1>
                  {user.is_live ? <LiveBadge size="sm" /> : null}
                </div>
                <p className="text-sm text-muted-foreground">@{user.username}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <IconUsers className="size-3.5" />
                    <span className="font-semibold text-foreground">{user.follower_count}</span>
                    followers
                  </span>
                  {user.is_live ? (
                    <span className="font-medium text-primary-text">Live now</span>
                  ) : lastLive?.ended_at ? (
                    <span>Last live {formatRelativeTime(lastLive.ended_at)}</span>
                  ) : (
                    <span>Offline</span>
                  )}
                </div>
              </div>
            </div>

            {!isOwnChannel ? (
              <button
                type="button"
                onClick={() => void toggleFollow()}
                disabled={followBusy || !accessToken}
                title={!accessToken ? 'Log in to follow' : undefined}
                className={cn(
                  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-6 py-2.5 text-sm font-bold transition-colors disabled:opacity-60',
                  following
                    ? 'bg-muted text-foreground hover:bg-accent'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90',
                )}
              >
                <IconHeart className={cn('size-4', following && 'fill-current')} />
                {following ? 'Following' : 'Follow'}
              </button>
            ) : null}
          </div>

          <nav className="mt-5 flex gap-1 border-t border-border pt-1">
            {TABS.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  'relative px-4 py-3 text-sm font-semibold transition-colors',
                  tab === item.id
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
                {tab === item.id ? (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary" />
                ) : null}
              </button>
            ))}
          </nav>
        </div>
      </section>

      {/* Tab content */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {tab === 'home' ? (
          <div className="space-y-8">
            {isOwnChannel && user.is_live ? (
              <div className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-base font-bold text-foreground">Edit stream info</h2>
                <div className="mt-4">
                  <StreamInfoEditor compact onSaved={() => void reloadUser()} />
                </div>
              </div>
            ) : null}

            {user.bio && !user.is_live ? (
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{user.bio}</p>
            ) : null}

            {user.is_live && user.bio ? (
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{user.bio}</p>
            ) : null}

            {!user.is_live ? (
              <ChannelVodGrid
                sessions={sessions}
                channel={user}
                onSelect={handleSelectVod}
                activeId={activeVod?.id ?? null}
                limit={8}
                showViewAll
                onViewAll={() => setTab('videos')}
              />
            ) : null}
          </div>
        ) : null}

        {tab === 'videos' ? (
          user.is_live ? (
            <div className="rounded-xl border border-border bg-card px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Past broadcasts will appear here after the stream ends.
              </p>
            </div>
          ) : (
            <ChannelVodGrid
              sessions={sessions}
              channel={user}
              onSelect={handleSelectVod}
              activeId={activeVod?.id ?? null}
              title="All stream videos"
              emptyMessage="No stream recordings yet"
            />
          )
        ) : null}

        {tab === 'about' ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-lg font-bold text-foreground">About {name}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {user.bio || `${name} has not added a bio yet.`}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Channel details
              </h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4 border-b border-border pb-3">
                  <dt className="text-muted-foreground">Username</dt>
                  <dd className="font-medium text-foreground">@{user.username}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-border pb-3">
                  <dt className="text-muted-foreground">Followers</dt>
                  <dd className="font-medium text-foreground">{user.follower_count}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-border pb-3">
                  <dt className="text-muted-foreground">Member since</dt>
                  <dd className="font-medium text-foreground">
                    {new Date(user.created_at).toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </dd>
                </div>
                {user.stream_category ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Category</dt>
                    <dd className="font-medium text-foreground">{user.stream_category}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
