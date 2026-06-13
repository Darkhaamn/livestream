"use client"

import { ChannelAvatar } from "@/components/stream/channel-avatar"
import { VodPlayOverlay, VodThumbnail } from "@/components/stream/vod-thumbnail"
import type { StreamSession, User } from "@/lib/api"
import type { Vod } from "@/lib/mtx-api"
import { formatRelativeTime, formatSessionDuration } from "@/lib/time-format"
import { cn } from "@/lib/utils"
import { sessionToVod, sessionsWithRecordings } from "@/lib/vod-session"

type ChannelVodGridProps = {
  sessions: StreamSession[]
  channel: User
  onSelect: (vod: Vod) => void
  activeId?: string | null
  limit?: number
  title?: string
  showViewAll?: boolean
  onViewAll?: () => void
  emptyMessage?: string
}

export function ChannelVodGrid({
  sessions,
  channel,
  onSelect,
  activeId,
  limit,
  title = "Stream Videos",
  showViewAll = false,
  onViewAll,
  emptyMessage = "No recordings yet",
}: ChannelVodGridProps) {
  const recordings = sessionsWithRecordings(sessions)
    .map(session => ({ session, vod: sessionToVod(session) }))
    .filter((item): item is { session: StreamSession; vod: Vod } => item.vod != null)

  const visible = limit != null ? recordings.slice(0, limit) : recordings
  const displayName = channel.display_name ?? channel.username

  if (recordings.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-6 py-14 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <section>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">{title}</h2>
        {showViewAll && recordings.length > (limit ?? 0) ? (
          <button
            type="button"
            onClick={onViewAll}
            className="text-sm font-semibold text-primary-text hover:underline"
          >
            View all
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4">
        {visible.map(({ session, vod }) => {
          const duration = formatSessionDuration(session)
          const isActive = activeId === vod.id

          return (
            <button
              key={session.id}
              type="button"
              onClick={() => onSelect(vod)}
              className={cn(
                "group overflow-hidden rounded-xl border border-border bg-card text-left transition-all",
                isActive ? "ring-2 ring-primary" : "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
              )}
            >
              <div className="relative aspect-video overflow-hidden bg-black">
                {session.recording_path ? (
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

              <div className="flex items-start gap-3 p-4">
                <ChannelAvatar
                  username={channel.username}
                  displayName={channel.display_name}
                  avatarUrl={channel.avatar_url}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                    {session.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {session.category || displayName}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatRelativeTime(session.ended_at ?? session.started_at)}
                  </p>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
