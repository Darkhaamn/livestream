import { api, type LiveStream } from '@/lib/api'

const POLL_MS = 15_000

export type LiveStreamsSnapshot = {
  streams: LiveStream[]
  error: string | null
  loaded: boolean
  refreshing: boolean
}

let snapshot: LiveStreamsSnapshot = {
  streams: [],
  error: null,
  loaded: false,
  refreshing: false,
}

const listeners = new Set<() => void>()
let subscriberCount = 0
let pollTimer: number | null = null
let inFlight = false

function notify() {
  listeners.forEach((listener) => listener())
}

function streamsEqual(a: LiveStream[], b: LiveStream[]): boolean {
  if (a.length !== b.length) return false
  return a.every((stream, index) => {
    const other = b[index]
    return (
      stream.path === other.path &&
      stream.username === other.username &&
      stream.stream_title === other.stream_title &&
      stream.stream_category === other.stream_category &&
      stream.viewer_count === other.viewer_count &&
      stream.display_name === other.display_name
    )
  })
}

async function fetchLiveStreams() {
  if (inFlight || document.hidden) return
  inFlight = true

  const hasCached = snapshot.streams.length > 0
  if (hasCached) {
    snapshot = { ...snapshot, refreshing: true }
    notify()
  }

  try {
    const data = await api.streams.live()
    snapshot = {
      streams: streamsEqual(snapshot.streams, data) ? snapshot.streams : data,
      error: null,
      loaded: true,
      refreshing: false,
    }
  } catch (err) {
    snapshot = {
      ...snapshot,
      error: err instanceof Error ? err.message : 'Failed to load streams',
      loaded: snapshot.loaded || snapshot.streams.length > 0,
      refreshing: false,
    }
  } finally {
    inFlight = false
    notify()
  }
}

function onVisibilityChange() {
  if (!document.hidden) void fetchLiveStreams()
}

function startPolling() {
  if (pollTimer) return
  void fetchLiveStreams()
  pollTimer = window.setInterval(() => void fetchLiveStreams(), POLL_MS)
  document.addEventListener('visibilitychange', onVisibilityChange)
}

function stopPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
  document.removeEventListener('visibilitychange', onVisibilityChange)
}

export function getLiveStreamsSnapshot(): LiveStreamsSnapshot {
  return snapshot
}

export function subscribeLiveStreams(listener: () => void): () => void {
  listeners.add(listener)
  subscriberCount += 1
  if (subscriberCount === 1) startPolling()
  return () => {
    listeners.delete(listener)
    subscriberCount -= 1
    if (subscriberCount === 0) stopPolling()
  }
}

export function refreshLiveStreams() {
  return fetchLiveStreams()
}
