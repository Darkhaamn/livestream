const DEFAULT_HLS_BASE =
  process.env.NEXT_PUBLIC_HLS_PLAYBACK_BASE ?? "http://localhost:8888"
const DEFAULT_WEBRTC_BASE =
  process.env.NEXT_PUBLIC_WEBRTC_PLAYBACK_BASE ?? "http://localhost:8889"
const MEDIA_CDN_BASE = process.env.NEXT_PUBLIC_MEDIA_CDN_BASE ?? ""
const LIVE_PLAYBACK =
  process.env.NEXT_PUBLIC_LIVE_PLAYBACK ?? "webrtc"

export function buildHlsUrl(streamKey: string, baseUrl = DEFAULT_HLS_BASE) {
  const key = streamKey.trim().replace(/^\/+|\/+$/g, "")
  return `${baseUrl.replace(/\/+$/, "")}/${key}/index.m3u8`
}

export function preferHlsPlayback() {
  return LIVE_PLAYBACK === "hls"
}

export function buildRtmpUrl(streamKey: string, rtmpBase: string) {
  const key = streamKey.trim().replace(/^\/+|\/+$/g, "")
  return `${rtmpBase.replace(/\/+$/, "")}/${key}`
}

export function buildWebRtcUrl(
  streamKey: string,
  baseUrl = DEFAULT_WEBRTC_BASE
) {
  const key = streamKey.trim().replace(/^\/+|\/+$/g, "")
  return `${baseUrl.replace(/\/+$/, "")}/${key}/whep`
}

export function buildWhipUrl(streamKey: string, whipBase: string) {
  const key = streamKey.trim().replace(/^\/+|\/+$/g, "")
  return `${whipBase.replace(/\/+$/, "")}/${key}/whip`
}

export function formatBytes(value: number) {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)} GB`
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)} MB`
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)} KB`
  return `${value} B`
}

export function formatMbps(value: number) {
  return `${(value || 0).toFixed(2)} Mbps`
}

const API_BASE = process.env.NEXT_PUBLIC_MTX_API_URL ?? ""

export function buildThumbnailUrl(streamKey: string, cacheBust?: number) {
  const key = streamKey.trim().replace(/^\/+|\/+$/g, "")
  if (MEDIA_CDN_BASE) {
    const t = cacheBust ?? Date.now()
    return `${MEDIA_CDN_BASE.replace(/\/+$/, "")}/thumbnails/${key}.jpg?t=${t}`
  }
  const t = cacheBust ?? Date.now()
  return `${API_BASE}/api/thumbnails/${encodeURIComponent(key)}?t=${t}`
}

export function buildVodThumbnailUrl(recordingPath: string) {
  const id = recordingPath.trim().replace(/^\/+|\/+$/g, "")
  if (MEDIA_CDN_BASE) {
    return `${MEDIA_CDN_BASE.replace(/\/+$/, "")}/thumbnails/vods/${id}.jpg`
  }
  return `${API_BASE}/api/vods/thumbnail/${encodeURIComponent(id)}`
}
