package mediamtx

import "time"

type PathList struct {
	ItemCount int64  `json:"itemCount"`
	PageCount int64  `json:"pageCount"`
	Items     []Path `json:"items"`
}

type Path struct {
	Name                 string       `json:"name"`
	ConfName             string       `json:"confName"`
	Source               *PathSource  `json:"source"`
	Available            bool         `json:"available"`
	AvailableTime        *string      `json:"availableTime"`
	Online               bool         `json:"online"`
	OnlineTime           *string      `json:"onlineTime"`
	Tracks2              []PathTrack  `json:"tracks2"`
	Readers              []PathReader `json:"readers"`
	InboundBytes         uint64       `json:"inboundBytes"`
	OutboundBytes        uint64       `json:"outboundBytes"`
	InboundFramesInError uint64       `json:"inboundFramesInError"`
}

type PathSource struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

type PathReader struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

type PathTrack struct {
	Codec      string         `json:"codec"`
	CodecProps map[string]any `json:"codecProps"`
}

type ConnList[T any] struct {
	ItemCount int64 `json:"itemCount"`
	PageCount int64 `json:"pageCount"`
	Items     []T   `json:"items"`
}

type RTMPConn struct {
	ID                      string `json:"id"`
	Created                 string `json:"created"`
	RemoteAddr              string `json:"remoteAddr"`
	State                   string `json:"state"`
	Path                    string `json:"path"`
	Query                   string `json:"query"`
	User                    string `json:"user"`
	UserAgent               string `json:"userAgent"`
	InboundBytes            uint64 `json:"inboundBytes"`
	OutboundBytes           uint64 `json:"outboundBytes"`
	OutboundFramesDiscarded uint64 `json:"outboundFramesDiscarded"`
}

type WebRTCSession struct {
	ID            string `json:"id"`
	Created       string `json:"created"`
	RemoteAddr    string `json:"remoteAddr"`
	State         string `json:"state"`
	Path          string `json:"path"`
	Query         string `json:"query"`
	User          string `json:"user"`
	UserAgent     string `json:"userAgent"`
	InboundBytes  uint64 `json:"inboundBytes"`
	OutboundBytes uint64 `json:"outboundBytes"`
}

type HLSsession struct {
	ID            string `json:"id"`
	Created       string `json:"created"`
	RemoteAddr    string `json:"remoteAddr"`
	State         string `json:"state"`
	Path          string `json:"path"`
	Query         string `json:"query"`
	User          string `json:"user"`
	UserAgent     string `json:"userAgent"`
	InboundBytes  uint64 `json:"inboundBytes"`
	OutboundBytes uint64 `json:"outboundBytes"`
}

type RTSPSession struct {
	ID            string `json:"id"`
	Created       string `json:"created"`
	RemoteAddr    string `json:"remoteAddr"`
	State         string `json:"state"`
	Path          string `json:"path"`
	Query         string `json:"query"`
	User          string `json:"user"`
	UserAgent     string `json:"userAgent"`
	InboundBytes  uint64 `json:"inboundBytes"`
	OutboundBytes uint64 `json:"outboundBytes"`
}

type ServerInfo struct {
	Version string `json:"version"`
	Started string `json:"started"`
}

type StreamMember struct {
	ID         string `json:"id"`
	Type       string `json:"type"`
	State      string `json:"state"`
	Path       string `json:"path"`
	RemoteAddr string `json:"remoteAddr"`
	Query      string `json:"query,omitempty"`
	User       string `json:"user,omitempty"`
	UserAgent  string `json:"userAgent,omitempty"`
	Device     string `json:"device"`
	Created    string `json:"created"`
}

type PathBandwidth struct {
	InboundBytes  uint64  `json:"inboundBytes"`
	OutboundBytes uint64  `json:"outboundBytes"`
	InboundMbps   float64 `json:"inboundMbps"`
	OutboundMbps  float64 `json:"outboundMbps"`
	SampledAt     string  `json:"sampledAt"`
}

type PathSummary struct {
	Path
	Bandwidth   PathBandwidth  `json:"bandwidth"`
	ViewerCount int            `json:"viewerCount"`
	Members     []StreamMember `json:"members"`
	Viewers     []StreamMember `json:"viewers"`
}

type BroadcastConfig struct {
	RTMPURL            string `json:"rtmpUrl"`
	HLSPlaybackBase    string `json:"hlsPlaybackBase"`
	WHIPURL            string `json:"whipUrl"`
	WebRTCPlaybackBase string `json:"webrtcPlaybackBase"`
	StreamKey          string `json:"streamKey,omitempty"`
}

type Dashboard struct {
	Server    ServerInfo    `json:"server"`
	Paths     []PathSummary `json:"paths"`
	UpdatedAt string        `json:"updatedAt"`
}

type byteSample struct {
	inbound  uint64
	outbound uint64
	at       time.Time
}
