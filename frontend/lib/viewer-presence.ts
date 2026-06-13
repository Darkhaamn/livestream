import { leaveViewer, pingViewer } from "@/lib/mtx-api"
import { getViewerId } from "@/lib/viewer-id"

type PresenceEntry = {
  path: string
  timer: ReturnType<typeof setInterval> | null
  refs: number
}

const PRESENCE_INTERVAL_MS = 15_000
const entries = new Map<string, PresenceEntry>()

function ping(path: string) {
  const viewerId = getViewerId()
  if (!viewerId || document.hidden) return
  void pingViewer(path, viewerId).catch(() => undefined)
}

/** Track viewer presence for a live path. Ref-counted so multiple components can share one heartbeat. */
export function acquireViewerPresence(path: string) {
  if (!path) return () => undefined

  let entry = entries.get(path)
  if (!entry) {
    entry = { path, timer: null, refs: 0 }
    entries.set(path, entry)
  }

  entry.refs += 1
  if (entry.refs === 1) {
    ping(path)
    entry.timer = setInterval(() => ping(path), PRESENCE_INTERVAL_MS)
  }

  let released = false
  return () => {
    if (released) return
    released = true
    const current = entries.get(path)
    if (!current) return
    current.refs -= 1
    if (current.refs > 0) return

    if (current.timer) clearInterval(current.timer)
    entries.delete(path)
    const viewerId = getViewerId()
    if (viewerId) void leaveViewer(path, viewerId).catch(() => undefined)
  }
}
