"use client"

import { IconPlayerPlay } from "@tabler/icons-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { ChannelAvatar } from "@/components/stream/channel-avatar"
import { VodPlayOverlay, VodThumbnail } from "@/components/stream/vod-thumbnail"
import { api, type StreamSession, type User } from "@/lib/api"
import type { Vod } from "@/lib/mtx-api"
import { formatSessionDuration } from "@/lib/time-format"
import { cn } from "@/lib/utils"
import {
  sessionToVod,
  sessionsWithRecordings,
  usernameFromStreamKey,
} from "@/lib/vod-session"

type VodListProps = {
  streamKey: string
  onSelect: (vod: Vod) => void
  activeId?: string | null
  onLoaded?: (count: number) => void
  channel?: User | null
  sessions?: StreamSession[]
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** i
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}

function formatStartedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const time = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  return `${day} · ${time}`
}

export function VodList({
  streamKey,
  onSelect,
  activeId,
  onLoaded,
  channel: channelProp,
  sessions: sessionsProp,
}: VodListProps) {
  const [channel, setChannel] = useState<User | null>(channelProp ?? null)
  const [sessions, setSessions] = useState<StreamSession[]>(sessionsProp ?? [])

  const username = usernameFromStreamKey(streamKey)

  useEffect(() => {
    if (channelProp !== undefined) setChannel(channelProp)
  }, [channelProp])

  useEffect(() => {
    if (sessionsProp !== undefined) setSessions(sessionsProp)
  }, [sessionsProp])

  useEffect(() => {
    if (!username || channelProp !== undefined) return
    let active = true
    api.users
      .getByUsername(username)
      .then(data => {
        if (active) setChannel(data)
      })
      .catch(() => {
        if (active) setChannel(null)
      })
    return () => {
      active = false
    }
  }, [username, channelProp])

  useEffect(() => {
    if (!username || sessionsProp !== undefined) return
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
  }, [username, sessionsProp])

  const recordings = useMemo(() => {
    return sessionsWithRecordings(sessions)
      .map(session => ({ session, vod: sessionToVod(session) }))
      .filter((item): item is { session: StreamSession; vod: Vod } => item.vod != null)
  }, [sessions])

  const onLoadedRef = useRef(onLoaded)
  onLoadedRef.current = onLoaded

  useEffect(() => {
    onLoadedRef.current?.(recordings.length)
  }, [recordings.length])

  if (recordings.length === 0) return null

  const displayName = channel?.display_name ?? channel?.username ?? username ?? "Streamer"

  return (
    <div className="px-4 py-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-muted-foreground">
        Past broadcasts
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {recordings.map(({ session, vod }) => {
          const duration = formatSessionDuration(session)
          const isActive = activeId === vod.id

          return (
            <button
              key={session.id}
              type="button"
              onClick={() => onSelect(vod)}
              className={cn(
                "group overflow-hidden rounded-xl border border-border bg-card text-left transition-all",
                isActive ? "ring-2 ring-primary" : "hover:border-primary/40 hover:shadow-md",
              )}
            >
              <div className="relative aspect-video overflow-hidden bg-black">
                {session.recording_path && channel ? (
                  <VodThumbnail
                    recordingPath={session.recording_path}
                    username={channel.username}
                    displayName={channel.display_name}
                    avatarUrl={channel.avatar_url}
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-muted to-background" />
                )}
                <VodPlayOverlay />
                {duration ? (
                  <span className="absolute left-2 top-2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-bold text-white">
                    {duration}
                  </span>
                ) : null}
              </div>

              <div className="flex items-start gap-2 p-3">
                {channel ? (
                  <ChannelAvatar
                    username={channel.username}
                    displayName={channel.display_name}
                    avatarUrl={channel.avatar_url}
                    size="sm"
                  />
                ) : (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary-text">
                    <IconPlayerPlay className="size-5" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  {channel ? (
                    <span className="block truncate text-xs font-semibold text-muted-foreground">
                      {displayName}
                    </span>
                  ) : null}
                  <span className="mt-0.5 block truncate text-sm font-semibold text-foreground">
                    {session.title}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    {session.category ? (
                      <span className="rounded-md bg-muted px-1.5 py-0.5">{session.category}</span>
                    ) : null}
                    <span>{formatStartedAt(session.started_at)}</span>
                  </span>
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
