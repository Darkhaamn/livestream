import type { StreamSession } from "@/lib/api"
import type { Vod } from "@/lib/mtx-api"

const LIVE_PREFIX = "live/"

/** Username segment from a stream key such as `live/alice`. */
export function usernameFromStreamKey(streamKey: string): string | null {
  if (!streamKey.startsWith(LIVE_PREFIX)) return null
  const username = streamKey.slice(LIVE_PREFIX.length).trim()
  return username || null
}

/** Ended sessions that have a linked recording in the database. */
export function sessionsWithRecordings(sessions: StreamSession[]): StreamSession[] {
  return sessions.filter(session => session.ended_at && session.recording_path)
}

/** Build a VOD player object from a stream session row. */
export function sessionToVod(session: StreamSession): Vod | null {
  if (!session.recording_path) return null
  return {
    id: session.recording_path,
    path: session.path,
    startedAt: session.started_at,
    sizeBytes: 0,
    url: `/api/vods/file/${session.recording_path}`,
    sessionId: session.id,
    title: session.title,
    category: session.category,
  }
}

/** Find the session linked to a VOD id (recording path). */
export function findSessionForVod(vod: Vod, sessions: StreamSession[]): StreamSession | null {
  if (vod.sessionId != null) {
    return sessions.find(session => session.id === vod.sessionId) ?? null
  }
  return sessions.find(session => session.recording_path === vod.id) ?? null
}
