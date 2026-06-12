package config

import (
	"fmt"
	"os"
)

type Config struct {
	MediaMTXURL        string
	MediaMTXUsername   string
	MediaMTXPassword   string
	ServerAddr         string
	CORSOrigins        string
	RTMPIngestURL      string
	RTSPPlaybackURL    string
	HLSPlaybackURL     string
	WHIPIngestURL      string
	WebRTCPlaybackURL  string
	ThumbnailDir       string
	ThumbnailInterval  string
	RecordingsDir      string
}

func Load() Config {
	return Config{
		MediaMTXURL:       envOr("MEDIAMTX_URL", "http://localhost:9997"),
		MediaMTXUsername:  envOr("MEDIAMTX_USERNAME", "admin"),
		MediaMTXPassword:  envOr("MEDIAMTX_PASSWORD", "admin123"),
		ServerAddr:        envOr("SERVER_ADDR", ":8080"),
		CORSOrigins:       envOr("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"),
		RTMPIngestURL:     envOr("RTMP_INGEST_URL", "rtmp://localhost"),
		RTSPPlaybackURL:   envOr("RTSP_PLAYBACK_URL", "rtsp://localhost:8554"),
		HLSPlaybackURL:    envOr("HLS_PLAYBACK_URL", "http://localhost:8888"),
		WHIPIngestURL:     envOr("WHIP_INGEST_URL", "http://localhost:8889/webrtc"),
		WebRTCPlaybackURL: envOr("WEBRTC_PLAYBACK_URL", "http://localhost:8889/webrtc"),
		ThumbnailDir:      envOr("THUMBNAIL_DIR", "../../thumbnails"),
		ThumbnailInterval: envOr("THUMBNAIL_INTERVAL", "10s"),
		RecordingsDir:     envOr("RECORDINGS_DIR", "../../recordings"),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func (c Config) MediaMTXBase() string {
	return c.MediaMTXURL
}

func (c Config) String() string {
	return fmt.Sprintf("mediamtx=%s server=%s", c.MediaMTXURL, c.ServerAddr)
}
