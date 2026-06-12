export type ServerInfo = {
  version: string
  started: string
}

export type PathSource = {
  type: string
  id: string
}

export type PathTrack = {
  codec: string
  codecProps?: Record<string, string | number>
}

export type StreamMember = {
  id: string
  type: string
  state: string
  path: string
  remoteAddr?: string
  query?: string
  user?: string
  userAgent?: string
  device: string
  created?: string
}

export type PathBandwidth = {
  inboundBytes: number
  outboundBytes: number
  inboundMbps: number
  outboundMbps: number
  sampledAt: string
}

export type PathSummary = {
  name: string
  confName: string
  source?: PathSource | null
  available: boolean
  online: boolean
  tracks2?: PathTrack[]
  inboundBytes: number
  outboundBytes: number
  inboundFramesInError?: number
  bandwidth: PathBandwidth
  viewerCount: number
  members: StreamMember[]
  viewers: StreamMember[]
}

export type Dashboard = {
  server: ServerInfo
  paths: PathSummary[]
  updatedAt: string
}

export type BroadcastConfig = {
  rtmpUrl: string
  hlsPlaybackBase: string
  whipUrl: string
  webrtcPlaybackBase: string
  streamKey?: string
}
