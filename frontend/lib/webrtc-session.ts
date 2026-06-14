type MediaListener = (stream: MediaStream) => void

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
  mediaListeners: Set<MediaListener>
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

/** Chrome needs stereo Opus in offer + answer SDP or playback can be silent. */
function patchStereoOpus(sdp: string) {
  const sections = sdp.split("m=")

  for (let i = 1; i < sections.length; i++) {
    if (!sections[i].startsWith("audio")) continue

    const lines = sections[i].split(/\r?\n/)
    let opusPayloadFormat = ""

    for (const line of lines) {
      if (line.startsWith("a=rtpmap:") && line.toLowerCase().includes("opus/")) {
        opusPayloadFormat = line.slice("a=rtpmap:".length).split(" ")[0]
        break
      }
    }

    if (!opusPayloadFormat) break

    let fmtpIndex = -1
    for (let j = 0; j < lines.length; j++) {
      if (lines[j].startsWith(`a=fmtp:${opusPayloadFormat} `)) {
        fmtpIndex = j
        if (!lines[j].includes("stereo=1")) {
          lines[j] += ";stereo=1"
        }
        if (!lines[j].includes("sprop-stereo=1")) {
          lines[j] += ";sprop-stereo=1"
        }
      }
    }

    if (fmtpIndex === -1) {
      const rtpmapIndex = lines.findIndex(
        (line) =>
          line.startsWith("a=rtpmap:") &&
          line.toLowerCase().includes("opus/")
      )
      if (rtpmapIndex >= 0) {
        lines.splice(
          rtpmapIndex + 1,
          0,
          `a=fmtp:${opusPayloadFormat} stereo=1;sprop-stereo=1;minptime=10;useinbandfec=1`
        )
      }
    }

    sections[i] = lines.join("\r\n")
    break
  }

  return sections.join("m=")
}

function notifyMedia(entry: ManagedSession, stream: MediaStream) {
  entry.media = stream
  for (const listener of entry.mediaListeners) {
    listener(stream)
  }
}

function destroySession(entry: ManagedSession) {
  if (entry.releaseTimer) {
    clearTimeout(entry.releaseTimer)
    entry.releaseTimer = null
  }

  entry.abortController.abort()
  const sessionUrl = entry.sessionUrl
  entry.sessionUrl = null
  entry.mediaListeners.clear()
  sessions.delete(entry.src)

  if (sessionUrl) {
    void deleteWhepSession(sessionUrl)
  }

  entry.peer.close()
  entry.media.getTracks().forEach((track) => track.stop())
}

async function connectSession(entry: ManagedSession) {
  const { peer, abortController, src } = entry

  peer.addTransceiver("video", { direction: "recvonly" })
  peer.addTransceiver("audio", { direction: "recvonly" })

  peer.addEventListener("track", (event) => {
    const stream = event.streams[0]
    if (stream) {
      notifyMedia(entry, stream)
    } else {
      entry.media.addTrack(event.track)
      notifyMedia(entry, entry.media)
    }
    entry.connected = true
  })

  peer.addEventListener("connectionstatechange", () => {
    if (peer.connectionState === "connected") {
      entry.connected = true
    }
  })

  const offer = await peer.createOffer()
  offer.sdp = patchStereoOpus(offer.sdp ?? "")
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
  await peer.setRemoteDescription({
    type: "answer",
    sdp: patchStereoOpus(answer),
  })

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
    mediaListeners: new Set(),
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
  onMediaStream: (listener: MediaListener) => () => void
  release: () => void
}

export function acquireWebRtcSession(
  src: string,
  onMediaStream?: MediaListener
): WebRtcLease {
  const existing = sessions.get(src)
  if (existing) {
    if (existing.releaseTimer) {
      clearTimeout(existing.releaseTimer)
      existing.releaseTimer = null
    }
    existing.refCount += 1
    if (onMediaStream) {
      existing.mediaListeners.add(onMediaStream)
      if (existing.media.getTracks().length > 0) {
        onMediaStream(existing.media)
      }
    }
    return leaseFromEntry(existing)
  }

  const entry = createSession(src)
  sessions.set(src, entry)
  if (onMediaStream) {
    entry.mediaListeners.add(onMediaStream)
  }

  return leaseFromEntry(entry)
}

function leaseFromEntry(entry: ManagedSession): WebRtcLease {
  return {
    media: entry.media,
    peer: entry.peer,
    waitConnected: () => entry.connectPromise,
    isConnected: () => entry.connected,
    onMediaStream: (listener) => {
      entry.mediaListeners.add(listener)
      if (entry.media.getTracks().length > 0) {
        listener(entry.media)
      }
      return () => {
        entry.mediaListeners.delete(listener)
      }
    },
    release: () => releaseWebRtcSession(entry.src),
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
