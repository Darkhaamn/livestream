type ManagedSession = {
  src: string
  peer: RTCPeerConnection
  media: MediaStream
  sessionUrl: string | null
  refCount: number
  connected: boolean
  releaseTimer: ReturnType<typeof setTimeout> | null
  connectPromise: Promise<void>
  abortController: AbortController
}

const sessions = new Map<string, ManagedSession>()

/** Keep session alive briefly so browser back/forward reuses the same WHEP connection. */
const IDLE_RELEASE_MS = 10_000
const CONNECT_TIMEOUT_MS = 12_000

function absoluteSessionUrl(location: string, whepSrc: string) {
  if (location.startsWith("http://") || location.startsWith("https://")) {
    return location
  }
  const base = new URL(whepSrc)
  if (location.startsWith("/")) {
    return `${base.origin}${location}`
  }
  return `${whepSrc.replace(/\/+$/, "")}/${location}`
}

async function deleteWhepSession(sessionUrl: string) {
  try {
    const response = await fetch(sessionUrl, { method: "DELETE" })
    if (response.ok || response.status === 404) return
    const text = await response.text().catch(() => "")
    if (text.includes("session not found")) return
  } catch {
    // Best-effort cleanup only.
  }
}

function waitForIceGathering(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === "complete") {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    const onStateChange = () => {
      if (peer.iceGatheringState === "complete") {
        peer.removeEventListener("icegatheringstatechange", onStateChange)
        resolve()
      }
    }
    peer.addEventListener("icegatheringstatechange", onStateChange)
  })
}

function destroySession(entry: ManagedSession) {
  if (entry.releaseTimer) {
    clearTimeout(entry.releaseTimer)
    entry.releaseTimer = null
  }

  entry.abortController.abort()
  const sessionUrl = entry.sessionUrl
  entry.sessionUrl = null
  sessions.delete(entry.src)

  if (sessionUrl) {
    void deleteWhepSession(sessionUrl)
  }

  entry.peer.close()
  entry.media.getTracks().forEach((track) => track.stop())
}

async function connectSession(entry: ManagedSession) {
  const { peer, media, abortController, src } = entry

  peer.addTransceiver("video", { direction: "recvonly" })
  peer.addTransceiver("audio", { direction: "recvonly" })

  peer.addEventListener("track", (event) => {
    media.addTrack(event.track)
    entry.connected = true
  })

  peer.addEventListener("connectionstatechange", () => {
    if (peer.connectionState === "connected") {
      entry.connected = true
    }
  })

  const offer = await peer.createOffer()
  await peer.setLocalDescription(offer)
  await waitForIceGathering(peer)

  if (!peer.localDescription) {
    throw new Error("WebRTC offer was not created")
  }

  const response = await fetch(src, {
    method: "POST",
    headers: {
      Accept: "application/sdp",
      "Content-Type": "application/sdp",
    },
    body: peer.localDescription.sdp,
    signal: abortController.signal,
  })

  if (!response.ok) {
    throw new Error(`WHEP returned ${response.status}`)
  }

  const location = response.headers.get("Location")
  if (location) {
    entry.sessionUrl = absoluteSessionUrl(location, src)
  }

  const answer = await response.text()
  await peer.setRemoteDescription({ type: "answer", sdp: answer })

  await new Promise<void>((resolve, reject) => {
    if (entry.connected) {
      resolve()
      return
    }

    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error("WebRTC connection timed out"))
    }, CONNECT_TIMEOUT_MS)

    const onStateChange = () => {
      if (peer.connectionState === "connected" || entry.connected) {
        cleanup()
        resolve()
      }
      if (peer.connectionState === "failed") {
        cleanup()
        reject(new Error("WebRTC connection failed"))
      }
    }

    const cleanup = () => {
      window.clearTimeout(timeout)
      peer.removeEventListener("connectionstatechange", onStateChange)
    }

    peer.addEventListener("connectionstatechange", onStateChange)
  })
}

function createSession(src: string): ManagedSession {
  const peer = new RTCPeerConnection()
  const media = new MediaStream()
  const abortController = new AbortController()

  const entry: ManagedSession = {
    src,
    peer,
    media,
    sessionUrl: null,
    refCount: 1,
    connected: false,
    releaseTimer: null,
    abortController,
    connectPromise: Promise.resolve(),
  }

  entry.connectPromise = connectSession(entry).catch((err) => {
    destroySession(entry)
    throw err
  })

  return entry
}

export type WebRtcLease = {
  media: MediaStream
  peer: RTCPeerConnection
  waitConnected: () => Promise<void>
  isConnected: () => boolean
  release: () => void
}

export function acquireWebRtcSession(src: string): WebRtcLease {
  const existing = sessions.get(src)
  if (existing) {
    if (existing.releaseTimer) {
      clearTimeout(existing.releaseTimer)
      existing.releaseTimer = null
    }
    existing.refCount += 1
    return {
      media: existing.media,
      peer: existing.peer,
      waitConnected: () => existing.connectPromise,
      isConnected: () => existing.connected,
      release: () => releaseWebRtcSession(src),
    }
  }

  const entry = createSession(src)
  sessions.set(src, entry)

  return {
    media: entry.media,
    peer: entry.peer,
    waitConnected: () => entry.connectPromise,
    isConnected: () => entry.connected,
    release: () => releaseWebRtcSession(src),
  }
}

export function releaseWebRtcSession(src: string) {
  const entry = sessions.get(src)
  if (!entry) return

  entry.refCount -= 1
  if (entry.refCount > 0) return

  if (entry.releaseTimer) {
    clearTimeout(entry.releaseTimer)
  }

  entry.releaseTimer = setTimeout(() => {
    const current = sessions.get(src)
    if (current && current.refCount <= 0) {
      destroySession(current)
    }
  }, IDLE_RELEASE_MS)
}

/** Immediately tear down a cached session (e.g. fallback to HLS). */
export function dropWebRtcSession(src: string) {
  const entry = sessions.get(src)
  if (!entry) return
  destroySession(entry)
}
